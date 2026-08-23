#!/bin/bash
# ЗАПУСК КОНВЕЙЕРА ОДНОЙ СТРОКОЙ: приборы зелёные → heartbeat → отбивка → что дальше.
set -u
SELF="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$(dirname "$SELF")"
cd "$HOME_DIR"

echo "== Проверка приборов (selftests) =="
fail=0
for t in "node scripts/conveyor-gate.mjs --selftest" \
         "node scripts/conveyor-zeus.mjs --selftest" \
         "node scripts/conveyor-exec.mjs --selftest" \
         "node scripts/conveyor-council.mjs --selftest" \
         "bash scripts/conveyor-watchdog.sh --selftest"; do
  if $t >/dev/null 2>&1; then echo "  ok  $t"; else echo "  FAIL $t"; fail=1; fi
done
[ "$fail" -eq 0 ] || { echo "приборы красные — запуск запрещён (fail-closed)"; exit 2; }

node scripts/conveyor-gate.mjs --beat "start.sh"
node scripts/conveyor-zeus.mjs send --text "🚀 Конвейер запущен. Очередь: $(ls queue/tasks/*.task.md 2>/dev/null | wc -l | tr -d ' ') задач. «стоп» — заморозить, «пуск» — продолжить." >/dev/null 2>&1 || true

echo
echo "== Очередь =="
node scripts/conveyor-gate.mjs --status || true
echo
if ! launchctl print "gui/$(id -u)/com.conveyor.watchdog" >/dev/null 2>&1; then
  echo "⚠️ Сторож не установлен. Один раз:"
  echo "  cp launchd/com.conveyor.watchdog.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/com.conveyor.watchdog.plist"
fi
if [ ! -f .conveyor/state/budget.json ]; then
  echo "⚠️ Нет .conveyor/state/budget.json — задай потолок: {\"started_at\":\"$(date -u +%FT%TZ)\",\"ceiling_usd\":N}"
fi
echo "Оркестратор поднимет сторож при протухшем heartbeat, либо вручную: сессия Claude Code в этой папке с промтом ORCHESTRATOR.md"
