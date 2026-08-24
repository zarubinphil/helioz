#!/usr/bin/env node
// ГОЛОВА КОНВЕЙЕРА - цель и планы не берутся ниоткуда, их добывает прибор.
// Допрос владельца (grill) → конечная цель (goal) → мастер-план и малые задачи (plan).
//
// Допрос собран из проверенного и доведён до уровня Fable 5:
//   · grill-me (Matt Pocock)  - допрашивать беспощадно, обходить дерево решений, к каждому вопросу
//                               давать СВОЙ рекомендованный ответ, по одному вопросу за раз;
//   · grill-me расширенный (usirin) - codebase-first: то, что можно узнать с диска, не спрашивают;
//   · grill-with-docs        - допрос оставляет артефакт, а не только согласие в чате;
//   · Superpowers brainstorming - на развилке предлагать 2–3 варианта, а не открытый вопрос;
//   · OntoAgent (arXiv 2605.05828, 2026) - онтология слотов: ЧТО спросить решает структура, КАК спросить
//                               решает модель. Отсюда измеримое покрытие допроса вместо ощущения «вроде всё»;
//   · Elicitron (Ataei et al.) - латентные требования: владелец не назовёт то, о чём не думал; спрашивать
//                               про крайние случаи и провалы отдельным блоком.
//
//   grill --idea "…"      собрать допрос по онтологии → queue/BRIEF.md (+ первый вопрос в Зевса)
//   ask-next              отправить владельцу следующий незакрытый вопрос (по одному за раз)
//   answer --slot X --text "…"   записать ответ владельца в BRIEF (зовёт Зевс, когда владелец пишет)
//   coverage [--json]     покрытие допроса: какие слоты закрыты, какие критичные пусты
//   goal                  из закрытого допроса → queue/GOAL.md (критичный слот пуст = отказ)
//   plan                  расхождение 2 CLI → слепой свод → docs/MASTER-PLAN.md + queue/tasks/*.task.md
//   --selftest            стаб-CLI, ни одного живого вызова
//
// Коды: 0 ok · 1 модель не справилась · 2 fail-closed (нет входа / допрос не закрыт / нет живых CLI).
import { parseArgs } from 'node:util'
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, chmodSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url))
const HOME = process.env.HELIOZ_HOME || path.dirname(SCRIPTS)
const EXEC = path.join(SCRIPTS, 'helioz-exec.mjs')
const ZEUS = path.join(SCRIPTS, 'helioz-zeus.mjs')
const QUEUE = path.join(HOME, 'queue')
const BRIEF = path.join(QUEUE, 'BRIEF.md')
const GOAL = path.join(QUEUE, 'GOAL.md')
const MASTER = path.join(HOME, 'docs', 'MASTER-PLAN.md')
const STATE = path.join(HOME, '.helioz', 'state', 'plan')
const now = () => new Date().toISOString()

// --- ОНТОЛОГИЯ ДОПРОСА: что спрашивать (структура), а не как (это решает модель) -------------------
// Три уровня: блок → слот → вопрос. Критичный слот пустым не бывает: без него планировать запрещено.
export const ONTOLOGY = [
  { block: 'ЦЕЛЬ', slots: [
    { id: 'goal.done', critical: true, what: 'что должно стать истинным, когда работа закончена' },
    { id: 'goal.who', critical: false, what: 'кто этим пользуется и что у него меняется' },
    { id: 'goal.why-now', critical: false, what: 'почему это делается сейчас, а не через полгода' },
  ] },
  { block: 'ГОТОВО', slots: [
    { id: 'done.check', critical: true, what: 'какой командой, числом или файлом проверяется готовность' },
    { id: 'done.deadline', critical: false, what: 'к какому сроку и что важнее - срок или полнота' },
  ] },
  { block: 'ГРАНИЦЫ', slots: [
    { id: 'limits.untouchable', critical: true, what: 'что нельзя трогать ни при каких условиях' },
    { id: 'limits.cost', critical: false, what: 'потолок денег и токенов, за которым останавливаемся' },
    { id: 'limits.foreign', critical: false, what: 'чья ещё работа идёт рядом и где риск столкнуться' },
  ] },
  { block: 'РИСК', slots: [
    { id: 'risk.failure', critical: true, what: 'что считается провалом работы' },
    { id: 'risk.rollback', critical: false, what: 'что дорого откатывать, если сделать неправильно' },
  ] },
  { block: 'УЖЕ ЕСТЬ', slots: [
    { id: 'have.assets', critical: false, what: 'что уже написано и переиспользуется (проверь диск сам, не спрашивай зря)' },
    { id: 'have.gaps', critical: false, what: 'чего точно нет и придётся делать с нуля' },
  ] },
  { block: 'РАЗВИЛКИ', slots: [
    { id: 'fork.autonomy', critical: true, what: 'что агенты решают сами, а что обязаны вынести владельцу' },
    { id: 'fork.style', critical: false, what: 'предпочтения владельца, которые он не назовёт сам (стек, стиль, привычки)' },
  ] },
  // Латентный блок (Elicitron): владелец не назовёт то, о чём не думал. Спрашиваем прицельно.
  { block: 'СКРЫТОЕ', slots: [
    { id: 'latent.edge', critical: false, what: 'крайний случай, на котором решение сломается первым' },
    { id: 'latent.month', critical: false, what: 'что развалится через месяц эксплуатации, если сделать в лоб' },
    { id: 'latent.wrong-shape', critical: false, what: 'какое очевидное решение владелец НЕ хочет и почему' },
  ] },
]
const allSlots = () => ONTOLOGY.flatMap(b => b.slots.map(s => ({ ...s, block: b.block })))

