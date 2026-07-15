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
  expect(extractAnthropic({ system: [{ type: "text", text: "x-anthropic-billing-header: cch=volatile;\nfirst" }, { type: "text", text: "second" }] })).toEqual([
    ["system", "first\nsecond"],
  ]);
});

test("writes stable snapshots", async () => {
  const directory = `${process.env.TMPDIR ?? "/tmp"}/capture-test-${crypto.randomUUID()}`;
  await writeSnapshot("test.md", [["system", "first"], ["developer", "second"]], directory);
  const first = await Bun.file(`${directory}/test.md`).text();
  expect(first).toBe("first\n\nsecond\n");
  await writeSnapshot("test.md", [["system", "first"], ["developer", "second"]], directory);
  expect(await Bun.file(`${directory}/test.md`).text()).toBe(first);
});
