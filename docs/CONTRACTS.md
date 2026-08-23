# Контракты состояния — всё на диске, ничего в памяти агента

Все пути относительно дома проекта. Писать состояние вправе только приборы (`scripts/*.mjs`);
оркестратор-LLM читает и вызывает приборы, руками файлы состояния не правит.

## Задача — `queue/tasks/<ID>.task.md`

```markdown
---
id: T001                      # уникален в очереди
title: Короткое имя
paths:                        # точные пути, по ним гейт блокирует пересечения
  - docs/LESSON-1.md
requires: []                  # id задач, чьи маркеры обязаны быть done
executor: kimi                # предпочтение; ротация может заменить (факт — в маркере)
verifier: codex               # ОБЯЗАН отличаться от фактического исполнителя
check_cmd: "grep -q '## Таблица' docs/LESSON-1.md"   # приёмка кодом, exit 0
probe_cmd: "! grep -q 'ВРАЖДЕБНАЯ-МЕТКА' docs/LESSON-1.md"  # враждебная проба, exit 0 = красный пойман
stop: "две попытки подряд красные → развилка владельцу"
price: "≤10 мин, ≤50к токенов"
kind: default                 # default | prod | foreign | expensive — классификация развилок из задачи
---
## Промт исполнителя
(дословный, заморожен при постановке)

## Промт проверяющего
(слепой: диск + команды, отчёт исполнителя не передавать)
```

Задача без `check_cmd` в конвейер НЕ принимается (`--ready` её не отдаёт, помечает `invalid`).

## Маркер — `.conveyor/state/markers/<ID>.done.json`

Пишет ТОЛЬКО `conveyor-gate.mjs --task <ID> --check-cmd …` при exit 0.
Поля целостности (все обязательны, отсутствие любого = tampered):
`task, check_cmd, exit_code, base, head, sha_of_changed_files, executor_cli, verifier_cli, finished_at, written_by:"conveyor-gate"`.
`sha_of_changed_files` пересчитывается по base..head при каждом чтении — несовпадение = tampered.

## Развилка — `queue/dilemmas/<DID>.json`

```json
{
  "id": "D001", "task": "T001", "kind": "default",
  "question": "…", "options": ["A", "B"], "recommend": 0,
  "status": "open",              // open → asked → answered | council
  "asked_at": null, "answered_at": null,
  "answer": null,                // индекс выбранной опции
  "decided_by": null,            // "owner" | "council"
  "council": null,               // {positions_dir, synthesis, lenses:[…], at}
  "replay": []                   // история «переиграть»: [{at, from, to, by:"owner"}]
}
```

`kind` из {prod, foreign, expensive} — совет решать НЕ вправе (exit 2), ждёт владельца.
`kind=default` — днём дефолтом решает оркестратор (фиксация в ledger), ночью — совет.

## Отбивка — `.conveyor/state/outbox/<ts>-<n>.json`

`{"text": "…", "quiet": true|false, "buttons": [[{"text","callback_data"}]] , "delivered_at": null, "attempts": 0}`
Durable-запись ПЕРВОЙ, отправка best-effort. `flush` дошлёт недоставленное. Пустых отбивок без данных не бывает.

## Ledger — `.conveyor/state/ledger.jsonl` (append-only)

Урок: `{"ts","kind":"lesson","cause","fix","rule","enforced_by"}`
Решение совета: `{"ts","kind":"council","dilemma","decision","lenses":[{lens,cli,position_file}],"rationale"}`
Дефолт оркестратора: `{"ts","kind":"default-choice","dilemma","decision","why"}`

## Прочее состояние

- `running.json` — `{"running":[{"task","started_at","executor"}]}`.
- `heartbeat.json` — `{"at","session","note"}`; пишет `--beat`. Старше `watchdog_stale_min` → watchdog перезапускает оркестратора с `docs/HANDOFF.md` на входе.
- `STOP` — файл-флаг. Есть → `--ready`/`--start` отказывают (exit 4), watchdog молчит. Ставится по «стоп» из Telegram или `--stop`; снимается «пуск»/`--go`.
- `budget.json` — `{"started_at","ceiling_usd","ceiling_tokens"}`; `--budget` меряет факт по jsonl трёх CLI, превышение → exit 3.
- `telegram-offset.json` — оффсет getUpdates.
- `READY.json` — пишет ТОЛЬКО `--probes` при всех шести зелёных: `{"written_by":"conveyor-gate","probes":6,"head","at"}`.

## Приём чужой работы — `--adopt <dir>`

Ждёт в `<dir>`: `ledger.jsonl` и/или `dilemmas/*.json`. Слияние идемпотентно:
строки ledger — по sha256 строки, развилки — по id (коллизия id при разном содержимом → префикс `adX-`).
Ничего не удаляется и не перезаписывается.

## Секреты

Токен и chat id читаются рантаймом из `~/.secrets/olympuz-telegram.env` в момент вызова.
В env потомков, argv, логи, git, отбивки — никогда. В ошибках токен вырезается по образцу olympuz.
