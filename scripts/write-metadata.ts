import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const outputDirectory = process.env.CAPTURE_OUTPUT_DIR ?? "prompts";
const codexSnapshot = Bun.file(join(outputDirectory, "codex.md"));
const claudeSnapshot = Bun.file(join(outputDirectory, "claude-code.md"));
const metadata = {
  claude_code: {
    captured: await claudeSnapshot.exists(),
    version: process.env.CLAUDE_CODE_VERSION ?? "unknown",
  },
  codex: {
    captured: await codexSnapshot.exists(),
    version: process.env.CODEX_VERSION ?? "unknown",
  },
};

await mkdir(outputDirectory, { recursive: true });
await Bun.write(join(outputDirectory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

if (!Object.values(metadata).every(({ captured }) => captured)) {
  throw new Error("one or more harness snapshots were not captured");
}
