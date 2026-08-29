#!/usr/bin/env node
// ИСПОЛНИТЕЛЬНЫЙ ПРИБОР - зонд CLI настоящим прогоном, ротация без простоя, запуск ролей.
// Уроки П26: зонд «provider list» лжет (зеленый при мертвом вызове) - зондируем НАСТОЯЩИМ прогоном.
// Контракт C: исполнитель и проверяющий - разные CLI; проверяющий слеп к отчету исполнителя
// (получает ТОЛЬКО свой промт из задачи - отчет исполнителя сюда физически не передается).
//
//   probe [--cli X | --all] [--force]   живой прогон «скажи одно слово: жив» → cli-health.json
//   pick --role execute|verify|advise [--exclude a,b] [--prefer X]   выбор живого CLI ротацией
//   task --id T01 --role executor|verifier [--cli X]   извлечь промт роли из задачи и прогнать CLI
//   run --cli X --prompt-file F [--write] [--timeout N] [--log L]    сырой запуск
//   --selftest                          стаб-бинари, ни одного живого вызова
//
// Коды: 0 ok · 1 прогон красный · 2 fail-closed (нет живых CLI / нет задачи / роль без промта).
import { parseArgs } from 'node:util'
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, chmodSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.HELIOZ_HOME || path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CFG = (() => { try { return JSON.parse(readFileSync(path.join(HOME, 'config', 'helioz.json'), 'utf8')) } catch { return {} } })()
const CLIS = (() => { try { return JSON.parse(readFileSync(path.join(HOME, 'config', 'clis.json'), 'utf8')) } catch { return {} } })()
const STATE = path.join(HOME, '.helioz', 'state')
const HEALTH = path.join(STATE, 'cli-health.json')
const now = () => new Date().toISOString()
const cliNames = () => Object.keys(CLIS).filter(k => !k.startsWith('_'))
const sha256 = s => createHash('sha256').update(s).digest('hex')
const EXEC_SECRET = path.join(STATE, 'exec', '.secret')

