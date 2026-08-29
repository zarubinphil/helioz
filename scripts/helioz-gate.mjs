#!/usr/bin/env node
// ПРИБОР КОНВЕЙЕРА - состояние на диске, маркер пишет код, подделка детектится.
// Наследник mnemazine-rebuild-gate.mjs (проверен боем 22–24.08.2026). Контракты: docs/CONTRACTS.md.
//
//   --ready            готовые задачи (deps done + пути не пересекаются + слот CLI свободен). Пусто → exit 2.
//   --start <id>       занять слот; пересечение путей с бегущей задачей → exit 5, НЕ стартует.
//   --finish <id>      освободить слот.
//   --task <id> --check-cmd "…" [--executor cli --verifier cli --base ref]
//                      прогнать приёмку; exit 0 → маркер целостности. Иначе маркер не пишется.
//   --require <id,..>  все маркеры done? tampered/missing → exit 2.
//   --status --json    доска.
//   --smoke [--json]   живой smoke текущего состояния: STOP нет, running.json читается, очередь валидна.
//   --beat [note]      heartbeat оркестратора.
//   --stop / --go      флаг STOP (ставится и по «стоп» из Telegram). При STOP: ready/start → exit 4.
//   --budget           факт расхода по jsonl трёх CLI против budget.json. Нет файла → exit 2; перебор → exit 3.
//   --adopt <dir>      идемпотентный приём чужого ledger.jsonl и dilemmas/*.json (Мозг 2.0 пересядет сюда).
//   --selftest         детерминированные пробы прибора в изолированном состоянии.
//
// Коды: 0 ok · 1 красный · 2 fail-closed (пусто/недостаточно) · 3 бюджет · 4 STOP · 5 пересечение путей.
import { parseArgs } from 'node:util'
import { promises as fsp, existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, statSync, appendFileSync, renameSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.HELIOZ_HOME || path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CFG = readJson(path.join(HOME, 'config', 'helioz.json')) || {}
const S = {
  state: path.join(HOME, '.helioz', 'state'),
  tasks: path.join(HOME, 'queue', 'tasks'),
  dilemmas: path.join(HOME, 'queue', 'dilemmas'),
}
const MARKERS = () => path.join(S.state, 'markers')
const EXEC_SECRET = () => path.join(S.state, 'exec', '.secret')

// --- утилиты --------------------------------------------------------------------------------------
const sha256 = s => createHash('sha256').update(s).digest('hex')
function readJson(f) { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null } }
// атомарная запись: tmp + rename - смерть процесса не оставляет усечённый JSON (ревью kimi, класс 4)
function writeJson(f, o) {
  mkdirSync(path.dirname(f), { recursive: true })
  const tmp = f + '.tmp-' + process.pid
  writeFileSync(tmp, JSON.stringify(o, null, 2) + '\n')
  renameSync(tmp, f)
}
// лок от гонок read-modify-write (ревью codex+kimi, класс 5): mkdir атомарен на POSIX
function withLock(name, fn) {
  const dir = path.join(S.state, `.lock-${name}`)
  mkdirSync(S.state, { recursive: true })
  const deadline = Date.now() + 5000
  for (;;) {
    try { mkdirSync(dir); break } catch {
      if (Date.now() > deadline) { console.error(`лок ${name} занят >5с - отказ (не гонка, а честный красный)`); return 2 }
      spawnSync('/bin/sleep', ['0.05'])
    }
  }
  try { return fn() } finally { rmSync(dir, { recursive: true, force: true }) }
}
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
  t.valid = Boolean(t.id && t.check_cmd && t.executor && t.verifier && t.executor !== t.verifier)
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
function taskFile(id) {
  for (const dir of [S.tasks, path.join(S.tasks, 'done')]) {
    const f = path.join(dir, `${id}.task.md`)
    if (existsSync(f)) return f
  }
  return null
}
function readTaskSync(id) {
  const f = taskFile(id)
  if (!f) return null
  const text = readFileSync(f, 'utf8')
  const task = parseTask(text, path.relative(S.tasks, f))
  return task ? { task, text, sha: sha256(text) } : null
}
const execReceiptFile = id => path.join(S.state, 'exec', `${id}.json`)
function execReceipt(id) {
  return readJson(execReceiptFile(id))
}
function receiptSecret() {
  try { return readFileSync(EXEC_SECRET(), 'utf8').trim() } catch { return null }
}
function receiptLogOk(rec, key) {
  const rel = rec && rec[key]
  if (!rel || path.isAbsolute(rel) || rel.includes('..')) return false
  return existsSync(path.join(HOME, rel))
}
function receiptLogSha(rec, key) {
  const rel = rec && rec[key]
  if (!rel || path.isAbsolute(rel) || rel.includes('..')) return null
  const f = path.join(HOME, rel)
  return existsSync(f) ? sha256(readFileSync(f)) : null
}
function receiptPayload(rec) {
  return {
    receipt_version: 1,
    executor_task_sha: rec.executor_task_sha || null,
    verifier_task_sha: rec.verifier_task_sha || null,
    executor_used: rec.executor_used || null,
    verifier_used: rec.verifier_used || null,
    executor_code: rec.executor_code ?? null,
    verifier_code: rec.verifier_code ?? null,
    executor_log: rec.executor_log || null,
    verifier_log: rec.verifier_log || null,
    executor_log_sha: receiptLogSha(rec, 'executor_log'),
    verifier_log_sha: receiptLogSha(rec, 'verifier_log'),
  }
}
function receiptSig(rec, secret) {
  return sha256(secret + '\0' + JSON.stringify(receiptPayload(rec)))
}
function receiptSignatureOk(rec) {
  const secret = receiptSecret()
  return Boolean(
    secret &&
    rec &&
    rec.written_by === 'helioz-exec' &&
    rec.receipt_version === 1 &&
    rec.receipt_sig &&
    rec.receipt_sig === receiptSig(rec, secret)
  )
}
function walkFiles(root) {
  if (!existsSync(root)) return []
  const st = statSync(root)
  if (st.isFile()) return [root]
  if (!st.isDirectory()) return []
  let out = []
  for (const name of readdirSync(root).sort()) out = out.concat(walkFiles(path.join(root, name)))
  return out
}
function externalProof(paths = []) {
  const home = path.resolve(HOME)
  const rows = []
  for (const p of paths) {
    const abs = path.resolve(HOME, p)
    if (abs === home || abs.startsWith(home + path.sep)) continue
    for (const f of walkFiles(abs)) {
      const rel = path.relative('/', f)
      rows.push(`${rel}\0${sha256(readFileSync(f))}`)
    }
  }
  return rows.sort()
}
const externalSha = paths => sha256(externalProof(paths).join('\n'))
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
  const taskRec = readTaskSync(id)
  if (!taskRec) return { status: 'tampered', reason: 'нет файла задачи', data: d }
  if (d.written_by !== 'helioz-gate') return { status: 'tampered', reason: 'нет written_by:"helioz-gate"', data: d }
  for (const k of ['task', 'task_sha', 'check_cmd', 'base', 'head', 'sha_of_changed_files', 'external', 'external_sha', 'executor_cli', 'verifier_cli', 'finished_at']) {
    if (d[k] === undefined || d[k] === null || d[k] === '') return { status: 'tampered', reason: `нет поля целостности ${k}`, data: d }
  }
  // ревью codex: маркер обязан быть привязан к СВОЕЙ задаче - копия чужого валидного маркера не проходит
  if (d.task !== id) return { status: 'tampered', reason: `маркер от другой задачи (${d.task})`, data: d }
  if (d.task_sha !== taskRec.sha) return { status: 'tampered', reason: 'task_sha не совпал с текущей задачей', data: d }
  if (d.check_cmd !== taskRec.task.check_cmd) return { status: 'tampered', reason: 'check_cmd не совпал с задачей', data: d }
  // ревью codex+kimi: exit_code проверяется на значение, не на наличие
  if (d.exit_code !== 0) return { status: 'tampered', reason: `exit_code ${d.exit_code} ≠ 0`, data: d }
  if (d.executor_cli === d.verifier_cli) {
    return { status: 'tampered', reason: `executor_cli совпал с verifier_cli (${d.executor_cli})`, data: d }
  }
  const rec = execReceipt(id)
  if (!rec) return { status: 'tampered', reason: 'нет exec-квитанции', data: d }
  if (!receiptSignatureOk(rec)) {
    return { status: 'tampered', reason: 'exec-квитанция не подписана helioz-exec', data: d }
  }
  if (rec.executor_task_sha !== taskRec.sha || rec.verifier_task_sha !== taskRec.sha) {
    return { status: 'tampered', reason: 'exec-квитанция от разных/старых редакций задачи', data: d }
  }
  if (rec.executor_used !== d.executor_cli || rec.verifier_used !== d.verifier_cli) {
    return { status: 'tampered', reason: 'exec-квитанция не совпала с маркером', data: d }
  }
  if (rec.executor_code !== 0 || rec.verifier_code !== 0) {
    return { status: 'tampered', reason: `exec-коды не зелёные (${rec.executor_code}/${rec.verifier_code})`, data: d }
  }
  if (!receiptLogOk(rec, 'executor_log') || !receiptLogOk(rec, 'verifier_log')) {
    return { status: 'tampered', reason: 'нет логов exec-квитанции', data: d }
  }
  // ревью kimi: base===head даёт пустой diff со всем известным sha256("") - фордж без единой проверки
  if (d.base === d.head) return { status: 'tampered', reason: 'base === head (пустой diff - не доказательство)', data: d }
  if (!gitSafe(['rev-parse', '--verify', d.head + '^{commit}']) || !gitSafe(['rev-parse', '--verify', d.base + '^{commit}'])) {
    return { status: 'tampered', reason: 'base/head не резолвятся в коммиты', data: d }
  }
  if (changedFilesSha(d.base, d.head) !== d.sha_of_changed_files) return { status: 'tampered', reason: 'sha_of_changed_files не совпал', data: d }
  if (!Array.isArray(d.external)) return { status: 'tampered', reason: 'external не список', data: d }
  if (d.external.join('\n') !== externalProof(taskRec.task.paths).join('\n')) {
    return { status: 'tampered', reason: 'external proof не совпал', data: d }
  }
  if (d.external_sha !== externalSha(taskRec.task.paths)) {
    return { status: 'tampered', reason: 'external_sha не совпал', data: d }
  }
  return { status: 'done', data: d }
}
function writeMarker(id, { checkCmd, executor, verifier, base }) {
  mkdirSync(MARKERS(), { recursive: true })
  const taskRec = readTaskSync(id)
  if (!taskRec) throw new Error(`маркер ${id}: файл задачи не найден`)
  if (!taskRec.task.valid) throw new Error(`маркер ${id}: задача невалидна (нужны id/check_cmd/executor/verifier и разные CLI)`)
  if (checkCmd !== taskRec.task.check_cmd) throw new Error(`маркер ${id}: --check-cmd не совпал с задачей`)
  if (!executor || !verifier) throw new Error(`маркер ${id}: нужны executor и verifier`)
  if (executor === verifier) throw new Error(`маркер ${id}: executor и verifier должны отличаться`)
  const rec = execReceipt(id)
  if (!rec) throw new Error(`маркер ${id}: нет exec-квитанции ${path.relative(HOME, execReceiptFile(id))}`)
  if (!receiptSignatureOk(rec)) throw new Error(`маркер ${id}: exec-квитанция не подписана helioz-exec`)
  if (rec.executor_task_sha !== taskRec.sha || rec.verifier_task_sha !== taskRec.sha) {
    throw new Error(`маркер ${id}: exec-квитанция от разных/старых редакций задачи`)
  }
  if (rec.executor_used !== executor || rec.verifier_used !== verifier) throw new Error(`маркер ${id}: exec-квитанция не совпала с CLI маркера`)
  if (rec.executor_code !== 0 || rec.verifier_code !== 0) throw new Error(`маркер ${id}: exec-коды не зелёные (${rec.executor_code}/${rec.verifier_code})`)
  if (!receiptLogOk(rec, 'executor_log') || !receiptLogOk(rec, 'verifier_log')) throw new Error(`маркер ${id}: нет логов exec-квитанции`)
  const head = git(['rev-parse', 'HEAD'])
  const baseSha = gitSafe(['rev-parse', base || `${head}~1`])
  // ревью kimi: молчаливый фолбэк на head легализовывал пустой diff - теперь честный отказ
  if (!baseSha || baseSha === head) throw new Error(`маркер ${id}: base не резолвится или совпадает с head - сначала закоммить работу задачи`)
  const marker = {
    task: id, task_sha: taskRec.sha, check_cmd: taskRec.task.check_cmd, exit_code: 0,
    base: baseSha, head, sha_of_changed_files: changedFilesSha(baseSha, head),
    external: externalProof(taskRec.task.paths),
    external_sha: externalSha(taskRec.task.paths),
    executor_cli: executor || null, verifier_cli: verifier || null,
    finished_at: now(), written_by: 'helioz-gate',
  }
  writeFileSync(markerFile(id), JSON.stringify(marker, null, 2) + '\n')
  return marker
}

