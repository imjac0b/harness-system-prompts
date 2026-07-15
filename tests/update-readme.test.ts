import { expect, test } from "bun:test";
import { renderResults, replaceResults } from "../scripts/update-readme";

const metadata = {
  claude_code: { captured: true, version: "2.1.210 (Claude Code)" },
  codex: { captured: true, version: "codex-cli 0.144.4" },
};

test("renders linked harness results", () => {
  const table = renderResults(metadata);
  expect(table).toContain("| Codex CLI | `codex-cli 0.144.4` | ✅ Captured | [View Markdown](prompts/codex.md) |");
  expect(table).toContain("| Claude Code | `2.1.210 (Claude Code)` | ✅ Captured | [View Markdown](prompts/claude-code.md) |");
});

test("replaces only the marked README table", () => {
  const readme = "Before\n<!-- harness-results:start -->\nold\n<!-- harness-results:end -->\nAfter\n";
  const updated = replaceResults(readme, metadata);
  expect(updated.startsWith("Before\n<!-- harness-results:start -->")).toBeTrue();
  expect(updated.endsWith("<!-- harness-results:end -->\nAfter\n")).toBeTrue();
});