function ensureExecSecret() {
  mkdirSync(path.dirname(EXEC_SECRET), { recursive: true })
  if (!existsSync(EXEC_SECRET)) {
    writeFileSync(EXEC_SECRET, randomBytes(32).toString('hex') + '\n', { mode: 0o600 })
  }
  return readFileSync(EXEC_SECRET, 'utf8').trim()
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
function signReceipt(rec) {
  return sha256(ensureExecSecret() + '\0' + JSON.stringify(receiptPayload(rec)))
}

// --- запуск одного CLI ----------------------------------------------------------------------------
function invokeCli(name, prompt, { write = false, timeoutSec } = {}) {
  const c = CLIS[name]
  if (!c) return { ok: false, code: 2, note: `CLI ${name} не в реестре` }
  const inv = write ? c.invoke_write : (c.invoke_read || c.invoke_write)
  if (!inv) return { ok: false, code: 2, note: `у ${name} нет invoke для этой роли (write=${write})` }
  const args = [...inv.slice(1)]
  let input
  if (c.stdin_prompt) input = prompt
  else args.push(prompt) // kimi: только аргументом (справка-CLI: stdin у него нет)
  const t0 = Date.now()
  const r = spawnSync(inv[0], args, {
    input, encoding: 'utf8', cwd: HOME,
    timeout: (timeoutSec || CFG.run_timeout_sec || 900) * 1000,
    env: { ...process.env }, maxBuffer: 32 * 1024 * 1024,
  })
  const out = (r.stdout || '').trim()
  return {
    ok: r.status === 0 && out.length > 0, // пустой ответ = мертв, даже при коде 0 (fail-closed)
    code: r.status ?? 1, stdout: out, stderr: (r.stderr || '').slice(0, 4000),
    ms: Date.now() - t0, timed_out: Boolean(r.error && r.error.code === 'ETIMEDOUT'),
  }
}

// --- зонд настоящим прогоном ----------------------------------------------------------------------
function readHealth() { try { return JSON.parse(readFileSync(HEALTH, 'utf8')) } catch { return {} } }
function probeOne(name) {
  const r = invokeCli(name, 'Ответь ровно одним словом без чего-либо еще: жив', { write: false, timeoutSec: CFG.probe_timeout_sec || 90 })
  const h = readHealth()
  h[name] = { alive: r.ok, at: now(), ms: r.ms, note: r.ok ? null : (r.timed_out ? 'timeout' : `code ${r.code}${r.stdout ? '' : ', пустой ответ'}`) }
  mkdirSync(STATE, { recursive: true })
  writeFileSync(HEALTH, JSON.stringify(h, null, 2) + '\n')
  console.log(`${name}: ${r.ok ? 'жив' : 'МЕРТВ'} (${r.ms}ms${h[name].note ? ', ' + h[name].note : ''})`)
  return r.ok
}
function cmdProbe(cli, all) {
  const targets = all ? cliNames() : [cli]
  if (!targets[0]) { console.error('probe: --cli или --all'); return 2 }
  let alive = 0
  for (const t of targets) if (probeOne(t)) alive++
  return alive > 0 ? 0 : 2 // все мертвы → fail-closed, оркестратору STOP+отбивка
}

// --- ротация: квота умерла → следующий; восстановился → вернулся; простой запрещен ---------------
function cmdPick(role, excludeCsv, prefer) {
  const exclude = new Set((excludeCsv || '').split(',').map(s => s.trim()).filter(Boolean))
  const roleKey = { execute: 'execute', executor: 'execute', verify: 'verify', verifier: 'verify', advise: 'advise', synthesize: 'synthesize' }[role]
  if (!roleKey) { console.error(`pick: неизвестная роль ${role}`); return 2 }
  let candidates = cliNames().filter(n => (CLIS[n].roles || []).includes(roleKey) && !exclude.has(n))
  if (prefer && candidates.includes(prefer)) candidates = [prefer, ...candidates.filter(c => c !== prefer)]
  const h = readHealth()
  const fresh = n => h[n] && (Date.now() - Date.parse(h[n].at)) < 10 * 60 * 1000
  for (const n of candidates) {
    const alive = fresh(n) ? h[n].alive : probeOne(n)
    if (alive) { console.log(n); return 0 }
  }
  console.error(`pick: живых CLI для роли ${roleKey} нет (кандидаты: ${candidates.join(', ') || 'пусто'})`)
  return 2
}

// --- прогон роли по задаче ------------------------------------------------------------------------
function loadTask(id) {
  const f = path.join(HOME, 'queue', 'tasks', `${id}.task.md`)
  if (!existsSync(f)) return null
  const text = readFileSync(f, 'utf8')
  const sec = name => { const m = text.match(new RegExp(`##\\s*${name}\\n([\\s\\S]*?)(?=\\n##\\s|$)`)); return m ? m[1].trim() : '' }
  const fm = k => { const m = text.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : '' }
  return { id, task_sha: sha256(text), executor: fm('executor'), verifier: fm('verifier'), executor_prompt: sec('Промт исполнителя'), verifier_prompt: sec('Промт проверяющего') }
}
function cmdTask(id, role, forcedCli) {
  const t = loadTask(id)
  if (!t) { console.error(`задача ${id} не найдена`); return 2 }
  const isExec = role === 'executor'
  const prompt = isExec ? t.executor_prompt : t.verifier_prompt
  if (!prompt) { console.error(`у задачи ${id} нет промта роли ${role} - fail-closed`); return 2 }
  // выбор CLI: исполнителю - предпочтение задачи; проверяющему - исключить ФАКТИЧЕСКОГО исполнителя
  const execRec = (() => { try { return JSON.parse(readFileSync(path.join(STATE, 'exec', `${id}.json`), 'utf8')) } catch { return {} } })()
  let cli = forcedCli
  if (!cli) {
    const verifierPref = t.verifier && t.verifier !== execRec.executor_used ? t.verifier : ''
    const pick = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'pick',
      '--role', isExec ? 'execute' : 'verify',
      ...(isExec
        ? (t.executor ? ['--prefer', t.executor] : [])
        : ['--exclude', execRec.executor_used || '', ...(verifierPref ? ['--prefer', verifierPref] : [])]),
    ], { encoding: 'utf8', env: process.env })
    if (pick.status !== 0) { process.stderr.write(pick.stderr || ''); return 2 }
    cli = pick.stdout.trim().split('\n').pop()
  }
  if (!isExec && execRec.executor_used && cli === execRec.executor_used) {
    console.error(`ОТКАЗ: проверяющий ${cli} совпал с исполнителем - генератор не судит себя`); return 2
  }
  const header = `Рабочий каталог: ${HOME}. Задача ${id}, роль: ${isExec ? 'исполнитель' : 'проверяющий'}.\n` +
    (isExec ? '' : 'Ты проверяешь ТОЛЬКО по диску и командам - никаких отчетов исполнителя не существует.\n')
  const r = invokeCli(cli, header + '\n' + prompt, { write: isExec })
  mkdirSync(path.join(STATE, 'logs'), { recursive: true })
  const log = path.join(STATE, 'logs', `${id}-${role}-${cli}.log`)
  writeFileSync(log, `# ${now()} · ${id} · ${role} · ${cli} · code ${r.code} · ${r.ms}ms\n\n${r.stdout}\n\n--- stderr ---\n${r.stderr}\n`)
  const rec = {
    ...execRec,
    [`${role}_task_sha`]: t.task_sha,
    [`${role}_used`]: cli,
    [`${role}_at`]: now(),
    [`${role}_code`]: r.code,
    [`${role}_log`]: path.relative(HOME, log),
  }
  delete rec.receipt_sig
  rec.written_by = 'helioz-exec'
  rec.receipt_version = 1
  rec.receipt_sig = signReceipt(rec)
  mkdirSync(path.join(STATE, 'exec'), { recursive: true })
  writeFileSync(path.join(STATE, 'exec', `${id}.json`), JSON.stringify(rec, null, 2) + '\n')
  console.log(JSON.stringify({ ok: r.ok, cli, code: r.code, ms: r.ms, log: rec[`${role}_log`] }))
  return r.ok ? 0 : 1
}

