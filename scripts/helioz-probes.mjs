#!/usr/bin/env node
// ВРАЖДЕБНЫЕ ПРОБЫ КОНВЕЙЕРА (порядок стройки, п.3). Все обязаны дать правильный красный/зелёный.
// Только этот прибор пишет READY.json - и только когда все пробы зелёные. Пробы гоняются в изолированном
// HELIOZ_HOME, боевое состояние не трогается (кроме записи READY.json при успехе).
//
// Коды: 0 - все пробы правильные, READY записан · 1 - хотя бы одна проба дала неверный цвет.
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, chmodSync } from 'node:fs'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url))
const HOME = process.env.HELIOZ_HOME || path.dirname(SCRIPTS)
const ISOLATED_GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_SYSTEM: os.devNull,
}
const now = () => new Date().toISOString()
const sha256 = s => createHash('sha256').update(s).digest('hex')
const results = []
function probe(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} проба: ${name}${detail ? ' - ' + detail : ''}`)
}

function mkHome() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'helioz-probe-'))
  for (const d of ['queue/tasks', 'queue/dilemmas', '.helioz/state', 'docs', 'scripts', 'config']) mkdirSync(path.join(tmp, d), { recursive: true })
  for (const s of readdirSync(SCRIPTS)) if (s.endsWith('.mjs') || s.endsWith('.sh')) writeFileSync(path.join(tmp, 'scripts', s), readFileSync(path.join(SCRIPTS, s)))
  execFileSync('git', ['-C', tmp, 'init', '-q'], { env: ISOLATED_GIT_ENV })
  writeFileSync(path.join(tmp, 'seed.txt'), 'seed\n')
  execFileSync('git', ['-C', tmp, 'add', '-A'], { env: ISOLATED_GIT_ENV })
  execFileSync('git', ['-C', tmp, '-c', 'user.email=p@c', '-c', 'user.name=probe', 'commit', '-qm', 'seed'], { env: ISOLATED_GIT_ENV })
  writeFileSync(path.join(tmp, 'seed.txt'), 'seed\nwork\n')
  execFileSync('git', ['-C', tmp, 'add', '-A'], { env: ISOLATED_GIT_ENV })
  execFileSync('git', ['-C', tmp, '-c', 'user.email=p@c', '-c', 'user.name=probe', 'commit', '-qm', 'work'], { env: ISOLATED_GIT_ENV })
  writeFileSync(path.join(tmp, 'config', 'helioz.json'), JSON.stringify({ quiet_hours: { start: '00:00', end: '23:59' }, council: { lenses: ['риск', 'цена отката', 'простота'], min_advisors: 3 }, probe_timeout_sec: 5, run_timeout_sec: 5 }))
  const stub = path.join(tmp, 'bin-adv')
  writeFileSync(stub, '#!/bin/sh\ncat >/dev/null 2>&1\necho "ВЫБОР: 1"; echo "ПОЧЕМУ: так."; echo "РИСК ОШИБКИ: нет."\n')
  chmodSync(stub, 0o755)
  writeFileSync(path.join(tmp, 'config', 'clis.json'), JSON.stringify({
    claude: { invoke_read: [stub], invoke_write: [stub], stdin_prompt: true, roles: ['execute', 'verify', 'advise', 'synthesize'] },
    codex: { invoke_read: [stub], invoke_write: [stub], stdin_prompt: true, roles: ['execute', 'verify', 'advise', 'synthesize'] },
  }))
  writeFileSync(path.join(tmp, 'queue', 'GOAL.md'), 'Цель: пробы конвейера проходят честно.')
  return tmp
}
const task = (id, p, extra = '') => `---\nid: ${id}\npaths:\n  - ${p}\nexecutor: claude\nverifier: codex\ncheck_cmd: "true"\n${extra}---\n## Промт исполнителя\nx\n## Промт проверяющего\ny\n`
const gate = (tmp, args) => spawnSync(process.execPath, [path.join(tmp, 'scripts', 'helioz-gate.mjs'), ...args], { env: { ...ISOLATED_GIT_ENV, HELIOZ_HOME: tmp }, encoding: 'utf8' })
function receipt(tmp, id, executor = 'claude', verifier = 'codex') {
  const ex = path.join(tmp, 'scripts', 'helioz-exec.mjs')
  const env = { ...ISOLATED_GIT_ENV, HELIOZ_HOME: tmp }
  const a = spawnSync(process.execPath, [ex, 'task', '--id', id, '--role', 'executor', '--cli', executor], { env, encoding: 'utf8' })
  const b = spawnSync(process.execPath, [ex, 'task', '--id', id, '--role', 'verifier', '--cli', verifier], { env, encoding: 'utf8' })
  if (a.status !== 0 || b.status !== 0) throw new Error(`receipt ${id}: helioz-exec failed ${a.status}/${b.status}`)
}

