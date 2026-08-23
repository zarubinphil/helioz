# Хэндофф оркестратора конвейера

Обновлён: 2026-08-24, ночь стройки. Конвейер СОБРАН и ГОТОВ (READY.json, шесть проб зелёные).

## Что сделано
- Все приборы собраны, selftests зелёные: gate (2b6d4e0), zeus (bb0b57b), exec+council (87789ef),
  watchdog/ORCHESTRATOR/README (5b23ad7), пробы+READY (d2621a8).
- Вертикальный срез прошёл живьём: T001 (маркер done), развилка D001 решена живым ночным советом
  (4 линзы claude/codex, слепой синтез codex), исполнитель codex, слепые проверяющие kimi+claude.
- Уроки ночи — в `.conveyor/state/ledger.jsonl` (2 урока: предпочтение проверяющего; фикстура пробы).

## Что дальше (1–3 шага)
1. Дождаться/разобрать независимые ревью codex+kimi (`.conveyor/state/review/*.md`), дефекты — чинить.
2. Владелец: launchd-сторож + budget.json (см. README «руками»).
3. Принять кампанию «Мозг 2.0» на границе её партии: `node scripts/conveyor-gate.mjs --adopt <их каталог>`
   (ledger + развилки сливаются идемпотентно), цель кампании — в `queue/GOAL.md`.

## Ключевое состояние
- Очередь `queue/tasks/` (T001 done) · развилки `queue/dilemmas/` (D001 answered by council) ·
  маркеры `.conveyor/state/markers/` · READY `.conveyor/state/READY.json`.
- Запуск: `bash scripts/conveyor-start.sh`. Промт оркестратора: `ORCHESTRATOR.md` (заморожен).
