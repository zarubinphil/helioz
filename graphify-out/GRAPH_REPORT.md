# Graph Report - conveyor  (2026-08-24)

## Corpus Check
- 14 files · ~13,497 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 145 nodes · 253 edges · 14 communities (9 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d2621a80`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]

## God Nodes (most connected - your core abstractions)
1. `main()` - 13 edges
2. `cmdPoll()` - 11 edges
3. `cmdFlush()` - 9 edges
4. `ПРОМТ ОРКЕСТРАТОРА КОНВЕЙЕРА — заморожен, изменения только решением владельца` - 9 edges
5. `Контракты состояния — всё на диске, ничего в памяти агента` - 9 edges
6. `cmdAsk()` - 8 edges
7. `cmdDecide()` - 8 edges
8. `writeMarker()` - 8 edges
9. `now()` - 7 edges
10. `readMarker()` - 7 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (14 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.15
Nodes (35): changedFilesSha(), CLAUDE_RATES, claudeProjDir(), claudeRate(), claudeSpend(), cmdAdopt(), cmdBeat(), cmdBudget() (+27 more)

### Community 1 - "Community 1"
Cohesion: 0.25
Nodes (20): applyAnswer(), CFG, cmdAsk(), cmdFlush(), cmdPoll(), cmdSelftest(), cmdSend(), DILEMMAS (+12 more)

### Community 2 - "Community 2"
Cohesion: 0.25
Nodes (16): CFG, cliNames(), CLIS, cmdPick(), cmdProbe(), cmdRun(), cmdSelftest(), cmdTask() (+8 more)

### Community 3 - "Community 3"
Cohesion: 0.23
Nodes (13): advisorPrompt(), CFG, cmdDecide(), cmdSelftest(), DILEMMAS, EXEC, FORBIDDEN, isQuiet() (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (11): Контракты состояния — всё на диске, ничего в памяти агента, Прочее состояние, Секреты, Приём чужой работы — `--adopt <dir>`, code:markdown (---), code:json ({), Маркер — `.conveyor/state/markers/<ID>.done.json`, Отбивка — `.conveyor/state/outbox/<ts>-<n>.json` (+3 more)

### Community 5 - "Community 5"
Cohesion: 0.2
Nodes (9): ПРОМТ ОРКЕСТРАТОРА КОНВЕЙЕРА — заморожен, изменения только решением владельца, Приборы (только они пишут состояние), Постановка работы (начало каждой миссии), Такт (повторяй бесконечно), Развилки, Контекст на исходе, Запреты (жёстко), Финал миссии (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.36
Nodes (8): gate(), main(), mkHome(), now(), probe(), results, SCRIPTS, task()

### Community 7 - "Community 7"
Cohesion: 0.25
Nodes (7): Запуск одной строкой, Приборы, Конвейер непрерывной работы (24/7), Как спустить задачу, Что владельцу сделать руками (один раз), code:bash (cd ~/Проекты/conveyor && bash scripts/conveyor-start.sh), Управление из Telegram

### Community 8 - "Community 8"
Cohesion: 0.4
Nodes (4): Хэндофф оркестратора конвейера, Ключевое состояние, Что дальше (1–3 шага), Что сделано

## Knowledge Gaps
- **47 isolated node(s):** `CFG`, `STATE`, `OUTBOX`, `DILEMMAS`, `CFG` (+42 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `CFG`, `STATE`, `OUTBOX` to the rest of the system?**
  _47 weakly-connected nodes found - possible documentation gaps or missing edges._