const runExec = args => spawnSync(process.execPath, [EXEC, ...args], { encoding: 'utf8', env: process.env })
function askCli(cli, prompt, logName, timeout = 600) {
  mkdirSync(STATE, { recursive: true })
  const pf = path.join(STATE, `${logName}.prompt.txt`)
  const lf = path.join(STATE, `${logName}.md`)
  writeFileSync(pf, prompt)
  const r = runExec(['run', '--cli', cli, '--prompt-file', pf, '--log', lf, '--timeout', String(timeout)])
  const text = existsSync(lf) ? readFileSync(lf, 'utf8').split('--- stderr ---')[0].trim() : ''
  return { ok: r.status === 0 && text.length > 0, text, log: path.relative(HOME, lf) }
}
function pickCli(role, exclude = [], prefer) {
  const r = runExec(['pick', '--role', role, ...(exclude.filter(Boolean).length ? ['--exclude', exclude.filter(Boolean).join(',')] : []), ...(prefer ? ['--prefer', prefer] : [])])
  return r.status === 0 ? r.stdout.trim().split('\n').pop() : null
}
const zeus = (text, quiet) => spawnSync(process.execPath, [ZEUS, 'send', '--text', text, ...(quiet ? ['--quiet'] : [])], { encoding: 'utf8' })

export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)```/)
  for (const c of (fenced ? [fenced[1], text] : [text])) {
    const start = c.indexOf('{')
    if (start < 0) continue
    let depth = 0, inStr = false, esc = false
    for (let i = start; i < c.length; i++) {
      const ch = c[i]
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue }
      if (ch === '"') inStr = true
      else if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(c.slice(start, i + 1)) } catch { break } } }
    }
  }
  return null
}

// --- 1. ДОПРОС ------------------------------------------------------------------------------------
const grillPrompt = idea => [
  'Ты - дознаватель. Владелец принёс работу, и твоя задача - вытащить из него всё, что нужно, ДО того как',
  'кто-то напишет строку кода. Ты не советчик и не рецензент: ты задаёшь вопросы.',
  '',
  `ИДЕЯ ВЛАДЕЛЬЦА: «${idea}»`,
  '',
  'Правила допроса (нарушение любого = плохой допрос):',
  '1. НА КАЖДЫЙ СЛОТ ниже - ровно один вопрос. Слоты заданы, их набор менять нельзя: это пространство допроса,',
  '   по нему потом считается покрытие. Ты решаешь КАК спросить, а не ЧТО спросить.',
  '2. Вопрос конкретный и отвечаемый одной-двумя фразами. Никаких «расскажите о вашем видении».',
  '3. К КАЖДОМУ вопросу дай СВОЙ рекомендованный ответ - тот, который ты примешь по умолчанию, если владелец',
  '   промолчит. Рекомендация обязана быть конкретной («потолок $20 за сутки»), а не «на усмотрение».',
  '4. Codebase-first: если ответ можно взять с диска - возьми его САМ (читай файлы в рабочем каталоге) и',
  '   вместо вопроса напиши, что нашёл, а спроси уже про следующий уровень решения. Не заставляй владельца',
  '   искать то, что видно тебе.',
  '5. Где выбор - предложи 2–3 конкретных варианта прямо в вопросе, а не открытое поле.',
  '6. Блок СКРЫТОЕ - про то, о чём владелец сам не подумает: крайний случай, срок жизни решения, ловушка',
  '   очевидного пути. Эти вопросы обязаны быть неудобными.',
  '',
  'СЛОТЫ (id · что нужно вытащить):',
  ...allSlots().map(s => `- ${s.id}${s.critical ? ' [КРИТИЧНЫЙ]' : ''} · ${s.what}`),
  '',
  'Формат ответа - строго так, без вступлений и без текста вокруг:',
  '',
  '<!-- slot:goal.done -->',
  '**Вопрос:** …',
  '**Рекомендую:** …',
  '**Ответ:**',
  '',
  '…и так по каждому слоту, в порядке списка выше. Строка «**Ответ:**» пустая - её заполняет владелец.',
].join('\n')

function cmdGrill(idea) {
  if (!idea || !idea.trim()) { console.error('grill: нет --idea - допрашивать не о чем'); return 2 }
  const cli = pickCli('advise')
  if (!cli) { console.error('grill: нет живых CLI'); return 2 }
  const r = askCli(cli, grillPrompt(idea.trim()), 'grill', 900)
  if (!r.ok) { console.error(`grill: ${cli} не ответил (лог ${r.log})`); return 1 }
  const got = new Set([...r.text.matchAll(/<!--\s*slot:([\w.-]+)\s*-->/g)].map(m => m[1]))
  const missing = allSlots().filter(s => !got.has(s.id))
  if (missing.length) { console.error(`grill: модель пропустила слоты: ${missing.map(s => s.id).join(', ')} - допрос неполон, отказ`); return 1 }
  mkdirSync(QUEUE, { recursive: true })
  writeFileSync(BRIEF, [
    `# Допрос: ${idea.trim()}`, '',
    `> Составил ${cli} по онтологии из ${allSlots().length} слотов, ${now()}.`,
    '> Отвечать можно где удобно, канал роли не играет:',
    '>   · правкой поля «**Ответ:**» прямо здесь - VS Code, любая IDE, десктопное приложение, vim;',
    '>   · командой `node scripts/helioz-plan.mjs answer --slot <слот> --text "…"` в терминале или сессии агента;',
    '>   · сообщением боту в Telegram, с телефона.',
    '> Промолчал по некритичному слоту - приму «Рекомендую». Критичный слот пустым не бывает: без него планов не будет.',
    '', r.text.trim(), '',
  ].join('\n'))
  writeFileSync(path.join(QUEUE, 'GRILL-STATE.json'), JSON.stringify({ idea: idea.trim(), started_at: now(), current: null, by: cli }, null, 2) + '\n')
  const cov = coverage()
  zeus(`📋 Допрос по идее «${idea.trim().slice(0, 100)}» готов: ${cov.total} вопросов, из них ${cov.criticalTotal} критичных. Отвечай где удобно: сюда по одному, правкой queue/BRIEF.md в редакторе или командой answer в терминале. Я записываю в любом случае.`)
  cmdAskNext()
  console.log(`допрос записан: ${path.relative(HOME, BRIEF)} (${cov.total} слотов, ${cli})`)
  return 0
}