// --- running / STOP / heartbeat -------------------------------------------------------------------
function readRunning() {
  const f = path.join(S.state, 'running.json')
  if (!existsSync(f)) return { running: [] }
  const j = readJson(f)
  // ревью codex+kimi: битый running.json раньше молча становился пустым (fail-open - слоты и
  // пересечения отключались). Теперь это честный красный: чинить руками, не угадывать.
  if (!j || !Array.isArray(j.running)) return { running: [], corrupt: true }
  return { running: j.running }
}
const writeRunning = st => writeJson(path.join(S.state, 'running.json'), { running: st.running })
const stopFile = () => path.join(S.state, 'STOP')
const stopped = () => existsSync(stopFile())

// --- команды --------------------------------------------------------------------------------------
async function cmdReady(json) {
  if (stopped()) { console.error('STOP на диске - конвейер заморожен (снять: --go или «пуск» в Зевса)'); return 4 }
  const tasks = await loadTasks()
  if (!tasks.size) { console.error('очередь пуста - fail-closed'); return 2 }
  const rst = readRunning()
  if (rst.corrupt) { console.error('running.json нечитаем - fail-closed, почини или удали файл руками'); return 2 }
  const running = rst.running
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
    if (invalid.length) console.log(`НЕ ПРИНЯТЫ (нужны id/check_cmd/executor/verifier и разные CLI): ${invalid.join(', ')}`)
    if (ready.length) { console.log('ГОТОВЫ:'); for (const r of ready) console.log(`  ${r.task} (${r.executor || 'любой'} → проверяет ${r.verifier || '?'})`) }
    else { console.log('готовых нет; блокеры:'); for (const id of Object.keys(blocked)) console.log(`  ${id}: ${blocked[id].join('; ')}`) }
  }
  return ready.length ? 0 : (Object.keys(blocked).length ? 1 : 2)
}

