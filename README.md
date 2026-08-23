# Конвейер непрерывной работы (24/7)

Владелец спускает задачи — конвейер работает круглосуточно. Ночью решает совет по методу Карпаты,
владельцу летят отбивки в Telegram (бот «Зевс» @ZeusKaifBot), он отвечает когда удобно.
Доктрина: `~/Desktop/Конвейер/` (бой 22–24.08.2026). Контракты состояния: `docs/CONTRACTS.md`.
Промт оркестратора: `ORCHESTRATOR.md` (заморожен).

## Запуск одной строкой

```bash
cd ~/Проекты/conveyor && bash scripts/conveyor-start.sh
```

(ставит heartbeat-надзор, проверяет приборы, шлёт отбивку и печатает, что делать дальше)

## Приборы

| Прибор | Зачем | Проверка |
|---|---|---|
| `scripts/conveyor-gate.mjs` | очередь, слоты, маркеры целостности (tampered-детект), STOP, бюджет, adopt | `--selftest` |
| `scripts/conveyor-zeus.mjs` | отбивки/развилки/стоп/переиграть через Telegram, durable outbox | `--selftest` |
| `scripts/conveyor-exec.mjs` | зонд CLI настоящим прогоном, ротация claude/codex/kimi, запуск ролей | `--selftest` |
| `scripts/conveyor-council.mjs` | ночной совет: линзы → изоляция → слепой синтез → ledger; сверка с целью владельца | `--selftest` |
| `scripts/conveyor-watchdog.sh` | heartbeat протух → новая сессия оркестратора с хэндоффом | `--selftest` |
| `scripts/conveyor-probes.mjs` | шесть сквозных враждебных проб; только они пишут `READY.json` | сам и есть проба |

## Как спустить задачу

1. Цель миссии → `queue/GOAL.md` (совет без неё не решает ни одной развилки).
2. Задача → `queue/tasks/<ID>.task.md` по контракту (`docs/CONTRACTS.md`): пути, `check_cmd`,
   враждебная проба, стоп-критерий, цена, промты исполнителя и проверяющего. Без `check_cmd` не примется.
3. Оркестратор возьмёт её тактом; отбивка прилетит в Зевса.

## Управление из Telegram

- Кнопки под развилкой или текст `<ID развилки> <номер варианта>` — решение (и «переиграть» совет).
- «стоп» — всё замирает без потерь; «пуск» — продолжение.

## Что владельцу сделать руками (один раз)

1. launchd-сторож: `cp launchd/com.conveyor.watchdog.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.conveyor.watchdog.plist`
2. Бюджет: заполнить `.conveyor/state/budget.json` (`{"started_at":"…","ceiling_usd":N}`) — без него `--budget` красный (потолок не подтверждён).
3. Первый запуск: строка выше.