// --- Покрытие допроса (вклад OntoAgent: покрытие измеримо, а не на глаз) --------------------------
export function parseBrief(text) {
  const out = []
  const re = /<!--\s*slot:([\w.-]+)\s*-->([\s\S]*?)(?=<!--\s*slot:|$)/g
  let m
  while ((m = re.exec(text))) {
    const body = m[2]
    const q = (body.match(/\*\*Вопрос:\*\*\s*(.*)/) || [])[1] || ''
    const rec = (body.match(/\*\*Рекомендую:\*\*\s*([\s\S]*?)(?=\n\*\*|$)/) || [])[1] || ''
    const ans = (body.match(/\*\*Ответ:\*\*\s*([\s\S]*?)(?=\n<!--|$)/) || [])[1] || ''
    out.push({ id: m[1], question: q.trim(), recommend: rec.trim(), answer: ans.trim() })
  }
  return out
}
function coverage() {
  const known = new Map(allSlots().map(s => [s.id, s]))
  const items = existsSync(BRIEF) ? parseBrief(readFileSync(BRIEF, 'utf8')) : []
  const rows = items.map(i => ({ ...i, critical: Boolean(known.get(i.id) && known.get(i.id).critical), answered: i.answer.length > 1 }))
  const criticalRows = rows.filter(r => r.critical)
  return {
    total: rows.length, answered: rows.filter(r => r.answered).length,
    criticalTotal: criticalRows.length, criticalAnswered: criticalRows.filter(r => r.answered).length,
    criticalMissing: criticalRows.filter(r => !r.answered).map(r => r.id),
    next: rows.find(r => !r.answered) || null, rows,
  }
}
function cmdCoverage(json) {
  const c = coverage()
  if (!c.total) { console.error('покрытие: допроса нет'); return 2 }
  if (json) console.log(JSON.stringify({ total: c.total, answered: c.answered, critical_missing: c.criticalMissing, next: c.next && c.next.id }, null, 2))
  else {
    console.log(`ПОКРЫТИЕ ДОПРОСА: ${c.answered}/${c.total} (критичных ${c.criticalAnswered}/${c.criticalTotal})`)
    for (const r of c.rows) console.log(`  ${r.answered ? '✓' : '·'} ${r.id}${r.critical ? ' [крит]' : ''}`)
  }
  return c.criticalMissing.length ? 1 : 0
}