async function cmdStart(id, executor) {
  if (stopped()) { console.error('STOP - старт запрещён'); return 4 }
  const tasks = await loadTasks()
  const t = tasks.get(id)
  if (!t) { console.error(`задача ${id} не в очереди`); return 2 }
  if (!t.valid) { console.error(`задача ${id} невалидна: нужны id/check_cmd/executor/verifier и разные CLI`); return 2 }
  return withLock('running', () => {
    const st = readRunning()
    if (st.corrupt) { console.error('running.json нечитаем - fail-closed'); return 2 }
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
  })
}

function cmdFinish(id) {
  return withLock('running', () => {
    const st = readRunning()
    if (st.corrupt) { console.error('running.json нечитаем - fail-closed'); return 2 }
    st.running = st.running.filter(r => r.task !== id)
    writeRunning(st)
    console.log(`finish: бегут ${st.running.length ? st.running.map(r => r.task).join(', ') : '(никто)'}`)
    return 0
  })
}

async function cmdTask(id, opts) {
  const tasks = await loadTasks()
  if (!tasks.has(id)) { console.error(`задача ${id} не в очереди - маркер не пишется`); return 2 }
  const t = tasks.get(id)
  if (!t.valid) { console.error(`задача ${id} невалидна - маркер не пишется`); return 2 }
  if (!opts.checkCmd) { console.error('нет --check-cmd - приёмка без команды не бывает'); return 2 }
  if (opts.checkCmd !== t.check_cmd) { console.error(`--check-cmd не совпал с задачей ${id} - маркер не пишется`); return 2 }
  const res = spawnSync('/bin/sh', ['-c', opts.checkCmd], { stdio: 'inherit', cwd: HOME })
  const code = res.status == null ? 1 : res.status
  if (code !== 0) { console.error(`проверка ${id} дала код ${code} - маркер не пишется`); return code || 1 }
  if (t.probe_cmd) {
    const pr = spawnSync('/bin/sh', ['-c', t.probe_cmd], { stdio: 'inherit', cwd: HOME })
    if ((pr.status ?? 1) !== 0) { console.error(`враждебная проба ${id} провалена (код ${pr.status}) - маркер не пишется`); return pr.status || 1 }
  }
  try {
    writeMarker(id, opts)
  } catch (e) {
    console.error(e.message || String(e))
    return 2
  }
  console.log(`маркер ${id} записан (exit_code 0)`)
  return 0
}

