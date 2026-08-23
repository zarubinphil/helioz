#!/usr/bin/env node
// ПРИБОР КОНВЕЙЕРА — состояние на диске, маркер пишет код, подделка детектится.
// Наследник mnemazine-rebuild-gate.mjs (проверен боем 22–24.08.2026). Контракты: docs/CONTRACTS.md.
//
//   --ready            готовые задачи (deps done + пути не пересекаются + слот CLI свободен). Пусто → exit 2.
//   --start <id>       занять слот; пересечение путей с бегущей задачей → exit 5, НЕ стартует.
//   --finish <id>      освободить слот.
//   --task <id> --check-cmd "…" [--executor cli --verifier cli --base ref]
//                      прогнать приёмку; exit 0 → маркер целостности. Иначе маркер не пишется.
//   --require <id,..>  все маркеры done? tampered/missing → exit 2.
//   --status --json    доска.
//   --beat [note]      heartbeat оркестратора.
//   --stop / --go      флаг STOP (ставится и по «стоп» из Telegram). При STOP: ready/start → exit 4.
//   --budget           факт расхода по jsonl трёх CLI против budget.json. Нет файла → exit 2; перебор → exit 3.
//   --adopt <dir>      идемпотентный приём чужого ledger.jsonl и dilemmas/*.json (Мозг 2.0 пересядет сюда).
//   --selftest         детерминированные пробы прибора в изолированном состоянии.
//
// Коды: 0 ok · 1 красный · 2 fail-closed (пусто/недостаточно) · 3 бюджет · 4 STOP · 5 пересечение путей.
import { parseArgs } from 'node:util'
import { promises as fsp, existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, statSync, appendFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.CONVEYOR_HOME || path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CFG = readJson(path.join(HOME, 'config', 'conveyor.json')) || {}
const S = {
  state: path.join(HOME, '.conveyor', 'state'),
  tasks: path.join(HOME, 'queue', 'tasks'),
  dilemmas: path.join(HOME, 'queue', 'dilemmas'),
}
const MARKERS = () => path.join(S.state, 'markers')

// --- утилиты --------------------------------------------------------------------------------------
const sha256 = s => createHash('sha256').update(s).digest('hex')
function readJson(f) { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null } }
function writeJson(f, o) { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(o, null, 2) + '\n') }
function git(args, cwd = HOME) { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\n$/, '') }
function gitSafe(args, cwd) { try { return git(args, cwd) } catch { return null } }
const now = () => new Date().toISOString()

