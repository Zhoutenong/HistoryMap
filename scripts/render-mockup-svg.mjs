/**
 * 复刻 prompt_1.png（宋 1127 截图）为 SVV 的生成脚本。
 * 数据源全部来自项目真实数据：
 *   - server/data/geo/china.json           现代省界底图（轮廓、描边）
 *   - server/data/geo/historical/regimes-1100.json   辽/宋/西夏/吐蕃/大理 水彩色块
 *   - server/data/geo/historical/regimes-1200.json   金  水彩色块（1127 过渡年）
 * 用法：node scripts/render-mockup-svg.mjs
 * 输出：docs/design_optimize/prompt_1_recreated.svg
 *
 * 视觉语言与 client/src/theme.js + styles.css 的 token 对齐：
 *   bg #e6d8b5 / text #3a3428 / accent #b03a2e / accentText #fdf8ec
 *   panelBg rgba(244,240,228,0.96) / bubble 纸卡 + 朱砂竖条印章 + 顶部小圆点
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const GEO = join(ROOT, 'server', 'data', 'geo')

const W = 870
const H = 1808
const TOPBAR_H = 56

// —— 主题 token（与 client/src/theme.js 对齐）——
const T = {
  bg: '#e6d8b5',
  text: '#3a3428',
  panelBg: 'rgba(244,240,228,0.96)',
  panelBorder: 'rgba(58,52,40,0.28)',
  accent: '#b03a2e',
  accentText: '#fdf8ec',
  bubbleBg: 'rgba(250,246,235,0.94)',
  bubbleBorder: 'rgba(176,58,46,0.45)',
  mapProvince: '#e6dfc8',
  mapEdge: '#8a8272',
  timelineTrack: 'rgba(58,52,40,0.14)',
  timelineProgressStart: '#b03a2e',
  timelineProgressEnd: '#d49a2a',
  timelineThumb: '#fdf8ec',
  timelineThumbBorder: '#b03a2e',
}

const FONT_SERIF = '"Noto Serif SC","Songti SC","STSong",serif'
const FONT_SANS = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'

// —— GeoJSON 读取 ——
function loadJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}
const china = loadJson(join(GEO, 'china.json'))
const r11 = loadJson(join(GEO, 'historical', 'regimes-1100.json'))
const r12 = loadJson(join(GEO, 'historical', 'regimes-1200.json'))

// —— 坐标收集（用于 bbox：现代底图）——
function* walkCoords(geom) {
  if (!geom) return
  const t = geom.type
  const c = geom.coordinates
  if (t === 'Point') { yield c; return }
  if (t === 'MultiPoint') { for (const p of c) yield p; return }
  if (t === 'LineString') { for (const p of c) yield p; return }
  if (t === 'MultiLineString') { for (const l of c) for (const p of l) yield p; return }
  if (t === 'Polygon') { for (const ring of c) for (const p of ring) yield p; return }
  if (t === 'MultiPolygon') { for (const poly of c) for (const ring of poly) for (const p of ring) yield p; return }
}

function bboxOf(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const f of features) {
    for (const [x, y] of walkCoords(f.geometry)) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY }
}

// —— 投影：经度线性，纬度用 Web Mercator 形式拉升，适配地图矩形 ——
function mercator(lat) {
  const r = (lat * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + r / 2))
}
function makeProject(bbox, rect) {
  const yMin = mercator(bbox.minY), yMax = mercator(bbox.maxY)
  const sx = rect.w / (bbox.maxX - bbox.minX)
  const sy = rect.h / (yMax - yMin)
  const s = Math.min(sx, sy)
  const ox = rect.x + (rect.w - (bbox.maxX - bbox.minX) * s) / 2
  const oy = rect.y + (rect.h - (yMax - yMin) * s) / 2
  return ([lon, lat]) => [ox + (lon - bbox.minX) * s, oy + (yMax - mercator(lat)) * s]
}

// 地图区域（顶栏下 → 详情卡片区上）
const MAP_RECT = { x: 6, y: TOPBAR_H + 12, w: W - 12, h: 1240 }

const chinaBBox = bboxOf(china.features)
const proj = makeProject(chinaBBox, MAP_RECT)

// —— 几何 → SVG path ——
function geomToPath(geom, projFn, decimals = 1) {
  const c = geom.coordinates
  const polys = geom.type === 'Polygon' ? [c] : c // MultiPolygon
  const paths = []
  for (const poly of polys) {
    for (const ring of poly) {
      if (ring.length < 3) continue
      let d = `M${ring.map(p => { const [x, y] = projFn(p); return `${x.toFixed(decimals)} ${y.toFixed(decimals)}` }).join('L')}Z`
      paths.push(d)
    }
  }
  return paths
}

const R = 0.05 // 数值四舍五入到 2 位

// —— 组装 ——
const out = []
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT_SERIF}">`)
out.push(`<defs>`)
// 宣纸颗粒纹理
out.push(`<filter id="grain" x="0" y="0" width="100%" height="100%">`)
out.push(`<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" stitchTiles="stitch"/>`)
out.push(`<feColorMatrix type="matrix" values="0 0 0 0 0.30  0 0 0 0 0.27  0 0 0 0 0.20  0 0 0 0.06 0"/>`)
out.push(`</filter>`)
// 顶栏渐变
out.push(`<linearGradient id="topbar" x1="0" y1="0" x2="0" y2="1">`)
out.push(`<stop offset="0" stop-color="rgba(250,246,235,0.94)"/>`)
out.push(`<stop offset="1" stop-color="rgba(250,246,235,0.60)"/>`)
out.push(`</linearGradient>`)
// 时间轴进度渐变
out.push(`<linearGradient id="prog" x1="0" y1="0" x2="1" y2="0">`)
out.push(`<stop offset="0" stop-color="${T.timelineProgressStart}"/>`)
out.push(`<stop offset="1" stop-color="${T.timelineProgressEnd}"/>`)
out.push(`</linearGradient>`)
// 水彩 soft 阴影
out.push(`<filter id="soft" x="-30%" y="-30%" width="160%" height="160%">`)
out.push(`<feGaussianBlur stdDeviation="3"/>`)
out.push(`</filter>`)
out.push(`</defs>`)

// 背景宣纸
out.push(`<rect width="${W}" height="${H}" fill="${T.bg}"/>`)
out.push(`<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.9"/>`)

// 暗角（简单径向淡出）
out.push(`<radialGradient id="vig" cx="50%" cy="46%" r="78%">`)
out.push(`<stop offset="0.62" stop-color="#000" stop-opacity="0"/>`)
out.push(`<stop offset="1" stop-color="#2a2418" stop-opacity="0.14"/>`)
out.push(`</radialGradient>`)
out.push(`<rect width="${W}" height="${H}" fill="url(#vig)"/>`)

// ===== 地图底图（现代省界，边缘色）=====
out.push(`<g id="basemap">`)
for (const f of china.features) {
  for (const d of geomToPath(f.geometry, proj)) {
    out.push(`<path d="${d}" fill="${T.mapProvince}" stroke="${T.mapEdge}" stroke-width="0.55" stroke-opacity="0.6"/>`)
  }
}
out.push(`</g>`)

// ===== 政权水彩 wash（1100 的辽/宋/西夏/吐蕃/大理 + 1200 的金）=====
const ENTITY_ORDER = ['西夏', '辽', '金', '吐蕃', '大理', '宋'] // 先小后大
const regimeColors = {}
for (const f of r11.features) regimeColors[f.properties.entity] = f.properties.color
for (const f of r12.features) regimeColors[f.properties.entity] = f.properties.color

const entities = new Map()
for (const f of r11.features) {
  if (!entities.has(f.properties.entity)) entities.set(f.properties.entity, [])
  entities.get(f.properties.entity).push(f)
}
for (const f of r12.features) {
  if (!entities.has(f.properties.entity)) entities.set(f.properties.entity, [])
  entities.get(f.properties.entity).push(f)
}

out.push(`<g id="regimes">`)
for (const ent of ENTITY_ORDER) {
  const feats = entities.get(ent)
  if (!feats) continue
  const color = regimeColors[ent] || '#888888'
  const opacity = 0.55
  // 主政权投影
  out.push(`<g opacity="${opacity * 0.5}" filter="url(#soft)">`)
  for (const f of feats) {
    for (const d of geomToPath(f.geometry, proj)) {
      out.push(`<path d="${d}" fill="${color}"/>`)
    }
  }
  out.push(`</g>`)
  // 主政权实底
  out.push(`<g opacity="${opacity}">`)
  for (const f of feats) {
    for (const d of geomToPath(f.geometry, proj)) {
      out.push(`<path d="${d}" fill="${color}"/>`)
    }
  }
  // 政权描边
  out.push(`<g fill="none" stroke="${color}" stroke-opacity="0.9" stroke-width="0.7">`)
  for (const f of feats) {
    for (const d of geomToPath(f.geometry, proj)) out.push(`<path d="${d}"/>`)
  }
  out.push(`</g>`)
  out.push(`</g>`)
}
out.push(`</g>`)

// ===== 宣纸纹 overlay 在地图上（让政权层也带纸感）=====
out.push(`<rect x="${MAP_RECT.x}" y="${MAP_RECT.y}" width="${MAP_RECT.w}" height="${MAP_RECT.h}" filter="url(#grain)" opacity="0.5" pointer-events="none"/>`)

// ===== 中央年份水印「1127」=====
out.push(`<text x="${W / 2}" y="${MAP_RECT.y + MAP_RECT.h * 0.34}" text-anchor="middle" font-size="300" font-weight="700" fill="${T.text}" fill-opacity="0.085" letter-spacing="10">1127</text>`)

// ===== 州府地名标注（简笔：小圆点 + 标号小卡）=====
const places = [
  { name: '兴庆府', coord: [106.28, 38.47], dx: 64, dy: -8 },   // 西夏
  { name: '东京(汴梁)', coord: [114.35, 34.79], dx: 58, dy: -28 }, // 宋
  { name: '临安', coord: [120.15, 30.28], dx: 62, dy: -34 },       // 宋
  { name: '成都', coord: [104.07, 30.67], dx: -76, dy: -6 },       // 宋
  { name: '上京', coord: [119.4, 43.97], dx: 58, dy: -12 },        // 辽
  { name: '中京', coord: [118.7, 41.6], dx: 8, dy: -46 },          // 辽
  { name: '大同', coord: [113.3, 40.09], dx: -8, dy: 40 },         // 辽/金
  { name: '大理', coord: [100.2, 25.6], dx: -86, dy: 0 },          // 大理
  { name: '西宁', coord: [101.78, 36.62], dx: -84, dy: -4 },       // 吐蕃
  { name: '兰州', coord: [103.82, 36.06], dx: -12, dy: -52 },      // 吐蕃
]
out.push(`<g id="placelabels" font-size="12" fill="${T.text}">`)
for (const p of places) {
  const [x, y] = proj(p.coord)
  out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${T.accent}" opacity="0.85"/>`)
  out.push(`<g transform="translate(${(x + p.dx).toFixed(1)} ${(y + p.dy).toFixed(1)})">`)
  out.push(`<rect x="-4" y="-14" width="${(p.name.length * 12 + 8)}" height="20" rx="4" fill="rgba(250,246,235,0.82)" stroke="rgba(58,52,40,0.28)" stroke-width="0.6"/>`)
  out.push(`<text x="0" y="1" text-anchor="middle">${p.name}</text>`)
  out.push(`</g>`)
}
out.push(`</g>`)

// ===== 事件泡泡（纸卡 + 朱砂竖条印章 + 顶部圆点光晕）=====
const bubbles = [
  { short: '靖康之变',   coord: [114.35, 34.79], dx: -8,  dy: -66, cat: '#b03a2e' },
  { short: '岳飞收复建康', coord: [118.8, 32.06],  dx: 58,  dy: -44, cat: '#a0622d' },
  { short: '南宋建都临安', coord: [120.15, 30.28], dx: 96,  dy: 8,   cat: '#b03a2e' },
]
function makeBubble(short, x, y, cat, flip) {
  const w = short.length * 14 + 26
  const h = 30
  const bx = flip ? x - w : x
  out.push(`<g class="bubble">`)
  // 指向线
  const ax = x, ay = y
  const tx = flip ? bx + w : bx
  const ty = y + h / 2
  out.push(`<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${cat}" stroke-width="1.2" opacity="0.7" stroke-dasharray="2 2"/>`)
  // 锚点小圆
  out.push(`<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="3.4" fill="${cat}" stroke="#fdf8ec" stroke-width="1.2"/>`)
  // 纸卡
  out.push(`<g transform="translate(${bx} ${y})">`)
  out.push(`<rect width="${w}" height="${h}" rx="6" fill="${T.bubbleBg}" stroke="${cat}" stroke-opacity="0.75" stroke-width="1" filter="url(#soft)"/>`)
  out.push(`<rect width="${w}" height="${h}" rx="6" fill="${T.bubbleBg}" stroke="${cat}" stroke-opacity="0.75" stroke-width="0.8"/>`)
  // 竖条印章（左）
  out.push(`<rect x="5" y="6" width="5" height="18" rx="2" fill="${cat}" opacity="0.92"/>`)
  // 顶部小圆点（光晕）
  out.push(`<circle cx="7.5" cy="2" r="3.2" fill="${cat}" opacity="0.9" filter="url(#soft)"/>`)
  out.push(`<circle cx="7.5" cy="2" r="3.2" fill="${cat}"/>`)
  // 事件名
  out.push(`<text x="17" y="20" font-size="13" font-weight="600" fill="${T.text}">${short}</text>`)
  out.push(`</g>`)
  out.push(`</g>`)
}
for (const b of bubbles) {
  const [x, y] = proj(b.coord)
  makeBubble(b.short, x, y, b.cat, false)
}

// ===== 顶栏 =====
out.push(`<g id="topbar">`)
out.push(`<rect width="${W}" height="${TOPBAR_H}" fill="url(#topbar)"/>`)
out.push(`<line x1="0" y1="${TOPBAR_H - 1}" x2="${W}" y2="${TOPBAR_H - 1}" stroke="rgba(58,52,40,0.14)"/>`)
out.push(`<g transform="translate(20 19)">`)
out.push(`<rect width="40" height="30" rx="4" fill="${T.accent}" stroke="rgba(0,0,0,0.18)"/>`)
out.push(`<text x="20" y="21" text-anchor="middle" font-size="16" font-weight="700" fill="${T.accentText}" letter-spacing="1">宋</text>`)
out.push(`<text x="52" y="21" font-size="19" font-weight="700" fill="${T.text}" letter-spacing="4">历史地图</text>`)
out.push(`</g>`)
// 右侧按钮组
const rightBtns = []
// 设置齿轮：画在小圆形按钮里
rightBtns.push(`<g transform="translate(${W - 34} 28)">`)
rightBtns.push(`<circle r="17" fill="rgba(250,246,235,0.75)" stroke="${T.panelBorder}" stroke-width="1"/>`)
// 简易齿轮（十字 + 圆）
rightBtns.push(`<circle r="6" fill="none" stroke="${T.text}" stroke-width="1.6"/>`)
rightBtns.push(`<line x1="0" y1="-8.4" x2="0" y2="8.4" stroke="${T.text}" stroke-width="2.4" stroke-linecap="round"/>`)
rightBtns.push(`<line x1="-8.4" y1="0" x2="8.4" y2="0" stroke="${T.text}" stroke-width="2.4" stroke-linecap="round"/>`)
rightBtns.push(`<line x1="-6" y1="-6" x2="6" y2="6" stroke="${T.text}" stroke-width="2.4" stroke-linecap="round"/>`)
rightBtns.push(`<line x1="6" y1="-6" x2="-6" y2="6" stroke="${T.text}" stroke-width="2.4" stroke-linecap="round"/>`)
rightBtns.push(`</g>`)

// 「三事件」按钮 + 徽标
const evBtnW = 86
const evBtnX = W - 34 - 24 - 86 - 12
rightBtns.push(`<g transform="translate(${evBtnX} 17)">`)
rightBtns.push(`<rect width="${evBtnW}" height="30" rx="15" fill="rgba(250,246,235,0.75)" stroke="${T.panelBorder}" stroke-width="1"/>`)
rightBtns.push(`<text x="12" y="20" font-size="13" fill="${T.text}">三事件</text>`)
rightBtns.push(`<circle cx="${evBtnW - 17}" cy="10" r="9" fill="${T.accent}" stroke="${T.accentText}" stroke-width="2"/>`)
rightBtns.push(`<text x="${evBtnW - 17}" y="14" text-anchor="middle" font-size="11" fill="${T.accentText}" font-family="${FONT_SANS}">3</text>`)
rightBtns.push(`</g>`)

// 「宋 ▼」朝代下拉
const dynW = 66
const dynX = evBtnX - 12 - dynW
rightBtns.push(`<g transform="translate(${dynX} 17)">`)
rightBtns.push(`<rect width="${dynW}" height="30" rx="15" fill="rgba(250,246,235,0.75)" stroke="${T.panelBorder}" stroke-width="1"/>`)
rightBtns.push(`<text x="20" y="20" text-anchor="middle" font-size="13" fill="${T.text}">宋</text>`)
rightBtns.push(`<path d="M ${dynW - 18} 13 l -4 4 l 4 4" fill="none" stroke="${T.text}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`)
rightBtns.push(`</g>`)
out.push(rightBtns.join(''))
out.push(`</g>`)

// ===== 图例（左侧中部）=====
const legendEntries = [
  { name: '宋',   color: '#b03a2e' },
  { name: '辽',   color: '#4a6a8a' },
  { name: '西夏', color: '#b08d4f' },
  { name: '金',   color: '#a8873a' },
  { name: '大理', color: '#6a8a5f' },
  { name: '吐蕃', color: '#8a6a4a' },
]
const legY = TOPBAR_H + 40
out.push(`<g id="legend" transform="translate(16 ${legY})" font-size="12">`)
out.push(`<rect width="104" height="${36 + legendEntries.length * 24}" rx="10" fill="rgba(244,240,228,0.72)" stroke="rgba(58,52,40,0.16)" stroke-width="1"/>`)
out.push(`<text x="12" y="18" font-size="11.5" font-weight="600" fill="${T.accent}" letter-spacing="4">政权</text>`)
out.push(`<line x1="12" y1="25" x2="92" y2="25" stroke="rgba(58,52,40,0.14)"/>`)
legendEntries.forEach((e, i) => {
  const y = 42 + i * 24
  out.push(`<rect x="13" y="${y - 10}" width="12" height="7" rx="2" fill="${e.color}" stroke="rgba(58,52,40,0.22)" stroke-width="1"/>`)
  out.push(`<text x="31" y="${y}" fill="${T.text}" font-weight="${i === 0 ? 600 : 400}">${e.name}</text>`)
})
out.push(`</g>`)

// ===== 事件详情卡片区 =====
const cardY0 = MAP_RECT.y + MAP_RECT.h + 22
const cardH = 128
const cardGap = 12
const cardW = W - 36
const cardX = 18
const details = [
  { title: '靖康之变', subtitle: '1127年 · 时代格局', text: '1127年，金军攻破汴京，宋徽宗、宋钦宗被俘。' },
  { title: '岳飞收复建康', subtitle: '1127年 · 军事·领土', text: '1127年，岳飞率军收复建康，稳定江南局势。' },
  { title: '南宋建都临安', subtitle: '1127年 · 时代格局', text: '1127年，赵构在临安即位，建立南宋。' },
]
out.push(`<g id="detailcards" font-size="13">`)
details.forEach((d, i) => {
  const y = cardY0 + i * (cardH + cardGap)
  out.push(`<g transform="translate(${cardX} ${y})">`)
  out.push(`<rect width="${cardW}" height="${cardH}" rx="10" fill="rgba(250,246,235,0.72)" stroke="rgba(58,52,40,0.18)"/>`)
  out.push(`<circle cx="20" cy="26" r="5" fill="${T.accent}"/>`)
  out.push(`<text x="34" y="30" font-size="15" font-weight="600" fill="${T.text}">${d.title}</text>`)
  out.push(`<rect x="${cardW - 110}" y="15" width="94" height="22" rx="11" fill="rgba(176,58,46,0.09)" stroke="${T.accent}" stroke-opacity="0.5" stroke-width="0.8"/>`)
  out.push(`<text x="${cardW - 63}" y="30" text-anchor="middle" font-size="11" fill="${T.accent}">${d.subtitle}</text>`)
  out.push(`<line x1="18" y1="48" x2="${cardW - 18}" y2="48" stroke="rgba(58,52,40,0.10)"/>`)
  out.push(`<text x="20" y="76" font-size="13" fill="${T.text}" fill-opacity="0.92">${d.text}</text>`)
  out.push(`</g>`)
})
out.push(`</g>`)

// ===== 底部时间轴 =====
const tlY = H - 78
const tlW = W - 40
const tlX = 20
out.push(`<g id="timeline" transform="translate(${tlX} ${tlY})">`)
out.push(`<rect width="${tlW}" height="62" rx="12" fill="rgba(250,246,235,0.88)" stroke="${T.panelBorder}" stroke-width="1"/>`)
// 播放键
out.push(`<g transform="translate(20 12)">`)
out.push(`<rect width="38" height="38" rx="10" fill="rgba(250,246,235,0.9)" stroke="${T.accent}" stroke-width="1.2"/>`)
out.push(`<path d="M 28 50 l 0 -22 l 16 11 Z" fill="${T.accent}" transform="translate(1 2)"/>`)
out.push(`</g>`)
// 年份 + 范围
out.push(`<text x="72" y="30" font-size="26" font-weight="700" fill="${T.accent}" letter-spacing="2" font-variant-numeric="tabular-nums">1127年</text>`)
out.push(`<text x="${tlW - 14}" y="30" text-anchor="end" font-size="11" fill="rgba(58,52,40,0.6)">960 — 1279</text>`)
// 进度条轨道
const trY = 48
const trX = 72
const trW2 = tlW - 14 - trX
const progW = trW2 * 0.632 // 1127 在 960-1279 的占比
out.push(`<rect x="${trX}" y="${trY}" width="${trW2}" height="5" rx="3" fill="${T.timelineTrack}"/>`)
out.push(`<rect x="${trX}" y="${trY}" width="${progW.toFixed(1)}" height="5" rx="3" fill="url(#prog)"/>`)
// 刻度
out.push(`<g stroke="rgba(58,52,40,0.35)" stroke-width="1">`)
for (let k = 0; k <= 4; k++) {
  const x = trX + (trW2 * k) / 4
  out.push(`<line x1="${x.toFixed(1)}" y1="${trY - 4}" x2="${x.toFixed(1)}" y2="${trY + 9}"/>`)
}
out.push(`</g>`)
// 拇指
const thx = trX + progW
out.push(`<circle cx="${thx.toFixed(1)}" cy="${trY + 2.5}" r="9" fill="${T.timelineThumb}" stroke="${T.timelineThumbBorder}" stroke-width="2"/>`)
out.push(`</g>`)

out.push(`</svg>`)

const target = join(ROOT, 'docs', 'design_optimize', 'prompt_1_recreated.svg')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, out.join('\n'), 'utf8')
console.log(`written: ${target}`)
console.log(`svg bytes: ${Buffer.byteLength(out.join('\n'))}`)
