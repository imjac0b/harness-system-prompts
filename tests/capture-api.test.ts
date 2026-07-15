import { expect, test } from "bun:test";
import { extractAnthropic, extractChatCompletions, extractCline, extractCodexDesktop, extractGemini, extractHermes, extractKimi, extractOpenAI, extractOpenClaw, extractOpenHands, extractRunnerEnvironment, snapshotForModel, snapshotForOpenAI, writeSnapshot } from "../scripts/capture-api";

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

test("normalizes Cline's current date", () => {
  expect(extractCline({ messages: [
    { role: "system", content: "<env>\n1. Platform: linux\n2. Date: 7/15/2026\n3. IDE: Terminal Shell\n</env>" },
  ] })).toEqual([
    ["system 1", "<env>\n1. Platform: linux\n2. Date: <CURRENT_DATE>\n3. IDE: Terminal Shell\n</env>"],
  ]);
});

test("normalizes Hermes' conversation start date", () => {
  expect(extractHermes({ messages: [
    { role: "system", content: "Host: Linux (6.17.0-1020-azure)\nConversation started: Wednesday, July 15, 2026\nModel: capture-hermes" },
  ] })).toEqual([
    ["system 1", "Host: Linux (<KERNEL_VERSION>)\nConversation started: <CURRENT_DATE>\nModel: capture-hermes"],
  ]);
});

test("normalizes OpenClaw's runner identity", () => {
  expect(extractOpenClaw({ messages: [
    { role: "system", content: "Runtime: agent=main | sessionId=38900de6-1d6f-4835-b805-fe2da463f9d1 | host=runnervm3jd5f | os=Linux 6.17.0-1020-azure (x64) | model=capture-openclaw" },
  ] })).toEqual([
    ["system 1", "Runtime: agent=main | sessionId=<SESSION_ID> | host=<HOSTNAME> | os=Linux <KERNEL_VERSION> (x64) | model=capture-openclaw"],
  ]);
});

test("normalizes OpenHands runtime context", () => {
  expect(extractOpenHands({ messages: [
    { role: "system", content: "<CURRENT_DATETIME>2026-07-16T03:42:11Z</CURRENT_DATETIME>\nYour current working directory is: /tmp/work\nUser operating system: Linux (kernel: 6.17.0-1020-azure)" },
  ] })).toEqual([
    ["system 1", "<CURRENT_DATETIME><CURRENT_DATE_TIME></CURRENT_DATETIME>\nYour current working directory is: <WORKSPACE>\nUser operating system: Linux (kernel: <KERNEL_VERSION>)"],
  ]);
});

test("normalizes runner paths and dates", () => {
  expect(extractRunnerEnvironment({ messages: [
    { role: "system", content: "<env>\n  Working directory: /tmp/work\n  Workspace root folder: /tmp/work\n  Today's date: Thu Jul 16 2026\n</env>" },
  ] })).toEqual([
    ["system 1", "<env>\n  Working directory: <WORKSPACE>\n  Workspace root folder: <WORKSPACE>\n  Today's date: <CURRENT_DATE>\n</env>"],
  ]);
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

test("routes added harness models to distinct snapshots", () => {
  expect(snapshotForModel("capture-agent-zero", "fallback.md")).toBe("agent-zero.md");
  expect(snapshotForModel("capture-aider", "fallback.md")).toBe("aider.md");
  expect(snapshotForModel("capture-kilo-code", "fallback.md")).toBe("kilo-code-cli.md");
  expect(snapshotForModel("capture-cline-cli", "fallback.md")).toBe("cline-cli.md");
  expect(snapshotForModel("capture-cline-sdk", "fallback.md")).toBe("cline-sdk.md");
  expect(snapshotForModel("capture-crush", "fallback.md")).toBe("crush.md");
  expect(snapshotForModel("capture-mimo-code", "fallback.md")).toBe("mimo-code.md");
  expect(snapshotForModel("capture-omp", "fallback.md")).toBe("omp.md");
  expect(snapshotForModel("capture-openclaw", "fallback.md")).toBe("openclaw.md");
  expect(snapshotForModel("capture-openhands", "fallback.md")).toBe("openhands.md");
  expect(snapshotForModel("capture-opensquilla", "fallback.md")).toBe("opensquilla.md");
  expect(snapshotForModel("capture-hermes", "fallback.md")).toBe("hermes-agent.md");
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
