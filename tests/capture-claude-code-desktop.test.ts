import { expect, test } from "bun:test";
import { findCodeTabAppend, findPinnedCli, readAsarSources, stringConstants } from "../scripts/capture-claude-code-desktop";

function asar(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const contents: Uint8Array[] = [];
  const root: { files: Record<string, unknown> } = { files: {} };
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const bytes = encoder.encode(text);
    let directory = root;
    const names = path.split("/");
    for (const name of names.slice(0, -1)) {
      directory.files[name] ??= { files: {} };
      directory = directory.files[name] as typeof root;
    }
    directory.files[names.at(-1)!] = { offset: String(offset), size: bytes.length };
    contents.push(bytes);
    offset += bytes.length;
  }
  const json = encoder.encode(JSON.stringify(root));
  const header = new Uint8Array(16 + json.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 4, true);
  view.setUint32(4, 8 + json.length, true);
  view.setUint32(8, 4 + json.length, true);
  view.setUint32(12, json.length, true);
  header.set(json, 16);
  return new Uint8Array(Buffer.concat([header, ...contents]));
}

test("reads bundled JavaScript from an app.asar archive", () => {
  expect(readAsarSources(asar({
    ".vite/build/index.js": "main",
    ".vite/build/nested/chunk.js": "chunk",
    ".vite/renderer/view.js": "skip",
    "package.json": "{}",
  }))).toEqual(["main", "chunk"]);
});

test("decodes minified string constants", () => {
  const constants = stringConstants(String.raw`var a="line\n— \"quoted\"",b='it\'s',c=` + "`tick \\` $ done`" + ",d=`skip ${x}`;");
  expect(constants.get("a")).toBe('line\n— "quoted"');
  expect(constants.get("b")).toBe("it's");
  expect(constants.get("c")).toBe("tick ` $ done");
  expect(constants.has("d")).toBeFalse();
});

test("rebuilds the Code tab system prompt append", () => {
  const source = [
    'var kr="\\n\\nFile links.\\n",Ar="\\n\\nRun buttons.\\n",Mr="\\n\\nNo dialogs.\\n",Nr=`\\n\\nYou are running inside the Claude desktop app (Code tab).\\n`;',
    "async function start(){let T=a.systemPromptAppend,E=Nr;h&&(E+=ph()),T&&(E+=n.cc(T));",
    'let M=t.jz("sidebarMode"),P=M==="epitaxy"||M==="code";P&&(E+=kr,E+=Ar),E+=Mr;let F=a.spawnedFrom}',
  ].join("");
  expect(findCodeTabAppend(["unrelated", source])).toBe(
    "\n\nYou are running inside the Claude desktop app (Code tab).\n\n\nFile links.\n\n\nRun buttons.\n\n\nNo dialogs.\n",
  );
  expect(() => findCodeTabAppend(["unrelated"])).toThrow("Code tab system prompt append");
});

test("finds the Claude Code build the desktop app pins", () => {
  const pinned = {
    version: "2.1.280",
    manifest: { version: "2.1.280", platforms: { "darwin-arm64": { binary: "claude.zst", checksum: "abc", size: 1 } } },
    baseUrl: "https://downloads.claude.ai/claude-code-releases/rc/abc",
    sdkWrapperVersion: "0.3.280-rc.20260921",
  };
  expect(findPinnedCli([`function mg(){return JSON.parse('${JSON.stringify(pinned)}')}`])).toEqual({
    version: "2.1.280",
    baseUrl: "https://downloads.claude.ai/claude-code-releases/rc/abc",
    platforms: pinned.manifest.platforms,
    sdkWrapperVersion: "0.3.280-rc.20260921",
  });
});
