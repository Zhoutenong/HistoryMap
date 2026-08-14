#!/usr/bin/env node
/**
 * Android 视觉验收：11 状态自动化截图（P20 真机）。
 *
 * 用法：node scripts/capture-acceptance.mjs [--serial <serial>] [--out <dir>]
 *   --serial 默认 CLB0218A10005491（P20）；--out 默认 artifacts/acceptance/
 *
 * 依赖：adb、已安装最新 app-debug.apk。坐标基于 1080×2244 竖屏标定
 * （由 picture-reg 对运行截图定位，2026-08-13）；若布局变化需重新标定。
 *
 * 截图清单（对齐 docs/design_optimize/acceptance/README.md）：
 *   main / legend-expanded / bubble / timeline-playing / timeline-complete /
 *   detail / event-log / settings / era-banner / landscape / background-resume
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const serial = args.includes('--serial') ? args[args.indexOf('--serial') + 1] : 'CLB0218A10005491';
const outDir = args.includes('--out')
  ? args[args.indexOf('--out') + 1]
  : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'artifacts', 'acceptance');

fs.mkdirSync(outDir, { recursive: true });

function adb(...a) {
  execFileSync('adb', ['-s', serial, ...a], { stdio: 'pipe', encoding: 'utf8' });
}
function adbOut(...a) {
  return execFileSync('adb', ['-s', serial, ...a], { stdio: 'pipe', maxBuffer: 32 * 1024 * 1024 }); // buffer（二进制安全）
}
function tap(x, y) { adb('shell', 'input', 'tap', String(x), String(y)); }
function key(k) { adb('shell', 'input', 'keyevent', k); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function launch() {
  adb('shell', 'logcat', '-c'); // 清空日志，供 waitForApp 轮询
  adb('shell', 'am', 'force-stop', 'com.historymap.app');
  sleep(800);
  adb('shell', 'monkey', '-p', 'com.historymap.app', '-c', 'android.intent.category.LAUNCHER', '1');
}
/** 等待应用渲染就绪（loadDynasty 日志出现或 FPS 日志出现），避免启动期误触 */
async function waitForApp(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const log = adbOut('shell', 'logcat', '-d', '-s', 'HistoryMap').toString('utf8');
      if (/loadDynasty|fps=/.test(log)) return true;
    } catch { /* adb 抖动忽略 */ }
    await sleep(700);
  }
  console.warn('[wait] 应用就绪超时，继续尝试');
  return false;
}
async function capture(name) {
  await sleep(1200); // 等画面稳定
  const buf = adbOut('exec-out', 'screencap', '-p');
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, buf);
  console.log(`[capture] ${name}.png -> ${file.replace(/\\/g, '/')} (${(buf.length / 1024).toFixed(0)} KB)`);
}

// 坐标（1080×2244 竖屏；picture-reg 定位 2026-08-13）
const BTN = {
  dynasty: [595, 163],    // 宋 ▾
  events: [766, 164],     // ☰ 事件
  settings: [939, 164],   // ⚙
  legend: [96, 351],      // 朱砂「政权」
  play: [125, 1962],      // 时间轴播放/暂停
};
// 时间轴轨道：x 59..1007、y=2108；年份 960..1279 → px
function yearX(year) {
  const y0 = 960, y1 = 1279, x0 = 59, x1 = 1007;
  return Math.round(x0 + ((year - y0) / (y1 - y0)) * (x1 - x0));
}

// BUBBLE_1/BUBBLE_2 固定泡泡坐标已弃用：detail 改用事件流首条动态定位

// ---------- 动态定位（P20 沉浸导航栏显隐不稳定，时间轴 y 会漂移，固定坐标不可靠） ----------
import zlib from 'node:zlib';

