#!/usr/bin/env node
// Сброс окна бюджета: started_at на сейчас, потолок не трогаем. Без него потолок однажды
// упрётся навсегда, потому что расход считается накопительно от даты старта.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HOME = process.env.HELIOZ_HOME || path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const f = path.join(HOME, '.helioz', 'state', 'budget.json')
if (!existsSync(f)) { console.error('нет budget.json - сначала задай потолок'); process.exit(2) }
const b = JSON.parse(readFileSync(f, 'utf8'))
const prev = b.started_at
b.started_at = new Date().toISOString()
writeFileSync(f, JSON.stringify(b, null, 2) + '\n')
console.log(`окно бюджета сброшено: было ${prev}, стало ${b.started_at}, потолок $${b.ceiling_usd ?? '-'}`)
