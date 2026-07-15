import { expect, test } from "bun:test";

test("selects Gemini API key authentication in the isolated runner home", async () => {
  const workflow = await Bun.file(".github/workflows/capture.yml").text();
  expect(workflow).toContain('{"security":{"auth":{"selectedType":"gemini-api-key"}}}');
  expect(workflow.indexOf('"selectedType":"gemini-api-key"')).toBeLessThan(
    workflow.indexOf('gemini -p "Reply with the word captured."'),
  );
});

test("captures Codex Desktop on macOS and publishes one combined update", async () => {
  const workflow = await Bun.file(".github/workflows/capture.yml").text();
  expect(workflow).toContain("capture-codex-desktop:");
  expect(workflow).toContain("runs-on: macos-latest");
  expect(workflow).toContain("https://persistent.oaistatic.com/codex-app-prod/Codex.dmg");
  expect(workflow).toContain("run: bun run capture-codex-desktop");
  expect(workflow).toContain("needs: [capture-cli, capture-codex-desktop]");
  expect(workflow).toContain("test -s prompts/codex-desktop.md");
});
