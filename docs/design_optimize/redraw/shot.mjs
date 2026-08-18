#!/usr/bin/env node
/**
 * 演示管线 · 截图验证脚本：无头 Chromium 渲染重绘 HTML → PNG，
 * 供 modlens 二次识图与源图比对。
 * 用法：node docs/design_optimize/redraw/shot.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = 'file:///' + path.join(__dirname, 'prompt4-redraw.html').replace(/\\/g, '/');
const out = path.join(__dirname, 'prompt4-redraw.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 872, height: 1804 }, deviceScaleFactor: 1 });
await page.goto(url);
await page.waitForTimeout(800);
await page.evaluate(() => {
  // 隐藏演示用标注开关，避免进入成片
  document.querySelector('.anno-toggle').style.display = 'none';
  document.title = 'prompt4-redraw';
});
await page.screenshot({ path: out });
await browser.close();
console.log(`[shot] ${out.replace(/\\/g, '/')}`);