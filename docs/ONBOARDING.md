# Onboarding

This walkthrough assumes you have never run an agent conveyor before. Every step says what to type and what you should see afterwards. If a step shows something different, stop there: the answer is in that difference, not further down the page.

You need a Mac or a Linux machine, Node.js 20 or newer, git, and at least one agent command line: `claude`, `codex` or `kimi`. Nothing else is installed behind your back.

1. **Open a terminal and get the project.** Type this and press Enter:

   ```bash
   git clone https://github.com/zarubinvibe/helioz.git ~/helioz
   cd ~/helioz
   ```

   You see a folder appear at `~/helioz` and your prompt now sits inside it. If git says the folder already exists, pick another path or delete the old one first.

2. **Run the installer.** It introduces itself before it does anything:

   ```bash
   bash install.sh en
   ```

   You see a short introduction, then a check of Node, git and your agent command lines. Each instrument runs its own selftest. At the end you get a list of what is ready and what is still on you. Nothing is installed without that list.

3. **Say what you want, once.** This is the only sentence the conveyor needs from you:

   ```bash
   node scripts/helioz-plan.mjs grill --idea "move billing onto the new schema"
   ```

   You see one question, not a form. Every question carries a recommended answer, so agreeing takes one word.

4. **Answer where you are.** Three doors lead into the same state on disk. In an editor, fill the answer line inside `queue/BRIEF.md`. In a terminal:

   ```bash
   node scripts/helioz-plan.mjs answer --slot goal.done --text "yes"
   ```

   In Telegram, reply to the bot when you are away from the desk. You see the same brief update whichever door you used.

5. **Let it write the plans.** When the critical slots are filled, two agents plan without seeing each other and a third merges them blind.

   You see a master plan in `docs/MASTER-PLAN.md` and small tasks under `queue/tasks/`, each with its own check command. A task without a check command is refused: "done" needs proof.

6. **Start the conveyor.**

   ```bash
   bash scripts/helioz-start.sh
   ```

   You see the tact begin: heartbeat, your answers pulled in, budget counted, one task picked, agents probed for real instead of by version string.

7. **Watch a task close.** The executor works, a blind verifier checks the disk and runs the check command, and the gate writes the finish mark.

   You see a mark that contains the commits before and after, a hash of the changed files, and the exit code. A mark written by hand or copied from another task is caught and named out loud.

8. **Read the report, then stop or continue.** Progress goes to Telegram and to disk in plain words.

   Say "stop" and the conveyor freezes without losing anything. Say "go" and it keeps driving. Three things always wait for you: production actions, a clash with someone else's work, and a fork that is expensive to undo either way.

9. **Let it survive the night.** When context runs out, the conveyor writes a handoff and the watchdog starts a fresh session from disk.

   You see the next session continue from the same line. Kill it at any moment: everything it knows lives on disk, not in its head.

10. **Prove it is not lying to you.**

    ```bash
    node scripts/helioz-probes.mjs
    ```

    You see thirteen adversarial probes: a forged mark, a receipt for an older revision, a rewritten log, a swapped check command, two executors sent at one file. All of them must be green. A red probe means the project has no "ready" status.

## Keeping it current

Later, when a new version is published, do not clone it again: open the project in Claude Code and run `/helioz-update`. It shows what changed first, pulls only fast-forward changes, leaves your settings and your data alone, and re-checks itself afterwards.

## If this helped

If Helioz moved your work while you slept, give it a star: [https://github.com/zarubinvibe/helioz](https://github.com/zarubinvibe/helioz). It takes a second, and it decides whether other people ever find the project.

Now that you have run it end to end, you are exactly the person who can improve it. The path is short: fork the repository, create a branch, commit your change, push the branch, then open a Pull Request. Do not push directly to `main`; the release gate rejects it.

Broke something instead, or found a step that lies? Open an issue at [https://github.com/zarubinvibe/helioz/issues](https://github.com/zarubinvibe/helioz/issues) and say what you ran and what you saw. A wrong step in this file is a bug like any other.
