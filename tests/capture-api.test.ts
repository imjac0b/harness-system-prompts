import { expect, test } from "bun:test";
import { extractAnthropic, extractChatCompletions, extractCodexDesktop, extractGemini, extractKimi, extractOpenAI, snapshotForOpenAI, writeSnapshot } from "../scripts/capture-api";

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

test("extracts OpenAI-compatible system messages", () => {
  expect(extractChatCompletions({ messages: [
    { role: "system", content: "base prompt" },
    { role: "developer", content: [{ type: "text", text: "repo prompt" }] },
    { role: "user", content: "skip me" },
  ] })).toEqual([
    ["system 1", "base prompt"],
    ["developer 2", "repo prompt"],
  ]);
});

test("normalizes Kimi's current date and time", () => {
  const prefix = "The current date and time in ISO format is `";
  const suffix = "`. This is only a reference.";
  const extractAt = (timestamp: string) => extractKimi({ messages: [
    { role: "system", content: `${prefix}${timestamp}${suffix}` },
  ] });
  const expected: [string, string][] = [
    ["system 1", `${prefix}<CURRENT_DATE_TIME>${suffix}`],
  ];

  expect(extractAt("2026-07-15T19:16:49.262327+00:00")).toEqual(expected);
  expect(extractAt("2026-07-16T03:42:11.900001Z")).toEqual(expected);
});

test("extracts Gemini system instructions", () => {
  expect(extractGemini({ systemInstruction: { parts: [{ text: "base prompt" }] } })).toEqual([
    ["system instruction", "base prompt"],
  ]);
});

test("routes Codex Desktop requests by originator", () => {
  expect(snapshotForOpenAI("gpt-5.6-sol", "Codex Desktop")).toBe("codex-desktop.md");
  expect(snapshotForOpenAI("capture-model", "codex_exec")).toBe("codex.md");
});

test("normalizes Codex Desktop skill paths", () => {
  expect(extractCodexDesktop({ instructions: "skill (file: /tmp/codex-home/skills/demo/SKILL.md)" })).toEqual([
    ["instructions", "skill (file: $CODEX_HOME/skills/demo/SKILL.md)"],
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
