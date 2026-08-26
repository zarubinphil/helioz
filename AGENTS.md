# Agent Rules

- Run `node scripts/helioz-probes.mjs` before publishing behavior changes.
- Run `node scripts/helioz-gate.mjs --smoke --json` before handoff when a live queue exists.
- Keep `.helioz/`, `queue/`, secrets, logs, and local runtime state out of git.
- Do not mark a task done without a check command and an integrity marker written by code.
- Public release requires `$HOME/.codex/bin/public-repo-gate check --repo . --release-intent public`.
