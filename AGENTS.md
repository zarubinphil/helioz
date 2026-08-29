# Agent Rules

- Run `node scripts/helioz-probes.mjs` before publishing behavior changes.
- Run `node scripts/helioz-gate.mjs --smoke --json` before handoff when a live queue exists.
- Keep `.helioz/`, `queue/`, secrets, logs, and local runtime state out of git.
- Do not mark a task done without a check command and an integrity marker written by code.
- Public release requires `$HOME/.codex/bin/public-repo-gate check --repo . --release-intent public`.

## Public packaging

- `README.md` and `README.ru.md` follow the shared family anatomy: promise, badges, wide hero, table of
  contents, and the ten beginner headings with the ASCII workflow diagram inside `How It Works`.
- Workflow stages live in `.github/pantheon.json`. Change the stages there first, then the two READMEs.
- `AGENTS.md` holds the rules; `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, and
  `.cursor/rules/*.mdc` only point here.
- Run `public-repo-gate check --repo . --release-intent public` before any push, and fix every blocker.
- Agent work here is tracked by Entire, and its checkpoints go to the separate private repository
  `zarubinvibe/helioz-checkpoints`. Session capture stays on: a public repository never stores its own
  checkpoints, and the release gate blocks a push when tracking is disabled or the checkpoint repository is public.
