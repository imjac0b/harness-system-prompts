import { chmod, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

type JsonObject = Record<string, unknown>;
type AsarEntry = { files?: Record<string, AsarEntry>; offset?: string; size?: number; unpacked?: boolean };
type PlatformBuild = { binary: string; checksum: string; size: number };
export type PinnedCli = {
  version: string;
  baseUrl: string;
  platforms: Record<string, PlatformBuild>;
  sdkWrapperVersion: string;
};

const codeTabAnchor = "You are running inside the Claude desktop app (Code tab).";
const identifier = String.raw`[A-Za-z_$][\w$]*`;

// Reads every JavaScript file under `.vite/build/` from an Electron app.asar archive.
export function readAsarSources(archive: Uint8Array): string[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const headerSize = view.getUint32(4, true);
  const jsonLength = view.getUint32(12, true);
  const header = JSON.parse(new TextDecoder().decode(archive.subarray(16, 16 + jsonLength))) as AsarEntry;
  const contentOffset = 8 + headerSize;
  const decoder = new TextDecoder();
  const sources: string[] = [];

  const walk = (entry: AsarEntry, path: string) => {
    for (const [name, child] of Object.entries(entry.files ?? {})) {
      const childPath = path ? `${path}/${name}` : name;
      if (child.files) {
        walk(child, childPath);
      } else if (childPath.startsWith(".vite/build/") && childPath.endsWith(".js") && !child.unpacked) {
        const start = contentOffset + Number(child.offset);
        sources.push(decoder.decode(archive.subarray(start, start + Number(child.size))));
      }
    }
  };
  walk(header, "");
  return sources;
}

// The desktop app embeds the manifest of the Claude Code build it downloads and spawns for the Code tab.
export function findPinnedCli(sources: string[]): PinnedCli {
  const pattern = /JSON\.parse\('(\{"version":"[^']*?"sdkWrapperVersion":"[^']*?"\})'\)/;
  for (const source of sources) {
    const match = source.match(pattern);
    if (!match) continue;
    const pinned = JSON.parse(match[1]) as JsonObject;
    const manifest = pinned.manifest as JsonObject | undefined;
    if (typeof pinned.version !== "string" || typeof pinned.baseUrl !== "string" || !manifest?.platforms) continue;
    return {
      version: pinned.version,
      baseUrl: pinned.baseUrl,
      platforms: manifest.platforms as Record<string, PlatformBuild>,
      sdkWrapperVersion: String(pinned.sdkWrapperVersion),
    };
  }
  throw new Error("Claude desktop bundle does not embed a pinned Claude Code manifest");
}

function decodeStringLiteral(body: string): string {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n|[\s\S])/g, (_escape, sequence: string) => {
    if (sequence.startsWith("u{")) return String.fromCodePoint(Number.parseInt(sequence.slice(2, -1), 16));
    if (sequence.length > 1 && (sequence[0] === "u" || sequence[0] === "x")) {
      return String.fromCharCode(Number.parseInt(sequence.slice(1), 16));
    }
    if (sequence === "\n" || sequence === "\r\n") return "";
    return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0" }[sequence] ?? sequence;
  });
}

// Maps every `name="..."`, `name='...'` or interpolation-free `name=\`...\`` assignment to its value.
export function stringConstants(source: string): Map<string, string> {
  const constants = new Map<string, string>();
  const pattern = new RegExp(
    String.raw`(?:^|[,;{}\s])(${identifier})=("(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*'|\`(?:[^\`\\$]|\\[\s\S]|\$(?!\{))*\`)`,
    "g",
  );
  for (const match of source.matchAll(pattern)) {
    if (!constants.has(match[1])) constants.set(match[1], decodeStringLiteral(match[2].slice(1, -1)));
  }
  return constants;
}

// Rebuilds the system-prompt append every local Code tab session starts from: the desktop-app notice,
// the Code tab's file-link and Run-button guidance, and the terminal-dialog slash command caveat.
// Everything the app adds after that depends on feature flags, the signed-in account or attached tools.
export function findCodeTabAppend(sources: string[]): string {
  for (const source of sources) {
    if (!source.includes(codeTabAnchor)) continue;
    const constants = stringConstants(source);
    const base = [...constants].find(([, value]) => value.trimStart().startsWith(codeTabAnchor))?.[0];
    if (!base) continue;
    const escaped = base.replaceAll("$", "\\$");
    const composition = new RegExp(
      String.raw`(${identifier})=${escaped};[\s\S]{0,1500}?${identifier}&&\(\1\+=(${identifier}),\1\+=(${identifier})\),\1\+=(${identifier});`,
    ).exec(source);
    if (!composition) continue;
    const parts = [base, composition[2], composition[3], composition[4]].map((name) => constants.get(name));
    if (parts.every((part): part is string => part !== undefined)) return parts.join("");
  }
  throw new Error("Claude desktop bundle does not contain the Code tab system prompt append");
}

