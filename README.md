# helioz — the work never stops

<p align="center">
  <img src="docs/assets/helioz-hero.png" alt="Helioz: a serene white marble statue of Helios with a radiant sun-disc beside the classical marble column, warm ivory light, soft blue and gold threads assembling a layered glass system" width="100%">
</p>

**Helioz** is the 24/7 orchestration conveyor of the **Olympuz pantheon** — a sibling of Zeuz (the factory), Mnemazine (memory), Themis (legal practice) and Olympuz itself (the swarm cockpit). Its lot is continuous runs: the owner drops tasks, and work never stands still. At night nobody wakes the owner — a council of independent advisors decides (Karpathy-style), and quiet Telegram reports fly to the owner's bot («Зевс»), so any decision can be replayed in the morning. Like Helios driving his chariot across the sky without a single day off, the conveyor keeps moving while everyone sleeps.

## Why

An autonomous agent will happily report "done" without proof, forge its own checkmarks, wake you at 3am over a trivial fork, or silently die and lose everything it knew. Helioz answers each of those with an instrument, not a promise:

- **State lives on disk, never in an agent's memory.** Kill the orchestrator at any moment — the next one continues from the instrument.
- **A completion marker is written only by code** — with base/head commits, a hash of changed files and the check's exit code. A hand-made, truncated or copied marker is detected as `tampered`.
- **Generator never judges itself.** Executor and verifier are different CLIs (claude / codex / kimi, live-probed, rotated); the verifier never sees the executor's report — only the disk.
- **Three escalation cases** reach the owner (production, foreign work conflict, expensive-to-revert fork). Everything else is decided by default or, at night, by a council of lenses that must serve the owner's stated goal — or abstain.
- **Fail-closed everywhere.** Empty queue is red. Unreadable state is red. A council without the owner's goal refuses to decide.

## Flow

```text
owner: goal → queue/GOAL.md · tasks → queue/tasks/*.task.md (no check_cmd → not accepted)
   ↓
orchestrator tact:  beat → poll Zeus → budget → ready → probe CLI → start (code blocks path overlaps)
   → executor (headless CLI, background) → blind verifier (different CLI)
   → gate --task: check_cmd + adversarial probe → integrity marker → finish → report to Telegram
   ↓
fork? → three owner-cases wait in queue (conveyor keeps working) · night default-forks → council
   (isolated lenses → blind synthesis → decision must serve owner's goal → ledger) → replayable in the morning
   ↓
context low → handoff → watchdog (launchd) restarts a fresh orchestrator from disk. Nothing is lost.
```

## Layout

| Path | What |
|---|---|
| `ORCHESTRATOR.md` | frozen orchestrator prompt (the tact above) |
| `scripts/helioz-gate.mjs` | queue, slots, dependency graph, tampered-proof markers, STOP, budget, `--adopt` |
| `scripts/helioz-zeus.mjs` | Telegram channel: durable outbox → best-effort delivery, fork buttons, stop/go/replay |
| `scripts/helioz-exec.mjs` | honest CLI probe (a real run, not a version check), rotation, role runner |
| `scripts/helioz-council.mjs` | night council: lenses in isolation → blind synthesis → ledger; forbidden cases refused |
| `scripts/helioz-watchdog.sh` | stale heartbeat → new orchestrator session with handoff |
| `scripts/helioz-probes.mjs` | six end-to-end adversarial probes; the only writer of `READY.json` |
| `docs/CONTRACTS.md` | on-disk state contracts (tasks, forks, markers, ledger) |
| `docs/BRAND.md` | design description — Pantheon Design System instance |

## Run

```bash
bash scripts/helioz-start.sh
```

Owner controls from Telegram: buttons under a fork, or `<fork-id> <option>`; «стоп» freezes everything losslessly, «пуск» resumes.

Six adversarial probes must stay green (`node scripts/helioz-probes.mjs`): orchestrator killed mid-task, forged marker, silent owner for a day, Telegram down, forbidden fork given to the council, two executors on overlapping files.

---

Русская версия: [README.ru.md](README.ru.md)