function cmdRequire(csv) {
  const ids = (csv || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!ids.length) { console.error('пустой --require - fail-closed'); return 2 }
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

async function cmdSmoke(json) {
  const rst = readRunning()
  const tasks = await loadTasks()
  const invalid = [...tasks].filter(([, t]) => !t.valid).map(([id]) => id).sort()
  const reasons = []
  if (stopped()) reasons.push('STOP')
  if (rst.corrupt) reasons.push('running.json corrupt')
  if (!tasks.size) reasons.push('queue empty')
  if (invalid.length) reasons.push(`invalid tasks: ${invalid.join(', ')}`)
  const out = {
    ok: reasons.length === 0,
    stop: stopped(),
    running_corrupt: Boolean(rst.corrupt),
    tasks: tasks.size,
    invalid,
    reasons,
  }
  if (json) console.log(JSON.stringify(out, null, 2))
  else if (out.ok) console.log(`smoke ok: stop=false, invalid=[], tasks=${tasks.size}`)
  else console.error(`smoke red: ${reasons.join('; ')}`)
  return out.ok ? 0 : 2
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
  if (!b) { console.error('budget.json отсутствует - потолок не подтверждён'); return 2 }
  // ревью codex+kimi: раньше недоступность ВСЕХ источников логов давала расход 0 и зелёный при
  // любом реальном перерасходе. С потолком и нулём читаемых источников - честный красный.
  const roots = [claudeProjDir(), path.join(os.homedir(), '.codex', 'sessions'), path.join(os.homedir(), '.kimi-code', 'session_index.jsonl')]
  const hasCeiling = (Number.isFinite(b.ceiling_tokens) && b.ceiling_tokens > 0) || (Number.isFinite(b.ceiling_usd) && b.ceiling_usd > 0)
  if (hasCeiling && !roots.some(r => existsSync(r))) { console.error('расход неизвестен: ни один источник логов CLI не читается - fail-closed'); return 2 }
  const since = b.started_at && !Number.isNaN(Date.parse(b.started_at)) ? Date.parse(b.started_at) : new Date().setHours(0, 0, 0, 0)
  const [c, x, k] = await Promise.all([claudeSpend(since).catch(() => ({ tokens: 0, usd: 0 })), codexSpend(since).catch(() => ({ tokens: 0, usd: 0 })), kimiSpend(since).catch(() => ({ tokens: 0, usd: 0 }))])
  const tokens = c.tokens + x.tokens + k.tokens, usd = c.usd + x.usd + k.usd
  const over = (Number.isFinite(b.ceiling_tokens) && b.ceiling_tokens > 0 && tokens > b.ceiling_tokens) || (Number.isFinite(b.ceiling_usd) && b.ceiling_usd > 0 && usd > b.ceiling_usd)
  // Слепой замер: прогоны в окне были, а расход вышел нулевой - значит журналы CLI не читаются.
  // Молчать нельзя: потолок, который всегда зелен, хуже отсутствующего (fail-closed).
  let runsInWindow = 0
  for (const dir of [path.join(S.state, 'exec'), path.join(S.state, 'logs')]) {
    try { for (const f of readdirSync(dir)) { if (statSync(path.join(dir, f)).mtimeMs >= since) runsInWindow++ } } catch { }
  }
  if (hasCeiling && tokens === 0 && runsInWindow > 0) {
    console.error(`расход неизвестен: в окне было ${runsInWindow} прогонов, а журналы CLI дали 0 токенов - замер слеп, потолок не подтверждён`)
    return 2
  }
  const rep = { ok: !over, since: new Date(since).toISOString(), spend_tokens: tokens, spend_usd: Number(usd.toFixed(2)), by_cli: { claude: c, codex: x, kimi: k }, ceiling_usd: b.ceiling_usd ?? null, ceiling_tokens: b.ceiling_tokens ?? null, runs_in_window: runsInWindow }
  if (json) console.log(JSON.stringify(rep, null, 2))
  else console.log(`бюджет с ${rep.since}: ${tokens.toLocaleString()} ток · ≈$${rep.spend_usd}${over ? ' - ПРЕВЫШЕНИЕ, останов' : ' - в пределах'}`)
  return over ? 3 : 0
}

// --- adopt: приём чужого ledger и развилок, идемпотентно, без потерь ------------------------------
function cmdAdopt(dir) {
  if (!dir || !existsSync(dir)) { console.error('adopt: каталог не найден - fail-closed'); return 2 }
  return withLock('adopt', () => cmdAdoptLocked(dir))
}
function cmdAdoptLocked(dir) {
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
  const sameCli = parseTask(fx.replace('verifier: codex', 'verifier: kimi'), 'fx3.md')
  eq(sameCli.valid, false, 'executor==verifier обязан быть invalid')

  // 2–7. Изолированное состояние в tmp git-репо.
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'helioz-selftest-'))
  try {
    const env = { ...process.env, HELIOZ_HOME: tmp }
    const self = fileURLToPath(import.meta.url)
    const execScript = path.join(path.dirname(self), 'helioz-exec.mjs')
    const run = (args) => spawnSync(process.execPath, [self, ...args], { env, encoding: 'utf8' })
    const runExec = (args) => spawnSync(process.execPath, [execScript, ...args], { env, encoding: 'utf8' })
    mkdirSync(path.join(tmp, 'queue', 'tasks'), { recursive: true })
    mkdirSync(path.join(tmp, 'queue', 'dilemmas'), { recursive: true })
    mkdirSync(path.join(tmp, 'docs'), { recursive: true })
    mkdirSync(path.join(tmp, 'config'), { recursive: true })
    writeFileSync(path.join(tmp, 'config', 'helioz.json'), JSON.stringify({ probe_timeout_sec: 5, run_timeout_sec: 5 }))
    const stub = ['/bin/sh', '-c', 'cat >/dev/null 2>&1 || true; echo ok']
    writeFileSync(path.join(tmp, 'config', 'clis.json'), JSON.stringify({
      kimi: { invoke_read: stub, invoke_write: stub, stdin_prompt: true, roles: ['execute', 'verify'] },
      codex: { invoke_read: stub, invoke_write: stub, stdin_prompt: true, roles: ['execute', 'verify'] },
    }))
    execFileSync('git', ['-C', tmp, 'init', '-q'])
    writeFileSync(path.join(tmp, 'seed.txt'), 'seed\n')
    execFileSync('git', ['-C', tmp, 'add', '-A'])
    execFileSync('git', ['-C', tmp, '-c', 'user.email=g@c', '-c', 'user.name=gate', 'commit', '-qm', 'seed'])
    // второй коммит: маркер требует base≠head с реальным diff (пустой diff = фордж, ревью kimi)
    writeFileSync(path.join(tmp, 'seed.txt'), 'seed\nwork\n')
    execFileSync('git', ['-C', tmp, 'add', '-A'])
    execFileSync('git', ['-C', tmp, '-c', 'user.email=g@c', '-c', 'user.name=gate', 'commit', '-qm', 'work'])

    // пустая очередь → exit 2 (fail-closed)
    eq(run(['--ready']).status, 2, 'пустая очередь обязана давать 2')

    // задачи: A и B делят путь; C независима, тот же CLI что A
    const mk = (id, paths, extra = '') => writeFileSync(path.join(tmp, 'queue', 'tasks', `${id}.task.md`),
      `---\nid: ${id}\npaths:\n${paths.map(p => '  - ' + p).join('\n')}\nexecutor: kimi\nverifier: codex\ncheck_cmd: "true"\n${extra}---\n## Промт исполнителя\nx\n## Промт проверяющего\ny\n`)
    const receipt = (id, executor = 'kimi', verifier = 'codex') => {
      eq(runExec(['task', '--id', id, '--role', 'executor', '--cli', executor]).status, 0)
      eq(runExec(['task', '--id', id, '--role', 'verifier', '--cli', verifier]).status, 0)
    }
    mk('A', ['docs/x.md'])
    mk('B', ['docs/x.md', 'docs/y.md'])
    mk('C', ['docs/z.md'])
    mk('F', ['docs/f.md'], 'check_cmd: "false"\n')
    eq(run(['--ready']).status, 0)
    const smoke = run(['--smoke', '--json'])
    eq(smoke.status, 0, 'здоровое живое состояние проходит smoke')
    eq(JSON.parse(smoke.stdout).stop, false)
    eq(JSON.parse(smoke.stdout).invalid.length, 0)

    // старт A, затем B (пересечение путей) → exit 5
    eq(run(['--start', 'A']).status, 0)
    eq(run(['--start', 'B']).status, 5, 'пересечение путей обязано давать 5')
    // C - слот kimi занят задачей A → exit 5
    eq(run(['--start', 'C']).status, 5, 'занятый слот CLI обязан давать 5')
    // «убить оркестратора»: свежий процесс читает то же состояние с диска
    const r2 = run(['--ready', '--json'])
    ok(r2.stdout.includes('пересечение путей') || r2.stdout.includes('слот CLI'), 'новый процесс видит бегущую A с диска')
    eq(run(['--finish', 'A']).status, 0)
    eq(run(['--start', 'B']).status, 0)
    eq(run(['--finish', 'B']).status, 0)

    // маркер: пишется только при exit 0, ловит подделку
    eq(run(['--task', 'A', '--check-cmd', 'false']).status, 2, 'чужой check_cmd не пишет маркер')
    ok(!existsSync(path.join(tmp, '.helioz', 'state', 'markers', 'A.done.json')))
    receipt('F')
    eq(run(['--task', 'F', '--check-cmd', 'false', '--executor', 'kimi', '--verifier', 'codex']).status, 1,
       'красная проверка не пишет маркер')
    ok(!existsSync(path.join(tmp, '.helioz', 'state', 'markers', 'F.done.json')))
    receipt('A')
    eq(run(['--task', 'A', '--check-cmd', 'true', '--executor', 'kimi', '--verifier', 'codex']).status, 0)
    eq(run(['--require', 'A']).status, 0)
    eq(run(['--task', 'B', '--check-cmd', 'true', '--executor', 'kimi', '--verifier', 'kimi']).status, 2,
       'executor==verifier обязан давать 2')
    receipt('B')
    eq(run(['--task', 'B', '--check-cmd', 'true', '--executor', 'kimi']).status, 2,
       'маркер без verifier обязан давать 2')
    eq(run(['--task', 'B', '--check-cmd', 'false', '--executor', 'kimi', '--verifier', 'codex']).status, 2,
       'check_cmd не из задачи обязан давать 2')
    // подделка руками → tampered
    const mf = path.join(tmp, '.helioz', 'state', 'markers', 'B.done.json')
    writeFileSync(mf, JSON.stringify({ task: 'B', written_by: 'orchestrator', finished_at: now() }))
    eq(run(['--require', 'B']).status, 2, 'рукописный маркер обязан быть tampered')
    // рукописная exec-квитанция с логами, но без подписи helioz-exec → не доказательство
    mkdirSync(path.join(tmp, '.helioz', 'state', 'exec'), { recursive: true })
    mkdirSync(path.join(tmp, '.helioz', 'state', 'logs'), { recursive: true })
    writeFileSync(path.join(tmp, '.helioz', 'state', 'logs', 'C-executor-kimi.log'), 'fake\n')
    writeFileSync(path.join(tmp, '.helioz', 'state', 'logs', 'C-verifier-codex.log'), 'fake\n')
    const cTask = readFileSync(path.join(tmp, 'queue', 'tasks', 'C.task.md'), 'utf8')
    writeFileSync(path.join(tmp, '.helioz', 'state', 'exec', 'C.json'), JSON.stringify({
      executor_task_sha: sha256(cTask), verifier_task_sha: sha256(cTask),
      executor_used: 'kimi', verifier_used: 'codex', executor_code: 0, verifier_code: 0,
      executor_log: '.helioz/state/logs/C-executor-kimi.log',
      verifier_log: '.helioz/state/logs/C-verifier-codex.log',
    }, null, 2) + '\n')
    eq(run(['--task', 'C', '--check-cmd', 'true', '--executor', 'kimi', '--verifier', 'codex']).status, 2,
       'рукописная exec-квитанция без подписи helioz-exec обязана давать 2')
    // обрезание полей у настоящего маркера → tampered
    const af = path.join(tmp, '.helioz', 'state', 'markers', 'A.done.json')
    const good = JSON.parse(readFileSync(af, 'utf8'))
    const cut = { ...good }; delete cut.sha_of_changed_files
    writeFileSync(af, JSON.stringify(cut))
    eq(run(['--require', 'A']).status, 2, 'обрезанный маркер обязан быть tampered')
    writeFileSync(af, JSON.stringify(good) + '\n')
    const cutExternal = { ...good }; delete cutExternal.external_sha
    writeFileSync(af, JSON.stringify(cutExternal))
    eq(run(['--require', 'A']).status, 2, 'маркер без external_sha обязан быть tampered')
    writeFileSync(af, JSON.stringify(good) + '\n')
    // повреждение содержимого: sha пересчитается и не совпадёт
    writeFileSync(af, JSON.stringify({ ...good, sha_of_changed_files: 'deadbeef' }) + '\n')
    eq(run(['--require', 'A']).status, 2, 'битый sha обязан быть tampered')
    // ревью codex: копия чужого ВАЛИДНОГО маркера → tampered (маркер не привязан был к id)
    writeFileSync(path.join(tmp, '.helioz', 'state', 'markers', 'C.done.json'), JSON.stringify(good) + '\n')
    eq(run(['--require', 'C']).status, 2, 'чужой валидный маркер копией обязан быть tampered')
    // ревью codex+kimi: exit_code ≠ 0 → tampered
    writeFileSync(af, JSON.stringify({ ...good, exit_code: 1 }) + '\n')
    eq(run(['--require', 'A']).status, 2, 'exit_code 1 обязан быть tampered')
    // ревью kimi: base === head (пустой diff, известный sha256("")) → tampered
    writeFileSync(af, JSON.stringify({ ...good, base: good.head, sha_of_changed_files: sha256('') }) + '\n')
    eq(run(['--require', 'A']).status, 2, 'base===head обязан быть tampered')
    writeFileSync(af, JSON.stringify(good) + '\n')
    eq(run(['--require', 'A']).status, 0, 'восстановленный честный маркер снова done')
    // ревью codex+kimi: битый running.json → fail-closed, не пустой список
    writeFileSync(path.join(tmp, '.helioz', 'state', 'running.json'), '{')
    eq(run(['--ready']).status, 2, 'битый running.json обязан давать fail-closed')
    eq(run(['--smoke']).status, 2, 'битый running.json обязан красить smoke')
    eq(run(['--start', 'C']).status, 2, 'старт при битом running.json запрещён')
    rmSync(path.join(tmp, '.helioz', 'state', 'running.json'))

    // requires: D ждёт маркер E
    mk('D', ['docs/d.md'], 'requires: [E]\n')
    const rd = run(['--ready', '--json'])
    ok(rd.stdout.includes('ждёт маркер E'), 'зависимость без маркера блокирует')

    // STOP → ready/start exit 4
    writeFileSync(path.join(tmp, '.helioz', 'state', 'STOP'), now())
    eq(run(['--ready']).status, 4); eq(run(['--start', 'C']).status, 4)
    rmSync(path.join(tmp, '.helioz', 'state', 'STOP'))

    // adopt: идемпотентно, без потерь
    const ext = path.join(tmp, 'ext'); mkdirSync(path.join(ext, 'dilemmas'), { recursive: true })
    writeFileSync(path.join(ext, 'ledger.jsonl'), '{"ts":"1","kind":"lesson","cause":"c","fix":"f","rule":"r","enforced_by":"e"}\n')
    writeFileSync(path.join(ext, 'dilemmas', 'DX.json'), JSON.stringify({ id: 'DX', kind: 'default', status: 'open', question: 'q', options: ['a'], recommend: 0 }))
    eq(run(['--adopt', ext]).status, 0)
    eq(run(['--adopt', ext]).status, 0)
    const led = readFileSync(path.join(tmp, '.helioz', 'state', 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean)
    eq(led.length, 1, 'adopt дважды не дублирует ledger')
    ok(existsSync(path.join(tmp, 'queue', 'dilemmas', 'DX.json')))

    // beat
    eq(run(['--beat', 'selftest']).status, 0)
    ok(existsSync(path.join(tmp, '.helioz', 'state', 'heartbeat.json')))

    // бюджет: нет budget.json → 2; с потолком 1 токен и нулевым расходом (пустые каталоги) → 0
    eq(run(['--budget']).status, 2, 'нет budget.json - потолок не подтверждён')
  } finally { rmSync(tmp, { recursive: true, force: true }) }

    console.log('selftest ok - разбор задач, fail-closed, пересечения, слоты, tampered, STOP, adopt, beat')
  return 0
}

