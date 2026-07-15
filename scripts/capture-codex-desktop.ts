import { mkdir } from "node:fs/promises";
import { join } from "node:path";

type JsonObject = Record<string, unknown>;
type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (result: JsonObject) => void;
};
type NotificationWaiter = {
  method: string;
  predicate: (params: JsonObject) => boolean;
  resolve: (params: JsonObject) => void;
};

const candidateApps = [
  process.env.CODEX_DESKTOP_APP_PATH,
  "/Applications/ChatGPT.app",
  "/Applications/Codex.app",
].filter((path): path is string => Boolean(path));

const appPath = candidateApps.find((path) => Bun.file(join(path, "Contents/Resources/codex")).size > 0);
if (!appPath) throw new Error("Codex desktop app bundle is required");

const binary = join(appPath, "Contents/Resources/codex");
const captureBaseUrl = process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:8787/v1";
const codexHome = process.env.CODEX_HOME ?? join(process.env.TMPDIR ?? "/tmp", `codex-desktop-${crypto.randomUUID()}`);
const workspace = process.env.CAPTURE_WORKSPACE ?? process.cwd();
await mkdir(codexHome, { recursive: true });

const child = Bun.spawn({
  cmd: [
    binary,
    "app-server",
    "--stdio",
    "-c",
    'model_provider="capture"',
    "-c",
    'model_reasoning_effort="low"',
    "-c",
    'model_providers.capture.name="Local capture API"',
    "-c",
    `model_providers.capture.base_url=${JSON.stringify(captureBaseUrl)}`,
    "-c",
    'model_providers.capture.env_key="CAPTURE_API_KEY"',
    "-c",
    'model_providers.capture.wire_api="responses"',
  ],
  cwd: workspace,
  env: {
    ...process.env,
    CAPTURE_API_KEY: process.env.CAPTURE_API_KEY ?? "local-capture-only",
    CODEX_HOME: codexHome,
    HOME: codexHome,
  },
  stdin: "pipe",
  stdout: "pipe",
  stderr: "inherit",
});

const pending = new Map<number, PendingRequest>();
const notificationWaiters: NotificationWaiter[] = [];
let requestId = 0;

function withTimeout<T>(promise: Promise<T>, message: string, milliseconds = 30_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  const timedOut = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timedOut]).finally(() => clearTimeout(timeout));
}

function send(message: JsonObject): void {
  child.stdin.write(`${JSON.stringify(message)}\n`);
  child.stdin.flush();
}

function request(method: string, params: JsonObject): Promise<JsonObject> {
  const id = ++requestId;
  send({ id, method, params });
  const response = new Promise<JsonObject>((resolve, reject) => pending.set(id, { resolve, reject }));
  return withTimeout(response, `Codex desktop ${method} request timed out`).finally(() => pending.delete(id));
}

function waitForNotification(method: string, predicate: (params: JsonObject) => boolean): Promise<JsonObject> {
  return new Promise((resolve) => notificationWaiters.push({ method, predicate, resolve }));
}

const readLoop = (async () => {
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of child.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as JsonObject;
      if (typeof message.id === "number") {
        const current = pending.get(message.id);
        if (!current) continue;
        pending.delete(message.id);
        if (message.error && typeof message.error === "object") {
          current.reject(new Error(JSON.stringify(message.error)));
        } else {
          current.resolve((message.result as JsonObject | undefined) ?? {});
        }
        continue;
      }
      if (typeof message.method !== "string" || !message.params || typeof message.params !== "object") continue;
      const params = message.params as JsonObject;
      for (let index = notificationWaiters.length - 1; index >= 0; index -= 1) {
        const waiter = notificationWaiters[index];
        if (waiter.method === message.method && waiter.predicate(params)) {
          notificationWaiters.splice(index, 1);
          waiter.resolve(params);
        }
      }
    }
  }
})();

try {
  await request("initialize", {
    clientInfo: {
      name: "Codex Desktop",
      title: "Codex",
      version: process.env.CODEX_DESKTOP_VERSION ?? "capture",
    },
    capabilities: { experimentalApi: true },
  });
  send({ method: "initialized", params: {} });

  const modelList = await request("model/list", { limit: 100, includeHidden: false });
  const models = Array.isArray(modelList.data) ? (modelList.data as JsonObject[]) : [];
  const selectedModel = process.env.CODEX_DESKTOP_MODEL
    ?? String(models.find((model) => model.isDefault === true)?.model ?? models[0]?.model ?? "");
  if (!selectedModel) throw new Error("Codex desktop model catalog is empty");

  const threadResult = await request("thread/start", {
    cwd: workspace,
    model: selectedModel,
    modelProvider: "capture",
    approvalPolicy: "never",
    sandbox: "danger-full-access",
    ephemeral: true,
    personality: "friendly",
    experimentalRawEvents: false,
  });
  const thread = threadResult.thread as JsonObject | undefined;
  const threadId = String(thread?.id ?? "");
  if (!threadId) throw new Error("Codex desktop thread id is missing");

  const completed = waitForNotification("turn/completed", (params) => params.threadId === threadId);
  await request("turn/start", {
    threadId,
    input: [{ type: "text", text: "Reply with the word captured.", text_elements: [] }],
    effort: "low",
    summary: "auto",
    collaborationMode: {
      mode: "default",
      settings: { model: selectedModel, reasoning_effort: "low", developer_instructions: null },
    },
  });
  await withTimeout(completed, "Codex desktop capture timed out");
  console.log(`captured Codex Desktop prompt with ${selectedModel}`);
} finally {
  child.stdin.end();
  child.kill();
  await Promise.allSettled([child.exited, readLoop]);
}
