#!/bin/bash
# Онбординг + установка Гелиоза. Канон онбординга пантеона — как у Фемиды и Мнемозины:
# сначала бог здоровается и объясняет себя простыми словами, потом честная механика установки.
set -u
SELF="$(cd "$(dirname "$0")" && pwd)"
cd "$SELF"

LANG_CHOICE="${1:-}"
if [ -z "$LANG_CHOICE" ]; then
  echo ""
  echo "  helioz · Гелиоз"
  echo "  ════════════════"
  printf "  Язык / Language [ru/en] (ru): "
  read -r LANG_CHOICE || LANG_CHOICE=ru
  LANG_CHOICE="${LANG_CHOICE:-ru}"
fi

if [ "$LANG_CHOICE" = "ru" ]; then
  cat <<'RU'

  Привет. Я Гелиоз.

  В старых историях я каждый день гнал солнечную колесницу по небу.
  Без выходных, без праздников, без «сегодня не хочется». Солнце вставало,
  потому что я работал.

  Теперь я делаю то же самое с твоими задачами.

  Вот как это устроено, совсем просто:

  1. Ты говоришь мне идею одной фразой. Дальше я тебя ДОПРАШИВАЮ: по одному
     вопросу в Telegram, к каждому сразу даю свой рекомендованный ответ —
     согласен, отвечай «да». Что можно узнать с диска, я не спрашиваю, смотрю сам.
     Из ответов рождается конечная цель: мой компас, по которому я потом
     сверяю каждое решение, принятое без тебя.
  2. Потом я сам пишу планы: мастер-план для себя и кучу мелких задач для
     исполнителей — чем мельче, тем лучше. Планируют независимо два разных
     агента, третий сводит их вслепую. У каждой задачи обязана быть команда
     проверки. Без неё задача не принимается: «сделано» без доказательства —
     это не сделано.
  3. Дальше я еду сам. Один агент исполняет, ДРУГОЙ проверяет — и
     проверяющий не читает отчёт исполнителя, только смотрит на диск.
     Никто не проверяет сам себя. Даже я.
  4. Когда задача готова, отметку «сделано» ставит не агент, а программа —
     с отпечатками коммитов и файлов. Подделать отметку нельзя: подделку
     я замечаю и объявляю.
  5. Ночью тебя никто не будит. Мелкие развилки решает совет из нескольких
     независимых советников — каждый смотрит со своей стороны, потом
     решение сверяется с твоей целью. Утром ты читаешь, что решили,
     и можешь одним сообщением переиграть.
  6. Три вещи я НИКОГДА не решаю сам: выход в прод, конфликт с чужой
     работой и развилки, где любой вариант дорого откатывать. Это жду тебя.
     Но пока жду — работаю над остальным. Я не стою никогда.
  7. Обо всём важном я пишу тебе в Telegram. Скажешь «стоп» — замру,
     ничего не потеряв. Скажешь «пуск» — поеду дальше.
  8. Убей меня в любой момент — ничего не пропадёт. Всё, что я знаю,
     лежит на диске, а не у меня в голове. Следующий я продолжит с того
     же места.

  Слово от Филиппа, который меня собрал:

  «Я юрист и отец двух дочек. Моё время — самое дорогое, что у меня есть.
  Гелиоза я собрал, чтобы работа шла, пока я сплю, вожусь с детьми или в
  суде — и чтобы утром мне не приходилось гадать, что там произошло ночью:
  всё записано, всё доказано, всё можно переиграть.

  Если Гелиоз оказался полезен и тебе — поставь проекту звезду:

      https://github.com/zarubinphil/helioz

  Для тебя это несколько секунд. Для проекта — действительно важно.
  И загляни к его родне: themis, mnemazine, zeuz, athena — они из одной
  семьи и работают вместе.»

