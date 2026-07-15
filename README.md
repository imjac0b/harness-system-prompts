# harness-system-prompts

Automatically captures and versions the system instructions sent by popular coding-agent harnesses to their model APIs.

The project uses a Bun-powered loopback server that implements the OpenAI Responses and Anthropic Messages API shapes. Each harness connects to this local server with dummy credentials, sends its assembled instructions, receives a minimal successful response, and exits. GitHub Actions commits each meaningful prompt or harness-version change.

## Latest captures

<!-- harness-results:start -->
| Harness | Version | Status | System prompt |
| --- | --- | --- | --- |
| Codex CLI | `codex-cli 0.144.4` | ✅ Captured | [View Markdown](prompts/codex.md) |
| Claude Code | `2.1.210 (Claude Code)` | ✅ Captured | [View Markdown](prompts/claude-code.md) |
<!-- harness-results:end -->

## How captures stay reproducible

Each run creates an empty `main` Git repository under the runner's temporary directory with a deterministic Git identity. Codex CLI and Claude Code both run inside that clean sandbox, producing stable branch, status, and commit-history context. The snapshot writer stores raw instruction bodies, removes Claude Code's per-request billing header, and avoids generated headings or timestamps.

## Run the capture

The workflow runs every Monday at 03:17 UTC and supports manual dispatch from **Actions → Capture harness system prompts → Run workflow**.

Fork maintainers can enable Actions and grant the workflow `contents: write` permission. The workflow's dummy credentials connect exclusively to its loopback capture server.

## Local development

Requirements: [Bun](https://bun.sh/) and Git.

```sh
bun install
bun test
bun run typecheck
```

Key files:

- `scripts/capture-api.ts` — loopback OpenAI Responses and Anthropic Messages endpoints
- `scripts/write-metadata.ts` — harness version and capture status metadata
- `scripts/update-readme.ts` — generated results table
- `.github/workflows/capture.yml` — scheduled capture and commit workflow

Captured instructions remain the property of their respective authors. Review each provider's terms before redistribution or reuse.
