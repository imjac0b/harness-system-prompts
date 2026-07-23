import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";

type JsonObject = Record<string, unknown>;
export type Section = [label: string, content: string];

const outputDirectory = process.env.CAPTURE_OUTPUT_DIR ?? "prompts";

export function textFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFrom).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const record = value as JsonObject;
    for (const key of ["text", "input_text", "content", "parts"]) {
      if (key in record) return textFrom(record[key]);
    }
  }
  return "";
}

function uniqueSections(sections: Section[]): Section[] {
  const seen = new Set<string>();
  return sections.flatMap(([label, rawContent]) => {
    const content = rawContent.trim();
    if (!content || seen.has(content)) return [];
    seen.add(content);
    return [[label, content] satisfies Section];
  });
}

export function extractOpenAI(payload: JsonObject): Section[] {
  const sections: Section[] = [];
  const instructions = textFrom(payload.instructions);
  if (instructions) sections.push(["instructions", instructions]);

  if (Array.isArray(payload.input)) {
    payload.input.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const record = item as JsonObject;
      if (record.role === "system" || record.role === "developer") {
        sections.push([`${record.role} ${index + 1}`, textFrom(record.content)]);
      }
    });
  }
  return uniqueSections(sections);
}

export function extractCodexDesktop(payload: JsonObject): Section[] {
  return extractOpenAI(payload).map(([label, content]) => [
    label,
    content.replace(/\(file: [^)]+\/skills\//g, "(file: $CODEX_HOME/skills/"),
  ]);
}

export function extractAnthropic(payload: JsonObject): Section[] {
  const system = textFrom(payload.system)
    .replace(/^x-anthropic-billing-header:\s*(.*)$/m, (_line, value: string) => {
      const fields = value
        .split(";")
        .map((field) => field.trim())
        .filter((field) => field && !field.startsWith("cch="));
      return `x-anthropic-billing-header: ${fields.join("; ")};`;
    })
    .replace(/^ - OS Version: Linux\s+.+$/m, " - OS Version: Linux");
  return uniqueSections([["system", system]]);
}

export function extractChatCompletions(payload: JsonObject): Section[] {
  if (!Array.isArray(payload.messages)) return [];
  return uniqueSections(
    payload.messages.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const message = item as JsonObject;
      if (message.role !== "system" && message.role !== "developer") return [];
      return [[`${message.role} ${index + 1}`, textFrom(message.content)] satisfies Section];
    }),
  );
}

export function extractKimi(payload: JsonObject): Section[] {
  return extractChatCompletions(payload).map(([label, content]) => [
    label,
    content.replace(
      /(The current date and time in ISO format is `)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})(`)/g,
      "$1<CURRENT_DATE_TIME>$2",
    ),
  ]);
}

export function extractCline(payload: JsonObject): Section[] {
  return extractChatCompletions(payload).map(([label, content]) => [
    label,
    content.replace(/^2\. Date: \d{1,2}\/\d{1,2}\/\d{4}$/gm, "2. Date: <CURRENT_DATE>"),
  ]);
}

export function extractHermes(payload: JsonObject): Section[] {
  return extractChatCompletions(payload).map(([label, content]) => [
    label,
    content
      .replace(/^Conversation started: .+$/gm, "Conversation started: <CURRENT_DATE>")
      .replace(/^Host: Linux \([^)]+\)$/gm, "Host: Linux (<KERNEL_VERSION>)"),
  ]);
}

export function extractOpenClaw(payload: JsonObject): Section[] {
  return extractChatCompletions(payload).map(([label, content]) => [
    label,
    content
      .replace(/sessionId=[^ |]+/g, "sessionId=<SESSION_ID>")
      .replace(/host=[^ |]+/g, "host=<HOSTNAME>")
      .replace(/os=Linux [^|]+ \(([^)]+)\)/g, "os=Linux <KERNEL_VERSION> ($1)"),
  ]);
}

export function extractOpenHands(payload: JsonObject): Section[] {
  return extractChatCompletions(payload).map(([label, content]) => [
    label,
    content
      .replace(
        /<CURRENT_DATETIME>[\s\S]*?<\/CURRENT_DATETIME>/g,
        "<CURRENT_DATETIME><CURRENT_DATE_TIME></CURRENT_DATETIME>",
      )
      .replace(/^(Your current working directory is:) .+$/gm, "$1 <WORKSPACE>")
      .replace(/^(User operating system:) Linux \(kernel: [^)]+\)$/gm, "$1 Linux (kernel: <KERNEL_VERSION>)"),
  ]);
}

