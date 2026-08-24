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

**I never start from a guess.** First the interrogation: one question at a time, each with a ready answer of mine, over a fixed list of topics — so it never turns out half a day later that we built the wrong thing. Without answers to the critical questions I refuse to plan.

**"Done" is judged by a program, not by him.** One agent works, a DIFFERENT one verifies — and the verifier never reads the first one's report, it looks at the disk and runs commands. Nobody grades their own homework. Not even me.

**The "finished" mark is written by code.** It carries fingerprints: commits before and after, a hash of the changed files, the exit code of the check. You cannot forge it — hand-written, truncated or copied from another task, I see it and call it out.

**At night nobody wakes you.** Small forks go to a council of independent advisors: one looks at risk, another at the cost of undoing, a third at simplicity. Each writes a position without seeing the others. Then the decision is checked against your goal. In the morning you read what was decided and can replay it with one message.

**Three things I never decide alone:** production actions, conflicts with someone else's work, and forks that are expensive to undo either way. Those wait for you — and while they wait, I work on everything else. I never idle.

**Kill me at any moment — nothing is lost.** Everything I know lives on disk, not in my head. The next me continues from the same line.

**Empty means red.** Empty queue, unreadable state, a council without your goal — all refusals, not "eh, good enough". A gate that turns green on nothing is worse than no gate.

## How it actually looks

All I need from you at the start is one sentence:

```bash
node scripts/helioz-plan.mjs grill --idea "rewrite billing onto the new schema"
```

Then I **interrogate** you. One question at a time in Telegram, each with my own recommended answer — agree and just say "yes", it gets recorded. The questions are not improvised: the interview has a fixed set of slots — the goal, how readiness is measured, what must never be touched, what counts as failure, what I may decide alone, plus a block of uncomfortable questions about things you would not raise yourself (where it breaks first, what falls apart after a month, which obvious solution you actually do not want). Anything the disk can answer I never ask — I look it up.

While a single critical slot is empty, there will be no plans. Not to be difficult: planning on a guess costs more than waiting for your answer. But I will not idle either — I take other work and the question keeps hanging.

Once the interview is closed, I write the plans myself. A master plan for me and a pile of small tasks for the executors — the smaller the better. **Two different agents plan independently**, blind to each other, and a third merges them blind: that is more honest than one agent, however clever.

```text
one sentence of intent
   ↓
slot-driven interrogation (one question at a time, with a recommendation) → queue/BRIEF.md
   ↓
final goal → queue/GOAL.md  (the compass for every decision made without you)
   ↓
plans: two agents apart → blind merge → docs/MASTER-PLAN.md + queue/tasks/*.task.md
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

<p align="center">
  <img src="docs/assets/helioz-flow.png" alt="The tact: glass cards Queue, Gate, Executor, Blind Verifier, Integrity Marker, Telegram Report, Night Council, Ledger joined by blue arrows; a gold thread loops from the council back to the queue" width="100%">
</p>

You can also drop a task by hand into `queue/tasks/`. One requirement: a check command. Without it I refuse the task — "done" without proof is not done.

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
| `scripts/helioz-plan.mjs` | slot-driven interrogation, final goal, master plan and small tasks |
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

<p align="center">
  <img src="docs/assets/helioz-emblem.png" alt="Helioz emblem: marble statue with a golden sun-disc, a chariot wheel and the classical column" width="46%">
</p>

## A star

If Helioz turns out useful — star it: [github.com/zarubinphil/helioz](https://github.com/zarubinphil/helioz).

Seconds for you, genuinely important for the project. And meet the family: [themis](https://github.com/zarubinphil/themis), [mnemazine](https://github.com/zarubinphil/mnemazine), [zeuz](https://github.com/zarubinphil/zeuz), [athena](https://github.com/zarubinphil/athena), [smltlk](https://github.com/zarubinphil/smltlk).

---

Русская версия: [README.ru.md](README.ru.md)