// --- Один вопрос за раз (правило grill-me: не вываливать анкету) ----------------------------------
function cmdAskNext() {
  const c = coverage()
  if (!c.total) { console.error('ask-next: допроса нет'); return 2 }
  if (!c.next) { zeus('✅ Допрос закрыт полностью. Составляю цель и планы.'); console.log('вопросов не осталось'); return 0 }
  const sf = path.join(QUEUE, 'GRILL-STATE.json')
  const st = existsSync(sf) ? JSON.parse(readFileSync(sf, 'utf8')) : {}
  st.current = c.next.id
  writeFileSync(sf, JSON.stringify(st, null, 2) + '\n')
  const head = `Вопрос ${c.answered + 1} из ${c.total}${c.next.critical ? ' (критичный, без него планов не будет)' : ''}`
  zeus([
    `❓ ${head}`, c.next.question, '',
    c.next.recommend ? `Моя рекомендация: ${c.next.recommend}` : '',
    'Ответь сообщением. Согласен с рекомендацией - напиши «да».',
  ].filter(Boolean).join('\n'))
  // Канал не один: тот же вопрос печатается сюда, поэтому отвечать можно там, где работаешь -
  // в терминале, в редакторе (правкой BRIEF.md), в сессии агента или из Telegram.
  console.log([
    '', `❓ ${head}   [слот ${c.next.id}]`, c.next.question,
    c.next.recommend ? `Рекомендую: ${c.next.recommend}` : '',
    '', 'Ответить можно любым способом:',
    `  node scripts/helioz-plan.mjs answer --slot ${c.next.id} --text "твой ответ"   (или --text "да")`,
    '  правкой строки «**Ответ:**» в queue/BRIEF.md - в VS Code, любой IDE, десктопном приложении',
    '  сообщением боту в Telegram',
  ].filter(Boolean).join('\n'))
  return 0
}

function cmdAnswer(slot, text) {
  if (!existsSync(BRIEF)) { console.error('answer: допроса нет'); return 2 }
  const sf = path.join(QUEUE, 'GRILL-STATE.json')
  const st = existsSync(sf) ? JSON.parse(readFileSync(sf, 'utf8')) : {}
  const id = slot || st.current
  if (!id) { console.error('answer: неизвестно, на какой вопрос отвечают'); return 2 }
  if (!text || !text.trim()) { console.error('answer: пустой ответ не записывается'); return 2 }
  const brief = readFileSync(BRIEF, 'utf8')
  const items = parseBrief(brief)
  const item = items.find(i => i.id === id)
  if (!item) { console.error(`answer: слота ${id} нет в допросе`); return 2 }
  // «да» = принять рекомендацию дознавателя (правило grill-me: у каждого вопроса есть готовый ответ)
  const value = /^(да|ок|ok|\+|согласен|yes)$/i.test(text.trim()) && item.recommend ? `(принята рекомендация) ${item.recommend}` : text.trim()
  const re = new RegExp(`(<!--\\s*slot:${id.replace(/\./g, '\\.')}\\s*-->[\\s\\S]*?\\*\\*Ответ:\\*\\*)([^\\n]*)`)
  writeFileSync(BRIEF, brief.replace(re, `$1 ${value.replace(/\n/g, ' ')}`))
  console.log(`записан ответ по слоту ${id}`)
  return cmdAskNext()
}

// --- 2. ЦЕЛЬ --------------------------------------------------------------------------------------
function cmdGoal() {
  if (!existsSync(BRIEF)) { console.error('goal: нет queue/BRIEF.md - сначала grill'); return 2 }
  const c = coverage()
  if (!c.total) { console.error('goal: BRIEF без слотов - файл испорчен'); return 2 }
  // Fail-closed по критичным слотам: планировать по недопрошенному владельцу запрещено.
  if (c.criticalMissing.length) { console.error(`goal: пусты критичные слоты: ${c.criticalMissing.join(', ')} - отказ`); return 2 }
  const cli = pickCli('synthesize')
  if (!cli) { console.error('goal: нет живых CLI'); return 2 }
  // Некритичные пустые слоты закрываются рекомендацией дознавателя - но это видно в цели, а не молчком.
  const filled = c.rows.map(r => `[${r.id}] ${r.question}\nОТВЕТ: ${r.answered ? r.answer : `(владелец промолчал, принята рекомендация) ${r.recommend}`}`).join('\n\n')
  const r = askCli(cli, [
    'Ниже допрос владельца с ответами. Сформулируй КОНЕЧНУЮ ЦЕЛЬ работы - тот север, по которому ночной',
    'совет агентов будет сверять каждое решение, принятое без владельца.',
    '',
    'Требования:',
    '- 5–10 строк. Цель, а не план: списка задач тут быть не должно.',
    '- Первая фраза - что станет истинным, когда работа закончена.',
    '- Отдельной строкой «Готово, когда:» - чем измеряется готовность, дословно из ответов владельца.',
    '- Отдельной строкой «Нельзя:» - запреты владельца.',
    '- Отдельной строкой «Принято по умолчанию:» - перечисли слоты, где владелец промолчал и принята рекомендация.',
    '- Ничего не выдумывай: только то, что есть в ответах.',
    '',
    'Формат: чистый markdown, первый заголовок «# Конечная цель владельца». Без преамбул.',
    '', '--- ДОПРОС ---', filled,
  ].join('\n'), 'goal', 600)
  if (!r.ok) { console.error(`goal: ${cli} не ответил (лог ${r.log})`); return 1 }
  writeFileSync(GOAL, r.text.trim() + `\n\n> Собрано ${cli} из queue/BRIEF.md (${c.answered}/${c.total} слотов от владельца), ${now()}. Правь руками, если неточно.\n`)
  zeus(`🎯 Конечная цель записана. Допрос закрыт на ${c.answered} из ${c.total} вопросов, критичные все. По этой цели совет будет решать ночные развилки.`)
  console.log(`цель записана: ${path.relative(HOME, GOAL)} (${cli})`)
  return 0
}

