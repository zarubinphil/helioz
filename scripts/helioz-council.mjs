#!/usr/bin/env node
// СОВЕТ ПО МЕТОДУ КАРПАТЫ - ночные развилки решает не один голос, а независимые линзы + синтез.
// Метод (файл «Метод расхождения-схождения», 23.08.2026): изоляция до сведения (советники не видят
// друг друга), гетерогенность (разные CLI сильнее клонов), синтез отдельным движком, решение в ledger.
//
// ЖЕСТКИЙ ЗАПРЕТ (контракт F): развилки kind ∈ {prod, foreign, expensive} совет решать НЕ ВПРАВЕ -
// exit 2, развилка ждет владельца в очереди, конвейер работает над остальным.
//
//   decide --dilemma <DID> [--day]     собрать совет и решить (по умолчанию только в тихие часы)
//   --selftest                         стаб-советники, ни одного живого вызова
//
// Коды: 0 решено · 1 совет не собрался (мало голосов) · 2 запретный kind / не ночь / нет развилки.
import { parseArgs } from 'node:util'
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, appendFileSync, chmodSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.HELIOZ_HOME || path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CFG = (() => { try { return JSON.parse(readFileSync(path.join(HOME, 'config', 'helioz.json'), 'utf8')) } catch { return {} } })()
const STATE = path.join(HOME, '.helioz', 'state')
const DILEMMAS = path.join(HOME, 'queue', 'dilemmas')
const EXEC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'helioz-exec.mjs')
const now = () => new Date().toISOString()
const FORBIDDEN = ['prod', 'foreign', 'expensive']

function isQuiet(d = new Date()) {
  const q = CFG.quiet_hours || { start: '23:00', end: '09:00' }
  const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const cur = d.getHours() * 60 + d.getMinutes(), a = mins(q.start), b = mins(q.end)
  return a <= b ? (cur >= a && cur < b) : (cur >= a || cur < b)
}

function exec(args) { return spawnSync(process.execPath, [EXEC, ...args], { encoding: 'utf8', env: process.env }) }

/** Конечная цель владельца - север совета. Ставится владельцем при постановке задачи:
 *  queue/GOAL.md (цель миссии) и/или поле goal: в задаче. Без цели совет решать НЕ ВПРАВЕ. */