async function downloadCli(pinned: PinnedCli, destination: string): Promise<void> {
  const platform = `${process.platform}-${process.arch}`;
  const build = pinned.platforms[platform];
  if (!build) throw new Error(`Pinned Claude Code ${pinned.version} has no ${platform} build`);
  const url = `${pinned.baseUrl}/${pinned.version}/${platform}/${build.binary}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Claude Code download failed with ${response.status}: ${url}`);
  const download = new Uint8Array(await response.arrayBuffer());
  const checksum = new Bun.CryptoHasher("sha256").update(download).digest("hex");
  if (checksum !== build.checksum) throw new Error(`Claude Code checksum mismatch for ${url}`);
  await mkdir(dirname(destination), { recursive: true });
  await Bun.write(destination, build.binary.endsWith(".zst") ? Bun.zstdDecompressSync(download) : download);
  await chmod(destination, 0o755);
}

async function installAgentSdk(version: string, directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  await Bun.write(join(directory, "package.json"), '{ "private": true }\n');
  const install = Bun.spawn({
    cmd: [process.execPath, "add", "--omit", "optional", `@anthropic-ai/claude-agent-sdk@${version}`],
    cwd: directory,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await install.exited) !== 0) throw new Error(`Installing @anthropic-ai/claude-agent-sdk@${version} failed`);
  return Bun.resolveSync("@anthropic-ai/claude-agent-sdk", directory);
}

if (import.meta.main) {
  const candidateApps = [process.env.CLAUDE_DESKTOP_APP_PATH, "/Applications/Claude.app"]
    .filter((path): path is string => Boolean(path));
  const appPath = candidateApps.find((path) => Bun.file(join(path, "Contents/Resources/app.asar")).size > 0);
  if (!appPath) throw new Error("Claude desktop app bundle is required");

  const sources = readAsarSources(await Bun.file(join(appPath, "Contents/Resources/app.asar")).bytes());
  const pinned = findPinnedCli(sources);
  const append = findCodeTabAppend(sources);

  const temporary = process.env.TMPDIR ?? "/tmp";
  const cliPath = process.env.CLAUDE_CODE_DESKTOP_CLI_PATH
    ?? join(temporary, `claude-code-desktop-${crypto.randomUUID()}`, "claude");
  await downloadCli(pinned, cliPath);

  // Drive the pinned CLI through the same Agent SDK release the desktop app bundles.
  const sdkVersion = pinned.sdkWrapperVersion.split("-")[0];
  const sdkDirectory = process.env.CLAUDE_AGENT_SDK_DIR ?? join(temporary, `claude-agent-sdk-${crypto.randomUUID()}`);
  const sdk = await import(await installAgentSdk(sdkVersion, sdkDirectory));
  const query = sdk.query as (input: { prompt: string; options: JsonObject }) => AsyncIterable<JsonObject>;

  const workspace = process.env.CAPTURE_WORKSPACE ?? process.cwd();
  const captureBaseUrl = process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:8787";
  let result: JsonObject | undefined;
  for await (const message of query({
    prompt: "Reply with the word captured.",
    options: {
      cwd: workspace,
      model: "capture-model",
      maxTurns: 1,
      permissionMode: "default",
      settingSources: ["user", "project", "local"],
      includePartialMessages: true,
      enableFileCheckpointing: true,
      systemPrompt: { type: "preset", preset: "claude_code", append },
      pathToClaudeCodeExecutable: cliPath,
      env: {
        ...process.env,
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? "local-capture-only",
        ANTHROPIC_BASE_URL: captureBaseUrl,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        CLAUDE_CODE_ENTRYPOINT: "claude-desktop",
        DISABLE_AUTOUPDATER: "1",
      },
    },
  })) {
    if (message.type === "result") result = message;
  }
  if (result?.subtype !== "success") throw new Error(`Claude Code Desktop capture failed: ${JSON.stringify(result)}`);
  console.log(`captured Claude Code Desktop prompt with Claude Code ${pinned.version} (Agent SDK ${sdkVersion})`);
}