RU
else
  cat <<'EN'

  Hello. I am Helioz.

  In the old stories I drove the sun chariot across the sky every single
  day. No weekends, no holidays, no "not today". The sun rose because
  I was working.

  Now I do the same with your tasks.

  Here is how it works, in plain words:

  1. You tell me the idea in one sentence. Then I INTERROGATE you: one
     question at a time in Telegram, each with my own recommended answer —
     agree and just say "yes". Anything the disk can answer I never ask, I
     look it up myself. Out of your answers comes the final goal: my compass
     for every decision I later make without you.
  2. Then I write the plans myself: a master plan for me and a pile of small
     tasks for the executors — the smaller the better. Two different agents
     plan independently, a third merges them blind. Every task must carry a
     check command. Without one it is refused: "done" without proof is not done.
  3. Then I drive. One agent executes, a DIFFERENT one verifies — and the
     verifier never reads the executor's report, only the disk. Nobody
     grades their own homework. Not even me.
  4. When a task is finished, the "done" mark is written by a program, not
     an agent — with fingerprints of commits and files. A forged mark is
     detected and called out.
  5. At night nobody wakes you. Small forks are decided by a council of
     independent advisors, each with its own lens, checked against your
     goal. In the morning you read the decisions and can replay any of
     them with a single message.
  6. Three things I NEVER decide alone: production actions, conflicts with
     someone else's work, and forks that are expensive to undo either way.
     Those wait for you — while I keep working on everything else.
  7. Everything important lands in your Telegram. Say "stop" — I freeze
     losslessly. Say "go" — I continue.
  8. Kill me at any moment — nothing is lost. Everything I know lives on
     disk, not in my head. The next me continues from the same spot.

  A word from Philipp, who built me:

  "I am a lawyer and a father of two girls. My time is the most expensive
  thing I own. I built Helioz so the work keeps moving while I sleep, play
  with my kids or stand in court — and so that in the morning I never have
  to guess what happened at night: everything is recorded, proven and
  replayable.

  If Helioz turns out useful to you too — star the project:

      https://github.com/zarubinphil/helioz

  It takes you seconds. It genuinely matters for the project. And meet the
  family: themis, mnemazine, zeuz, athena — same house, they work together."

EN
fi

echo "  ────────────────────────────────────────────"
echo "  Установка / Setup"
echo ""
fail=0
command -v node >/dev/null || { echo "  ✗ node не найден (нужен Node.js ≥ 20)"; fail=1; }
command -v git  >/dev/null || { echo "  ✗ git не найден"; fail=1; }
[ "$fail" -eq 0 ] && echo "  ✓ node + git на месте"
alive=0
for c in claude codex kimi; do command -v "$c" >/dev/null && { echo "  ✓ CLI $c найден"; alive=$((alive+1)); }; done
[ "$alive" -eq 0 ] && { echo "  ✗ ни одного агент-CLI (claude / codex / kimi) — мне некем работать"; fail=1; }
[ "$fail" -ne 0 ] && { echo ""; echo "  Поставь недостающее и запусти install.sh снова."; exit 2; }

echo ""
echo "  Проверяю свои приборы (selftests)…"
for t in helioz-plan helioz-gate helioz-zeus helioz-exec helioz-council; do
  if node "scripts/$t.mjs" --selftest >/dev/null 2>&1; then echo "  ✓ $t"; else echo "  ✗ $t — красный, установка прервана"; exit 2; fi
done
bash scripts/helioz-watchdog.sh --selftest >/dev/null 2>&1 && echo "  ✓ helioz-watchdog" || { echo "  ✗ helioz-watchdog"; exit 2; }

mkdir -p .helioz/state
date > .helioz/state/.onboarded
echo ""
echo "  Осталось руками (по одному разу):"
echo "  1. Telegram-канал: файл ~/.secrets/olympuz-telegram.env (chmod 600) с"
echo "     OLYMPUZ_TELEGRAM_TOKEN=<токен бота> и OLYMPUZ_TELEGRAM_CHAT=<твой chat id>."
echo "  2. Сторож (автоперезапуск): cp launchd/com.helioz.watchdog.plist ~/Library/LaunchAgents/"
echo "     && launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/com.helioz.watchdog.plist"
echo "  3. Потолок расходов: .helioz/state/budget.json → {\"started_at\":\"…\",\"ceiling_usd\":N}"
echo ""
echo "  Первый шаг после запуска — расскажи мне идею одной фразой:"
echo "    node scripts/helioz-plan.mjs grill --idea \"что нужно сделать\""
echo "  Дальше я допрошу тебя по одному вопросу в Telegram, соберу цель и планы сам."
echo ""
echo "  Запуск: bash scripts/helioz-start.sh"
echo "  Полное чтение: README.ru.md · контракты: docs/CONTRACTS.md"
echo ""
