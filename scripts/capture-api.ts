import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";

type JsonObject = Record<string, unknown>;
export type Section = [label: string, content: string];

const outputDirectory = process.env.CAPTURE_OUTPUT_DIR ?? "prompts";

export function textFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFrom).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const record = value as JsonObject;
    for (const key of ["text", "input_text", "content"]) {
      if (key in record) return textFrom(record[key]);
    }
  }
  return "";
}

function uniqueSections(sections: Section[]): Section[] {
  const seen = new Set<string>();
  return sections.flatMap(([label, rawContent]) => {
    const content = rawContent.trim();
    if (!content || seen.has(content)) return [];
    seen.add(content);
    return [[label, content] satisfies Section];
  });
}

export function extractOpenAI(payload: JsonObject): Section[] {
  const sections: Section[] = [];
  const instructions = textFrom(payload.instructions);
  if (instructions) sections.push(["instructions", instructions]);

  if (Array.isArray(payload.input)) {
    payload.input.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const record = item as JsonObject;
      if (record.role === "system" || record.role === "developer") {
        sections.push([`${record.role} ${index + 1}`, textFrom(record.content)]);
      }
    });
  }
  return uniqueSections(sections);
}

export function extractAnthropic(payload: JsonObject): Section[] {
  return uniqueSections([["system", textFrom(payload.system)]]);
}

export async function writeSnapshot(
  filename: string,
  harness: string,
  sections: Section[],
  directory = outputDirectory,
): Promise<void> {
  if (sections.length === 0) return;
  const lines = [`# ${harness} instructions`, ""];
  for (const [label, content] of sections) {
    lines.push(`## ${label}`, "", content, "");
  }

  await mkdir(directory, { recursive: true });
  const target = join(directory, filename);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await Bun.write(temporary, `${lines.join("\n").trimEnd()}\n`);
  await rename(temporary, target);
}

function sse(events: Array<[event: string, payload: JsonObject]>): Response {
  const body = events
    .map(([event, payload]) => `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
    .join("");
  return new Response(body, {
    headers: {
      "cache-control": "no-cache",
      "content-type": "text/event-stream",
    },
  });
}

function openAIResponse(model: string): Response {
  const outputText = { type: "output_text", text: "captured", annotations: [] };
  const completedMessage = {
    id: "msg_capture",
    status: "completed",
    type: "message",
    role: "assistant",
    content: [outputText],
  };
  const completed = {
    id: "resp_capture",
    object: "response",
    created_at: 0,
    status: "completed",
    model,
    output: [completedMessage],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  };
  return sse([
    ["response.created", { type: "response.created", response: { ...completed, status: "in_progress", output: [] }, sequence_number: 0 }],
    ["response.output_item.added", { type: "response.output_item.added", output_index: 0, item: { ...completedMessage, status: "in_progress", content: [] }, sequence_number: 1 }],
    ["response.content_part.added", { type: "response.content_part.added", item_id: "msg_capture", output_index: 0, content_index: 0, part: { ...outputText, text: "" }, sequence_number: 2 }],
    ["response.output_text.delta", { type: "response.output_text.delta", delta: "captured", item_id: "msg_capture", output_index: 0, content_index: 0, sequence_number: 3 }],
    ["response.output_text.done", { type: "response.output_text.done", text: "captured", item_id: "msg_capture", output_index: 0, content_index: 0, sequence_number: 4 }],
    ["response.content_part.done", { type: "response.content_part.done", item_id: "msg_capture", output_index: 0, content_index: 0, part: outputText, sequence_number: 5 }],
    ["response.output_item.done", { type: "response.output_item.done", output_index: 0, item: completedMessage, sequence_number: 6 }],
    ["response.completed", { type: "response.completed", response: completed, sequence_number: 7 }],
  ]);
}

function anthropicResponse(model: string): Response {
  return sse([
    ["message_start", { type: "message_start", message: { id: "msg_capture", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "captured" } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } }],
    ["message_stop", { type: "message_stop" }],
  ]);
}

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    return Response.json({ status: "ok" });
  }
  if (request.method === "GET" && url.pathname.endsWith("/models")) {
    return Response.json({ object: "list", data: [{ id: "capture-model", object: "model", owned_by: "local" }] });
  }
  if (request.method !== "POST") return Response.json({ error: "not found" }, { status: 404 });

  let payload: JsonObject;
  try {
    payload = (await request.json()) as JsonObject;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (url.pathname.endsWith("/messages/count_tokens")) return Response.json({ input_tokens: 1 });
  if (url.pathname.endsWith("/messages")) {
    await writeSnapshot("claude-code.md", "Claude Code", extractAnthropic(payload));
    return anthropicResponse(String(payload.model ?? "capture-model"));
  }
  if (url.pathname.endsWith("/responses")) {
    await writeSnapshot("codex.md", "Codex", extractOpenAI(payload));
    return openAIResponse(String(payload.model ?? "capture-model"));
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

if (import.meta.main) {
  const server = Bun.serve({
    hostname: process.env.CAPTURE_HOST ?? "127.0.0.1",
    port: Number(process.env.CAPTURE_PORT ?? "8787"),
    fetch: handleRequest,
  });
  console.log(`capture API listening on ${server.url}`);
}
