import { expect, test } from "bun:test";

test("selects Gemini API key authentication in the isolated runner home", async () => {
  const workflow = await Bun.file(".github/workflows/capture.yml").text();
  expect(workflow).toContain('{"security":{"auth":{"selectedType":"gemini-api-key"}}}');
  expect(workflow.indexOf('"selectedType":"gemini-api-key"')).toBeLessThan(
    workflow.indexOf('gemini -p "Reply with the word captured."'),
  );
});