// --- диспетчер ------------------------------------------------------------------------------------
async function main() {
  let v
  try {
    ({ values: v } = parseArgs({
      args: process.argv.slice(2), allowPositionals: true,
      options: {
        ready: { type: 'boolean' }, status: { type: 'boolean' }, smoke: { type: 'boolean' }, json: { type: 'boolean' },
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
  if (v.smoke) return cmdSmoke(v.json)
  if (v.start) return cmdStart(v.start, v.executor)
  if (v.finish) return cmdFinish(v.finish)
  if (v.task) return cmdTask(v.task, { checkCmd: v['check-cmd'], executor: v.executor, verifier: v.verifier, base: v.base })
  if (v.require) return cmdRequire(v.require)
  if (v.beat !== undefined) return cmdBeat(v.beat)
  if (v.budget) return cmdBudget(v.json)
  if (v.stop) { writeFileSync(stopFile(), now()); console.log('STOP поставлен'); return 0 }
  if (v.go) { rmSync(stopFile(), { force: true }); console.log('STOP снят'); return 0 }
  if (v.adopt) return cmdAdopt(v.adopt)
  console.log('helioz-gate: --ready --start --finish --task --check-cmd --require --status --smoke --beat --budget --stop --go --adopt --selftest --json')
  return 0
}
main().then(c => process.exit(c)).catch(e => { console.error(e && e.message || e); process.exit(1) })
