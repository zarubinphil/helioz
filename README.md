# helioz — the work never stops

<p align="center">
  <img src="docs/assets/helioz-hero.png" alt="Helioz: a serene white marble statue of Helios with a radiant sun-disc beside the classical marble column, warm ivory light, soft blue and gold threads assembling a layered glass system" width="100%">
</p>

## Who I am

Hello. I am Helioz.

In the old stories I drove the sun chariot across the sky every single day. No weekends, no holidays, no "not today". The sun rose because I was working.

Now I do the same with tasks.

Philipp Zarubin built me. The reason is boring: he is a lawyer and a father of two girls, and he has almost no time. Night, court, kids — and the work stands still because nobody is driving it. Now I drive.

I belong to a family: [Olympuz](https://github.com/zarubinphil/olympuz) is the swarm cockpit, [Zeuz](https://github.com/zarubinphil/zeuz) is the factory that births systems like me, [Mnemazine](https://github.com/zarubinphil/mnemazine) is memory, [Themis](https://github.com/zarubinphil/themis) runs a law practice, [Athena](https://github.com/zarubinphil/athena) is the agent OS all of it lives on. My lot in that family is one thing: continuity. The work moves while you sleep.

## Why you need me (in plain words)

Picture a worker who can do anything but has three flaws. He says "done" when it is not done. He wakes you at 3am over nothing. And he forgets everything the moment you switch him off.

Every flaw gets an instrument, not a promise:

**"Done" is judged by a program, not by him.** One agent works, a DIFFERENT one verifies — and the verifier never reads the first one's report, it looks at the disk and runs commands. Nobody grades their own homework. Not even me.

**The "finished" mark is written by code.** It carries fingerprints: commits before and after, a hash of the changed files, the exit code of the check. You cannot forge it — hand-written, truncated or copied from another task, I see it and call it out.

**At night nobody wakes you.** Small forks go to a council of independent advisors: one looks at risk, another at the cost of undoing, a third at simplicity. Each writes a position without seeing the others. Then the decision is checked against your goal. In the morning you read what was decided and can replay it with one message.

**Three things I never decide alone:** production actions, conflicts with someone else's work, and forks that are expensive to undo either way. Those wait for you — and while they wait, I work on everything else. I never idle.

**Kill me at any moment — nothing is lost.** Everything I know lives on disk, not in my head. The next me continues from the same line.

**Empty means red.** Empty queue, unreadable state, a council without your goal — all refusals, not "eh, good enough". A gate that turns green on nothing is worse than no gate.

## How it actually looks

You give me a goal in one file, `queue/GOAL.md`. That is my compass: every decision I make without you gets checked against it.

Tasks go into `queue/tasks/`. Each one must carry a check command. No command, no task: "done" without proof is not done.

Then I drive:

```text
goal → queue/GOAL.md · tasks → queue/tasks/*.task.md (no check command, not accepted)
   ↓
tact: heartbeat → pull your Telegram answers → budget → pick a task → probe agents
   → start (code will not let two touch one file) → executor → blind verifier
   → check command + adversarial probe → integrity mark → report to you
   ↓
fork? your three cases wait in the queue while I keep working · small night forks go to the council
   (lenses apart → blind synthesis → checked against the goal → ledger) → replay it in the morning
   ↓
context running out → handoff → the watchdog starts a fresh session from disk. Nothing is lost.
```

Everything important lands in your Telegram: stage, percent, what went wrong and how I got out — plain words, no code. Say "stop" and I freeze losslessly. Say "go" and I continue.

## Install

```bash
git clone https://github.com/zarubinphil/helioz.git ~/helioz
cd ~/helioz
bash install.sh en
```

`install.sh` first introduces itself and explains how I work, then checks what you have (Node, git, at least one agent CLI: claude, codex or kimi), runs my instruments through their selftests and tells you what is left to do by hand. Needs macOS or Linux and Node.js 20+.

After that:

```bash
bash scripts/helioz-start.sh
```

## What is inside

| Path | What it does |
|---|---|
| `ORCHESTRATOR.md` | the frozen orchestrator prompt — the tact above |
| `scripts/helioz-gate.mjs` | queue, slots, dependencies, forgery-proof marks, stop, budget, adopting foreign work |
| `scripts/helioz-zeus.mjs` | Telegram: reports queue on disk and arrive, fork buttons, stop/go/replay |
| `scripts/helioz-exec.mjs` | honest agent probe (a real run, not a version check), rotation, role runner |
| `scripts/helioz-council.mjs` | night council: lenses apart, blind synthesis, ledger; forbidden cases refused |
| `scripts/helioz-watchdog.sh` | heartbeat gone → start a new session with the handoff |
| `scripts/helioz-probes.mjs` | six adversarial probes; only they grant the project its "ready" status |
| `docs/CONTRACTS.md` | on-disk state contracts: tasks, forks, marks, ledger |
| `docs/BRAND.md` | design description, an instance of the Pantheon Design System |

## How I prove I am not lying

Six probes run with one command and must all be green:

```bash
node scripts/helioz-probes.mjs
```

Kill the orchestrator mid-task — the next one continues. Forge a mark — caught. Stay silent for a day — work goes on, forks intact. Cut Telegram — reports queue up and arrive later. Hand the council a forbidden fork — it refuses. Send two executors at one file — the second never starts.

The probes test me, not my claims about myself. A red probe means no "ready" status.

## A star

If Helioz turns out useful — star it: [github.com/zarubinphil/helioz](https://github.com/zarubinphil/helioz).

Seconds for you, genuinely important for the project. And meet the family: [themis](https://github.com/zarubinphil/themis), [mnemazine](https://github.com/zarubinphil/mnemazine), [zeuz](https://github.com/zarubinphil/zeuz), [athena](https://github.com/zarubinphil/athena), [smltlk](https://github.com/zarubinphil/smltlk).

---

Русская версия: [README.ru.md](README.ru.md)
