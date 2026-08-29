# Helioz

While you sleep the work keeps moving: Helioz drives it and shows you in the morning what shifted.

[Русский](README.ru.md) · [中文](README.zh.md)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Stars](https://img.shields.io/github/stars/zarubinvibe/helioz?style=flat&color=C9A87A)](https://github.com/zarubinvibe/helioz/stargazers) [![Status](https://img.shields.io/badge/status-working-brightgreen.svg)](https://github.com/zarubinvibe/helioz) [![Olympuz](https://img.shields.io/badge/olympuz-family-B8D6EA.svg)](https://github.com/zarubinvibe/athena#olympuz-family)

<p align="center"><img src="docs/assets/pantheon/hero.png" alt="Helios in white marble with a golden sun disc beside the classical column, blue and gold threads assembling a conveyor of glass cards" width="100%"></p>

<!-- owner-welcome:start -->

> Hello. I am a lawyer with two daughters and a coffee business, and my evenings are short. I built Helioz because the work kept stopping the moment I closed the laptop: the agent forgot the task, called it done when it was not, and woke me at night over a small fork.
>
> It runs on my own machine every day. If it moves your work forward while you sleep, take it and make it yours.
>
> — Filipp Zarubin

<!-- owner-welcome:end -->

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

Helioz is a conveyor. You say one sentence about what you need. It interrogates you until the goal is clear, cuts it into small tasks and hands them to agents. Whoever did the work never checks it. All of this runs on your own machine, and everything Helioz knows sits on disk.

## Why It Helps

An agent forgets the task the moment you close the laptop. It says done when it is not. It wakes you at night over nothing. Each of those gets an instrument here rather than a promise: the state lives on disk, a stranger does the checking, and small night forks go to a council. In the morning you read what moved instead of staring at a frozen chat.

## The Main Advantage

**Main advantage:** the finish mark is written by code, not by whoever did the work.

**Why this is better:** Inside the mark: the commits before and after, a hash of the changed files, the exit code of the check. Forging it does not work. A mark copied from another task or typed in by hand gets caught and named out loud.

## How It Works

The tact runs in a circle and leaves a file at every step. Kill the session mid-task and the next one continues from the same line.

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

<p align="center"><img src="docs/assets/pantheon/workflow/01-interview.png" alt="Helioz workflow stage 1: Say the goal once, drawn as a wide Pantheon marble scene" width="100%"></p>

**You get:** a goal in `queue/GOAL.md` that every later decision is checked against.

### Step 2: Two agents plan blind

Two agents write plans without seeing each other. A third merges them blind. One clever agent is fond of its own mistakes; two of them argue.

<p align="center"><img src="docs/assets/pantheon/workflow/02-plan.png" alt="Helioz workflow stage 2: Two agents plan blind, drawn as a wide Pantheon marble scene" width="100%"></p>

**You get:** a master plan plus small tasks in `queue/tasks/`, each with a check command.

### Step 3: The gate picks the next task

The gate takes only a task whose dependencies are closed and whose budget window still has room. Two agents can never hold the same file, because the code refuses the second one.

<p align="center"><img src="docs/assets/pantheon/workflow/03-gate.png" alt="Helioz workflow stage 3: The gate picks the next task, drawn as a wide Pantheon marble scene" width="100%"></p>

**You get:** one running task with a locked file set and a live budget count.

### Step 4: An executor does the work

Before handing over work, Helioz runs a real probe of each agent CLI instead of trusting a version string. The task goes to the agent that answered.

<p align="center"><img src="docs/assets/pantheon/workflow/04-execute.png" alt="Helioz workflow stage 4: An executor does the work, drawn as a wide Pantheon marble scene" width="100%"></p>

**You get:** a changed working tree and a log of what the agent actually ran.

### Step 5: A blind verifier checks it

The verifier never sees the executor's report. It looks at the files, runs the check command, and adds an adversarial probe. Nobody grades their own homework.

<p align="center"><img src="docs/assets/pantheon/workflow/05-verify.png" alt="Helioz workflow stage 5: A blind verifier checks it, drawn as a wide Pantheon marble scene" width="100%"></p>

**You get:** a verdict backed by command output, or a task sent back for rework.

### Step 6: Code writes the finish mark

The mark is written by the gate, not by the agent. Thirteen adversarial probes try to forge it: a copied receipt, a mark without the external commit, a rewritten log, a swapped check command.

<p align="center"><img src="docs/assets/pantheon/workflow/06-mark.png" alt="Helioz workflow stage 6: Code writes the finish mark, drawn as a wide Pantheon marble scene" width="100%"></p>

**You get:** a task closed with evidence that survives an audit.

### Step 7: Report, council, handoff

Progress goes to Telegram and to disk. A small fork goes to a council of four lenses that write apart and are checked against your goal. Production actions, clashes with someone else's work, and expensive forks always wait for you.

<p align="center"><img src="docs/assets/pantheon/workflow/07-handoff.png" alt="Helioz workflow stage 7: Report, council, handoff, drawn as a wide Pantheon marble scene" width="100%"></p>

**You get:** a handoff file, so the watchdog starts the next session without losing context.

## Quickstart

You need a Mac or Linux, Node.js 20 or newer, git, and at least one agent in the terminal: `claude`, `codex` or `kimi`. Three doors from here, any of them works.

```bash
git clone https://github.com/zarubinvibe/helioz.git ~/helioz
cd ~/helioz
bash install.sh en
bash scripts/helioz-start.sh
```

No Git? Download [the ZIP](https://github.com/zarubinvibe/helioz/archive/refs/heads/main.zip), unpack it, and run the same `bash install.sh en` inside. Prefer an archive in the terminal? Take [the tarball](https://github.com/zarubinvibe/helioz/archive/refs/heads/main.tar.gz). First time here? Open the project in Claude Code and run `/helioz-setup`: the install goes as a conversation, one question at a time, and nothing is installed without your yes.

Never done this before? [The onboarding](docs/ONBOARDING.md) walks the whole first run step by step and says what you see after every command.

**You get:** the installer explains what it is, looks at what you already have, runs its own selftests, and names honestly what is left for you to do.

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

Before any push, read `git diff` and run the public gate.

## Limits

Status: working, its author runs it daily.

- macOS and Linux only; there is no Windows path.
- Quality of the work is the quality of the agent CLI you installed.
- The gate proves file state and command output. It does not judge product taste.
- Telegram, the night council, and the watchdog are optional and can be switched off.

Deeper: [the full reference](docs/DETAILS.md), [state contracts](docs/CONTRACTS.md), [the orchestrator prompt](ORCHESTRATOR.md), [the master plan](docs/MASTER-PLAN.md). Not taking it on trust? `node scripts/helioz-probes.mjs` runs thirteen probes that try to fool it. All of them must come back green.

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