function cmdRun(cli, promptFile, write, timeoutSec, log) {
  if (!existsSync(promptFile || '')) { console.error('нет --prompt-file'); return 2 }
  const r = invokeCli(cli, readFileSync(promptFile, 'utf8'), { write, timeoutSec })
  if (log) { mkdirSync(path.dirname(log), { recursive: true }); writeFileSync(log, r.stdout + '\n--- stderr ---\n' + r.stderr) }
  else console.log(r.stdout)
  return r.ok ? 0 : 1
}

// --- selftest: стаб-бинари ------------------------------------------------------------------------
async function cmdSelftest() {
  const { strictEqual: eq, ok } = await import('node:assert')
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'helioz-exec-'))
  try {
    const bin = path.join(tmp, 'bin'); mkdirSync(bin, { recursive: true })
    const mkbin = (name, script) => { const f = path.join(bin, name); writeFileSync(f, '#!/bin/sh\n' + script + '\n'); chmodSync(f, 0o755); return f }
    // стабы: alive отвечает; broken падает (аналог kimi -y -p); empty отвечает пустотой при коде 0; slow спит
    const alive = mkbin('alive', 'cat >/dev/null 2>&1 || true; echo жив')
    const aliveArg = mkbin('alive-arg', 'echo "получил: $2"')
    const broken = mkbin('broken', 'echo "error: Cannot combine --prompt with --yolo." >&2; exit 1')
    const empty = mkbin('empty', 'exit 0')
    mkdirSync(path.join(tmp, 'config'), { recursive: true })
    mkdirSync(path.join(tmp, 'queue', 'tasks'), { recursive: true })
    writeFileSync(path.join(tmp, 'config', 'helioz.json'), JSON.stringify({ probe_timeout_sec: 5, run_timeout_sec: 5 }))
    const clis = {
      claude: { invoke_read: [alive, '-p'], invoke_write: [alive, '-p', '--w'], stdin_prompt: true, roles: ['execute', 'verify', 'advise', 'synthesize'] },
      codex: { invoke_read: [broken, 'exec'], invoke_write: [broken, 'exec'], stdin_prompt: true, roles: ['execute', 'verify', 'advise'] },
      kimi: { invoke_read: [aliveArg, '-p'], invoke_write: null, stdin_prompt: false, roles: ['verify', 'advise'] },
    }
    writeFileSync(path.join(tmp, 'config', 'clis.json'), JSON.stringify(clis))
    const self = fileURLToPath(import.meta.url)
    const run = (args) => spawnSync(process.execPath, [self, ...args], { env: { ...process.env, HELIOZ_HOME: tmp }, encoding: 'utf8' })

    // 1. Зонд: живой зеленый, сломанный вызов КРАСНЫЙ (не «provider list зеленый»), пустой ответ КРАСНЫЙ.
    eq(run(['probe', '--cli', 'claude']).status, 0)
    const rb = run(['probe', '--cli', 'codex'])
    eq(rb.status, 2, 'сломанный invoke обязан давать красный зонд')
    ok(rb.stdout.includes('МЕРТВ'))
    clis.codex.invoke_read = [empty]; writeFileSync(path.join(tmp, 'config', 'clis.json'), JSON.stringify(clis))
    ok(run(['probe', '--cli', 'codex', '--force']).stdout.includes('МЕРТВ'), 'пустой ответ при коде 0 = мертв')
    clis.codex.invoke_read = [broken, 'exec']; writeFileSync(path.join(tmp, 'config', 'clis.json'), JSON.stringify(clis))

    // 2. Ротация: предпочтенный мертв → берем следующего живого. Все мертвы → 2.
    const p1 = run(['pick', '--role', 'execute', '--prefer', 'codex'])
    eq(p1.status, 0); eq(p1.stdout.trim().split('\n').pop(), 'claude', 'мертвый codex заменен живым claude')
    const p2 = run(['pick', '--role', 'execute', '--exclude', 'claude,codex'])
    eq(p2.status, 2, 'нет живых для роли - fail-closed (kimi не execute)')

    // 3. Промт аргументом для не-stdin CLI (kimi-стиль).
    const pv = run(['pick', '--role', 'verify', '--exclude', 'claude,codex'])
    eq(pv.stdout.trim().split('\n').pop(), 'kimi')

    // 4. task: исполнитель бежит, проверяющий НЕ может совпасть с исполнителем.
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'T9.task.md'), [
      '---', 'id: T9', 'executor: claude', 'verifier: kimi', 'check_cmd: "true"', '---',
      '## Промт исполнителя', 'сделай дело', '## Промт проверяющего', 'проверь диск',
    ].join('\n'))
    const e1 = run(['task', '--id', 'T9', '--role', 'executor'])
    eq(e1.status, 0)
    const rec = JSON.parse(readFileSync(path.join(tmp, '.helioz', 'state', 'exec', 'T9.json'), 'utf8'))
    eq(rec.executor_used, 'claude')
    eq(rec.written_by, 'helioz-exec')
    ok(rec.receipt_sig && rec.receipt_sig.length === 64, 'exec-квитанция подписана')
    ok(existsSync(path.join(tmp, rec.executor_log)), 'лог исполнителя на диске')
    const v1 = run(['task', '--id', 'T9', '--role', 'verifier', '--cli', 'claude'])
    eq(v1.status, 2, 'проверяющий = исполнитель → отказ (генератор не судит себя)')
    const v2 = run(['task', '--id', 'T9', '--role', 'verifier'])
    eq(v2.status, 0)
    const rec2 = JSON.parse(readFileSync(path.join(tmp, '.helioz', 'state', 'exec', 'T9.json'), 'utf8'))
    ok(rec2.verifier_used && rec2.verifier_used !== 'claude', 'ротация выбрала другой CLI')

    // 5. Роль без промта → 2.
    writeFileSync(path.join(tmp, 'queue', 'tasks', 'T10.task.md'), '---\nid: T10\ncheck_cmd: "true"\n---\n## Промт исполнителя\nx\n')
    eq(run(['task', '--id', 'T10', '--role', 'verifier']).status, 2)

    console.log('selftest ok - честный зонд (сломанный/пустой = красный), ротация, kimi-аргумент, generator≠verifier, логи')
    return 0
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