/** 解码 PNG（8-bit RGB/RGBA，非隔行），返回 { w, h, px(x,y)->[r,g,b] } */
function decodePng(buf) {
  let pos = 8; const idat = []; let width = 0, height = 0, bitDepth = 0, colorType = 0;
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error('PNG 格式不支持');
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const pxBuf = Buffer.alloc(width * height * ch);
  const line = Buffer.alloc(stride);
  let off = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[off++];
    for (let x = 0; x < stride; x++) {
      const v = raw[off++];
      const left = x >= ch ? line[x - ch] : 0;
      const up = y > 0 ? pxBuf[(y - 1) * stride + x] : 0;
      const ul = y > 0 && x >= ch ? pxBuf[(y - 1) * stride + x - ch] : 0;
      let a = v;
      if (f === 1) a = (v + left) & 255;
      else if (f === 2) a = (v + up) & 255;
      else if (f === 3) a = (v + ((left + up) >> 1)) & 255;
      else if (f === 4) { const p = left + up - ul, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul); a = (v + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul)) & 255; }
      line[x] = a; pxBuf[y * stride + x] = a;
    }
  }
  return {
    w: width, h: height, ch, stride, pxBuf,
    px(x, y) { const i = y * stride + x * ch; return [pxBuf[i], pxBuf[i + 1], pxBuf[i + 2]]; },
  };
}

/** 截屏并解码，返回像素访问对象 */
function screenPng() {
  return decodePng(adbOut('exec-out', 'screencap', '-p'));
}

/**
 * 扫描底部区域定位：轨道 y（朱砂进度线最宽的水平带，排除左侧播放按钮 x<180）
 * 与播放按钮 y（左侧 x 90..170 的朱砂边框带）。
 * 返回 { trackY, playY, panelTop }
 */
function locateTimeline(img) {
  const { w, h, px } = img;
  const y0 = Math.floor(h * 0.52), y1 = h - 6;
  let bestRow = -1, bestVerm = 0, playRow = -1, playVerm = 0;
  const verm = (r, g, b) => r > 170 && g < 120 && b < 110;
  for (let y = y0; y < y1; y += 2) {
    let c = 0, pc = 0;
    for (let x = 180; x < w - 40; x += 3) { const p = px(x, y); if (verm(...p)) c++; } // 轨道区
    for (let x = 90; x < 175; x += 2) { const p = px(x, y); if (verm(...p)) pc++; }    // 播放按钮区
    if (c > bestVerm) { bestVerm = c; bestRow = y; }
    if (pc > playVerm) { playVerm = pc; playRow = y; }
  }
  // 播放按钮中心：边框带顶部 + ~28px（56px 设计高）
  const playY = playRow > 0 ? playRow + 28 : h - 280;
  // 面板顶部：轨道行向上回退 ~200px（面板含 3 行布局）
  const panelTop = bestRow > 0 ? bestRow - 200 : h - 340;
  console.log(`[locate] trackY=${bestRow} playY=${playY} panelTop=${panelTop} (屏高 ${h})`);
  return { trackY: bestRow, playY, panelTop };
}

/** 屏幕坐标 tap：优先用动态定位的轨道 y；fallback 固定坐标 */
let UI = null; // 每次 fresh() 后刷新
async function refreshUI() {
  try { UI = locateTimeline(screenPng()); } catch { console.warn('[locate] 失败，用固定坐标'); UI = null; }
}
/**
 * 拖拽轨道到目标年份。注意：tap 会触发「24dp 内吸附事件点 → 打开详情」，
 * 固定年份 tap 易落在事件刻度点附近误开详情；拖拽走 dragging 路径不吸附，
 * 直接连续 setYear，是设置年份的可靠方式。
 */
function dragToYear(year) {
  const ty = (UI?.trackY ?? 2108) - 0;
  const x = yearX(year);
  adb('shell', 'input', 'swipe', '100', String(ty), String(x), String(ty), '500');
}
function tapPlay() {
  const py = UI?.playY ?? 1962;
  tap(125, py);
}

/**
 * 在地图区域（避开顶栏/图例/时间轴）找事件泡泡：扫描朱砂像素密度最高的团块。
 * 泡泡为米白纸笺 + 朱砂描边 + 左侧朱砂竖条，是地图上朱砂最密集的区域之一。
 * 返回 [x, y] 中心或 null。
 */
/**
 * 在事件流抽屉中找第一条事件：扫描列表区（y 700-1300）的彩色分类条
 * （4px×22px 实心色条，x≈96）。返回行中心 [x, y] 或 null。
 */