// --- 3. ПЛАНЫ (расхождение → слепое схождение) ----------------------------------------------------
const PLAN_SCHEMA = `{
  "master": {
    "summary": "2-4 предложения: что делаем, почему так, где планировщики разошлись",
    "waves": [{"n": 1, "tasks": ["T001","T002"], "why": "почему эти идут вместе"}],
    "risks": ["риск и что делаем, если он случится"],
    "budget": "ожидаемая цена всей работы: время и токены"
  },
  "tasks": [{
    "id": "T001",
    "title": "короткое имя",
    "goal": "одно проверяемое утверждение, которое станет истинным",
    "paths": ["точный/путь/файла"],
    "requires": [],
    "executor": "claude|codex|kimi",
    "verifier": "другой CLI, не тот же",
    "check_cmd": "команда, дающая 0 при успехе",
    "probe_cmd": "враждебная проба: команда, дающая 0 когда проверка ПРАВИЛЬНО краснеет на сломанном входе",
    "stop": "когда остановиться и звать владельца",
    "price": "оценка времени и токенов",
    "kind": "default",
    "executor_prompt": "дословный промт исполнителю: что сделать, по шагам",
    "verifier_prompt": "дословный промт проверяющему: что проверить по ДИСКУ, первая строка ответа - ВЕРДИКТ: зелёный|красный"
  }]
}`

const planPrompt = (goal, brief) => [
  'Ты - планировщик конвейера. Разбей работу на МАЛЫЕ задачи для агентов-исполнителей.',
  '',
  'Главное правило: чем мельче задача, тем лучше. Атом = один проверяемый результат ∧ один исполнитель ∧',
  'непересекающиеся с другими задачами файлы. Задачу нельзя проверить одной командой - она слишком крупная,',
  'дроби. Двенадцать мелких задач лучше трёх больших.',
  '',
  'Жёсткие требования к каждой задаче:',
  '- check_cmd обязателен и даёт 0 только при настоящем успехе. Задача без него в конвейер не принимается.',
  '- probe_cmd - враждебная проба: специально сломанный вход, на котором проверка ОБЯЗАНА покраснеть.',
  '- paths - точные пути, не больше трёх на задачу; задачи одной волны не делят ни одного пути.',
  '- executor и verifier - разные CLI: генератор не судит себя.',
  '- executor_prompt и verifier_prompt пишутся дословно, переписывать их никто не будет. Проверяющему',
  '  запрещено читать отчёт исполнителя - он смотрит только на диск и коды возврата.',
  '- kind: default, кроме прода/публикации (prod), конфликта с чужой работой (foreign) и развилок, дорогих',
  '  в откате (expensive) - эти три ждут владельца.',
  '',
  'Ответь ОДНИМ JSON-объектом по схеме. Никакого текста вокруг JSON.',
  PLAN_SCHEMA,
  '', '--- КОНЕЧНАЯ ЦЕЛЬ ВЛАДЕЛЬЦА ---', goal,
  '', '--- ДОПРОС ВЛАДЕЛЬЦА (ответы - источник истины) ---', brief,
].join('\n')

const synthPrompt = (goal, variants) => [
  'Ты - свод планов. Ниже НЕЗАВИСИМЫЕ планы разных планировщиков (имена скрыты) на одну работу.',
  'Собери ОДИН план: бери лучшее из каждого, дроби всё, что осталось крупным, выкидывай дубли.',
  'Где планировщики разошлись - выбирай то, что лучше служит конечной цели владельца, и назови разногласие',
  'в master.summary. Не сглаживай: разногласие - ценная находка, а не шум.',
  '',
  'Требования те же: малые задачи, check_cmd у каждой, враждебная проба, непересекающиеся пути внутри волны,',
  'исполнитель ≠ проверяющий, дословные промты обеих ролей.',
  'Ответь ОДНИМ JSON-объектом по схеме. Никакого текста вокруг JSON.',
  PLAN_SCHEMA,
  '', '--- КОНЕЧНАЯ ЦЕЛЬ ВЛАДЕЛЬЦА ---', goal,
  ...variants.map((v, i) => `\n--- ПЛАН ${String.fromCharCode(65 + i)} ---\n${v}`),
].join('\n')

