#!/bin/bash
# СТОРОЖ КОНВЕЙЕРА - убийство оркестратора ничего не теряет: heartbeat протух → новый стартует с хэндоффом.
# Запускается launchd каждые 2 минуты. Делает три вещи:
#   1) zeus poll (стоп/пуск/ответы владельца доезжают даже при мертвом оркестраторе) + flush отбивок;
#   2) при STOP - молчит (не стартует ничего);
#   3) heartbeat старше порога и есть незакрытая работа → поднимает новую сессию оркестратора.
# --dry-run: печатает решение, ничего не запускает. --selftest: детерминированные пробы.
set -u
SELF="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${HELIOZ_HOME:-$(dirname "$SELF")}"
STATE="$HOME_DIR/.helioz/state"
LOGS="$STATE/logs"
mkdir -p "$STATE" "$LOGS"

cfg() { node -e "const c=require('$HOME_DIR/config/helioz.json');console.log(c.$1 ?? '')" 2>/dev/null; }

decide() {
  # → печатает START|SKIP:<причина>
  if [ -f "$STATE/STOP" ]; then echo "SKIP:STOP на диске"; return; fi
  local stale_min; stale_min="$(cfg watchdog_stale_min)"; stale_min="${stale_min:-15}"
  if [ -f "$STATE/heartbeat.json" ]; then
    local age
    age=$(node -e "const h=require('$STATE/heartbeat.json');console.log(Math.floor((Date.now()-Date.parse(h.at))/60000))" 2>/dev/null || echo 99999)
    if [ "$age" -lt "$stale_min" ]; then echo "SKIP:heartbeat свежий (${age}м < ${stale_min}м)"; return; fi
  fi
  # работа есть? незакрытые задачи в очереди (без маркера done)
  local pending
  pending=$(node "$SELF/helioz-gate.mjs" --status --json 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);console.log(j.tasks.filter(t=>t.state==="pending"||t.state==="running").length)}catch{console.log(0)}})' 2>/dev/null || echo 0)
  if [ "${pending:-0}" -eq 0 ]; then echo "SKIP:очередь без незакрытых задач"; return; fi
  echo "START"
}

if [ "${1:-}" = "--selftest" ]; then
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  mkdir -p "$TMP/.helioz/state" "$TMP/queue/tasks" "$TMP/config" "$TMP/scripts"
  cp "$SELF/helioz-gate.mjs" "$TMP/scripts/"
  echo '{"watchdog_stale_min":15}' > "$TMP/config/helioz.json"
  # проба 1: STOP → SKIP
  date > "$TMP/.helioz/state/STOP"
  out=$(HELIOZ_HOME="$TMP" bash "$0" --dry-run)
  case "$out" in SKIP:STOP*) ;; *) echo "FAIL: при STOP получили '$out'"; exit 1;; esac
  rm "$TMP/.helioz/state/STOP"
  # проба 2: свежий heartbeat → SKIP
  node -e "require('fs').writeFileSync('$TMP/.helioz/state/heartbeat.json',JSON.stringify({at:new Date().toISOString()}))"
  out=$(HELIOZ_HOME="$TMP" bash "$0" --dry-run)
  case "$out" in SKIP:heartbeat*) ;; *) echo "FAIL: при свежем heartbeat получили '$out'"; exit 1;; esac
  # проба 3: протухший heartbeat + незакрытая задача → START
  node -e "require('fs').writeFileSync('$TMP/.helioz/state/heartbeat.json',JSON.stringify({at:new Date(Date.now()-3600e3).toISOString()}))"
  printf -- '---\nid: TW\npaths:\n  - docs/w.md\ncheck_cmd: "true"\n---\n## Промт исполнителя\nx\n## Промт проверяющего\ny\n' > "$TMP/queue/tasks/TW.task.md"
  out=$(HELIOZ_HOME="$TMP" bash "$0" --dry-run)
  [ "$out" = "START" ] || { echo "FAIL: при протухшем heartbeat получили '$out'"; exit 1; }
  # проба 4: протухший heartbeat, но очередь закрыта → SKIP
  rm "$TMP/queue/tasks/TW.task.md"
  out=$(HELIOZ_HOME="$TMP" bash "$0" --dry-run)
  case "$out" in SKIP:очередь*) ;; *) echo "FAIL: при пустой очереди получили '$out'"; exit 1;; esac
  echo "selftest ok - STOP молчит, свежий heartbeat молчит, протухший+работа стартует, без работы молчит"
  exit 0
fi

# штатный прогон: связь с владельцем даже при мертвом оркестраторе
node "$SELF/helioz-zeus.mjs" poll --timeout 20 >> "$LOGS/watchdog.log" 2>&1 || true
node "$SELF/helioz-zeus.mjs" flush >> "$LOGS/watchdog.log" 2>&1 || true

DECISION="$(decide)"
if [ "${1:-}" = "--dry-run" ]; then echo "$DECISION"; exit 0; fi
echo "$(date '+%F %T') watchdog: $DECISION" >> "$LOGS/watchdog.log"
[ "$DECISION" = "START" ] || exit 0

# двойной старт запрещен: pid прошлого оркестратора еще жив → не трогаем
if [ -f "$STATE/orchestrator.pid" ] && kill -0 "$(cat "$STATE/orchestrator.pid")" 2>/dev/null; then
  echo "$(date '+%F %T') watchdog: pid жив, не стартуем" >> "$LOGS/watchdog.log"; exit 0
fi

CMD="$(cfg orchestrator_cmd)"
if [ -z "$CMD" ]; then echo "$(date '+%F %T') watchdog: orchestrator_cmd пуст" >> "$LOGS/watchdog.log"; exit 0; fi
TS="$(date +%Y%m%d-%H%M%S)"
# launchd не наследует HELIOZ_HOME: без него `cd "$HELIOZ_HOME"` в команде
# оставляет оркестратор в корне, и он умирает на первом же cat.
export HELIOZ_HOME="$HOME_DIR"
nohup bash -lc "$CMD" >> "$LOGS/orchestrator-$TS.log" 2>&1 &
echo $! > "$STATE/orchestrator.pid"
node "$SELF/helioz-zeus.mjs" send --text "♻️ Оркестратор перезапущен сторожем (heartbeat протух). Продолжаю с хэндоффа, состояние цело." >> "$LOGS/watchdog.log" 2>&1 || true
echo "$(date '+%F %T') watchdog: запущен оркестратор pid $(cat "$STATE/orchestrator.pid")" >> "$LOGS/watchdog.log"