function findFirstLogEntry(img) {
  const { h, px } = img;
  const isBar = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx - mn > 18 && r + g + b > 180 && r < 220; // 分类色（非米白/墨）
  };
  for (let y = 700; y < Math.min(1300, h); y += 3) {
    for (let x = 88; x < 122; x += 2) {
      const c = px(x, y);
      if (!isBar(...c)) continue;
      let run = 1;
      for (let dy = 1; dy < 26; dy++) {
        const q = px(x, y + dy);
        if (q[0] === c[0] && q[1] === c[1] && q[2] === c[2]) run++; else break;
      }
      if (run >= 10) {
        console.log(`[log] 首条 @(${x},${y}) 高=${run}`);
        return [x + 220, y + run / 2]; // 行中心（文字在色条右侧）
      }
    }
  }
  console.warn('[log] 未找到事件流条目');
  return null;
}

async function main() {
  const steps = process.env.CAPTURE_ONLY; // 可选：只跑指定状态（逗号分隔）
  const only = steps ? steps.split(',') : null;
  const want = (n) => !only || only.includes(n);

  // 0. 固定竖屏
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');

  // 启动 + 就绪 + 暂停自动播放（多数状态共用）
  async function fresh() {
    launch();
    await waitForApp();
    await sleep(1000);     // 等布局稳定
    await refreshUI();     // 动态定位轨道/播放按钮（导航栏显隐导致 y 漂移）
    tapPlay();             // 暂停，固定画面
    await sleep(600);
  }

  if (want('main')) {
    await fresh();
    await capture('main');
  }
  if (want('legend-expanded')) {
    await fresh();
    tap(...BTN.legend); // 展开图例
    await sleep(800);
    await capture('legend-expanded');
    tap(...BTN.legend); // 收起
    await sleep(400);
  }
  if (want('bubble')) {
    await fresh();
    dragToYear(1130); // 跳到 1130（靖康之变等事件窗口）
    await sleep(900);
    await capture('bubble');
  }
  if (want('timeline-playing')) {
    await fresh();
    dragToYear(1000);
    await sleep(400);
    tapPlay(); // 开始播放
    await sleep(1200);
    await capture('timeline-playing');
    tapPlay(); // 暂停
    await sleep(300);
  }
  if (want('timeline-complete')) {
    await fresh();
    dragToYear(1278); // 拖近终点（拖拽末位 MOVE 可能略低于目标，留 1 年余量）
    await sleep(500);
    tapPlay();        // 播放：自然推进 1278→1279 触发 completed 横幅（仅播放路径置 true）
    await sleep(1500);
    await capture('timeline-complete');
  }
  if (want('detail')) {
    await fresh(); // 年 ~990，事件流已出现若干条
    tap(...BTN.events); // 打开事件流（列表首条确定存在）
    await sleep(900);
    const entry = findFirstLogEntry(screenPng()); // 动态找首条（避免固定坐标失配）
    if (entry) {
      tap(...entry); // onPick：跳年 + 打开详情
      await sleep(1000);
      await capture('detail');
    } else {
      console.warn('[detail] 未找到事件流条目，跳过');
    }
    key('BACK'); await sleep(400); // 关详情
  }
  if (want('event-log')) {
    await fresh();
    tap(...BTN.events); // 打开事件流
    await sleep(900);
    await capture('event-log');
    key('BACK'); await sleep(400);
  }
  if (want('settings')) {
    await fresh();
    tap(...BTN.settings); // 打开设置
    await sleep(900);
    await capture('settings');
    key('BACK'); await sleep(400);
  }
  if (want('era-banner')) {
    await fresh();
    // 单次拖拽越过 1126→1127 时期边界（拖拽末位 MOVE 可能略低于目标，需明显越过）
    dragToYear(1150);
    await sleep(900); // 时期异步加载 ~1s 后横幅出现，持续 2.6s
    await capture('era-banner');
  }
  if (want('landscape')) {
    // 横屏：先启动应用，再强制关自动旋转并设横屏（auto-rotate 会覆盖 user_rotation）
    await fresh();
    adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '1');
    await sleep(2500);
    await capture('landscape');
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '0'); // 恢复竖屏
    await sleep(1000);
  }
  if (want('background-resume')) {
    await fresh();
    dragToYear(987); await sleep(800);
    key('HOME'); await sleep(2000);
    adb('shell', 'monkey', '-p', 'com.historymap.app', '-c', 'android.intent.category.LAUNCHER', '1');
    await sleep(3000);
    await capture('background-resume');
  }

  console.log(`\n完成。截图输出：${outDir.replace(/\\/g, '/')}`);
  console.log(`清单：${fs.readdirSync(outDir).filter((f) => f.endsWith('.png')).sort().join(', ')}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