export function validatePlan(plan) {
  const errs = []
  if (!plan || typeof plan !== 'object') return ['план не разобрался в JSON']
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : []
  if (!tasks.length) errs.push('ноль задач - fail-closed')
  const ids = new Set()
  for (const t of tasks) {
    const w = m => errs.push(`${t.id || '?'}: ${m}`)
    if (!t.id || ids.has(t.id)) w('нет уникального id')
    ids.add(t.id)
    if (!t.check_cmd) w('нет check_cmd - задача не принимается')
    if (!Array.isArray(t.paths) || !t.paths.length) w('нет точных путей')
    else if (t.paths.length > 3) w(`путей ${t.paths.length} > 3 - задача слишком крупная, дробить`)
    if (!t.executor_prompt || !t.verifier_prompt) w('нет дословных промтов ролей')
    if (t.executor && t.verifier && t.executor === t.verifier) w('исполнитель совпал с проверяющим')
    for (const dep of t.requires || []) if (!tasks.some(x => x.id === dep)) w(`зависимость ${dep} не существует`)
  }
  for (const wv of (plan.master && plan.master.waves) || []) {
    const seen = new Map()
    for (const id of wv.tasks || []) {
      const t = tasks.find(x => x.id === id)
      if (!t) { errs.push(`волна ${wv.n}: задачи ${id} нет в плане`); continue }
      for (const p of t.paths || []) {
        if (seen.has(p)) errs.push(`волна ${wv.n}: ${id} и ${seen.get(p)} делят путь ${p}`)
        else seen.set(p, id)
      }
    }
  }
  return errs
}

function writeTaskFiles(plan) {
  const dir = path.join(QUEUE, 'tasks')
  mkdirSync(dir, { recursive: true })
  const written = []
  for (const t of plan.tasks) {
    writeFileSync(path.join(dir, `${t.id}.task.md`), [
      '---', `id: ${t.id}`, `title: ${t.title || t.id}`,
      `goal: "${String(t.goal || '').replace(/"/g, "'")}"`,
      'paths:', ...t.paths.map(p => `  - ${p}`),
      `requires: [${(t.requires || []).join(', ')}]`,
      `executor: ${t.executor || 'claude'}`, `verifier: ${t.verifier || 'codex'}`,
      `check_cmd: "${String(t.check_cmd).replace(/"/g, '\\"')}"`,
      ...(t.probe_cmd ? [`probe_cmd: "${String(t.probe_cmd).replace(/"/g, '\\"')}"`] : []),
      `stop: "${String(t.stop || 'две красные попытки подряд → развилка владельцу').replace(/"/g, "'")}"`,
      `price: "${String(t.price || 'не оценена').replace(/"/g, "'")}"`,
      `kind: ${t.kind || 'default'}`, '---',
      '## Промт исполнителя', t.executor_prompt, '', '## Промт проверяющего', t.verifier_prompt, '',
    ].join('\n'))
    written.push(t.id)
  }
  return written
}

function writeMaster(plan, meta) {
  const m = plan.master || {}
  mkdirSync(path.dirname(MASTER), { recursive: true })
  writeFileSync(MASTER, [
    '# Мастер-план', '', m.summary || '', '',
    '## Волны', '',
    ...((m.waves || []).flatMap(w => [`**Волна ${w.n}** - ${w.why || ''}`, ...(w.tasks || []).map(id => {
      const t = plan.tasks.find(x => x.id === id)
      return `- ${id} · ${t ? t.title : '?'} · исполняет ${t ? t.executor : '?'}, проверяет ${t ? t.verifier : '?'} · проверка: \`${t ? t.check_cmd : '?'}\``
    }), ''])),
    '## Риски', '', ...((m.risks || []).map(r => `- ${r}`)), '',
    '## Цена', '', m.budget || 'не оценена', '',
    '---', '',
    `Собран прибором helioz-plan ${now()}: планировали ${meta.planners.join(' и ')} независимо, свёл ${meta.synth} вслепую.`,
    'Задачи - в `queue/tasks/`. Оркестратор читает этот файл как карту, а исполняет задачи тактом по ORCHESTRATOR.md.',
  ].join('\n'))
}

function cmdPlan() {
  if (!existsSync(GOAL)) { console.error('plan: нет queue/GOAL.md - сначала grill и goal'); return 2 }
  const goal = readFileSync(GOAL, 'utf8')
  const brief = existsSync(BRIEF) ? readFileSync(BRIEF, 'utf8') : ''
  const first = pickCli('execute')
  const second = pickCli('advise', [first])
  if (!first) { console.error('plan: нет живых CLI'); return 2 }
  const planners = [first, second].filter(Boolean)
  const variants = []
  for (const cli of planners) {
    const r = askCli(cli, planPrompt(goal, brief), `planner-${cli}`, 900)
    if (r.ok && extractJson(r.text)) variants.push(r.text)
    else console.error(`планировщик ${cli} не дал разборный план (лог ${r.log})`)
  }
  if (!variants.length) { console.error('plan: ни один планировщик не справился'); return 1 }
  if (variants.length === 1) console.error('ВНИМАНИЕ: план одноголосый - второго независимого мнения не было')

  const synth = pickCli('synthesize', planners) || planners[0]
  const sr = askCli(synth, synthPrompt(goal, variants), 'synthesis', 900)
  let plan = sr.ok ? extractJson(sr.text) : null
  let usedSynth = synth
  if (!plan) { plan = extractJson(variants[0]); usedSynth = 'свод не удался, взят первый план'; console.error('свод не разобрался - падаю на первый план') }

  const errs = validatePlan(plan)
  if (errs.length) {
    console.error('ПЛАН НЕ ПРИНЯТ (ворота приёмки):')
    for (const e of errs) console.error('  · ' + e)
    return 1
  }
  const ids = writeTaskFiles(plan)
  writeMaster(plan, { planners, synth: usedSynth })
  zeus(`🗺 Планы готовы: ${ids.length} малых задач и мастер-план. Планировали независимо ${planners.join(' и ')}, свёл вслепую ${usedSynth}. У каждой задачи своя команда проверки и враждебная проба. Начинаю работу.`)
  console.log(JSON.stringify({ ok: true, tasks: ids, master: path.relative(HOME, MASTER), planners, synth: usedSynth }))
  return 0
}

