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
  const system = [
    "x-anthropic-billing-header: cc_version=2.1.210.814; cc_entrypoint=sdk-cli; cch=volatile;",
    "first",
    " - OS Version: Linux 6.17.0-1020-azure",
  ].join("\n");
  expect(extractAnthropic({ system: [{ type: "text", text: system }, { type: "text", text: "second" }] })).toEqual([
    [
      "system",
      "x-anthropic-billing-header: cc_version=2.1.210.814; cc_entrypoint=sdk-cli;\nfirst\n - OS Version: Linux\nsecond",
    ],
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
