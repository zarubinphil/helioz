# Контракты состояния - все на диске, ничего в памяти агента

Все пути относительно дома проекта. Писать состояние вправе только приборы (`scripts/*.mjs`);
оркестратор-LLM читает и вызывает приборы, руками файлы состояния не правит.

## Допрос владельца - `queue/BRIEF.md` + `queue/GRILL-STATE.json`

Пространство допроса задано онтологией слотов в `scripts/helioz-plan.mjs` (ONTOLOGY): блок → слот →
вопрос. Слот критичный или нет; критичный пустым не бывает - без него `plan goal` отказывает (exit 2).

BRIEF хранит по слоту три поля, разметка машинная:

```markdown
<!-- slot:goal.done -->
**Вопрос:** …
**Рекомендую:** …          ← ответ дознавателя по умолчанию; «да» от владельца принимает его
**Ответ:**                  ← пишет владелец (руками или сообщением боту)
```

`GRILL-STATE.json` - `{idea, started_at, current, by}`; `current` = слот открытого вопроса. Свободный
текст владельца в Telegram, не похожий на ответ по развилке, записывается в этот слот и открывает
следующий. Один вопрос за раз - анкету целиком не вываливают.

## Планы - `docs/MASTER-PLAN.md` + `queue/tasks/*.task.md`

Рождает `plan plan`: два разных CLI планируют независимо, третий сводит вслепую. Ворота приемки плана
(`validatePlan`) отвергают: задачу без `check_cmd`, без дословных промтов ролей, с >3 путями,
с исполнителем=проверяющим, с зависимостью-призраком, с пересечением путей внутри волны. Мастер-план -
карта для оркестратора; исполняется все равно через очередь и гейт.

## Задача - `queue/tasks/<ID>.task.md`

```markdown
---
id: T001                      # уникален в очереди
title: Короткое имя
paths:                        # точные пути, по ним гейт блокирует пересечения
  - docs/LESSON-1.md
requires: []                  # id задач, чьи маркеры обязаны быть done
executor: kimi                # предпочтение; ротация может заменить (факт - в маркере)
verifier: codex               # ОБЯЗАН отличаться от фактического исполнителя
check_cmd: "grep -q '## Таблица' docs/LESSON-1.md"   # приемка кодом, exit 0
probe_cmd: "! grep -q 'ВРАЖДЕБНАЯ-МЕТКА' docs/LESSON-1.md"  # враждебная проба, exit 0 = красный пойман
stop: "две попытки подряд красные → развилка владельцу"
price: "≤10 мин, ≤50к токенов"
kind: default                 # default | prod | foreign | expensive - классификация развилок из задачи
---
## Промт исполнителя
(дословный, заморожен при постановке)

## Промт проверяющего
(слепой: диск + команды, отчет исполнителя не передавать)
```

Задача без `check_cmd`, без `executor`/`verifier` или с одинаковыми CLI в конвейер НЕ принимается
(`--ready` ее не отдает, помечает `invalid`).

## Маркер - `.helioz/state/markers/<ID>.done.json`

Пишет ТОЛЬКО `helioz-gate.mjs --task <ID> --check-cmd … --executor … --verifier …` при exit 0.
До маркера должны пройти обе роли через `helioz-exec.mjs`; факт хранится в
`.helioz/state/exec/<ID>.json`. Квитанция обязана иметь `written_by:"helioz-exec"`,
`receipt_version:1` и `receipt_sig`, пересчитанный по задаче, CLI, кодам и хешам логов.
Поля целостности (все обязательны, отсутствие любого = tampered):
`task, task_sha, check_cmd, exit_code, base, head, sha_of_changed_files, external, external_sha, executor_cli, verifier_cli, finished_at, written_by:"helioz-gate"`.
`task_sha` пересчитывается по текущему файлу задачи, `check_cmd` обязан совпадать с задачей,
`sha_of_changed_files` пересчитывается по base..head, `external_sha` — по абсолютным путям из
`paths`. Любое несовпадение, отсутствие зеленой exec-квитанции или рукописная квитанция
без подписи `helioz-exec` = tampered.

Живой smoke перед передачей/публикацией: `node scripts/helioz-gate.mjs --smoke --json`.
Он должен вернуть `ok:true`, `stop:false`, `running_corrupt:false`, `invalid:[]` и ненулевую
очередь. STOP, битый `running.json`, пустая очередь или невалидная задача дают exit 2.

## Развилка - `queue/dilemmas/<DID>.json`

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

`kind` из {prod, foreign, expensive} - совет решать НЕ вправе (exit 2), ждет владельца.
`kind=default` - днем дефолтом решает оркестратор (фиксация в ledger), ночью - совет.

## Отбивка - `.helioz/state/outbox/<ts>-<n>.json`

`{"text": "…", "quiet": true|false, "buttons": [[{"text","callback_data"}]] , "delivered_at": null, "attempts": 0}`
Durable-запись ПЕРВОЙ, отправка best-effort. `flush` дошлет недоставленное. Пустых отбивок без данных не бывает.

## Ledger - `.helioz/state/ledger.jsonl` (append-only)

Урок: `{"ts","kind":"lesson","cause","fix","rule","enforced_by"}`
Решение совета: `{"ts","kind":"council","dilemma","decision","lenses":[{lens,cli,position_file}],"rationale"}`
Дефолт оркестратора: `{"ts","kind":"default-choice","dilemma","decision","why"}`

## Прочее состояние

- `running.json` - `{"running":[{"task","started_at","executor"}]}`.
- `heartbeat.json` - `{"at","pid","note"}`; пишет `--beat`. Старше `watchdog_stale_min` → watchdog перезапускает оркестратора с `docs/HANDOFF.md` на входе.
- `STOP` - файл-флаг. Есть → `--ready`/`--start` отказывают (exit 4), watchdog молчит. Ставится по «стоп» из Telegram или `--stop`; снимается «пуск»/`--go`.
- `budget.json` - `{"started_at","ceiling_usd","ceiling_tokens"}`; `--budget` меряет факт по jsonl трех CLI, превышение → exit 3.
- `telegram-offset.json` - оффсет getUpdates.
- `READY.json` - пишет ТОЛЬКО `helioz-probes.mjs` при всех пробах зеленых:
  `{"written_by":"helioz-probes","probes":[...],"head","at"}`.

## Прием чужой работы - `--adopt <dir>`

Ждет в `<dir>`: `ledger.jsonl` и/или `dilemmas/*.json`. Слияние идемпотентно:
строки ledger - по sha256 строки, развилки - по id (коллизия id при разном содержимом → префикс `adX-`).
Ничего не удаляется и не перезаписывается.

## Секреты

Токен и chat id читаются рантаймом из файла, переданного через `HELIOZ_TG_ENV`, в момент вызова.
В env потомков, argv, логи, git, отбивки - никогда. В ошибках токен вырезается.
