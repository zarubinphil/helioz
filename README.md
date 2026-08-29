# Helioz

Helioz keeps long agent work moving across sessions, checks, and handoffs, so nothing stalls while you sleep.

[Русский](README.ru.md)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Stars](https://img.shields.io/github/stars/zarubinvibe/helioz?style=flat&color=C9A87A)](https://github.com/zarubinvibe/helioz/stargazers) [![Status](https://img.shields.io/badge/status-working-brightgreen.svg)](https://github.com/zarubinvibe/helioz) [![Olympuz](https://img.shields.io/badge/olympuz-family-B8D6EA.svg)](https://github.com/zarubinvibe/athena#olympuz-family)

<p align="center"><img src="docs/assets/pantheon/hero.png" alt="Helios in white marble with a golden sun disc beside the classical column, blue and gold threads assembling a conveyor of glass cards" width="100%"></p>

## Contents

- [What This Is](#what-this-is)
- [Why It Helps](#why-it-helps)
- [The Main Advantage](#the-main-advantage)
- [How It Works](#how-it-works)
- [Quickstart](#quickstart)
- [Simple Comparison](#simple-comparison)
- [Simple Words](#simple-words)
- [Safety And Privacy](#safety-and-privacy)
- [Limits](#limits)
- [Star And Contribute](#star-and-contribute)

<!-- beginner-readme:start -->

## What This Is

Helioz is a conveyor for agent work. You say what you want once. It interrogates you, writes the plans, hands tasks to coding agents, checks the result with a second agent, and reports back. It runs on your machine and keeps every bit of state on disk.

## Why It Helps

An agent forgets the task between sessions, says "done" when it is not, and wakes you at night over a small fork. Helioz answers each of those with an instrument: state on disk, a blind verifier, and a night council. You get progress by morning instead of a stalled chat window.

## The Main Advantage

**Main advantage:** the finish mark is written by code, not by the agent that did the work.

**Why this is better:** a mark carries the commits before and after, a hash of the changed files, and the exit code of the check command. A copied or hand-written mark is caught and named out loud.

## How It Works

One tact runs in a loop. Each step leaves a file on disk, so a killed session continues from the same line.

<!-- workflow-diagram:start -->

```text
  ┌───────────┐   ┌───────────┐   ┌───────────┐
  │ Interview │ ▶ │ Plan      │ ▶ │ Gate      │
  └───────────┘   └───────────┘   └───────────┘
        ▼
  ┌───────────┐   ┌───────────┐   ┌───────────┐
  │ Execute   │ ▶ │ Verify    │ ▶ │ Mark      │
  └───────────┘   └───────────┘   └───────────┘
        ▼
  ┌───────────┐
  │ Handoff   │
  └───────────┘
```

<!-- workflow-diagram:end -->

| Stage | What happens |
|---|---|
| 1. Interview | One sentence turns into filled slots and a written goal |
| 2. Plan | Two independent plans, merged by a third agent |
| 3. Gate | Slots, dependencies, budget, and a stop switch |
| 4. Execute | A real CLI probe picks the agent that actually runs |
| 5. Verify | A second agent reads the disk, not the report |
| 6. Mark | Commits, file hashes, and exit code inside the mark |
| 7. Handoff | Telegram report, night council on small forks, fresh session |

### Step 1: Say the goal once

You start with one sentence of intent. Helioz asks one question at a time and attaches its own recommendation, so agreeing takes a word. Answer in the editor, in a terminal, or in Telegram.

**You get:** a goal in `queue/GOAL.md` that every later decision is checked against.

### Step 2: Two agents plan blind

Two agents write plans without seeing each other. A third merges them blind. One clever agent is fond of its own mistakes; two of them argue.

**You get:** a master plan plus small tasks in `queue/tasks/`, each with a check command.

### Step 3: The gate picks the next task

The gate takes only a task whose dependencies are closed and whose budget window still has room. Two agents can never hold the same file, because the code refuses the second one.

**You get:** one running task with a locked file set and a live budget count.

### Step 4: An executor does the work

Before handing over work, Helioz runs a real probe of each agent CLI instead of trusting a version string. The task goes to the agent that answered.

**You get:** a changed working tree and a log of what the agent actually ran.

### Step 5: A blind verifier checks it

The verifier never sees the executor's report. It looks at the files, runs the check command, and adds an adversarial probe. Nobody grades their own homework.

**You get:** a verdict backed by command output, or a task sent back for rework.

### Step 6: Code writes the finish mark

The mark is written by the gate, not by the agent. Thirteen adversarial probes try to forge it: a copied receipt, a mark without the external commit, a rewritten log, a swapped check command.

**You get:** a task closed with evidence that survives an audit.

### Step 7: Report, council, handoff

Progress goes to Telegram and to disk. A small fork goes to a council of four lenses that write apart and are checked against your goal. Production actions, clashes with someone else's work, and expensive forks always wait for you.

**You get:** a handoff file, so the watchdog starts the next session without losing context.

## Quickstart

You need macOS or Linux, Node.js 20 or newer, git, and at least one agent CLI: `claude`, `codex`, or `kimi`. Pick any of the three ways in.

```bash
git clone https://github.com/zarubinvibe/helioz.git ~/helioz
cd ~/helioz
bash install.sh en
bash scripts/helioz-start.sh
```

No Git? Download [the ZIP](https://github.com/zarubinvibe/helioz/archive/refs/heads/main.zip), unpack it, and run the same `bash install.sh en` inside. Prefer an archive in the terminal? Take [the tarball](https://github.com/zarubinvibe/helioz/archive/refs/heads/main.tar.gz).

**You get:** the installer introduces itself, checks Node, git, and your agent CLIs, runs the instrument selftests, and names what is left to do by hand.

## Simple Comparison

| Choice | Best when | What you get | Trade-off |
|---|---|---|---|
| **Helioz** | Long work must continue while you are away | State on disk, blind verification, forged-proof marks, night decisions | You run and watch it yourself |
| Running the agent by hand | One short task in one sitting | Full control of every step | The work stops the moment you close the laptop |
| A CI pipeline | Repeatable checks after a commit | Server-side runs and history | It reacts to commits; it does not plan or decide |
| A tracker plus agent chat | Team coordination | Visible board and comments | Nothing verifies that "done" is true |

## Simple Words

| Word | Simple meaning |
|---|---|
| Repository | The project folder that Git stores and versions |
| Terminal | The window where you type commands |
| Command | One instruction you give the computer |
| Branch | A separate line of changes that does not touch `main` |
| Pull Request | A request to review your change and accept it |
| Agent CLI | A coding assistant you run in the terminal, such as Claude Code or Codex |
| Check command | The command that proves a task is done, for example `npm test` |

## Safety And Privacy

- File access stays inside the clone unless a task names another allowed path.
- `.helioz/`, `queue/`, and logs are local runtime state and are never published.
- Secrets live outside git and are read only when a message is sent or polled.
- Telegram delivery is best effort: messages land in a local outbox first.
- Production actions and expensive forks are refused by the council and wait for you.
- An empty queue, unreadable state, or a goalless council is a red result, not a pass.

Review `git diff` and run the public gate before any push.

## Limits

Status: working local system, run daily by its author.

- macOS and Linux only; there is no Windows path.
- Quality of the work is the quality of the agent CLI you installed.
- The gate proves file state and command output. It does not judge product taste.
- Telegram, the night council, and the watchdog are optional and can be switched off.

Deeper reading: [the full reference](docs/DETAILS.md), [state contracts](docs/CONTRACTS.md), [the orchestrator prompt](ORCHESTRATOR.md), and [the master plan](docs/MASTER-PLAN.md). Proof of the claims above: `node scripts/helioz-probes.mjs` runs thirteen adversarial probes and all of them must be green.

## Star And Contribute

Useful? Give Helioz a star: [https://github.com/zarubinvibe/helioz](https://github.com/zarubinvibe/helioz). It takes a second and it decides whether other people ever find the project.

Want to change something? The path is short: fork the repository, create a branch, commit your change, push the branch, then open a Pull Request. Do not push directly to `main`; the release gate rejects it.

Found a problem instead? Open an issue at [https://github.com/zarubinvibe/helioz/issues](https://github.com/zarubinvibe/helioz/issues) and say what you ran and what happened.

<!-- beginner-readme:end -->

<!-- pantheon-family:start -->
## Olympuz family

This is one of the public [Olympuz projects](https://github.com/zarubinvibe/athena#olympuz-family). Each row opens the repository or downloads its source as a ZIP.

| Type | Name | What it does | Source |
|---|---|---|---|
| project | Athena | Portable agent OS that restores a complete Claude and Codex setup on a new Mac. | [Repository](https://github.com/zarubinvibe/athena) · [ZIP](https://github.com/zarubinvibe/athena/archive/refs/heads/main.zip) |
| project | Helioz | 24/7 agent work conveyor with verified completion markers and goal-based overnight decisions. | [Repository](https://github.com/zarubinvibe/helioz) · [ZIP](https://github.com/zarubinvibe/helioz/archive/refs/heads/main.zip) |
| project | Mnemazine | Local-first memory system that turns raw inputs into verified reusable knowledge. | [Repository](https://github.com/zarubinvibe/mnemazine) · [ZIP](https://github.com/zarubinvibe/mnemazine/archive/refs/heads/main.zip) |
| project | Themis | Multi-agent assistant for Russian litigation with local OCR and review by a five-jurist council. | [Repository](https://github.com/zarubinvibe/themis) · [ZIP](https://github.com/zarubinvibe/themis/archive/refs/heads/main.zip) |
| project | Zeuz | Factory that turns an idea into a governed multi-agent workflow with gates, observability, and replay. | [Repository](https://github.com/zarubinvibe/zeuz) · [ZIP](https://github.com/zarubinvibe/zeuz/archive/refs/heads/main.zip) |
<!-- pantheon-family:end -->

## License

MIT. See [LICENSE](LICENSE).
