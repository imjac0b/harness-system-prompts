const packageName = process.env.CLINE_SDK_PACKAGE ?? "@cline/sdk";
const sdk = await import(packageName);
const Agent = sdk.Agent as new (config: Record<string, unknown>) => {
  run(input: string): Promise<{ status: string; error?: Error }>;
};
const getClineDefaultSystemPrompt = sdk.getClineDefaultSystemPrompt as (
  options: Record<string, unknown>,
) => string;

if (!Agent || !getClineDefaultSystemPrompt) {
  throw new Error("@cline/sdk does not expose Agent and getClineDefaultSystemPrompt");
}

const workspace = process.env.CAPTURE_WORKSPACE ?? process.cwd();
const agent = new Agent({
  providerId: "openai-compatible",
  modelId: "capture-cline-sdk",
  apiKey: "local-capture-only",
  baseUrl: "http://127.0.0.1:8787/v1",
  systemPrompt: getClineDefaultSystemPrompt({
    ide: "Cline SDK",
    mode: "act",
    platform: process.platform,
    providerId: "openai-compatible",
    workspaceName: "harness-sandbox",
    workspaceRoot: workspace,
  }),
  tools: [],
});

const result = await agent.run("Reply with the word captured.");
if (result.status !== "completed") {
  throw result.error ?? new Error(`Cline SDK capture ended with status ${result.status}`);
}