// --- selftest -------------------------------------------------------------------------------------
async function cmdSelftest() {
  const { strictEqual: eq, ok } = await import('node:assert')

  eq(extractJson('Вот план:\n```json\n{"a":1}\n```\nготово').a, 1)
  eq(extractJson('мусор без json'), null)
  eq(extractJson('{"s":"скобка } внутри строки","b":2}').b, 2)

  // онтология: критичные слоты существуют и покрывают цель/готовность/границы/риск/автономию
  const crit = allSlots().filter(s => s.critical).map(s => s.id)
  ok(crit.includes('goal.done') && crit.includes('done.check') && crit.includes('limits.untouchable') && crit.includes('risk.failure') && crit.includes('fork.autonomy'), 'критичные слоты на месте')
  ok(allSlots().some(s => s.id.startsWith('latent.')), 'блок латентных требований на месте')

  const brief = ['<!-- slot:goal.done -->', '**Вопрос:** Что готово?', '**Рекомендую:** сборка зелёная', '**Ответ:** тесты проходят',
    '<!-- slot:done.check -->', '**Вопрос:** Чем мерим?', '**Рекомендую:** npm test', '**Ответ:**'].join('\n')
  const parsed = parseBrief(brief)
  eq(parsed.length, 2); eq(parsed[0].answer, 'тесты проходят'); eq(parsed[1].answer, ''); eq(parsed[1].recommend, 'npm test')

  const good = {
    master: { summary: 's', waves: [{ n: 1, tasks: ['T1', 'T2'], why: 'w' }], risks: [], budget: 'b' },
    tasks: [
      { id: 'T1', title: 't', paths: ['a.mjs'], requires: [], executor: 'claude', verifier: 'codex', check_cmd: 'true', executor_prompt: 'x', verifier_prompt: 'y' },
      { id: 'T2', title: 't', paths: ['b.mjs'], requires: ['T1'], executor: 'codex', verifier: 'kimi', check_cmd: 'true', executor_prompt: 'x', verifier_prompt: 'y' },
    ],
  }
  eq(validatePlan(good).length, 0)
  const noCheck = structuredClone(good); delete noCheck.tasks[0].check_cmd
  ok(validatePlan(noCheck).some(e => e.includes('check_cmd')), 'задача без check_cmd отвергается')
  const fat = structuredClone(good); fat.tasks[0].paths = ['a', 'b', 'c', 'd']
  ok(validatePlan(fat).some(e => e.includes('дробить')), 'крупная задача отвергается')
  const same = structuredClone(good); same.tasks[0].verifier = 'claude'
  ok(validatePlan(same).some(e => e.includes('совпал')), 'исполнитель=проверяющий отвергается')
  const clash = structuredClone(good); clash.tasks[1].paths = ['a.mjs']
  ok(validatePlan(clash).some(e => e.includes('делят путь')), 'пересечение путей в волне отвергается')
  const ghost = structuredClone(good); ghost.tasks[1].requires = ['T9']
  ok(validatePlan(ghost).some(e => e.includes('не существует')), 'зависимость-призрак отвергается')
  eq(validatePlan({ tasks: [] })[0], 'ноль задач - fail-closed')

  // сквозной прогон на стаб-CLI
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'helioz-plan-'))
  try {
    for (const d of ['queue/tasks', 'config', 'scripts', 'docs', '.helioz/state']) mkdirSync(path.join(tmp, d), { recursive: true })
    for (const s of ['helioz-exec.mjs', 'helioz-zeus.mjs', 'helioz-plan.mjs', 'helioz-gate.mjs']) writeFileSync(path.join(tmp, 'scripts', s), readFileSync(path.join(SCRIPTS, s)))
    const slotBlocks = allSlots().map(s => `echo "<!-- slot:${s.id} -->"; echo "**Вопрос:** Что по ${s.id}?"; echo "**Рекомендую:** разумный дефолт"; echo "**Ответ:**"`).join('; ')
    const stub = path.join(tmp, 'stub')
    writeFileSync(stub, `#!/bin/sh\ninput=$(cat)\ncase "$input" in\n  *"дознаватель"*) ${slotBlocks};;\n  *"КОНЕЧНУЮ ЦЕЛЬ"*) echo "# Конечная цель владельца"; echo "Готово, когда: команда проверки даёт ноль."; echo "Нельзя: трогать прод.";;\n  *) echo '${JSON.stringify(good).replace(/'/g, "'\\''")}';;\nesac\n`)
    chmodSync(stub, 0o755)
    writeFileSync(path.join(tmp, 'config', 'clis.json'), JSON.stringify({
      claude: { invoke_read: [stub], invoke_write: [stub], stdin_prompt: true, roles: ['execute', 'verify', 'advise', 'synthesize'] },
      codex: { invoke_read: [stub], invoke_write: [stub], stdin_prompt: true, roles: ['execute', 'verify', 'advise', 'synthesize'] },
    }))
    writeFileSync(path.join(tmp, 'config', 'helioz.json'), JSON.stringify({ probe_timeout_sec: 5, run_timeout_sec: 5 }))
    const self = path.join(tmp, 'scripts', 'helioz-plan.mjs')
    const run = args => spawnSync(process.execPath, [self, ...args], { env: { ...process.env, HELIOZ_HOME: tmp }, encoding: 'utf8' })

    eq(run(['grill']).status, 2, 'без идеи допрос невозможен')
    eq(run(['grill', '--idea', 'починить сборку']).status, 0)
    const briefText = readFileSync(path.join(tmp, 'queue', 'BRIEF.md'), 'utf8')
    eq(parseBrief(briefText).length, allSlots().length, 'в допросе все слоты онтологии')

    // цель по незакрытым критичным слотам - отказ, с их перечислением
    const g1 = run(['goal'])
    eq(g1.status, 2, 'незакрытые критичные слоты обязаны давать отказ')
    ok(g1.stderr.includes('goal.done'), 'отказ называет пустой слот')
    eq(run(['coverage']).status, 1, 'покрытие красное, пока критичные пусты')

    // владелец отвечает по одному: «да» = принять рекомендацию
    eq(run(['answer', '--slot', 'goal.done', '--text', 'да']).status, 0)
    ok(parseBrief(readFileSync(path.join(tmp, 'queue', 'BRIEF.md'), 'utf8')).find(i => i.id === 'goal.done').answer.includes('рекомендаци'), '«да» принимает рекомендацию')
    // ask-next сдвинулся на следующий незакрытый слот
    const st = JSON.parse(readFileSync(path.join(tmp, 'queue', 'GRILL-STATE.json'), 'utf8'))
    ok(st.current && st.current !== 'goal.done', 'следующий вопрос выбран')
    for (const id of allSlots().filter(s => s.critical).map(s => s.id)) run(['answer', '--slot', id, '--text', 'ответ владельца'])
    eq(run(['coverage']).status, 0, 'критичные закрыты - покрытие зелёное')

    eq(run(['goal']).status, 0)
    const goalText = readFileSync(path.join(tmp, 'queue', 'GOAL.md'), 'utf8')
    ok(goalText.includes('Конечная цель') && goalText.includes('Готово, когда'))

    eq(run(['plan']).status, 0)
    ok(existsSync(path.join(tmp, 'docs', 'MASTER-PLAN.md')), 'мастер-план на диске')
    const t1 = readFileSync(path.join(tmp, 'queue', 'tasks', 'T1.task.md'), 'utf8')
    ok(t1.includes('check_cmd:') && t1.includes('## Промт исполнителя') && t1.includes('## Промт проверяющего'))
    spawnSync('git', ['-C', tmp, 'init', '-q'])
    const gate = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'helioz-gate.mjs'), '--ready', '--json'], { env: { ...process.env, HELIOZ_HOME: tmp }, encoding: 'utf8' })
    const ready = JSON.parse(gate.stdout || '{}')
    eq((ready.invalid || []).length, 0, 'гейт принял все рождённые задачи')
    ok((ready.ready || []).some(r => r.task === 'T1'), 'T1 готова к запуску')
  } finally { rmSync(tmp, { recursive: true, force: true }) }

  console.log('selftest ok - онтология слотов, допрос по одному вопросу, «да»=рекомендация, отказ по критичным, цель, расхождение-схождение, ворота плана, задачи принимаются гейтом')
  return 0
}

async function main() {
  const { values: v, positionals } = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: { idea: { type: 'string' }, slot: { type: 'string' }, text: { type: 'string' }, json: { type: 'boolean' }, selftest: { type: 'boolean' } },
  })
  if (v.selftest) return cmdSelftest()
  const cmd = positionals[0]
  if (cmd === 'grill') return cmdGrill(v.idea)
  if (cmd === 'ask-next') return cmdAskNext()
  if (cmd === 'answer') return cmdAnswer(v.slot, v.text)
  if (cmd === 'coverage') return cmdCoverage(v.json)
  if (cmd === 'goal') return cmdGoal()
  if (cmd === 'plan') return cmdPlan()
  console.log('helioz-plan: grill --idea "…" · ask-next · answer --slot X --text "…" · coverage · goal · plan | --selftest')
  return 0
}
main().then(c => process.exit(c)).catch(e => { console.error(String(e && e.stack || e)); process.exit(1) })