async function main() {
  // ---- 1. Убить оркестратора посреди задачи → новый продолжает без потерь --------------------------
  {
    const tmp = mkHome()
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'A.task.md'), task('A', 'docs/a.md'))
    // B на ДРУГОМ CLI: иначе гейт честно заблокирует слот claude - проба мерила бы не «продолжение», а слоты
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'B.task.md'), task('B', 'docs/b.md').replace('executor: claude', 'executor: codex').replace('verifier: codex', 'verifier: claude'))
    gate(tmp, ['--start', 'A'])
    // «смерть» оркестратора: процесс исчез, памяти нет. Новый процесс читает ТОЛЬКО диск:
    const st = gate(tmp, ['--status', '--json'])
    const j = JSON.parse(st.stdout)
    const aRunning = j.tasks.find(t => t.task === 'A')?.state === 'running'
    const bReady = gate(tmp, ['--ready', '--json'])
    const bOk = bReady.status === 0 && JSON.parse(bReady.stdout).ready.some(r => r.task === 'B')
    // новый оркестратор доводит A: маркер пишется, ничего не потеряно
    receipt(tmp, 'A')
    const fin = gate(tmp, ['--task', 'A', '--check-cmd', 'true', '--executor', 'claude', '--verifier', 'codex'])
    const done = fin.status === 0 && gate(tmp, ['--require', 'A']).status === 0
    probe('убить оркестратора посреди задачи', aRunning && bOk && done,
      `A running с диска: ${aRunning}, B берётся: ${bOk}, A доведена новым процессом: ${done}`)
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- 2. Маркер руками / обрезанный → tampered ----------------------------------------------------
  {
    const tmp = mkHome()
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'A.task.md'), task('A', 'docs/a.md'))
    receipt(tmp, 'A')
    gate(tmp, ['--task', 'A', '--check-cmd', 'true', '--executor', 'claude', '--verifier', 'codex'])
    const mf = path.join(tmp, '.helioz', 'state', 'markers', 'A.done.json')
    const good = JSON.parse(readFileSync(mf, 'utf8'))
    // рукописный
    writeFileSync(path.join(tmp, '.helioz', 'state', 'markers', 'B.done.json'), JSON.stringify({ task: 'B', written_by: 'orchestrator', finished_at: now() }))
    const hand = gate(tmp, ['--require', 'B']).status === 2
    // обрезанный (без поля целостности)
    const cut = { ...good }; delete cut.sha_of_changed_files
    writeFileSync(mf, JSON.stringify(cut))
    const trunc = gate(tmp, ['--require', 'A']).status === 2
    probe('поддельный/обрезанный маркер → tampered', hand && trunc, `рукописный: ${hand}, обрезанный: ${trunc}`)
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- 3. Владелец молчит сутки → работа не стоит, очередь развилок цела ---------------------------
  {
    const tmp = mkHome()
    writeFileSync(path.join(tmp, 'queue', 'dilemmas', 'DW.json'), JSON.stringify({ id: 'DW', task: 'A', kind: 'expensive', question: 'q', options: ['a', 'b'], recommend: 0, status: 'asked', asked_at: new Date(Date.now() - 24 * 3600e3).toISOString(), answered_at: null, answer: null, decided_by: null, council: null, replay: [] }))
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'B.task.md'), task('B', 'docs/b.md'))
    const r = gate(tmp, ['--ready', '--json'])
    const works = r.status === 0 && JSON.parse(r.stdout).ready.some(x => x.task === 'B')
    const d = JSON.parse(readFileSync(path.join(tmp, 'queue', 'dilemmas', 'DW.json'), 'utf8'))
    const intact = d.status === 'asked' && d.answer === null
    probe('владелец молчит сутки', works && intact, `конвейер работает: ${works}, развилка цела и ждёт: ${intact}`)
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- 4. Telegram недоступен → отбивки копятся и доезжают -----------------------------------------
  {
    const tmp = mkHome()
    writeFileSync(path.join(tmp, 'tg.env'), 'HELIOZ_TELEGRAM_TOKEN=PROBETOKEN\nHELIOZ_TELEGRAM_CHAT=42\n')
    const zeus = path.join(tmp, 'scripts', 'helioz-zeus.mjs')
    const env = api => ({ ...process.env, HELIOZ_HOME: tmp, HELIOZ_TG_ENV: path.join(tmp, 'tg.env'), HELIOZ_TG_API: api })
    const runZ = (args, api) => new Promise(res => {
      const p = spawn(process.execPath, [zeus, ...args], { env: env(api) })
      let out = ''; p.stdout.on('data', c => out += c); p.on('close', status => res({ status, out }))
    })
    const dead = await runZ(['send', '--text', 'отбивка в никуда'], 'http://127.0.0.1:1')
    const obDir = path.join(tmp, '.helioz', 'state', 'outbox')
    const box = () => readdirSync(obDir).map(f => JSON.parse(readFileSync(path.join(obDir, f), 'utf8')))
    const kept = dead.status === 0 && box().some(m => !m.delivered_at)
    const { createServer } = await import('node:http')
    const srv = createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => { s.setHeader('content-type', 'application/json'); s.end(JSON.stringify({ ok: true, result: {} })) }) })
    await new Promise(r => srv.listen(0, '127.0.0.1', r))
    const fl = await runZ(['flush'], `http://127.0.0.1:${srv.address().port}`)
    srv.close()
    const delivered = fl.status === 0 && box().every(m => m.delivered_at)
    probe('Telegram недоступен', kept && delivered, `копится: ${kept}, доезжает после восстановления: ${delivered}`)
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- 5. Совету - запретная развилка → обязан отложить, не решить ---------------------------------
  {
    const tmp = mkHome()
    let all = true, det = []
    for (const kind of ['prod', 'foreign', 'expensive']) {
      writeFileSync(path.join(tmp, 'queue', 'dilemmas', `DF-${kind}.json`), JSON.stringify({ id: `DF-${kind}`, task: null, kind, question: 'q', options: ['a', 'b'], recommend: 0, status: 'asked', asked_at: now(), answered_at: null, answer: null, decided_by: null, council: null, replay: [] }))
      const r = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'helioz-council.mjs'), 'decide', '--dilemma', `DF-${kind}`, '--day'], { env: { ...process.env, HELIOZ_HOME: tmp }, encoding: 'utf8' })
      const d = JSON.parse(readFileSync(path.join(tmp, 'queue', 'dilemmas', `DF-${kind}.json`), 'utf8'))
      const ok = r.status === 2 && d.decided_by === null && d.status === 'asked'
      all = all && ok; det.push(`${kind}: ${ok}`)
    }
    probe('совету запретная развилка', all, det.join(', '))
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- 6. Два исполнителя на пересекающихся файлах → второй не стартует ----------------------------
  {
    const tmp = mkHome()
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'A.task.md'), task('A', 'docs/shared.md'))
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'B.task.md'), task('B', 'docs/shared.md', '').replace('executor: claude', 'executor: codex').replace('verifier: codex', 'verifier: claude'))
    const s1 = gate(tmp, ['--start', 'A']).status === 0
    const s2 = gate(tmp, ['--start', 'B']).status === 5
    probe('пересекающиеся файлы', s1 && s2, `первый стартовал: ${s1}, второй отвергнут кодом (exit 5): ${s2}`)
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- 7. Маркер связан с frozen-редакцией задачи --------------------------------------------------
  {
    const tmp = mkHome()
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'A.task.md'), task('A', 'docs/a.md'))
    receipt(tmp, 'A')
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'A.task.md'), task('A', 'docs/a.md').replace('x\n## Промт проверяющего', 'x изменен\n## Промт проверяющего'))
    const r = gate(tmp, ['--task', 'A', '--check-cmd', 'true', '--executor', 'claude', '--verifier', 'codex'])
    probe('exec-квитанция старой редакции задачи', r.status === 2, `код ${r.status}`)
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- 8. Новые поля маркера обязательны -----------------------------------------------------------
  {
    const tmp = mkHome()
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'A.task.md'), task('A', 'docs/a.md'))
    receipt(tmp, 'A')
    gate(tmp, ['--task', 'A', '--check-cmd', 'true', '--executor', 'claude', '--verifier', 'codex'])
    const mf = path.join(tmp, '.helioz', 'state', 'markers', 'A.done.json')
    const m = JSON.parse(readFileSync(mf, 'utf8'))
    delete m.external_sha
    writeFileSync(mf, JSON.stringify(m, null, 2) + '\n')
    const r = gate(tmp, ['--require', 'A'])
    probe('маркер без external_sha красный', r.status === 2, `код ${r.status}`)
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- 9. Exec-квитанция без логов не доказательство ----------------------------------------------
  {
    const tmp = mkHome()
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'A.task.md'), task('A', 'docs/a.md'))
    receipt(tmp, 'A')
    rmSync(path.join(tmp, '.helioz', 'state', 'logs'), { recursive: true, force: true })
    const r = gate(tmp, ['--task', 'A', '--check-cmd', 'true', '--executor', 'claude', '--verifier', 'codex'])
    probe('exec-квитанция без логов красная', r.status === 2, `код ${r.status}`)
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- 10. Рукописная exec-квитанция не доказательство --------------------------------------------
  {
    const tmp = mkHome()
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'A.task.md'), task('A', 'docs/a.md'))
    const taskText = readFileSync(path.join(tmp, 'queue', 'tasks', 'A.task.md'), 'utf8')
    mkdirSync(path.join(tmp, '.helioz', 'state', 'exec'), { recursive: true })
    mkdirSync(path.join(tmp, '.helioz', 'state', 'logs'), { recursive: true })
    writeFileSync(path.join(tmp, '.helioz', 'state', 'logs', 'A-executor-claude.log'), 'fake\n')
    writeFileSync(path.join(tmp, '.helioz', 'state', 'logs', 'A-verifier-codex.log'), 'fake\n')
    writeFileSync(path.join(tmp, '.helioz', 'state', 'exec', 'A.json'), JSON.stringify({
      executor_task_sha: sha256(taskText), verifier_task_sha: sha256(taskText),
      executor_used: 'claude', verifier_used: 'codex', executor_code: 0, verifier_code: 0,
      executor_log: '.helioz/state/logs/A-executor-claude.log',
      verifier_log: '.helioz/state/logs/A-verifier-codex.log',
    }, null, 2) + '\n')
    const r = gate(tmp, ['--task', 'A', '--check-cmd', 'true', '--executor', 'claude', '--verifier', 'codex'])
    probe('рукописная exec-квитанция красная', r.status === 2, `код ${r.status}`)
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- 11. Подмена лога после подписанной квитанции ломает подпись --------------------------------
  {
    const tmp = mkHome()
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'A.task.md'), task('A', 'docs/a.md'))
    receipt(tmp, 'A')
    writeFileSync(path.join(tmp, '.helioz', 'state', 'logs', 'A-verifier-codex.log'), 'tampered\n')
    const r = gate(tmp, ['--task', 'A', '--check-cmd', 'true', '--executor', 'claude', '--verifier', 'codex'])
    probe('подмена exec-лога красная', r.status === 2, `код ${r.status}`)
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- 12. Неканонический check_cmd не исполняется -------------------------------------------------
  {
    const tmp = mkHome()
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'A.task.md'), task('A', 'docs/a.md'))
    receipt(tmp, 'A')
    const flag = path.join(tmp, 'should-not-exist')
    const r = gate(tmp, ['--task', 'A', '--check-cmd', `touch ${flag}`, '--executor', 'claude', '--verifier', 'codex'])
    probe('чужой check_cmd не исполняется', r.status === 2 && !existsSync(flag), `код ${r.status}`)
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- 13. executor==verifier в задаче invalid -----------------------------------------------------
  {
    const tmp = mkHome()
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'A.task.md'), task('A', 'docs/a.md').replace('verifier: codex', 'verifier: claude'))
    const r = gate(tmp, ['--ready', '--json'])
    const invalid = r.status === 2 && JSON.parse(r.stdout).invalid.includes('A')
    probe('executor==verifier invalid', invalid, `код ${r.status}`)
    rmSync(tmp, { recursive: true, force: true })
  }

  // ---- итог: READY пишется только при всех правильных цветах ---------------------------------------
  const allOk = results.length === 13 && results.every(r => r.ok)
  if (allOk) {
    const head = (() => { try { return execFileSync('git', ['-C', HOME, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return null } })()
    writeFileSync(path.join(HOME, '.helioz', 'state', 'READY.json'), JSON.stringify({
      written_by: 'helioz-probes', probes: results.map(r => r.name), head, at: now(),
    }, null, 2) + '\n')
    console.log('READY.json записан - конвейер готов принимать чужую работу (--adopt)')
    return 0
  }
  console.error(`ПРОБЫ НЕ ПРОЙДЕНЫ: ${results.filter(r => !r.ok).map(r => r.name).join('; ')} - READY не пишется`)
  return 1
}
main().then(c => process.exit(c)).catch(e => { console.error(String(e && e.stack || e)); process.exit(1) })