// --- разбор задачи (frontmatter-подмножество: скаляры, [a,b], список «- x») -----------------------
export function parseTask(text, file = '') {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const t = { file, paths: [], requires: [] }
  const lines = m[1].split('\n')
  let listKey = null
  const unq = v => v.replace(/^["']|["']$/g, '')
  for (const ln of lines) {
    const li = ln.match(/^\s+-\s+(.*)$/)
    if (li && listKey) { t[listKey].push(unq(li[1].trim())); continue }
    const kv = ln.match(/^([a-z_]+):\s*(.*)$/)
    if (!kv) continue
    const [, k, raw] = kv
    listKey = null
    const v = raw.trim()
    if (v === '' || v === '[]') { if (k === 'paths' || k === 'requires') { t[k] = []; listKey = k } else t[k] = '' ; continue }
    if (v.startsWith('[')) { t[k] = v.slice(1, -1).split(',').map(s => unq(s.trim())).filter(Boolean); continue }
    t[k] = unq(v)
  }
  // тело: промты ролей
  const body = text.slice(m[0].length)
  const sec = name => { const mm = body.match(new RegExp(`##\\s*${name}\\n([\\s\\S]*?)(?=\\n##\\s|$)`)); return mm ? mm[1].trim() : '' }
  t.executor_prompt = sec('Промт исполнителя')
  t.verifier_prompt = sec('Промт проверяющего')
  t.valid = Boolean(t.id && t.check_cmd)
  return t
}

async function loadTasks() {
  const out = new Map()
  let dir = []
  try { dir = readdirSync(S.tasks) } catch { return out }
  for (const f of dir.filter(x => x.endsWith('.task.md')).sort()) {
    const t = parseTask(readFileSync(path.join(S.tasks, f), 'utf8'), f)
    if (t && t.id) out.set(t.id, t)
  }
  return out
}

// --- маркеры целостности (порт rebuild-gate: подделка/обрезание = tampered) -----------------------
const markerFile = id => path.join(MARKERS(), `${id}.done.json`)
function changedFilesSha(base, head, cwd = HOME) {
  const names = (gitSafe(['diff', '--name-only', `${base}..${head}`], cwd) || '').split('\n').filter(Boolean)
  let buf = names.join('\n')
  for (const n of names) buf += '\0' + n + '\0' + (gitSafe(['show', `${head}:${n}`], cwd) ?? '')
  return sha256(buf)
}
export function readMarker(id) {
  const f = markerFile(id)
  if (!existsSync(f)) return { status: 'missing' }
  let d
  try { d = JSON.parse(readFileSync(f, 'utf8')) } catch { return { status: 'tampered', reason: 'нечитаемый json' } }
  if (d.written_by !== 'conveyor-gate') return { status: 'tampered', reason: 'нет written_by:"conveyor-gate"', data: d }
  for (const k of ['task', 'base', 'head', 'sha_of_changed_files', 'exit_code', 'finished_at']) {
    if (d[k] === undefined || d[k] === null || d[k] === '') return { status: 'tampered', reason: `нет поля целостности ${k}`, data: d }
  }
  if (!gitSafe(['rev-parse', '--verify', d.head + '^{commit}']) || !gitSafe(['rev-parse', '--verify', d.base + '^{commit}'])) {
    return { status: 'tampered', reason: 'base/head не резолвятся в коммиты', data: d }
  }
  if (changedFilesSha(d.base, d.head) !== d.sha_of_changed_files) return { status: 'tampered', reason: 'sha_of_changed_files не совпал', data: d }
  return { status: 'done', data: d }
}
function writeMarker(id, { checkCmd, executor, verifier, base }) {
  mkdirSync(MARKERS(), { recursive: true })
  const head = git(['rev-parse', 'HEAD'])
  const baseSha = gitSafe(['rev-parse', base || `${head}~1`]) || head
  const marker = {
    task: id, check_cmd: checkCmd || '', exit_code: 0,
    base: baseSha, head, sha_of_changed_files: changedFilesSha(baseSha, head),
    executor_cli: executor || null, verifier_cli: verifier || null,
    finished_at: now(), written_by: 'conveyor-gate',
  }
  writeFileSync(markerFile(id), JSON.stringify(marker, null, 2) + '\n')
  return marker
}

// --- running / STOP / heartbeat -------------------------------------------------------------------
function readRunning() {
  const j = readJson(path.join(S.state, 'running.json'))
  return { running: j && Array.isArray(j.running) ? j.running : [] }
}
const writeRunning = st => writeJson(path.join(S.state, 'running.json'), st)
const stopFile = () => path.join(S.state, 'STOP')
const stopped = () => existsSync(stopFile())

// --- команды --------------------------------------------------------------------------------------
async function cmdReady(json) {
  if (stopped()) { console.error('STOP на диске — конвейер заморожен (снять: --go или «пуск» в Зевса)'); return 4 }
  const tasks = await loadTasks()
  if (!tasks.size) { console.error('очередь пуста — fail-closed'); return 2 }
  const running = readRunning().running
  const runningIds = new Set(running.map(r => r.task))
  const busyPaths = new Set(), busyCli = new Set()
  for (const r of running) {
    const t = tasks.get(r.task)
    if (t) for (const p of t.paths) busyPaths.add(p)
    if (r.executor) busyCli.add(r.executor)
  }
  const ready = [], blocked = {}, invalid = []
  for (const [id, t] of [...tasks].sort()) {
    if (!t.valid) { invalid.push(id); continue }
    if (readMarker(id).status === 'done' || runningIds.has(id)) continue
    const reasons = []
    for (const dep of t.requires) {
      const mk = readMarker(dep)
      if (mk.status !== 'done') reasons.push(`ждёт маркер ${dep}${mk.status === 'tampered' ? ' (tampered)' : ''}`)
    }
    const inter = t.paths.filter(p => busyPaths.has(p))
    if (inter.length) reasons.push(`пересечение путей: ${inter.join(', ')}`)
    if (t.executor && busyCli.has(t.executor)) reasons.push(`слот CLI ${t.executor} занят`)
    if (reasons.length) blocked[id] = reasons
    else ready.push({ task: id, executor: t.executor || null, verifier: t.verifier || null })
  }
  const out = { ok: ready.length > 0, ready, blocked, invalid }
  if (json) console.log(JSON.stringify(out, null, 2))
  else {
    if (invalid.length) console.log(`НЕ ПРИНЯТЫ (нет check_cmd/id): ${invalid.join(', ')}`)
    if (ready.length) { console.log('ГОТОВЫ:'); for (const r of ready) console.log(`  ${r.task} (${r.executor || 'любой'} → проверяет ${r.verifier || '?'})`) }
    else { console.log('готовых нет; блокеры:'); for (const id of Object.keys(blocked)) console.log(`  ${id}: ${blocked[id].join('; ')}`) }
  }
  return ready.length ? 0 : (Object.keys(blocked).length ? 1 : 2)
}

async function cmdStart(id, executor) {
  if (stopped()) { console.error('STOP — старт запрещён'); return 4 }
  const tasks = await loadTasks()
  const t = tasks.get(id)
  if (!t) { console.error(`задача ${id} не в очереди`); return 2 }
  if (!t.valid) { console.error(`задача ${id} без check_cmd — в конвейер не принимается`); return 2 }
  const st = readRunning()
  if (st.running.some(r => r.task === id)) { console.error(`${id} уже бежит`); return 1 }
  // Непересечение файлов сторожит КОД до запуска, не договорённость.
  for (const r of st.running) {
    const rt = tasks.get(r.task)
    const inter = rt ? t.paths.filter(p => rt.paths.includes(p)) : []
    if (inter.length) { console.error(`ОТКАЗ: пересечение путей с ${r.task}: ${inter.join(', ')}`); return 5 }
  }
  const cli = executor || t.executor || null
  if (cli && st.running.some(r => r.executor === cli)) { console.error(`ОТКАЗ: слот CLI ${cli} занят`); return 5 }
  st.running.push({ task: id, executor: cli, started_at: now() })
  writeRunning(st)
  console.log(`start: бегут ${st.running.map(r => r.task).join(', ')}`)
  return 0
}

function cmdFinish(id) {
  const st = readRunning()
  st.running = st.running.filter(r => r.task !== id)
  writeRunning(st)
  console.log(`finish: бегут ${st.running.length ? st.running.map(r => r.task).join(', ') : '(никто)'}`)
  return 0
}

async function cmdTask(id, opts) {
  const tasks = await loadTasks()
  if (!tasks.has(id)) { console.error(`задача ${id} не в очереди — маркер не пишется`); return 2 }
  if (!opts.checkCmd) { console.error('нет --check-cmd — приёмка без команды не бывает'); return 2 }
  const res = spawnSync('/bin/sh', ['-c', opts.checkCmd], { stdio: 'inherit', cwd: HOME })
  const code = res.status == null ? 1 : res.status
  if (code !== 0) { console.error(`проверка ${id} дала код ${code} — маркер не пишется`); return code || 1 }
  const t = tasks.get(id)
  if (t.probe_cmd) {
    const pr = spawnSync('/bin/sh', ['-c', t.probe_cmd], { stdio: 'inherit', cwd: HOME })
    if ((pr.status ?? 1) !== 0) { console.error(`враждебная проба ${id} провалена (код ${pr.status}) — маркер не пишется`); return pr.status || 1 }
  }
  writeMarker(id, opts)
  console.log(`маркер ${id} записан (exit_code 0)`)
  return 0
}

function cmdRequire(csv) {
  const ids = (csv || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!ids.length) { console.error('пустой --require — fail-closed'); return 2 }
  let bad = 0
  for (const id of ids) {
    const mk = readMarker(id)
    if (mk.status !== 'done') { console.error(`${id}: ${mk.status}${mk.reason ? ' (' + mk.reason + ')' : ''}`); bad++ }
  }
  if (bad) return 2
  console.log(`require ok: ${ids.join(', ')}`)
  return 0
}

async function cmdStatus(json) {
  const tasks = await loadTasks()
  const running = new Set(readRunning().running.map(r => r.task))
  const rows = []
  for (const [id, t] of [...tasks].sort()) {
    const mk = readMarker(id)
    let state = mk.status
    if (state === 'missing') state = running.has(id) ? 'running' : (t.valid ? 'pending' : 'invalid')
    rows.push({ task: id, state, reason: mk.reason || null })
  }
  let dilFiles = []
  try { dilFiles = readdirSync(S.dilemmas) } catch { /* каталога может не быть до первой развилки */ }
  const dils = dilFiles.filter(f => f.endsWith('.json')).map(f => readJson(path.join(S.dilemmas, f))).filter(Boolean)
  const out = { stop: stopped(), tasks: rows, dilemmas: dils.map(d => ({ id: d.id, kind: d.kind, status: d.status })) }
  if (json) console.log(JSON.stringify(out, null, 2))
  else {
    console.log(`ДОСКА КОНВЕЙЕРА${out.stop ? '  [STOP]' : ''}`)
    for (const r of rows) console.log(`  ${r.task}  ${r.state}${r.reason ? '  (' + r.reason + ')' : ''}`)
    for (const d of out.dilemmas) console.log(`  развилка ${d.id} [${d.kind}] ${d.status}`)
  }
  return 0
}

function cmdBeat(note) {
  writeJson(path.join(S.state, 'heartbeat.json'), { at: now(), pid: process.pid, note: note || '' })
  console.log('beat ' + now())
  return 0
}

// --- бюджет: факт с диска по jsonl трёх CLI (порт rebuild-gate, best-effort) ----------------------
const CLAUDE_RATES = { opus: [15, 75, 18.75, 1.5], sonnet: [3, 15, 3.75, 0.3], haiku: [1, 5, 1.25, 0.1], fable: [15, 75, 18.75, 1.5] }
const NON_CLAUDE_USD_PER_MTOK = 3
const claudeProjDir = () => path.join(os.homedir(), '.claude', 'projects', HOME.replace(/[^A-Za-z0-9]/g, '-'))
function claudeRate(model) { const l = (model || '').toLowerCase(); for (const k of Object.keys(CLAUDE_RATES)) if (l.includes(k)) return CLAUDE_RATES[k]; return CLAUDE_RATES.opus }
async function claudeSpend(since) {
  let tokens = 0, usd = 0, files = []
  try { files = readdirSync(claudeProjDir()).filter(f => f.endsWith('.jsonl')) } catch { return { tokens, usd } }
  for (const f of files) {
    const full = path.join(claudeProjDir(), f)
    try { if (statSync(full).mtimeMs < since) continue } catch { continue }
    let txt = ''; try { txt = await fsp.readFile(full, 'utf8') } catch { continue }
    for (const ln of txt.split('\n')) {
      if (!ln.trim()) continue
      let o; try { o = JSON.parse(ln) } catch { continue }
      const u = o.message && o.message.usage
      if (!u || o.message.model === '<synthetic>') continue
      if (!(o.timestamp && Date.parse(o.timestamp) >= since)) continue
      const r = claudeRate(o.message.model)
      const [a, b, c, d] = [u.input_tokens || 0, u.output_tokens || 0, u.cache_creation_input_tokens || 0, u.cache_read_input_tokens || 0]
      tokens += a + b + c + d
      usd += a / 1e6 * r[0] + b / 1e6 * r[1] + c / 1e6 * r[2] + d / 1e6 * r[3]
    }
  }
  return { tokens, usd }
}
async function codexSpend(since) {
  let tokens = 0, entries = []
  try { entries = readdirSync(path.join(os.homedir(), '.codex', 'sessions'), { recursive: true, withFileTypes: true }) } catch { return { tokens, usd: 0 } }
  for (const e of entries) {
    if (!e.isFile() || !/^rollout-.*\.jsonl$/.test(e.name)) continue
    const full = path.join(e.parentPath || e.path, e.name)
    try { if (statSync(full).mtimeMs < since) continue } catch { continue }
    let txt = ''; try { txt = await fsp.readFile(full, 'utf8') } catch { continue }
    const lines = txt.split('\n').filter(Boolean)
    let meta; try { meta = JSON.parse(lines[0]) } catch { continue }
    if (!(meta.payload && meta.payload.cwd && meta.payload.cwd.startsWith(HOME))) continue
    if (!(meta.timestamp && Date.parse(meta.timestamp) >= since)) continue
    let last = null
    for (const ln of lines) { if (ln.includes('"total_token_usage"')) { const mm = ln.match(/"total_tokens":(\d+)/); if (mm) last = Number(mm[1]) } }
    if (last != null) tokens += last
  }
  return { tokens, usd: tokens / 1e6 * NON_CLAUDE_USD_PER_MTOK }
}
async function kimiSpend(since) {
  let tokens = 0, idx = ''
  try { idx = await fsp.readFile(path.join(os.homedir(), '.kimi-code', 'session_index.jsonl'), 'utf8') } catch { return { tokens, usd: 0 } }
  for (const ln of idx.split('\n')) {
    if (!ln.trim()) continue
    let s; try { s = JSON.parse(ln) } catch { continue }
    if (s.workDir !== HOME || !s.sessionDir) continue
    let agents = []
    try { agents = readdirSync(path.join(s.sessionDir, 'agents'), { recursive: true, withFileTypes: true }) } catch { continue }
    for (const a of agents) {
      if (!a.isFile() || a.name !== 'wire.jsonl') continue
      let txt = ''; try { txt = await fsp.readFile(path.join(a.parentPath || a.path, a.name), 'utf8') } catch { continue }
      for (const wl of txt.split('\n')) {
        if (!wl.includes('step.end')) continue
        let o; try { o = JSON.parse(wl) } catch { continue }
        if (!(o.time && o.time >= since)) continue
        const u = (o.event && o.event.usage) || o.usage
        if (u) tokens += (u.inputOther || 0) + (u.output || 0) + (u.inputCacheRead || 0) + (u.inputCacheCreation || 0)
      }
    }
  }
  return { tokens, usd: tokens / 1e6 * NON_CLAUDE_USD_PER_MTOK }
}
async function cmdBudget(json) {
  const b = readJson(path.join(S.state, 'budget.json'))
  if (!b) { console.error('budget.json отсутствует — потолок не подтверждён'); return 2 }
  const since = b.started_at && !Number.isNaN(Date.parse(b.started_at)) ? Date.parse(b.started_at) : new Date().setHours(0, 0, 0, 0)
  const [c, x, k] = await Promise.all([claudeSpend(since).catch(() => ({ tokens: 0, usd: 0 })), codexSpend(since).catch(() => ({ tokens: 0, usd: 0 })), kimiSpend(since).catch(() => ({ tokens: 0, usd: 0 }))])
  const tokens = c.tokens + x.tokens + k.tokens, usd = c.usd + x.usd + k.usd
  const over = (Number.isFinite(b.ceiling_tokens) && b.ceiling_tokens > 0 && tokens > b.ceiling_tokens) || (Number.isFinite(b.ceiling_usd) && b.ceiling_usd > 0 && usd > b.ceiling_usd)
  const rep = { ok: !over, since: new Date(since).toISOString(), spend_tokens: tokens, spend_usd: Number(usd.toFixed(2)), by_cli: { claude: c, codex: x, kimi: k }, ceiling_usd: b.ceiling_usd ?? null, ceiling_tokens: b.ceiling_tokens ?? null }
  if (json) console.log(JSON.stringify(rep, null, 2))
  else console.log(`бюджет с ${rep.since}: ${tokens.toLocaleString()} ток · ≈$${rep.spend_usd}${over ? ' — ПРЕВЫШЕНИЕ, останов' : ' — в пределах'}`)
  return over ? 3 : 0
}

// --- adopt: приём чужого ledger и развилок, идемпотентно, без потерь ------------------------------
function cmdAdopt(dir) {
  if (!dir || !existsSync(dir)) { console.error('adopt: каталог не найден — fail-closed'); return 2 }
  let addedLedger = 0, addedDil = 0, skipped = 0
  const ledgerFile = path.join(S.state, 'ledger.jsonl')
  mkdirSync(S.state, { recursive: true })
  const have = new Set(existsSync(ledgerFile) ? readFileSync(ledgerFile, 'utf8').split('\n').filter(Boolean).map(sha256) : [])
  const extLedger = path.join(dir, 'ledger.jsonl')
  if (existsSync(extLedger)) {
    for (const ln of readFileSync(extLedger, 'utf8').split('\n').filter(Boolean)) {
      if (have.has(sha256(ln))) { skipped++; continue }
      appendFileSync(ledgerFile, ln + '\n'); have.add(sha256(ln)); addedLedger++
    }
  }
  const extDil = path.join(dir, 'dilemmas')
  if (existsSync(extDil)) {
    mkdirSync(S.dilemmas, { recursive: true })
    for (const f of readdirSync(extDil).filter(x => x.endsWith('.json'))) {
      const src = readFileSync(path.join(extDil, f), 'utf8')
      const d = JSON.parse(src)
      const dst = path.join(S.dilemmas, `${d.id}.json`)
      if (existsSync(dst)) {
        if (readFileSync(dst, 'utf8') === src) { skipped++; continue }
        const nid = `ad-${d.id}`
        d.id = nid
        writeJson(path.join(S.dilemmas, `${nid}.json`), d); addedDil++
      } else { writeFileSync(dst, src); addedDil++ }
    }
  }
  console.log(`adopt: ledger +${addedLedger}, развилок +${addedDil}, пропущено (уже есть) ${skipped}`)
  return 0
}

// --- selftest -------------------------------------------------------------------------------------
async function cmdSelftest() {
  const { strictEqual: eq, ok } = await import('node:assert')

  // 1. Разбор задачи из фикстуры.
  const fx = ['---', 'id: T01', 'title: Проба', 'paths:', '  - docs/a.md', '  - docs/b.md', 'requires: [T00]',
    'executor: kimi', 'verifier: codex', 'check_cmd: "true"', 'kind: default', '---',
    '## Промт исполнителя', 'делай', '## Промт проверяющего', 'проверяй'].join('\n')
  const t = parseTask(fx, 'fx.md')
  eq(t.id, 'T01'); eq(t.paths.length, 2); eq(t.requires[0], 'T00'); eq(t.executor, 'kimi')
  eq(t.executor_prompt, 'делай'); eq(t.verifier_prompt, 'проверяй'); eq(t.valid, true)
  const noCheck = parseTask(fx.replace('check_cmd: "true"\n', ''), 'fx2.md')
  eq(noCheck.valid, false, 'задача без check_cmd обязана быть invalid')

  // 2–7. Изолированное состояние в tmp git-репо.
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'conveyor-selftest-'))
  try {
    const env = { ...process.env, CONVEYOR_HOME: tmp }
    const self = fileURLToPath(import.meta.url)
    const run = (args) => spawnSync(process.execPath, [self, ...args], { env, encoding: 'utf8' })
    mkdirSync(path.join(tmp, 'queue', 'tasks'), { recursive: true })
    mkdirSync(path.join(tmp, 'queue', 'dilemmas'), { recursive: true })
    mkdirSync(path.join(tmp, 'docs'), { recursive: true })
    execFileSync('git', ['-C', tmp, 'init', '-q'])
    writeFileSync(path.join(tmp, 'seed.txt'), 'seed\n')
    execFileSync('git', ['-C', tmp, 'add', '-A'])
    execFileSync('git', ['-C', tmp, '-c', 'user.email=g@c', '-c', 'user.name=gate', 'commit', '-qm', 'seed'])

    // пустая очередь → exit 2 (fail-closed)
    eq(run(['--ready']).status, 2, 'пустая очередь обязана давать 2')

    // задачи: A и B делят путь; C независима, тот же CLI что A
    const mk = (id, paths, extra = '') => writeFileSync(path.join(tmp, 'queue', 'tasks', `${id}.task.md`),
      `---\nid: ${id}\npaths:\n${paths.map(p => '  - ' + p).join('\n')}\nexecutor: kimi\nverifier: codex\ncheck_cmd: "true"\n${extra}---\n## Промт исполнителя\nx\n## Промт проверяющего\ny\n`)
    mk('A', ['docs/x.md'])
    mk('B', ['docs/x.md', 'docs/y.md'])
    mk('C', ['docs/z.md'])
    eq(run(['--ready']).status, 0)

    // старт A, затем B (пересечение путей) → exit 5
    eq(run(['--start', 'A']).status, 0)
    eq(run(['--start', 'B']).status, 5, 'пересечение путей обязано давать 5')
    // C — слот kimi занят задачей A → exit 5
    eq(run(['--start', 'C']).status, 5, 'занятый слот CLI обязан давать 5')
    // «убить оркестратора»: свежий процесс читает то же состояние с диска
    const r2 = run(['--ready', '--json'])
    ok(r2.stdout.includes('пересечение путей') || r2.stdout.includes('слот CLI'), 'новый процесс видит бегущую A с диска')
    eq(run(['--finish', 'A']).status, 0)
    eq(run(['--start', 'B']).status, 0)
    eq(run(['--finish', 'B']).status, 0)

    // маркер: пишется только при exit 0, ловит подделку
    eq(run(['--task', 'A', '--check-cmd', 'false']).status, 1, 'красная проверка не пишет маркер')
    ok(!existsSync(path.join(tmp, '.conveyor', 'state', 'markers', 'A.done.json')))
    eq(run(['--task', 'A', '--check-cmd', 'true', '--executor', 'kimi', '--verifier', 'codex']).status, 0)
    eq(run(['--require', 'A']).status, 0)
    // подделка руками → tampered
    const mf = path.join(tmp, '.conveyor', 'state', 'markers', 'B.done.json')
    writeFileSync(mf, JSON.stringify({ task: 'B', written_by: 'orchestrator', finished_at: now() }))
    eq(run(['--require', 'B']).status, 2, 'рукописный маркер обязан быть tampered')
    // обрезание полей у настоящего маркера → tampered
    const af = path.join(tmp, '.conveyor', 'state', 'markers', 'A.done.json')
    const good = JSON.parse(readFileSync(af, 'utf8'))
    const cut = { ...good }; delete cut.sha_of_changed_files
    writeFileSync(af, JSON.stringify(cut))
    eq(run(['--require', 'A']).status, 2, 'обрезанный маркер обязан быть tampered')
    writeFileSync(af, JSON.stringify(good) + '\n')
    // повреждение содержимого: sha пересчитается и не совпадёт
    writeFileSync(af, JSON.stringify({ ...good, sha_of_changed_files: 'deadbeef' }) + '\n')
    eq(run(['--require', 'A']).status, 2, 'битый sha обязан быть tampered')

    // requires: D ждёт маркер E
    mk('D', ['docs/d.md'], 'requires: [E]\n')
    const rd = run(['--ready', '--json'])
    ok(rd.stdout.includes('ждёт маркер E'), 'зависимость без маркера блокирует')

    // STOP → ready/start exit 4
    writeFileSync(path.join(tmp, '.conveyor', 'state', 'STOP'), now())
    eq(run(['--ready']).status, 4); eq(run(['--start', 'C']).status, 4)
    rmSync(path.join(tmp, '.conveyor', 'state', 'STOP'))

    // adopt: идемпотентно, без потерь
    const ext = path.join(tmp, 'ext'); mkdirSync(path.join(ext, 'dilemmas'), { recursive: true })
    writeFileSync(path.join(ext, 'ledger.jsonl'), '{"ts":"1","kind":"lesson","cause":"c","fix":"f","rule":"r","enforced_by":"e"}\n')
    writeFileSync(path.join(ext, 'dilemmas', 'DX.json'), JSON.stringify({ id: 'DX', kind: 'default', status: 'open', question: 'q', options: ['a'], recommend: 0 }))
    eq(run(['--adopt', ext]).status, 0)
    eq(run(['--adopt', ext]).status, 0)
    const led = readFileSync(path.join(tmp, '.conveyor', 'state', 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean)
    eq(led.length, 1, 'adopt дважды не дублирует ledger')
    ok(existsSync(path.join(tmp, 'queue', 'dilemmas', 'DX.json')))

    // beat
    eq(run(['--beat', 'selftest']).status, 0)
    ok(existsSync(path.join(tmp, '.conveyor', 'state', 'heartbeat.json')))

    // бюджет: нет budget.json → 2; с потолком 1 токен и нулевым расходом (пустые каталоги) → 0
    eq(run(['--budget']).status, 2, 'нет budget.json — потолок не подтверждён')
  } finally { rmSync(tmp, { recursive: true, force: true }) }

  console.log('selftest ok — разбор задач, fail-closed, пересечения, слоты, tampered (3 вида), STOP, adopt, beat')
  return 0
}

// --- диспетчер ------------------------------------------------------------------------------------
async function main() {
  let v
  try {
    ({ values: v } = parseArgs({
      args: process.argv.slice(2), allowPositionals: true,
      options: {
        ready: { type: 'boolean' }, status: { type: 'boolean' }, json: { type: 'boolean' },
        start: { type: 'string' }, finish: { type: 'string' }, executor: { type: 'string' },
        task: { type: 'string' }, 'check-cmd': { type: 'string' }, verifier: { type: 'string' }, base: { type: 'string' },
        require: { type: 'string' }, beat: { type: 'string' }, budget: { type: 'boolean' },
        stop: { type: 'boolean' }, go: { type: 'boolean' }, adopt: { type: 'string' }, selftest: { type: 'boolean' },
      },
    }))
  } catch (e) { console.error('разбор аргументов: ' + e.message); return 2 }

  mkdirSync(S.state, { recursive: true })
  if (v.selftest) return cmdSelftest()
  if (v.ready) return cmdReady(v.json)
  if (v.status) return cmdStatus(v.json)
  if (v.start) return cmdStart(v.start, v.executor)
  if (v.finish) return cmdFinish(v.finish)
  if (v.task) return cmdTask(v.task, { checkCmd: v['check-cmd'], executor: v.executor, verifier: v.verifier, base: v.base })
  if (v.require) return cmdRequire(v.require)
  if (v.beat !== undefined) return cmdBeat(v.beat)
  if (v.budget) return cmdBudget(v.json)
  if (v.stop) { writeFileSync(stopFile(), now()); console.log('STOP поставлен'); return 0 }
  if (v.go) { rmSync(stopFile(), { force: true }); console.log('STOP снят'); return 0 }
  if (v.adopt) return cmdAdopt(v.adopt)
  console.log('conveyor-gate: --ready --start --finish --task --check-cmd --require --status --beat --budget --stop --go --adopt --selftest --json')
  return 0
}
main().then(c => process.exit(c)).catch(e => { console.error(e && e.message || e); process.exit(1) })
