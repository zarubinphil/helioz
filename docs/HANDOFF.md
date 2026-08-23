# Хэндофф оркестратора конвейера

Обновлён: 2026-08-24 (стройка, вертикальный срез впереди).

## Что сделано
- Конвейер собран: gate, zeus, exec, council, watchdog — все selftests зелёные.

## Что дальше (1–3 шага)
1. `node scripts/conveyor-gate.mjs --ready` — взять готовую задачу из очереди.
2. Такт по ORCHESTRATOR.md.

## Ключевое состояние
- Очередь: `queue/tasks/`, развилки: `queue/dilemmas/`, маркеры: `.conveyor/state/markers/`.
- Цель миссии: `queue/GOAL.md`.
