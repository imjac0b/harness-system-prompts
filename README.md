# harness-system-prompts

Captures the system and developer instructions that Codex CLI and Claude Code send to explicitly configured, local API-compatible endpoints.

The Bun-powered GitHub Action installs the latest published CLI packages, starts a loopback-only capture server, runs one non-interactive request through each harness, and commits changed snapshots under `prompts/`. The committed metadata records the exact CLI versions used for each capture.

## Run it

Open **Actions → Capture harness system prompts → Run workflow**. The scheduled job also runs every Monday at 03:17 UTC.

The workflow uses dummy local credentials. It requires no OpenAI or Anthropic API key. Its `GITHUB_TOKEN` has `contents: write` permission so it can commit changed snapshots to the current default branch.

## Files

- `scripts/capture-api.ts` implements the loopback OpenAI Responses and Anthropic Messages endpoints with `Bun.serve`.
- `scripts/write-metadata.ts` records CLI versions and capture status.
- `prompts/codex.md` contains Codex system/developer instructions.
- `prompts/claude-code.md` contains Claude Code system instructions.
- `prompts/metadata.json` identifies the harness versions used for the snapshots.

Captured instructions remain the property of their respective authors. Review their terms before redistributing snapshot content.

## Local smoke test

```sh
bun install
bun test
bun run typecheck
```