export function extractRunnerEnvironment(payload: JsonObject): Section[] {
  return extractChatCompletions(payload).map(([label, content]) => [
    label,
    content
      .replace(/^(\s*Working directory:)\s*.+$/gm, "$1 <WORKSPACE>")
      .replace(/^(\s*Workspace root folder:)\s*.+$/gm, "$1 <WORKSPACE>")
      .replace(/^(\s*Today's date:)\s*.+$/gm, "$1 <CURRENT_DATE>"),
  ]);
}

export function extractMiMo(payload: JsonObject): Section[] {
  return extractRunnerEnvironment(payload).map(([label, content]) => [
    label,
    content
      .replace(/(\/memory\/projects\/)[0-9a-f-]{36}(?=\/)/g, "$1<PROJECT_ID>")
      .replace(/(\/memory\/sessions\/)ses_[A-Za-z0-9]+(?=\/)/g, "$1<SESSION_ID>"),
  ]);
}

export function extractOmp(payload: JsonObject): Section[] {
  return extractChatCompletions(payload).map(([label, content]) => [
    label,
    content
      .replace(/^(- OS:)\s*.+$/gm, "$1 <OS_VERSION>")
      .replace(/^(- Kernel:)\s*.+$/gm, "$1 <KERNEL_VERSION>")
      .replace(/^(- CPU:)\s*.+$/gm, "$1 <CPU_MODEL>")
      .replace(
        /^Today is \d{4}-\d{2}-\d{2}, and the current working directory is '.+'\.$/gm,
        "Today is <CURRENT_DATE>, and the current working directory is '<WORKSPACE>'.",
      ),
  ]);
}

export function extractGemini(payload: JsonObject): Section[] {
  return uniqueSections([
    ["system instruction", textFrom(payload.systemInstruction ?? payload.system_instruction)],
  ]);
}

const snapshotsByModel: Record<string, string> = {
  "capture-agent-zero": "agent-zero.md",
  "capture-aider": "aider.md",
  "capture-cline-cli": "cline-cli.md",
  "capture-cline-sdk": "cline-sdk.md",
  "capture-crush": "crush.md",
  "capture-gemini": "gemini-cli.md",
  "capture-grok": "grok-code-cli.md",
  "capture-hermes": "hermes-agent.md",
  "capture-kimi": "kimi-cli.md",
  "capture-kilo-code": "kilo-code-cli.md",
  "capture-mimo-code": "mimo-code.md",
  "capture-omp": "omp.md",
  "capture-openclaw": "openclaw.md",
  "capture-openhands": "openhands.md",
  "capture-opensquilla": "opensquilla.md",
  "capture-opencode": "opencode.md",
  "capture-pi": "pi.md",
  "capture-qwen": "qwen-code.md",
};

export function snapshotForModel(model: unknown, fallback: string): string {
  return snapshotsByModel[String(model)] ?? fallback;
}

export function snapshotForOpenAI(model: unknown, originator: string | null): string {
  if (originator?.toLowerCase() === "codex desktop") return "codex-desktop.md";
  return snapshotForModel(model, "codex.md");
}

export async function writeSnapshot(
  filename: string,
  sections: Section[],
  directory = outputDirectory,
): Promise<void> {
  if (sections.length === 0) return;
  const content = sections.map(([, section]) => section).join("\n\n");

  await mkdir(directory, { recursive: true });
  const target = join(directory, filename);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await Bun.write(temporary, `${content.trimEnd()}\n`);
  await rename(temporary, target);
}

function sse(events: Array<[event: string, payload: JsonObject]>): Response {
  const body = events
    .map(([event, payload]) => `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
    .join("");
  return new Response(body, {
    headers: {
      "cache-control": "no-cache",
      "content-type": "text/event-stream",
    },
  });
}

function openAIResponse(model: string): Response {
  const outputText = { type: "output_text", text: "captured", annotations: [] };
  const completedMessage = {
    id: "msg_capture",
    status: "completed",
    type: "message",
    role: "assistant",
    content: [outputText],
  };
  const completed = {
    id: "resp_capture",
    object: "response",
    created_at: 0,
    status: "completed",
    model,
    output: [completedMessage],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  };
  return sse([
    ["response.created", { type: "response.created", response: { ...completed, status: "in_progress", output: [] }, sequence_number: 0 }],
    ["response.output_item.added", { type: "response.output_item.added", output_index: 0, item: { ...completedMessage, status: "in_progress", content: [] }, sequence_number: 1 }],
    ["response.content_part.added", { type: "response.content_part.added", item_id: "msg_capture", output_index: 0, content_index: 0, part: { ...outputText, text: "" }, sequence_number: 2 }],
    ["response.output_text.delta", { type: "response.output_text.delta", delta: "captured", item_id: "msg_capture", output_index: 0, content_index: 0, sequence_number: 3 }],
    ["response.output_text.done", { type: "response.output_text.done", text: "captured", item_id: "msg_capture", output_index: 0, content_index: 0, sequence_number: 4 }],
    ["response.content_part.done", { type: "response.content_part.done", item_id: "msg_capture", output_index: 0, content_index: 0, part: outputText, sequence_number: 5 }],
    ["response.output_item.done", { type: "response.output_item.done", output_index: 0, item: completedMessage, sequence_number: 6 }],
    ["response.completed", { type: "response.completed", response: completed, sequence_number: 7 }],
  ]);
}

function chatCompletionsResponse(model: string, stream: boolean): Response {
  const completion = {
    id: "chatcmpl_capture",
    object: "chat.completion",
    created: 0,
    model,
    choices: [{ index: 0, message: { role: "assistant", content: "captured" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
  if (!stream) return Response.json(completion);

  const chunks = [
    { id: completion.id, object: "chat.completion.chunk", created: 0, model, choices: [{ index: 0, delta: { role: "assistant", content: "captured" }, finish_reason: null }] },
    { id: completion.id, object: "chat.completion.chunk", created: 0, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: completion.usage },
  ];
  return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`, {
    headers: { "cache-control": "no-cache", "content-type": "text/event-stream" },
  });
}

function geminiResponse(model: string, stream: boolean): Response {
  const response = {
    candidates: [{ content: { role: "model", parts: [{ text: "captured" }] }, finishReason: "STOP", index: 0 }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    modelVersion: model,
    responseId: "capture",
  };
  if (!stream) return Response.json(response);
  return new Response(`data: ${JSON.stringify(response)}\n\n`, {
    headers: { "cache-control": "no-cache", "content-type": "text/event-stream" },
  });
}

function anthropicResponse(model: string): Response {
  return sse([
    ["message_start", { type: "message_start", message: { id: "msg_capture", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "captured" } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } }],
    ["message_stop", { type: "message_stop" }],
  ]);
}

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    return Response.json({ status: "ok" });
  }
  if (request.method === "GET" && url.pathname.endsWith("/models")) {
    if (url.pathname.includes("/v1beta/")) {
      return Response.json({ models: [{ name: "models/capture-gemini", displayName: "Capture Gemini" }] });
    }
    return Response.json({
      object: "list",
      data: ["capture-model", ...Object.keys(snapshotsByModel)].map((id) => ({
        id,
        object: "model",
        owned_by: "local",
      })),
    });
  }
  if (request.method === "GET" && url.pathname.includes("/models/capture-gemini")) {
    return Response.json({ name: "models/capture-gemini", displayName: "Capture Gemini" });
  }
  if (request.method !== "POST") return Response.json({ error: "not found" }, { status: 404 });

  let payload: JsonObject;
  try {
    payload = (await request.json()) as JsonObject;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (url.pathname.endsWith("/messages/count_tokens")) return Response.json({ input_tokens: 1 });
  if (url.pathname.includes(":countTokens")) return Response.json({ totalTokens: 1 });
  if (url.pathname.endsWith("/messages")) {
    await writeSnapshot("claude-code.md", extractAnthropic(payload));
    return anthropicResponse(String(payload.model ?? "capture-model"));
  }
  if (url.pathname.endsWith("/responses")) {
    const model = String(payload.model ?? "capture-model");
    const originator = request.headers.get("originator");
    const filename = snapshotForOpenAI(model, originator);
    const sections = filename === "codex-desktop.md" ? extractCodexDesktop(payload) : extractOpenAI(payload);
    await writeSnapshot(filename, sections);
    return openAIResponse(model);
  }
  if (url.pathname.endsWith("/chat/completions")) {
    const model = String(payload.model ?? "capture-model");
    const filename = snapshotForModel(model, "openai-compatible.md");
    const sections = filename === "kimi-cli.md"
      ? extractKimi(payload)
      : filename === "openhands.md"
        ? extractOpenHands(payload)
        : filename === "mimo-code.md"
          ? extractMiMo(payload)
          : filename === "omp.md"
            ? extractOmp(payload)
            : filename === "crush.md" || filename === "opensquilla.md" || filename === "opencode.md" || filename === "kilo-code-cli.md"
          ? extractRunnerEnvironment(payload)
          : filename === "cline-cli.md" || filename === "cline-sdk.md"
            ? extractCline(payload)
            : filename === "hermes-agent.md"
              ? extractHermes(payload)
              : filename === "openclaw.md"
                ? extractOpenClaw(payload)
                : extractChatCompletions(payload);
    await writeSnapshot(filename, sections);
    return chatCompletionsResponse(model, payload.stream === true);
  }
  if (url.pathname.includes(":generateContent") || url.pathname.includes(":streamGenerateContent")) {
    const match = url.pathname.match(/\/models\/([^/:]+)/);
    const model = match?.[1] ?? "capture-gemini";
    await writeSnapshot(snapshotForModel(model, "gemini-cli.md"), extractGemini(payload));
    return geminiResponse(model, url.pathname.includes(":streamGenerateContent"));
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

if (import.meta.main) {
  const server = Bun.serve({
    hostname: process.env.CAPTURE_HOST ?? "127.0.0.1",
    port: Number(process.env.CAPTURE_PORT ?? "8787"),
    fetch: handleRequest,
  });
  console.log(`capture API listening on ${server.url}`);
}
