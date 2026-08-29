#!/usr/bin/env node
// КАНАЛ «ЗЕВС» (@ZeusKaifBot) - отбивки владельцу и решения владельца.
// Паттерн канала: durable-запись первой, Telegram - best-effort.
//   durable-запись в outbox ПЕРВОЙ, Telegram - best-effort; токен из домашнего каталога секретов, никогда в env
//   потомков/argv/логи; чужой chat id → ТИШИНА; callback ≤64 байт, матч по префиксу id; fail-closed.
//
//   send --text "…" [--quiet]        отбивка (в outbox → попытка доставки)
//   ask --dilemma <DID>              развилка владельцу: вопрос+варианты+рекомендация+кнопки
//   flush                            дослать недоставленное из outbox
//   poll [--timeout N]               забрать ответы: кнопки, «стоп»/«пуск», «DID N», /replay
//   --selftest                       стаб-HTTP, ни одного живого запроса
//
// Коды: 0 ok (даже если сеть легла - durable цел) · 2 fail-closed (нет секретов/развилки).
import { parseArgs } from 'node:util'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, renameSync } from 'node:fs'
import { spawnSync as spawnSyncLock } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.HELIOZ_HOME || path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CFG = (() => { try { return JSON.parse(readFileSync(path.join(HOME, 'config', 'helioz.json'), 'utf8')) } catch { return {} } })()
const STATE = path.join(HOME, '.helioz', 'state')
const OUTBOX = path.join(STATE, 'outbox')
const DILEMMAS = path.join(HOME, 'queue', 'dilemmas')
const API = process.env.HELIOZ_TG_API || 'https://api.telegram.org'
const defaultSecrets = path.join(os.homedir(), '.secrets', 'helioz-telegram.env')
const SECRETS = process.env.HELIOZ_TG_ENV || (CFG.secrets_env ? CFG.secrets_env.replace(/^~/, os.homedir()) : defaultSecrets)
const now = () => new Date().toISOString()

// --- секреты: читаются в момент вызова, не кэшируются в env, в вывод не попадают ------------------
function readTg() {
  if (!existsSync(SECRETS)) return null
  const kv = new Map()
  for (const raw of readFileSync(SECRETS, 'utf8').split('\n')) {
    const l = raw.trim()
    if (!l || l.startsWith('#')) continue
    const at = l.indexOf('=')
    if (at > 0) kv.set(l.slice(0, at).trim(), l.slice(at + 1).trim())
  }
  const token = kv.get('HELIOZ_TELEGRAM_TOKEN') || kv.get('OLYMPUZ_TELEGRAM_TOKEN')
  const chat = kv.get('HELIOZ_TELEGRAM_CHAT') || kv.get('OLYMPUZ_TELEGRAM_CHAT')
  return token && chat ? { token, chat } : null
}
const redact = (s, token) => (token ? String(s).split(token).join('<token>') : String(s))

// лок от гонок (ревью codex+kimi: параллельные flush → дубль в Telegram, параллельные poll → двойная
// обработка updates). mkdir атомарен; занято >5с → честный отказ, durable-состояние не трогается.
async function withLock(name, fn) {
  const dir = path.join(STATE, `.lock-${name}`)
  mkdirSync(STATE, { recursive: true })
  const deadline = Date.now() + 5000
  for (;;) {
    try { mkdirSync(dir); break } catch {
      if (Date.now() > deadline) { console.error(`лок ${name} занят >5с - второй экземпляр не начинает`); return 2 }
      spawnSyncLock('/bin/sleep', ['0.05'])
    }
  }
  try { return await fn() } finally { rmSync(dir, { recursive: true, force: true }) }
}

