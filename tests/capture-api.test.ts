import { expect, test } from "bun:test";
import { extractAnthropic, extractOpenAI, writeSnapshot } from "../scripts/capture-api";

test("extracts OpenAI instructions and developer input", () => {
  expect(
    extractOpenAI({
      instructions: "base prompt",
      input: [
        { role: "developer", content: [{ type: "input_text", text: "repo prompt" }] },
        { role: "user", content: "skip me" },
      ],
    }),
  ).toEqual([
    ["instructions", "base prompt"],
    ["developer 1", "repo prompt"],
  ]);
});

test("extracts Anthropic text blocks", () => {
  expect(extractAnthropic({ system: [{ type: "text", text: "first" }, { type: "text", text: "second" }] })).toEqual([
    ["system", "first\nsecond"],
  ]);
});

test("writes stable snapshots", async () => {
  const directory = `${process.env.TMPDIR ?? "/tmp"}/capture-test-${crypto.randomUUID()}`;
  await writeSnapshot("test.md", "Test", [["system", "content"]], directory);
  const first = await Bun.file(`${directory}/test.md`).text();
  await writeSnapshot("test.md", "Test", [["system", "content"]], directory);
  expect(await Bun.file(`${directory}/test.md`).text()).toBe(first);
});
