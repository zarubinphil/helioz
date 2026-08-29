#!/bin/bash
# Онбординг + установка Гелиоза. Канон онбординга пантеона - как у Фемиды и Мнемозины:
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
  Без выходных, без праздников, без «сегодня что-то не хочется».
  Солнце вставало, потому что я работал.

  Теперь то же самое я делаю с задачами. Вот весь путь, от начала и до конца.

  1. Ты бросаешь мне идею одной фразой. Не задание, не план: просто мысль,
     вроде «переписать биллинг на новую схему».

  2. Я тебя допрашиваю. По одному вопросу за раз, и к каждому сразу даю
     свой ответ. Согласен, напиши «да», я запишу и спрошу следующий.
     Спрашиваю не что попало, а по списку тем: чего добиваемся, чем меряем
     готовность, что нельзя трогать, что считается провалом, что решать
     без тебя. Отдельно иду в неудобные углы: где сломается первым, что
     развалится через месяц, какое очевидное решение тебе на самом деле не
     нужно. То, что видно на диске, я не спрашиваю, а иду и смотрю сам.

     Отвечать можно там, где ты работаешь, канал мне безразличен. Правишь
     строку «Ответ» в queue/BRIEF.md - подойдёт VS Code, любая IDE,
     десктопное приложение, vim. Сидишь в терминале или в сессии агента
     (Claude Code, Codex, что угодно) - командой:
       node scripts/helioz-plan.mjs answer --slot goal.done --text "да"
     Ты в дороге и под рукой телефон - пишешь боту в Telegram.
     Вопрос я отправляю сразу везде, состояние одно и лежит на диске.

  3. Из твоих ответов рождается конечная цель. Это мой компас: каждое
     решение, принятое без тебя, я потом сверяю с ней. Пока главные
     вопросы без ответа, цели не будет, и планов тоже. Не из вредности:
     работать по догадке дороже, чем подождать одну твою фразу.

  4. Дальше планы пишу я. Мастер-план себе и кучу мелких задач
     исполнителям, чем мельче, тем лучше. Планируют два разных агента
     врозь, не видя работу друг друга, третий сводит их вслепую. У каждой
     задачи обязана быть команда проверки. Нет команды, задачу не приму:
     «сделано» без доказательства это не сделано.

  5. Потом еду сам. Один агент работает, другой проверяет, и проверяющий
     отчёт первого не читает: смотрит на диск и гоняет команды. Никто не
     ставит оценку сам себе. Я тоже.

  6. Отметку «готово» пишет программа, а не агент. Внутри отпечатки
     коммитов и файлов. Подделку я вижу и объявляю вслух.

  7. Ночью тебя никто не будит. Мелкие развилки решает совет советников,
     каждый со своей стороны, и решение сверяется с твоей целью. Утром
     прочитаешь и одним сообщением переиграешь, если не согласен.

  8. Три вещи я не решаю никогда: выход в прод, столкновение с чужой
     работой и развилку, где любой вариант дорого откатывать. Тут жду
     тебя. Но пока жду, беру другую работу. Стоять я не умею.

  9. Убей меня в любой момент, ничего не пропадёт. Всё, что я знаю, лежит
     на диске, а не у меня в голове. Следующий я продолжит с той же
     строчки. Скажешь «стоп», замру. Скажешь «пуск», поеду дальше.

  Слово от Филиппа, который меня собрал:

  «Я юрист и отец двух дочек. Время - единственное, чего мне правда не
  хватает. Гелиоза я собрал, чтобы работа шла, пока я сплю, вожусь с
  детьми или сижу в процессе. И чтобы утром не гадать, что там было
  ночью: всё записано, всё доказано, любое решение можно переиграть.

  Если он и тебе пригодится, поставь звезду:

      https://github.com/zarubinvibe/helioz

  Тебе несколько секунд, проекту правда важно. И загляни к его родне:
  themis, mnemazine, zeuz, athena. Они из одной семьи и работают вместе.»