// timeoutMs шире, чем long-poll: getUpdates держит соединение timeout секунд, и обрыв на 15с
// съедал бы каждый ответ владельца, пришедший через сторожа (поймано живым прогоном launchd).
async function tg(method, body, tgc, timeoutMs = 15000) {
  const res = await fetch(`${API}/bot${tgc.token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const j = await res.json().catch(() => ({ ok: false, status: res.status }))
  return { http: res.status, ...j }
}

// --- тихие часы -----------------------------------------------------------------------------------
export function isQuietHours(d = new Date(), q = CFG.quiet_hours || { start: '23:00', end: '09:00' }) {
  const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const cur = d.getHours() * 60 + d.getMinutes(), a = mins(q.start), b = mins(q.end)
  return a <= b ? (cur >= a && cur < b) : (cur >= a || cur < b)
}

// --- outbox: durable первым -----------------------------------------------------------------------
function enqueue(msg) {
  mkdirSync(OUTBOX, { recursive: true })
  const f = path.join(OUTBOX, `${Date.now()}-${Math.floor(Math.random() * 1e6)}.json`)
  writeFileSync(f, JSON.stringify({ ...msg, created_at: now(), delivered_at: null, attempts: 0 }, null, 2) + '\n')
  return f
}
async function cmdFlush() { return withLock('outbox', cmdFlushLocked) }
async function cmdFlushLocked() {
  const tgc = readTg()
  let files = []
  try { files = readdirSync(OUTBOX).filter(f => f.endsWith('.json') && !f.endsWith('.corrupt.json')).sort() } catch { }
  let sent = 0, pending = 0
  for (const f of files) {
    const full = path.join(OUTBOX, f)
    let m
    try { m = JSON.parse(readFileSync(full, 'utf8')) } catch {
      // ревью codex: битый outbox-файл раньше молча выпадал из доставки навсегда - теперь виден
      renameSync(full, full.replace(/\.json$/, '.corrupt.json'))
      console.error(`flush: битый файл ${f} → помечен .corrupt.json, разберись руками`)
      continue
    }
    if (m.delivered_at) continue
    if (!tgc) { pending++; continue }
    const body = { chat_id: tgc.chat, text: m.text, disable_notification: Boolean(m.quiet) }
    if (m.buttons) body.reply_markup = { inline_keyboard: m.buttons }
    try {
      const r = await tg('sendMessage', body, tgc)
      if (r.ok) { m.delivered_at = now(); sent++ } else { m.attempts++; m.last_error = `HTTP ${r.http}`; pending++ }
    } catch (e) { m.attempts++; m.last_error = redact(e.message || e, tgc.token); pending++ }
    writeFileSync(full, JSON.stringify(m, null, 2) + '\n')
  }
  console.log(`flush: доставлено ${sent}, в очереди ${pending}`)
  return 0 // сеть легла - не провал: durable цел, доедет следующим flush
}

async function cmdSend(text, quiet) {
  if (!text || !text.trim()) { console.error('пустая отбивка запрещена - каждое сообщение несёт данные'); return 2 }
  enqueue({ text, quiet: quiet || isQuietHours() })
  return cmdFlush()
}

// --- развилка владельцу ---------------------------------------------------------------------------
function readDilemma(id) {
  const f = path.join(DILEMMAS, `${id}.json`)
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
}
function writeDilemma(d) { mkdirSync(DILEMMAS, { recursive: true }); writeFileSync(path.join(DILEMMAS, `${d.id}.json`), JSON.stringify(d, null, 2) + '\n') }

async function cmdAsk(id) {
  const d = readDilemma(id)
  if (!d) { console.error(`развилка ${id} не найдена`); return 2 }
  const lines = [`❓ Развилка ${d.id} [${d.kind}]${d.task ? ' · задача ' + d.task : ''}`, d.question, '']
  d.options.forEach((o, i) => lines.push(`${i + 1}. ${o}${i === d.recommend ? '  ← рекомендую' : ''}`))
  lines.push('', d.council ? 'Совет уже решил ночью - ответ переиграет его решение.' : 'Кнопкой или текстом: «' + d.id + ' номер». Конвейер не ждёт - работает дальше.')
  const idp = d.id.slice(0, 8)
  const buttons = [d.options.map((_, i) => ({ text: String(i + 1), callback_data: `d:${idp}:${i}` }))]
  enqueue({ text: lines.join('\n'), quiet: isQuietHours(), buttons })
  if (d.status === 'open') { d.status = 'asked'; d.asked_at = now(); writeDilemma(d) }
  return cmdFlush()
}

// --- poll: единственная дверь решений владельца ---------------------------------------------------
function applyAnswer(d, idx, via) {
  if (!Array.isArray(d.replay)) d.replay = [] // ревью kimi: развилка от внешнего писателя без replay - не повод падать
  const prev = d.answer
  if (d.status === 'answered' && d.answer === idx) return 'повтор - уже так решено'
  if (d.decided_by === 'council' || d.status === 'answered') {
    d.replay.push({ at: now(), from: prev ?? (d.council ? d.council.decision : null), to: idx, by: 'owner', via })
  }
  d.answer = idx; d.status = 'answered'; d.decided_by = 'owner'; d.answered_at = now()
  writeDilemma(d)
  return `принято: ${d.id} → вариант ${idx + 1} (${d.options[idx]})`
}
function matchDilemma(prefix) {
  let files = []
  try { files = readdirSync(DILEMMAS).filter(f => f.endsWith('.json')) } catch { }
  const hits = []
  for (const f of files) {
    // ревью kimi: один битый JSON в каталоге раньше убивал весь poll - включая канал «стоп»
    let d; try { d = JSON.parse(readFileSync(path.join(DILEMMAS, f), 'utf8')) } catch { console.error(`битая развилка ${f} - пропущена`); continue }
    if (d && d.id && d.id.startsWith(prefix) && ['asked', 'answered', 'council'].includes(d.status)) hits.push(d)
  }
  return hits.length === 1 ? hits[0] : (hits.length ? 'ambiguous' : null)
}

async function cmdPoll(timeoutSec) { return withLock('poll', () => cmdPollLocked(timeoutSec)) }
async function cmdPollLocked(timeoutSec) {
  const tgc = readTg()
  if (!tgc) { console.error('нет секретов Telegram - poll невозможен'); return 2 }
  const offFile = path.join(STATE, 'telegram-offset.json')
  let offset = 0
  try { offset = JSON.parse(readFileSync(offFile, 'utf8')).offset || 0 } catch { }
  let r
  try { r = await tg('getUpdates', { offset, timeout: timeoutSec || 0, allowed_updates: ['message', 'callback_query'] }, tgc, (timeoutSec || 0) * 1000 + 15000) } catch (e) {
    console.error('poll: сеть недоступна (' + redact(e.message || e, tgc.token) + ') - конвейер работает дальше')
    return 0
  }
  if (!r.ok || !Array.isArray(r.result)) { console.error(`poll: HTTP ${r.http}`); return 0 }
  const events = []
  for (const u of r.result) {
    offset = Math.max(offset, u.update_id + 1)
    // poison-update не смеет заблокировать канал (ревью kimi): ошибка одного update логируется,
    // offset всё равно продвигается - «стоп» доедет следующим сообщением
    try {
      await handleUpdate(u)
    } catch (e) { console.error(`update ${u.update_id}: ${redact(e.message || e, tgc.token)}`) }
    continue
  }
  async function handleUpdate(u) {
    // чужой отправитель → тишина (не подтверждать существование бота)
    const fromId = String(u.message?.from?.id ?? u.callback_query?.from?.id ?? '')
    if (fromId !== String(tgc.chat)) return
    if (u.callback_query) {
      const p = String(u.callback_query.data || '').split(':')
      let reply = 'Не понял кнопку.'
      if (p.length === 3 && p[0] === 'd' && /^\d+$/.test(p[2])) {
        const d = matchDilemma(p[1])
        if (d === 'ambiguous') reply = 'Совпало несколько развилок - ответь текстом: полный id + номер.'
        else if (!d) reply = 'Развилка не найдена или уже закрыта.'
        else if (Number(p[2]) >= d.options.length) reply = 'Нет такого варианта.'
        else { reply = applyAnswer(d, Number(p[2]), 'button'); events.push({ kind: 'answer', dilemma: d.id, answer: Number(p[2]) }) }
      }
      try { await tg('answerCallbackQuery', { callback_query_id: u.callback_query.id, text: reply.slice(0, 190) }, tgc) } catch { }
      enqueue({ text: reply, quiet: isQuietHours() })
      return
    }
    const text = (u.message?.text || '').trim()
    if (!text) return
    const lower = text.toLowerCase()
    if (lower === 'стоп' || lower === 'stop') {
      writeFileSync(path.join(STATE, 'STOP'), now())
      events.push({ kind: 'stop' })
      enqueue({ text: '🛑 СТОП принят. Всё замораживается; состояние в приборе, ничего не потеряно. Возобновить: «пуск».', quiet: false })
      return
    }
    if (lower === 'пуск' || lower === 'go') {
      rmSync(path.join(STATE, 'STOP'), { force: true })
      events.push({ kind: 'go' })
      enqueue({ text: '▶️ Пуск принят, конвейер продолжает по очереди.', quiet: isQuietHours() })
      return
    }
    const m = text.match(/^\/?(?:replay\s+)?([A-Za-zА-Яа-я0-9_-]+)\s+(\d+)$/)
    if (m && matchDilemma(m[1])) {
      const d = matchDilemma(m[1])
      const idx = Number(m[2]) - 1
      let reply = 'Развилка не найдена.'
      if (d !== 'ambiguous' && idx >= 0 && idx < d.options.length) { reply = applyAnswer(d, idx, 'text'); events.push({ kind: 'answer', dilemma: d.id, answer: idx }) }
      else if (d === 'ambiguous') reply = 'Несколько совпадений - уточни id.'
      enqueue({ text: reply, quiet: isQuietHours() })
      return
    }
    // Идёт допрос и вопрос открыт - свободный текст владельца это ОТВЕТ на него.
    // Так конвейер начинается прямо с телефона: владелец отвечает по одному, прибор пишет и спрашивает дальше.
    const gs = path.join(HOME, 'queue', 'GRILL-STATE.json')
    if (existsSync(gs)) {
      let cur = null
      try { cur = JSON.parse(readFileSync(gs, 'utf8')).current } catch { }
      if (cur) {
        const plan = path.join(path.dirname(fileURLToPath(import.meta.url)), 'helioz-plan.mjs')
        const r = spawnSyncLock(process.execPath, [plan, 'answer', '--slot', cur, '--text', text], { encoding: 'utf8', env: process.env })
        events.push({ kind: 'grill-answer', slot: cur, ok: r.status === 0 })
        if (r.status !== 0) enqueue({ text: 'Ответ не записался - загляни в queue/BRIEF.md.', quiet: isQuietHours() })
        return
      }
    }
    if (m) enqueue({ text: 'Развилка не найдена.', quiet: isQuietHours() })
  }
  writeFileSync(offFile, JSON.stringify({ offset }) + '\n')
  await cmdFlush()
  console.log(JSON.stringify({ ok: true, events }))
  return 0
}

// --- selftest: стаб-HTTP, живых запросов ноль -----------------------------------------------------
async function cmdSelftest() {
  const { strictEqual: eq, ok } = await import('node:assert')
  const { createServer } = await import('node:http')
  const { mkdtempSync } = await import('node:fs')
  const { spawn } = await import('node:child_process')
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'helioz-zeus-'))
  try {
    mkdirSync(path.join(tmp, 'queue', 'dilemmas'), { recursive: true })
    mkdirSync(path.join(tmp, '.helioz', 'state'), { recursive: true })
    writeFileSync(path.join(tmp, 'tg.env'), 'HELIOZ_TELEGRAM_TOKEN=TESTTOKEN123\nHELIOZ_TELEGRAM_CHAT=42\n')

    // стаб-сервер Telegram
    const calls = []
    let updates = []
    const srv = createServer((req, res) => {
      let body = ''
      req.on('data', c => body += c)
      req.on('end', () => {
        const method = req.url.split('/').pop()
        calls.push({ method, body: JSON.parse(body || '{}') })
        res.setHeader('content-type', 'application/json')
        if (method === 'getUpdates') res.end(JSON.stringify({ ok: true, result: updates }))
        else res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }))
      })
    })
    await new Promise(r => srv.listen(0, '127.0.0.1', r))
    const port = srv.address().port
    const self = fileURLToPath(import.meta.url)
    const env = (api) => ({ ...process.env, HELIOZ_HOME: tmp, HELIOZ_TG_ENV: path.join(tmp, 'tg.env'), HELIOZ_TG_API: api })
    // spawn (не spawnSync): сервер-стаб живёт в этом же процессе, блокировать event loop нельзя
    const run = (args, api = `http://127.0.0.1:${port}`) => new Promise(resolve => {
      const p = spawn(process.execPath, [self, ...args], { env: env(api) })
      let stdout = '', stderr = ''
      p.stdout.on('data', c => stdout += c); p.stderr.on('data', c => stderr += c)
      p.on('close', status => resolve({ status, stdout, stderr }))
    })

    // 1. Пустая отбивка запрещена.
    eq((await run(['send', '--text', '  '])).status, 2)

    // 2. send доставляется; текст дошёл до стаба; токен не светится в выводе.
    const r1 = await run(['send', '--text', 'проба связи'])
    eq(r1.status, 0)
    ok(calls.some(c => c.method.startsWith('sendMessage') && c.body.text === 'проба связи'), 'стаб получил sendMessage')
    ok(!r1.stdout.includes('TESTTOKEN123') && !r1.stderr.includes('TESTTOKEN123'), 'токен не печатается')

    // 3. Telegram мёртв → отбивка КОПИТСЯ (exit 0, конвейер не падает), затем flush дошлёт.
    const r2 = await run(['send', '--text', 'офлайн-отбивка'], 'http://127.0.0.1:1')
    eq(r2.status, 0, 'мёртвый Telegram не роняет конвейер')
    const box = () => readdirSync(path.join(tmp, '.helioz', 'state', 'outbox')).map(f => JSON.parse(readFileSync(path.join(tmp, '.helioz', 'state', 'outbox', f), 'utf8')))
    ok(box().some(m => m.text === 'офлайн-отбивка' && !m.delivered_at), 'недоставленное лежит в outbox')
    eq((await run(['flush'])).status, 0)
    ok(box().every(m => m.delivered_at), 'flush дослал всё')

    // 4. ask: развилка → кнопки, статус asked.
    const dil = { id: 'D001', task: 'T1', kind: 'default', question: 'Куда?', options: ['влево', 'вправо'], recommend: 1, status: 'open', asked_at: null, answered_at: null, answer: null, decided_by: null, council: null, replay: [] }
    writeFileSync(path.join(tmp, 'queue', 'dilemmas', 'D001.json'), JSON.stringify(dil))
    eq((await run(['ask', '--dilemma', 'D001'])).status, 0)
    const d1 = JSON.parse(readFileSync(path.join(tmp, 'queue', 'dilemmas', 'D001.json'), 'utf8'))
    eq(d1.status, 'asked')
    const askCall = calls.find(c => c.body.reply_markup)
    ok(askCall && askCall.body.reply_markup.inline_keyboard[0].length === 2, 'кнопки на месте')
    ok(askCall.body.reply_markup.inline_keyboard[0].every(b => Buffer.byteLength(b.callback_data) <= 64), 'callback ≤64 байт')

    // 5. poll: чужой chat id → тишина; свой → ответ применяется.
    updates = [
      { update_id: 1, callback_query: { id: 'x1', from: { id: 999 }, data: 'd:D001:0' } },              // чужак
      { update_id: 2, callback_query: { id: 'x2', from: { id: 42 }, data: 'd:D001:0' } },               // владелец
    ]
    const rp = await run(['poll'])
    eq(rp.status, 0)
    const d2 = JSON.parse(readFileSync(path.join(tmp, 'queue', 'dilemmas', 'D001.json'), 'utf8'))
    eq(d2.status, 'answered'); eq(d2.answer, 0); eq(d2.decided_by, 'owner')
    ok(!calls.some(c => c.method === 'answerCallbackQuery' && c.body.callback_query_id === 'x1'), 'чужаку - тишина')

    // 6. «переиграть»: развилку решил совет → владелец отвечает → replay записан.
    const dc = { ...dil, id: 'D002', status: 'council', decided_by: 'council', answer: 1, council: { decision: 1, at: now() } }
    writeFileSync(path.join(tmp, 'queue', 'dilemmas', 'D002.json'), JSON.stringify(dc))
    updates = [{ update_id: 3, message: { from: { id: 42 }, text: 'D002 1' } }]
    eq((await run(['poll'])).status, 0)
    const d3 = JSON.parse(readFileSync(path.join(tmp, 'queue', 'dilemmas', 'D002.json'), 'utf8'))
    eq(d3.decided_by, 'owner'); eq(d3.answer, 0); eq(d3.replay.length, 1, 'переигрыш зафиксирован')

    // 7. «стоп» из Telegram → STOP на диске; «пуск» → снят.
    updates = [{ update_id: 4, message: { from: { id: 42 }, text: 'стоп' } }]
    eq((await run(['poll'])).status, 0)
    ok(existsSync(path.join(tmp, '.helioz', 'state', 'STOP')), 'STOP поставлен')
    updates = [{ update_id: 5, message: { from: { id: 42 }, text: 'пуск' } }]
    eq((await run(['poll'])).status, 0)
    ok(!existsSync(path.join(tmp, '.helioz', 'state', 'STOP')), 'STOP снят')

    // 8. Тихие часы: пересечение полуночи.
    ok(isQuietHours(new Date('2026-01-01T23:30:00'), { start: '23:00', end: '09:00' }))
    ok(isQuietHours(new Date('2026-01-01T03:00:00'), { start: '23:00', end: '09:00' }))
    ok(!isQuietHours(new Date('2026-01-01T12:00:00'), { start: '23:00', end: '09:00' }))

    srv.close()
    console.log('selftest ok - durable outbox, мёртвый Telegram не роняет, кнопки/переиграть/стоп, чужим тишина, токен не течёт')
    return 0
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

// --- диспетчер ------------------------------------------------------------------------------------
async function main() {
  const { values: v, positionals } = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: {
      text: { type: 'string' }, quiet: { type: 'boolean' }, dilemma: { type: 'string' },
      timeout: { type: 'string' }, selftest: { type: 'boolean' },
    },
  })
  mkdirSync(STATE, { recursive: true })
  if (v.selftest) return cmdSelftest()
  const cmd = positionals[0]
  if (cmd === 'send') return cmdSend(v.text, v.quiet)
  if (cmd === 'ask') return cmdAsk(v.dilemma)
  if (cmd === 'flush') return cmdFlush()
  if (cmd === 'poll') return cmdPoll(Number(v.timeout) || 0)
  console.log('helioz-zeus: send --text|ask --dilemma|flush|poll [--timeout N] | --selftest')
  return 0
}
main().then(c => process.exit(c)).catch(e => { console.error(String(e && e.message || e)); process.exit(1) })
