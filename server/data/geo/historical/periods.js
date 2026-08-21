// periods.json 共享单例（A3 后端结果级缓存的一部分）：
// meta.js 与 routes/overlay.js 原先各读各的 periods.json，现统一走本模块，
// 首次读取后缓存解析结果；文件 mtime 变化（开发期改数据）时自动重读。
// 下游只读返回对象（不得就地修改）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PERIODS_PATH = path.join(__dirname, 'periods.json');

let cached = null;
let cachedMtimeMs = null;

/**
 * 读取 periods.json 索引（单例 + mtime 失效）。
 * @returns {object|null} 解析结果；文件缺失/损坏返回 null
 */
export function getPeriodsIndex() {
  let stat;
  try {
    stat = fs.statSync(PERIODS_PATH);
  } catch {
    cached = null;
    cachedMtimeMs = null;
    return null;
  }
  if (cached && cachedMtimeMs === stat.mtimeMs) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(PERIODS_PATH, 'utf8'));
    cachedMtimeMs = stat.mtimeMs;
    return cached;
  } catch {
    cached = null;
    cachedMtimeMs = null;
    return null;
  }
}
