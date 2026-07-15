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

test("captures all CLI harnesses in one GitHub runner job", async () => {
  const workflow = await Bun.file(".github/workflows/capture.yml").text();
  expect(workflow).toContain("capture-cli:");
  expect(workflow).toContain("node-version: 24");
  expect(workflow).toContain("@kilocode/cli@latest");
  expect(workflow).toContain("cline@latest");
  expect(workflow).toContain("bun add @cline/sdk@latest");
  expect(workflow).toContain("openclaw@latest");
  expect(workflow).toContain("uv tool install --python 3.13 hermes-agent");
  expect(workflow).toContain("run: bun run capture-cline-sdk.ts");
  expect(workflow).toContain("test -s prompts/kilo-code-cli.md");
  expect(workflow).toContain("test -s prompts/cline-cli.md");
  expect(workflow).toContain("test -s prompts/cline-sdk.md");
  expect(workflow).toContain("test -s prompts/openclaw.md");
  expect(workflow).toContain("test -s prompts/hermes-agent.md");
  expect(workflow).toContain('echo "hermes_agent=${HERMES_VERSION%%$\'\\n\'*}" >> "$GITHUB_OUTPUT"');
});

test("runs captures on pushes, manual dispatches, and the weekly schedule", async () => {
  const workflow = await Bun.file(".github/workflows/capture.yml").text();
  expect(workflow).toContain("  push:");
  expect(workflow).toContain("  workflow_dispatch:");
  expect(workflow).toContain('cron: "17 3 * * 1"');
});