RU
else
  cat <<'EN'

  Hello. I am Helioz.

  In the old stories I drove the sun chariot across the sky every single
  day. No weekends, no holidays, no "not today". The sun rose because I
  was working.

  Now I do the same with tasks. Here is the whole path, start to finish.

  1. You throw me an idea in one sentence. Not a spec, not a plan, just
     the thought: "move billing onto the new schema".

  2. I interrogate you. One question at a time, and every question comes
     with my own answer attached. Agree and just say "yes": I record it
     and ask the next one. The questions are not improvised, they follow
     a fixed list of topics: what we are after, how readiness is
     measured, what must never be touched, what counts as failure, what
     I may decide alone. Then I walk into the awkward corners: where it
     breaks first, what falls apart after a month, which obvious
     solution you actually do not want. Anything the disk can answer I
     never ask you, I go and look.

     Answer wherever you work, the channel means nothing to me. Fill in
     the answer line in queue/BRIEF.md from VS Code, any IDE, a desktop
     app or vim. Sitting in a terminal or an agent session (Claude Code,
     Codex, whatever) run:
       node scripts/helioz-plan.mjs answer --slot goal.done --text "yes"
     On the move with only a phone, message the bot in Telegram.
     I send the question everywhere at once; the state is one, on disk.

  3. Your answers become the final goal. That is my compass: every
     decision I later make without you gets checked against it. While the
     main questions have no answers there is no goal and no plans. Not to
     be difficult: guessing costs more than waiting for one sentence.

  4. Then I write the plans. A master plan for me and a pile of small
     tasks for the executors, the smaller the better. Two different
     agents plan apart, blind to each other, and a third merges them
     blind. Every task must carry a check command. No command, no task:
     "done" without proof is not done.

  5. Then I drive. One agent works, another verifies, and the verifier
     never reads the first one's report: it looks at the disk and runs
     commands. Nobody grades their own homework. Me included.

  6. The "finished" mark is written by a program, not an agent. It
     carries fingerprints of commits and files. A forgery gets seen and
     called out.

  7. At night nobody wakes you. Small forks go to a council of advisors,
     each with its own angle, and the decision is checked against your
     goal. In the morning you read it and replay it with one message if
     you disagree.

  8. Three things I never decide alone: production actions, a clash with
     someone else's work, and a fork that is expensive to undo either
     way. Those wait for you. While they wait I take other work. Idling
     is not something I do.

  9. Kill me at any moment, nothing is lost. Everything I know lives on
     disk, not in my head. The next me continues from the same line. Say
     "stop" and I freeze. Say "go" and I keep driving.

  A word from Philipp, who built me:

  "I am a lawyer and a father of two girls. Time is the one thing I am
  short of. I built Helioz so the work keeps moving while I sleep, play
  with my kids or sit in a hearing. And so that in the morning I never
  have to guess what happened overnight: everything is recorded, proven,
  and any decision can be replayed.

  If it turns out useful to you too, star the project:

      https://github.com/zarubinvibe/helioz

  Seconds for you, genuinely important for the project. And meet the
  family: themis, mnemazine, zeuz, athena. Same house, they work
  together."

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
[ "$alive" -eq 0 ] && { echo "  ✗ ни одного агент-CLI (claude / codex / kimi) - мне некем работать"; fail=1; }
[ "$fail" -ne 0 ] && { echo ""; echo "  Поставь недостающее и запусти install.sh снова."; exit 2; }

echo ""
echo "  Проверяю свои приборы (selftests)…"
for t in helioz-plan helioz-gate helioz-zeus helioz-exec helioz-council; do
  if node "scripts/$t.mjs" --selftest >/dev/null 2>&1; then echo "  ✓ $t"; else echo "  ✗ $t - красный, установка прервана"; exit 2; fi
done
bash scripts/helioz-watchdog.sh --selftest >/dev/null 2>&1 && echo "  ✓ helioz-watchdog" || { echo "  ✗ helioz-watchdog"; exit 2; }

mkdir -p .helioz/state queue/tasks queue/dilemmas
date > .helioz/state/.onboarded
echo ""
echo "  Осталось руками (по одному разу):"
echo '  1. Telegram-канал: локальный файл секретов вне репозитория (chmod 600) с'
echo "     HELIOZ_TELEGRAM_TOKEN=<токен бота> и HELIOZ_TELEGRAM_CHAT=<твой chat id>."
echo "  2. Сторож (автоперезапуск): подставь путь клона в launchd/com.helioz.watchdog.plist"
echo "     и положи результат в ~/Library/LaunchAgents/com.helioz.watchdog.plist,"
echo "     затем: launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/com.helioz.watchdog.plist"
echo "  3. Потолок расходов: .helioz/state/budget.json → {\"started_at\":\"…\",\"ceiling_usd\":N}."
echo "     Окно считается от started_at; сбросить: node scripts/helioz-budget-reset.mjs"
echo ""
echo "  Первый шаг после запуска: расскажи мне идею одной фразой."
echo "    node scripts/helioz-plan.mjs grill --idea \"что нужно сделать\""
echo "  Дальше я допрошу тебя по одному вопросу в Telegram, соберу цель и планы сам."
echo ""
echo "  Запуск: bash scripts/helioz-start.sh"
echo "  Подробно: README.ru.md, контракты состояния: docs/CONTRACTS.md"
echo ""
