import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const outputDirectory = process.env.CAPTURE_OUTPUT_DIR ?? "prompts";
type HarnessMetadata = { captured: boolean; version: string };
const harnesses = {
  claude_code: ["claude-code.md", "CLAUDE_CODE_VERSION"],
  codex: ["codex.md", "CODEX_VERSION"],
  gemini_cli: ["gemini-cli.md", "GEMINI_CLI_VERSION"],
  grok_code_cli: ["grok-code-cli.md", "GROK_CODE_CLI_VERSION"],
  kimi_cli: ["kimi-cli.md", "KIMI_CLI_VERSION"],
  opencode: ["opencode.md", "OPENCODE_VERSION"],
  pi: ["pi.md", "PI_VERSION"],
  qwen_code: ["qwen-code.md", "QWEN_CODE_VERSION"],
} as const;

const metadata = Object.fromEntries(
  await Promise.all(
    Object.entries(harnesses).map(async ([key, [filename, versionVariable]]) => [
      key,
      {
        captured: await Bun.file(join(outputDirectory, filename)).exists(),
        version: process.env[versionVariable] ?? "unknown",
      },
    ]),
  ),
) as Record<string, HarnessMetadata>;

await mkdir(outputDirectory, { recursive: true });
await Bun.write(join(outputDirectory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

if (process.env.REQUIRE_ALL_CAPTURES === "1" && !Object.values(metadata).every(({ captured }) => captured)) {
  throw new Error("one or more harness snapshots were not captured");
}
