type HarnessMetadata = {
  captured: boolean;
  version: string;
};

type Metadata = {
  claude_code: HarnessMetadata;
  codex: HarnessMetadata;
  codex_desktop: HarnessMetadata;
  gemini_cli: HarnessMetadata;
  grok_code_cli: HarnessMetadata;
  kimi_cli: HarnessMetadata;
  opencode: HarnessMetadata;
  pi: HarnessMetadata;
  qwen_code: HarnessMetadata;
};

const startMarker = "<!-- harness-results:start -->";
const endMarker = "<!-- harness-results:end -->";

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderResults(metadata: Metadata): string {
  const rows = [
    ["Codex CLI", metadata.codex, "prompts/codex.md"],
    ["Codex Desktop", metadata.codex_desktop, "prompts/codex-desktop.md"],
    ["Claude Code", metadata.claude_code, "prompts/claude-code.md"],
    ["Gemini CLI", metadata.gemini_cli, "prompts/gemini-cli.md"],
    ["OpenCode", metadata.opencode, "prompts/opencode.md"],
    ["Kimi CLI", metadata.kimi_cli, "prompts/kimi-cli.md"],
    ["Qwen Code", metadata.qwen_code, "prompts/qwen-code.md"],
    ["Grok Code CLI", metadata.grok_code_cli, "prompts/grok-code-cli.md"],
    ["Pi", metadata.pi, "prompts/pi.md"],
  ] as const;

  return [
    startMarker,
    "| Harness | Version | Status | System prompt |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      ([name, result, path]) =>
        `| ${name} | \`${cell(result.version)}\` | ${result.captured ? "✅ Captured" : "⏳ Pending"} | [View Markdown](${path}) |`,
    ),
    endMarker,
  ].join("\n");
}

export function replaceResults(readme: string, metadata: Metadata): string {
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);
  if (start < 0 || end < start) throw new Error("README result markers are missing or out of order");
  return `${readme.slice(0, start)}${renderResults(metadata)}${readme.slice(end + endMarker.length)}`;
}

if (import.meta.main) {
  const metadata = (await Bun.file("prompts/metadata.json").json()) as Metadata;
  const readme = await Bun.file("README.md").text();
  await Bun.write("README.md", replaceResults(readme, metadata));
}