// --- диспетчер ------------------------------------------------------------------------------------
async function main() {
  const { values: v, positionals } = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: {
      cli: { type: 'string' }, all: { type: 'boolean' }, force: { type: 'boolean' },
      role: { type: 'string' }, exclude: { type: 'string' }, prefer: { type: 'string' },
      id: { type: 'string' }, 'prompt-file': { type: 'string' }, write: { type: 'boolean' },
      timeout: { type: 'string' }, log: { type: 'string' }, selftest: { type: 'boolean' },
    },
  })
  if (v.selftest) return cmdSelftest()
  const cmd = positionals[0]
  if (cmd === 'probe') return cmdProbe(v.cli, v.all)
  if (cmd === 'pick') return cmdPick(v.role, v.exclude, v.prefer)
  if (cmd === 'task') return cmdTask(v.id, v.role, v.cli)
  if (cmd === 'run') return cmdRun(v.cli, v['prompt-file'], v.write, Number(v.timeout) || 0, v.log)
  console.log('helioz-exec: probe --cli|--all · pick --role [--exclude,--prefer] · task --id --role [--cli] · run --cli --prompt-file [--write] | --selftest')
  return 0
}
main().then(c => process.exit(c)).catch(e => { console.error(String(e && e.message || e)); process.exit(1) })
