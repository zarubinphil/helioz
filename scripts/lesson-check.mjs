#!/usr/bin/env node
// Ворота учебной задачи T001: LESSON-1.md обязан детерминированно соответствовать config/clis.json.
// Fail-closed: нет файла / пустой / нет строки CLI / роли не совпали → exit 1.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HOME = process.env.CONVEYOR_HOME || path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const target = process.argv[2] || path.join(HOME, 'docs', 'LESSON-1.md')

let text
try { text = readFileSync(target, 'utf8') } catch { console.error(`красный: нет файла ${target}`); process.exit(1) }
if (!text.trim()) { console.error('красный: файл пуст'); process.exit(1) }
if (!text.includes('|')) { console.error('красный: нет таблицы'); process.exit(1) }

const clis = JSON.parse(readFileSync(path.join(HOME, 'config', 'clis.json'), 'utf8'))
for (const [name, c] of Object.entries(clis)) {
  if (name.startsWith('_')) continue
  const row = text.split('\n').find(l => l.includes('|') && l.includes(name))
  if (!row) { console.error(`красный: нет строки таблицы для ${name}`); process.exit(1) }
  for (const role of c.roles || []) {
    if (!row.includes(role)) { console.error(`красный: у ${name} в таблице нет роли ${role}`); process.exit(1) }
  }
}
console.log('зелёный: таблица соответствует config/clis.json')