function ownerGoal(d) {
  const parts = []
  const gf = path.join(HOME, 'queue', 'GOAL.md')
  if (existsSync(gf)) { const t = readFileSync(gf, 'utf8').trim(); if (t) parts.push(t) }
  if (d.task) {
    const tf = path.join(HOME, 'queue', 'tasks', `${d.task}.task.md`)
    if (existsSync(tf)) {
      const m = readFileSync(tf, 'utf8').match(/^goal:\s*(.+)$/m)
      if (m) parts.push(`Цель задачи ${d.task}: ` + m[1].trim().replace(/^["']|["']$/g, ''))
    }
  }
  return parts.join('\n\n')
}

function advisorPrompt(d, lens, goal) {
  return [
    `Ты - советник ночного совета конвейера. Твоя ЕДИНСТВЕННАЯ линза: «${lens}».`,
    'Другие советники существуют, но их позиций ты не видишь - отвечай независимо.',
    '',
    'КОНЕЧНАЯ ЦЕЛЬ ВЛАДЕЛЬЦА (север, установлена им при постановке задачи):',
    goal,
    'Твое решение обязано служить этой цели. Вариант, противоречащий цели, не выбирай,',
    'даже если он лучше по твоей линзе - линза подчинена цели.',
    '',
    `РАЗВИЛКА: ${d.question}`,
    ...d.options.map((o, i) => `Вариант ${i + 1}: ${o}`),
    d.task ? `Контекст: задача ${d.task} конвейера (дом: ${HOME}).` : '',
    '',
    'Ответь строго в формате:',
    'ВЫБОР: <номер варианта, либо 0 если НИ ОДИН вариант не служит цели владельца>',
    'ПОЧЕМУ: 2–4 предложения только через твою линзу.',
    'РИСК ОШИБКИ: одно предложение - что будет, если твой выбор неверен.',
  ].filter(Boolean).join('\n')
}

function parseChoice(text, nOptions) {
  const m = String(text).match(/ВЫБОР:\s*(\d+)/i)
  if (!m) return null
  if (Number(m[1]) === 0) return 'none' // советник считает: ни один вариант не служит цели
  const idx = Number(m[1]) - 1
  return idx >= 0 && idx < nOptions ? idx : null
}

async function cmdDecide(id, day) {
  const df = path.join(DILEMMAS, `${id}.json`)
  if (!existsSync(df)) { console.error(`развилка ${id} не найдена`); return 2 }
  const d = JSON.parse(readFileSync(df, 'utf8'))

  // Запретные случаи - совет НЕ решает, ни ночью, ни с флагами. Ждут владельца.
  if (FORBIDDEN.includes(d.kind)) {
    console.error(`ОТКАЗ: развилка ${id} kind=${d.kind} - из трех случаев владельца, совет решать не вправе`)
    return 2
  }
  if (d.status === 'answered') { console.error(`${id} уже решена (${d.decided_by})`); return 2 }
  if (!day && !isQuiet()) { console.error('днем default-развилки решает оркестратор дефолтом; совет - ночной механизм (или --day)'); return 2 }

  // Без конечной цели владельца совету не с чем сверять - решать НЕ ВПРАВЕ (fail-closed).
  const goal = ownerGoal(d)
  if (!goal) { console.error(`ОТКАЗ: нет конечной цели владельца (queue/GOAL.md или goal: в задаче) - развилка ${id} ждет владельца`); return 2 }

  const lenses = (CFG.council && CFG.council.lenses) || ['риск', 'цена отката', 'соответствие контракту владельца', 'простота']
  const minAdv = (CFG.council && CFG.council.min_advisors) || 3
  const dir = path.join(STATE, 'council', id)
  mkdirSync(dir, { recursive: true })

  // Советники: линза × живой CLI (гетерогенность по возможности), изоляция - каждый пишет в свой файл.
  const positions = []
  const usedCli = []
  for (let i = 0; i < lenses.length; i++) {
    const lens = lenses[i]
    // ротация ради разнообразия: пробуем не повторять последний использованный CLI
    const pick = exec(['pick', '--role', 'advise', ...(usedCli.length ? ['--prefer', ['claude', 'codex', 'kimi'].find(c => c !== usedCli[usedCli.length - 1]) || ''] : [])])
    if (pick.status !== 0) continue
    const cli = pick.stdout.trim().split('\n').pop()
    const pf = path.join(dir, `prompt-${i}.txt`)
    writeFileSync(pf, advisorPrompt(d, lens, goal))
    const lf = path.join(dir, `advisor-${i}-${lens.replace(/[^\wа-яА-Я-]+/g, '_')}-${cli}.md`)
    const r = exec(['run', '--cli', cli, '--prompt-file', pf, '--log', lf, '--timeout', String(CFG.probe_timeout_sec ? CFG.probe_timeout_sec * 4 : 360)])
    const text = existsSync(lf) ? readFileSync(lf, 'utf8') : ''
    const choice = r.status === 0 ? parseChoice(text, d.options.length) : null
    if (choice !== null) { positions.push({ lens, cli, choice, file: path.relative(HOME, lf) }); usedCli.push(cli) }
  }
  if (positions.length < minAdv) {
    console.error(`совет не собрался: позиций ${positions.length} < ${minAdv} - развилка остается владельцу`)
    return 1
  }
  // Большинство советников считает, что НИ ОДИН вариант не служит цели → совет воздерживается,
  // развилка уходит владельцу: совет не вправе выбирать против конечной цели.
  const noneVotes = positions.filter(p => p.choice === 'none').length
  if (noneVotes * 2 >= positions.length) {
    appendFileSync(path.join(STATE, 'ledger.jsonl'), JSON.stringify({ ts: now(), kind: 'council-abstain', dilemma: id, why: `ни один вариант не служит цели владельца (${noneVotes}/${positions.length} голосов)` }) + '\n')
    const zeusA = path.join(path.dirname(EXEC), 'helioz-zeus.mjs')
    spawnSync(process.execPath, [zeusA, 'send', '--text', `🌙 Совет ВОЗДЕРЖАЛСЯ по развилке ${id}: большинство линз считает, что ни один вариант не служит твоей цели. Развилка ждет тебя: «${id} <номер>».`, '--quiet'], { encoding: 'utf8', env: process.env })
    console.error(`совет воздержался: ни один вариант не служит цели (${noneVotes}/${positions.length})`)
    return 1
  }

  // Синтез: отдельный вызов, видит анонимизированные позиции (без имен CLI - слепое судейство).
  const anon = positions.map((p, i) => `Советник ${String.fromCharCode(65 + i)} (линза «${p.lens}»):\n${readFileSync(path.join(HOME, p.file), 'utf8').split('--- stderr ---')[0].trim()}`)
  const synthPrompt = [
    'Ты - синтез ночного совета. Ниже независимые позиции советников (имена скрыты).',
    'Прими ОДНО решение. Разногласия не сглаживай - назови их прямо.',
    '',
    'КОНЕЧНАЯ ЦЕЛЬ ВЛАДЕЛЬЦА (север): решение обязано служить ей.',
    goal, '',
    `РАЗВИЛКА: ${d.question}`, ...d.options.map((o, i) => `Вариант ${i + 1}: ${o}`), '',
    ...anon, '',
    'Ответь строго в формате:',
    'РЕШЕНИЕ: <номер варианта, либо 0 если ни один не служит цели владельца>',
    'ОБОСНОВАНИЕ: 3–5 предложений, первым - как решение служит цели.',
    'РАЗНОГЛАСИЯ: были/не было и какие.',
  ].join('\n')
  const spf = path.join(dir, 'synthesis-prompt.txt')
  writeFileSync(spf, synthPrompt)
  // синтез - движком, не совпадающим с большинством советников, если возможно
  const counts = usedCli.reduce((a, c) => (a[c] = (a[c] || 0) + 1, a), {})
  const majority = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]
  const spick = exec(['pick', '--role', 'synthesize', '--exclude', majority || ''])
  const scli = spick.status === 0 ? spick.stdout.trim().split('\n').pop() : (usedCli[0] || null)
  if (!scli) { console.error('нет CLI для синтеза'); return 1 }
  const slf = path.join(dir, `synthesis-${scli}.md`)
  const sr = exec(['run', '--cli', scli, '--prompt-file', spf, '--log', slf, '--timeout', '360'])
  const stext = existsSync(slf) ? readFileSync(slf, 'utf8') : ''
  const decision = sr.status === 0 ? parseChoice(stext.replace(/РЕШЕНИЕ/i, 'ВЫБОР'), d.options.length) : null
  if (decision === 'none') {
    appendFileSync(path.join(STATE, 'ledger.jsonl'), JSON.stringify({ ts: now(), kind: 'council-abstain', dilemma: id, why: 'синтез: ни один вариант не служит цели владельца' }) + '\n')
    const zeusB = path.join(path.dirname(EXEC), 'helioz-zeus.mjs')
    spawnSync(process.execPath, [zeusB, 'send', '--text', `🌙 Совет ВОЗДЕРЖАЛСЯ по развилке ${id}: синтез счел, что ни один вариант не служит твоей цели. Ждет тебя: «${id} <номер>».`, '--quiet'], { encoding: 'utf8', env: process.env })
    console.error('синтез: ни один вариант не служит цели - воздержание')
    return 1
  }
  const numeric = positions.filter(p => p.choice !== 'none')
  const finalChoice = decision !== null ? decision
    : numeric.map(p => p.choice).sort((a, b) => numeric.filter(p => p.choice === b).length - numeric.filter(p => p.choice === a).length)[0] // фолбэк: большинство голосов
  const rationale = (stext.match(/ОБОСНОВАНИЕ:\s*([\s\S]*?)(?:РАЗНОГЛАСИЯ:|$)/i) || [])[1]?.trim() || 'синтез без текста - решение большинством позиций'

  // Запись: развилка + ledger (обоснование) + отбивка (тихая ночью, с механизмом «переиграть»).
  d.answer = finalChoice; d.status = 'answered'; d.decided_by = 'council'; d.answered_at = now()
  d.council = { decision: finalChoice, at: now(), synthesis: path.relative(HOME, slf), synthesis_cli: scli, lenses: positions }
  writeFileSync(df, JSON.stringify(d, null, 2) + '\n')
  mkdirSync(STATE, { recursive: true })
  appendFileSync(path.join(STATE, 'ledger.jsonl'), JSON.stringify({
    ts: now(), kind: 'council', dilemma: id, decision: finalChoice,
    lenses: positions.map(p => ({ lens: p.lens, cli: p.cli, choice: p.choice, position_file: p.file })),
    synthesis_cli: scli, rationale,
  }) + '\n')
  const zeus = path.join(path.dirname(EXEC), 'helioz-zeus.mjs')
  spawnSync(process.execPath, [zeus, 'send', '--text',
    `🌙 Совет решил развилку ${id}: вариант ${finalChoice + 1} (${d.options[finalChoice]}).\n${rationale.slice(0, 500)}\nПереиграть: ответь «${id} <номер>».`,
    '--quiet'], { encoding: 'utf8', env: process.env })
  console.log(JSON.stringify({ ok: true, dilemma: id, decision: finalChoice, advisors: positions.length, synthesis_cli: scli }))
  return 0
}

// --- selftest: стаб-советники ---------------------------------------------------------------------
async function cmdSelftest() {
  const { strictEqual: eq, ok } = await import('node:assert')
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'helioz-council-'))
  try {
    const bin = path.join(tmp, 'bin'); mkdirSync(bin, { recursive: true })
    // стаб: читает промт со stdin, голосует за вариант 2; синтез отвечает РЕШЕНИЕ: 2
    const adv = path.join(bin, 'adv')
    writeFileSync(adv, '#!/bin/sh\ninput=$(cat)\ncase "$input" in *"синтез ночного совета"*) echo "РЕШЕНИЕ: 2"; echo "ОБОСНОВАНИЕ: так надежнее по всем линзам."; echo "РАЗНОГЛАСИЯ: не было.";; *) echo "ВЫБОР: 2"; echo "ПОЧЕМУ: линза велит."; echo "РИСК ОШИБКИ: небольшой.";; esac\n')
    chmodSync(adv, 0o755)
    for (const sub of ['config', 'queue/dilemmas', 'scripts']) mkdirSync(path.join(tmp, sub), { recursive: true })
    writeFileSync(path.join(tmp, 'config', 'helioz.json'), JSON.stringify({
      quiet_hours: { start: '00:00', end: '23:59' }, // «всегда ночь» для теста
      council: { lenses: ['риск', 'цена отката', 'простота'], min_advisors: 3, synthesis_order: ['claude'] },
      probe_timeout_sec: 5, run_timeout_sec: 5,
    }))
    writeFileSync(path.join(tmp, 'config', 'clis.json'), JSON.stringify({
      claude: { invoke_read: [adv], invoke_write: [adv], stdin_prompt: true, roles: ['execute', 'verify', 'advise', 'synthesize'] },
      codex: { invoke_read: [adv], invoke_write: [adv], stdin_prompt: true, roles: ['execute', 'verify', 'advise', 'synthesize'] },
    }))
    const mkDil = (id, kind) => writeFileSync(path.join(tmp, 'queue', 'dilemmas', `${id}.json`), JSON.stringify({
      id, task: 'T1', kind, question: 'Куда идти?', options: ['влево', 'вправо'], recommend: 0,
      status: 'asked', asked_at: now(), answered_at: null, answer: null, decided_by: null, council: null, replay: [],
    }))
    const self = fileURLToPath(import.meta.url)
    const run = (args) => spawnSync(process.execPath, [self, ...args], { env: { ...process.env, HELIOZ_HOME: tmp }, encoding: 'utf8' })

    // 0а. Без конечной цели владельца совет решать НЕ ВПРАВЕ (exit 2).
    mkDil('DNoGoal', 'default')
    const rng = run(['decide', '--dilemma', 'DNoGoal', '--day'])
    eq(rng.status, 2, 'нет цели - совет обязан отказаться')
    ok(rng.stderr.includes('цели'), 'причина названа')
    // цель миссии ставит владелец при постановке задачи
    writeFileSync(path.join(tmp, 'queue', 'GOAL.md'), 'Конечная цель: конвейер работает 24/7 без потерь.')

    // 1. ЗАПРЕТНЫЕ: prod / foreign / expensive → совет ОБЯЗАН отказаться (exit 2), развилка не решена.
    for (const kind of ['prod', 'foreign', 'expensive']) {
      mkDil('DF-' + kind, kind)
      const r = run(['decide', '--dilemma', 'DF-' + kind, '--day'])
      eq(r.status, 2, `kind=${kind}: совет обязан отложить`)
      const d = JSON.parse(readFileSync(path.join(tmp, 'queue', 'dilemmas', `DF-${kind}.json`), 'utf8'))
      eq(d.status, 'asked', 'запретная развилка осталась ждать владельца')
      eq(d.decided_by, null)
    }

    // 2. default → решается: позиции 3 линз, синтез, ledger, развилка answered by council.
    mkDil('DOK', 'default')
    const r2 = run(['decide', '--dilemma', 'DOK'])
    eq(r2.status, 0, 'default ночью решается: ' + r2.stderr)
    const d2 = JSON.parse(readFileSync(path.join(tmp, 'queue', 'dilemmas', 'DOK.json'), 'utf8'))
    eq(d2.decided_by, 'council'); eq(d2.answer, 1, 'советники выбрали вариант 2 → индекс 1')
    eq(d2.council.lenses.length, 3)
    const led = readFileSync(path.join(tmp, '.helioz', 'state', 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    const ce = led.find(l => l.kind === 'council' && l.dilemma === 'DOK')
    ok(ce && ce.rationale && ce.lenses.length === 3, 'ledger несет решение с обоснованием и позициями')
    // позиции советников лежат файлами (изоляция: каждый писал в свой)
    const cdir = readdirSync(path.join(tmp, '.helioz', 'state', 'council', 'DOK'))
    ok(cdir.filter(f => f.startsWith('advisor-')).length === 3, 'три файла позиций')
    // отбивка легла в outbox (Telegram-стаба нет - недоставленная, но durable)
    const obox = readdirSync(path.join(tmp, '.helioz', 'state', 'outbox'))
    ok(obox.length >= 1, 'отбивка о решении в outbox')

    // 3. Мало голосов (лимит 3, живой CLI один и его роль advise убрана) → совет не собрался, exit 1.
    writeFileSync(path.join(tmp, 'config', 'clis.json'), JSON.stringify({
      claude: { invoke_read: [adv], invoke_write: [adv], stdin_prompt: true, roles: ['synthesize'] },
    }))
    rmSync(path.join(tmp, '.helioz', 'state', 'cli-health.json'), { force: true })
    mkDil('DThin', 'default')
    eq(run(['decide', '--dilemma', 'DThin']).status, 1, 'нет советников → совет не решает')

    // 4. Уже решенная → 2.
    eq(run(['decide', '--dilemma', 'DOK']).status, 2)

    // 5. Цель в промте каждого советника; советники голосуют «0 = ни один не служит цели» → воздержание.
    const p0 = readFileSync(path.join(tmp, '.helioz', 'state', 'council', 'DOK', 'prompt-0.txt'), 'utf8')
    ok(p0.includes('КОНЕЧНАЯ ЦЕЛЬ ВЛАДЕЛЬЦА') && p0.includes('24/7 без потерь'), 'цель владельца в промте советника')
    const advNone = path.join(bin, 'advnone')
    writeFileSync(advNone, '#!/bin/sh\ncat >/dev/null\necho "ВЫБОР: 0"; echo "ПОЧЕМУ: ни один вариант не служит цели."; echo "РИСК ОШИБКИ: нет."\n')
    chmodSync(advNone, 0o755)
    writeFileSync(path.join(tmp, 'config', 'clis.json'), JSON.stringify({
      claude: { invoke_read: [advNone], invoke_write: [advNone], stdin_prompt: true, roles: ['execute', 'verify', 'advise', 'synthesize'] },
      codex: { invoke_read: [advNone], invoke_write: [advNone], stdin_prompt: true, roles: ['execute', 'verify', 'advise', 'synthesize'] },
    }))
    rmSync(path.join(tmp, '.helioz', 'state', 'cli-health.json'), { force: true })
    mkDil('DNone', 'default')
    const rn = run(['decide', '--dilemma', 'DNone'])
    eq(rn.status, 1, 'все за 0 → совет воздержался')
    const dn = JSON.parse(readFileSync(path.join(tmp, 'queue', 'dilemmas', 'DNone.json'), 'utf8'))
    eq(dn.status, 'asked', 'развилка осталась владельцу')
    const led2 = readFileSync(path.join(tmp, '.helioz', 'state', 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    ok(led2.some(l => l.kind === 'council-abstain' && l.dilemma === 'DNone'), 'воздержание записано в ledger')

    console.log('selftest ok - без цели не решает, запретные отложены, default решен по цели, воздержание при «ни один», тонкий совет не решает')
    return 0
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

async function main() {
  const { values: v, positionals } = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: { dilemma: { type: 'string' }, day: { type: 'boolean' }, selftest: { type: 'boolean' } },
  })
  if (v.selftest) return cmdSelftest()
  if (positionals[0] === 'decide') return cmdDecide(v.dilemma, v.day)
  console.log('helioz-council: decide --dilemma <DID> [--day] | --selftest')
  return 0
}
main().then(c => process.exit(c)).catch(e => { console.error(String(e && e.message || e)); process.exit(1) })
