import { expect, test } from "bun:test";
import { renderResults, replaceResults } from "../scripts/update-readme";

const metadata = {
  claude_code: { captured: true, version: "2.1.210 (Claude Code)" },
  codex: { captured: true, version: "codex-cli 0.144.4" },
  gemini_cli: { captured: false, version: "unknown" },
  grok_code_cli: { captured: false, version: "unknown" },
  kimi_cli: { captured: false, version: "unknown" },
  opencode: { captured: false, version: "unknown" },
  pi: { captured: false, version: "unknown" },
  qwen_code: { captured: false, version: "unknown" },
};

test("renders linked harness results", () => {
  const table = renderResults(metadata);
  expect(table).toContain("| Codex CLI | `codex-cli 0.144.4` | ✅ Captured | [View Markdown](prompts/codex.md) |");
  expect(table).toContain("| Claude Code | `2.1.210 (Claude Code)` | ✅ Captured | [View Markdown](prompts/claude-code.md) |");
  expect(table).toContain("| Gemini CLI | `unknown` | ⏳ Pending | [View Markdown](prompts/gemini-cli.md) |");
  expect(table).toContain("| Pi | `unknown` | ⏳ Pending | [View Markdown](prompts/pi.md) |");
});

test("replaces only the marked README table", () => {
  const readme = "Before\n<!-- harness-results:start -->\nold\n<!-- harness-results:end -->\nAfter\n";
  const updated = replaceResults(readme, metadata);
  expect(updated.startsWith("Before\n<!-- harness-results:start -->")).toBeTrue();
  expect(updated.endsWith("<!-- harness-results:end -->\nAfter\n")).toBeTrue();
});
