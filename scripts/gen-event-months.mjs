#!/usr/bin/env node
// 生成事件月级日期 seed（server/data/seed/10-event-months.sql）。
// 数据源：.data-months/<dynasty>.json（由历史考据子代理研究生成，见 AGENTS.md「时空数据库」章节旁注）。
// 输出：按 (dynasty_id, year, short) 身份的 UPDATE 语句，幂等可重跑。
// 用法：node scripts/gen-event-months.mjs
//
// 约束：
// - month/month_end 均为 1-12；若 year_end == year（单年事件）则 month_end 至少取 month，
//   保证窗口 [year·month, year_end·month_end] 有效（起点不晚于终点）。
// - short 内单引号做 SQL 转义（''），避免值含撇号导致语句断裂。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, '.data-months');
const OUT = join(ROOT, 'server', 'data', 'seed', '10-event-months.sql');

const FILES = ['song.json', 'jin.json', 'liao.json', 'yuan.json', 'tang.json'];

function esc(s) {
  return String(s).replace(/'/g, "''");
}
function clampMonth(m, def = 1) {
  const v = Number(m);
  return Number.isFinite(v) && v >= 1 && v <= 12 ? Math.round(v) : def;
}

const lines = [];
lines.push('-- 事件月级日期（月份化）：按 (dynasty_id, year, short) 身份 UPDATE 全部事件的 month/month_end。');
lines.push('-- 由 scripts/gen-event-months.mjs 从 .data-months/*.json 生成，幂等可重跑（提交前请勿手改）。');
lines.push('-- month 为事件发生月；month_end 为显示窗口结束月（对应原 year_end，多为跨年窗口的近似）。');
lines.push('');

let total = 0;
for (const file of FILES) {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) continue;
  const dynasty = file.replace(/\.json$/, '');
  const rows = JSON.parse(readFileSync(path, 'utf8'));
  rows.forEach((r) => {
    const y = Number(r.year);
    if (!Number.isFinite(y)) return;
    const short = String(r.short || '').trim();
    if (!short) return;
    let m = clampMonth(r.month, 1);
    let me = clampMonth(r.monthEnd, 12); // 缺省 12：与 schema month_end DEFAULT 12 同语义（跨年窗口整年可见）
    if (Number(r.yearEnd ?? r.year) === y && me < m) me = m; // 单年窗口：终点不早于起点
    const note = (r.note || '').replace(/\s+/g, ' ').trim();
    const conf = r.confidence || 'medium';
    if (note) lines.push(`-- [${conf}] ${note}`);
    lines.push(
      `UPDATE events SET month = ${m}, month_end = ${me} ` +
        `WHERE dynasty_id = '${dynasty}' AND year = ${y} AND short = '${esc(short)}';`
    );
    total++;
  });
}

lines.push('');
lines.push(`-- 共 ${total} 条事件`);
writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(`[gen-event-months] 已写入 ${OUT}（${total} 条 UPDATE）`);
