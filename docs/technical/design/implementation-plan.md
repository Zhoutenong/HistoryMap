# HistoryMap 视觉还原执行计划

> 目标：让当前运行效果与 `docs/design_optimize/prompt_1.png` / `prompt_4.png` 两张效果图在视觉气质上完全一致。
> 本计划面向**无法识别图片**的执行模型，因此所有目标效果都用文字、CSS 值、代码位置精确描述，并给出可验收的验证步骤。

---

## 一、总体原则

1. **不改交互骨架**：顶栏、时间轴、事件泡泡、详情面板、事件抽屉、设置面板、朝代转场横幅的 DOM 结构和交互逻辑保持不变。
2. **不新增图片素材**：已有 `paper-texture.jpg`、`paper-grain.png`、`ink-landscape.png` 足够，所有控件用 CSS 绘制。
3. **只改三处**：
   - `client/src/styles.css`（氛围、控件样式）
   - `client/src/map/TerritoryOverlay.js`（地图水彩渲染参数、政权标签位置）
   - `client/src/timeline/Timeline.js`（播放按钮图标化）
   - 可选：`server/scripts/fetch_historical_basemaps.js` 或生成的 `server/data/geo/historical/regimes-*.json`（政权颜色微调）
4. **统一设计 tokens**：所有颜色来自 `:root` 变量；新写样式必须复用现有变量，勿引入新十六进制色值。

---

## 二、关键效果图特征（文字精确描述）

### 2.1 整体氛围
- 背景是**暖黄色宣纸**，有清晰可见的纸张纤维和颗粒感。
- 四边有**暗角（vignette）**：越靠近屏幕边缘，背景越暗、越偏棕褐。
- 中央区域比当前更亮，四边比当前更暗，形成“聚光灯”效果。
- 大年份水印（如 `960年`）比当前更浓、更可见，但仍需保持半透明不抢主体。

### 2.2 地图
- 政权区域以**水墨晕染**方式呈现，颜色饱和度明显高于当前。
- 边界不是清晰矢量线，而是有**水墨渗开**的毛边感。
- 同一时期相邻政权颜色区分度高，不会糊成一片。
- 政权标签（如“宋”“辽”“西夏”）是半透明米黄底、深褐字的小卡片，位于对应疆域的**视觉中心**。
- 地图整体略微偏暖，像古画。

### 2.3 事件泡泡
- 形状：横向小胶囊，左侧有一个**小巧的朱砂竖条/圆点印章**。
- 印章不能太高、太粗，要与文字高度一致。
- 背景为米白色，边框为淡朱砂色。
- 当前聚焦的泡泡（详情面板打开时）整体变成朱砂红底白字。

### 2.4 时间轴
- 底部悬浮条，左侧是一个**圆角方形纯图标按钮**。
- 播放时按钮内显示 `▶`（实心三角，无文字）。
- 暂停时按钮内显示两条竖线 `❚❚`（无文字）。
- 当前年份“XXXX 年”用朱砂红衬线大字。
- 进度条从朱砂红渐变为暖金黄。

### 2.5 事件详情面板
- 右侧滑入，米黄宣纸底，顶部圆角。
- 顶部：年份红徽章 + 分类灰徽章 + 大标题。
- 标题下方有一条朱砂色渐变分隔线。
- 正文行距较大，像古籍排版。
- “影响”块有左侧朱砂竖条。
- 底部水墨山水画插画占比明显，与面板等宽。

### 2.6 事件抽屉
- 左侧滑出，标题“历史事件”用朱砂色，左侧带一条朱砂竖线装饰。
- 每条记录左侧有分类色条，年份用朱砂色，事件名用深褐色。

### 2.7 设置面板
- 与当前结构一致，但按钮 hover 更精致，复选框颜色与主题一致。

### 2.8 朝代转场横幅
- 全屏深墨压暗（约 78% 不透明度）。
- 中央金色大字，上下有金色细线装饰。
- 文字有柔和光晕。

---

## 三、分模块执行清单

### 3.1 全局背景与氛围（`client/src/styles.css`）

#### 目标
背景从“平板米色”升级为“暖黄宣纸 + 颗粒 + 暗角”。

#### 修改位置
- 文件：`client/src/styles.css`
- 当前范围：`:root` 变量（约第 4–40 行）、`body` 规则（约第 53–58 行）、`#year-watermark` 规则（约第 175–197 行）。

#### 具体修改

1. **调整主题变量**（`:root` 内）：
   - 将 `--bg` 从 `#e8dfc6` 改为 `#e6d8b5`（更暖、更黄）。
   - 将 `--panelBg` 从 `rgba(244, 240, 228, 0.95)` 改为 `rgba(244, 240, 228, 0.96)`（面板更实）。
   - 将 `--panelShadow` 从 `rgba(58, 52, 40, 0.18)` 改为 `rgba(58, 52, 40, 0.22)`（阴影更深）。

2. **重写 `body` 背景层**：
   当前代码（保留原意，改为多层叠加）：
   ```css
   body {
     background:
       linear-gradient(rgba(232, 223, 198, 0.86), rgba(232, 223, 198, 0.86)),
       url('/paper-texture.jpg') center / cover fixed,
       var(--bg);
   }
   ```
   替换为：
   ```css
   body {
     background:
       /* 暗角：中心透明，边缘压暗 */
       radial-gradient(ellipse at 50% 50%,
         rgba(230, 216, 181, 0) 0%,
         rgba(230, 216, 181, 0) 55%,
         rgba(68, 58, 46, 0.22) 100%
       ),
       /* 纸张颗粒层 */
       url('/paper-grain.png') center / 400px repeat,
       /* 暖色罩层，调低透明度让纹理透出 */
       linear-gradient(rgba(230, 216, 181, 0.70), rgba(230, 216, 181, 0.70)),
       url('/paper-texture.jpg') center / cover fixed,
       var(--bg);
     background-color: var(--bg);
   }
   ```

3. **加浓年份水印**：
   当前 `#year-watermark`：
   ```css
   color: rgba(58, 52, 40, 0.05);
   ```
   改为：
   ```css
   color: rgba(58, 52, 40, 0.09);
   font-weight: 800;
   right: 4vw;
   top: 42%;
   ```
   当前字号是 `clamp(140px, 26vw, 340px)`，可改为 `clamp(160px, 28vw, 380px)` 让水印更突出。

#### 验收
- 刷新页面后，背景明显有纸张纹理和四边暗角。
- 水印 `960年` 清晰可见但不遮挡地图。

---

### 3.2 地图水彩渲染升级（`client/src/map/TerritoryOverlay.js`）

#### 目标
让政权颜色更饱和、边界有水墨渗开感、相邻政权区分明显。

#### 修改位置
- 文件：`client/src/map/TerritoryOverlay.js`
- 当前范围：
  - `watercolorTint`（约第 23–35 行）
  - `buildWatercolorCanvas` 内参数（约第 113–145 行）
  - `buildTerritoryOverlay` 内 `planeMat` 的 `opacity`（约第 204–210 行）

#### 具体修改

1. **提升饱和度保留比例**：
   当前：
   ```javascript
   const s = Math.max(0, hsl.s * 0.60);
   const l = Math.min(0.40, Math.max(0.28, hsl.l * 0.76));
   ```
   改为：
   ```javascript
   const s = Math.max(0, hsl.s * 0.78);
   const l = Math.min(0.46, Math.max(0.32, hsl.l * 0.82));
   ```

2. **增强水彩晕染参数**：
   当前代码（三个渲染层）：
   ```javascript
   // 2a
   ctx.filter = `blur(${Math.max(6, W / 170)}px)`;
   ctx.fillStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.20)`;
   // 2b
   ctx.filter = `blur(${Math.max(2, W / 500)}px)`;
   ctx.fillStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.36)`;
   // 2c
   ctx.lineWidth = 1.3;
   ctx.strokeStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.34)`;
   ```
   替换为：
   ```javascript
   // 2a 羽化晕染层（更大范围、更高透明度）
   ctx.filter = `blur(${Math.max(12, W / 110)}px)`;
   ctx.fillStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.32)`;
   // 2b 主体色层（更实）
   ctx.filter = `blur(${Math.max(5, W / 280)}px)`;
   ctx.fillStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.52)`;
   // 2c 淡墨边界（更深、更粗）
   ctx.lineWidth = 1.8;
   ctx.strokeStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.48)`;
   ```
   并在 `2c` 之后新增一层深色边缘，模拟水墨干边：
   ```javascript
   // 2d 加深干边
   tracePath(ctx, rings, toPx);
   ctx.save();
   ctx.filter = 'none';
   ctx.lineWidth = 0.8;
   ctx.lineJoin = 'round';
   ctx.strokeStyle = `rgba(${Math.max(0, tint.r - 40)}, ${Math.max(0, tint.g - 40)}, ${Math.max(0, tint.b - 40)}, 0.28)`;
   ctx.stroke();
   ctx.restore();
   ```

3. **增强纸张颗粒**：
   当前颗粒透明度：
   ```javascript
   grain.data[i + 3] = Math.round(10 + v * 20);
   ```
   改为：
   ```javascript
   grain.data[i + 3] = Math.round(14 + v * 28);
   ```
   当前颗粒层全局 alpha `0.55` 改为 `0.72`。

4. **提升 Plane 不透明度**：
   当前 `planeMat.opacity = 0.92`，改为 `0.95`。

5. **（可选）给水彩 plane 加轻微阴影增加层次**：
   在 `buildTerritoryOverlay` 中，创建 `washMesh` 后：
   ```javascript
   washMesh.castShadow = false;
   washMesh.receiveShadow = false;
   ```
   不要启用真实阴影，避免性能问题。若需要“立体感”，可额外加一层半透明的暗色渐变贴图，但本计划不强制。

#### 验收
- 刷新页面后，地图颜色明显更浓，边界有毛边水墨感。
- 960 年“宋”（朱红）与“辽”（蓝灰）、“西夏”（土黄）对比清晰。
- 切换到 1127 年，南宋疆域同样清晰可见。

---

### 3.3 政权标签位置修正（`client/src/map/TerritoryOverlay.js`）

#### 目标
“宋”标签应位于北宋疆域的视觉中心（约河南/山东中部），当前位置偏南。

#### 修改位置
- 文件：`client/src/map/TerritoryOverlay.js`
- 当前范围：`buildRegimeLabel` 函数（约第 174–183 行）。

#### 具体修改

当前 `buildRegimeLabel` 直接用 `geoCentroid(feature)`，对复杂多边形可能偏南。
替换为：

```javascript
function buildRegimeLabel(feature, entity) {
  const centroid = geoCentroid(feature);
  if (!centroid || Number.isNaN(centroid[0])) return null;
  const [x, y] = project(centroid);

  // 对“宋”做向北偏移，使其位于疆域视觉中心而非偏南
  const adjustedY = entity === '宋'
    ? y + computeFeatureHeight(feature) * 0.05
    : y;

  const el = document.createElement('div');
  el.className = 'regime-label';
  el.textContent = entity;
  const obj = new CSS2DObject(el);
  obj.position.set(x, adjustedY, 7.2);
  return obj;
}
```

并在同一文件内新增辅助函数：

```javascript
function computeFeatureHeight(feature) {
  let ymin = Infinity, ymax = -Infinity;
  normalizePolygons(feature.geometry).forEach((rings) => {
    rings.forEach((ring) => ring.forEach(([lng, lat]) => {
      const [, y] = project([lng, lat]);
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }));
  });
  return ymax - ymin || 1;
}
```

> 注意：世界坐标系中 `y` 轴向上，向北移动意味着 `y` 增大，因此 `adjustedY = y + height * 0.05`。

#### 验收
- 960 年主界面中，“宋”标签位于北宋疆域中部偏北（约河南东部位置）。
- 切换到 1127 年，“宋”标签位于南宋疆域中部（约江浙一带）。
- 其他政权标签保持自然位置。

---

### 3.4 事件泡泡印章缩小（`client/src/styles.css`）

#### 目标
泡泡左侧印章从“又高又粗”变成“小巧紧凑”的朱砂印章。

#### 修改位置
- 文件：`client/src/styles.css`
- 当前范围：`.bubble-inner`（约第 214–238 行）、`.bubble-seal`（约第 240–261 行）。

#### 具体修改

1. **`.bubble-inner`**：
   当前：
   ```css
   .bubble-inner {
     padding: 3px 10px 3px 4px;
     gap: 7px;
     border-radius: 3px 12px 12px 3px;
     font-size: 12.5px;
   }
   ```
   改为：
   ```css
   .bubble-inner {
     padding: 2px 8px 2px 3px;
     gap: 5px;
     border-radius: 2px 10px 10px 2px;
     font-size: 13px;
     box-shadow: 0 2px 10px rgba(46, 42, 36, 0.18);
   }
   ```

2. **`.bubble-seal`**：
   当前：
   ```css
   .bubble-seal {
     width: 9px;
     height: 40px;
     border-radius: 4px;
   }
   ```
   改为：
   ```css
   .bubble-seal {
     width: 5px;
     height: 18px;
     border-radius: 2px;
     margin-left: 2px;
   }
   ```

3. **`.bubble-seal::after`（顶部圆点）**：
   当前：
   ```css
   .bubble-seal::after {
     top: -8px;
     width: 12px;
     height: 12px;
   }
   ```
   改为：
   ```css
   .bubble-seal::after {
     top: -4px;
     width: 7px;
     height: 7px;
   }
   ```

#### 验收
- 事件泡泡左侧印章高度与文字行高一致（约 18px），不再突兀。
- 印章顶部圆点小巧，光晕柔和。
- 详情面板打开时，聚焦泡泡的印章变白，整体协调。

---

### 3.5 时间轴播放按钮图标化（`client/src/styles.css` + `client/src/timeline/Timeline.js`）

#### 目标
播放按钮从“文字+图标”改成“圆角方块纯图标”。

#### 修改位置
- 文件：`client/src/timeline/Timeline.js`
  - 当前范围：`play()` 方法（约第 119–133 行）、`pause()` 方法（约第 135–143 行）。
- 文件：`client/src/styles.css`
  - 当前范围：`#tl-play`（约第 311–331 行）。

#### 具体修改

1. **JS 中按钮内容改为图标 span**：
   在 `play()` 中：
   ```javascript
   this.playBtn.textContent = '⏸';
   ```
   改为：
   ```javascript
   this.playBtn.innerHTML = '<span class="tl-play-icon">❚❚</span>';
   ```

   在 `pause()` 中：
   ```javascript
   this.playBtn.textContent = '▶';
   ```
   改为：
   ```javascript
   this.playBtn.innerHTML = '<span class="tl-play-icon">▶</span>';
   ```

2. **CSS 中按钮样式图标化**：
   当前 `#tl-play`：
   ```css
   #tl-play {
     width: 34px;
     height: 34px;
     font-size: 13px;
     border-radius: 8px;
   }
   ```
   改为：
   ```css
   #tl-play {
     width: 38px;
     height: 38px;
     font-size: 15px;
     border-radius: 10px;
     display: flex;
     align-items: center;
     justify-content: center;
     padding: 0;
   }
   #tl-play .tl-play-icon {
     display: inline-block;
     transform: translateX(0.5px);
   }
   ```

#### 验收
- 页面加载后，时间轴左侧按钮显示 `▶`（三角）。
- 点击播放后，按钮显示 `❚❚`（两条竖线）。
- 按钮为正圆角方形，无文字。

---

### 3.6 详情面板精致化（`client/src/styles.css`）

#### 目标
标题更大、分隔线更朱砂、影响块更突出、插画更醒目。

#### 修改位置
- 文件：`client/src/styles.css`
- 当前范围：`.detail-head`、`.detail-year`、`.detail-cat`、 `#detail-panel h2`、`.detail-divider`、`.detail-impact`、`.detail-related`、`.detail-ink-art`（约第 461–565 行）。

#### 具体修改

1. **标题字号加大**：
   ```css
   #detail-panel h2 {
     font-size: 24px;
     margin-bottom: 12px;
     letter-spacing: 2px;
   }
   ```

2. **分隔线强化**：
   ```css
   .detail-divider {
     height: 1.5px;
     background: linear-gradient(to right, rgba(176, 58, 46, 0.65), rgba(176, 58, 46, 0.05));
     margin: 6px 0 16px;
   }
   ```

3. **影响块更突出**：
   ```css
   .detail-impact {
     margin-top: 18px;
     padding: 14px 16px;
     background: rgba(176, 58, 46, 0.075);
     border-left: 4px solid var(--accent);
   }
   ```

4. **插画占比增大**：
   ```css
   .detail-ink-art {
     margin-top: 22px;
     border-radius: 6px;
     opacity: 0.95;
   }
   ```

5. **年份徽章加粗**：
   ```css
   .detail-year {
     font-weight: 600;
     padding: 3px 14px;
   }
   ```

#### 验收
- 打开任意事件详情，标题字号明显变大。
- 分隔线从左侧朱砂渐变到右侧透明。
- 底部水墨插画清晰、宽度与面板一致。

---

### 3.7 事件抽屉标题装饰（`client/src/styles.css`）

#### 目标
“历史事件”标题左侧加一条朱砂竖线，标题更醒目。

#### 修改位置
- 文件：`client/src/styles.css`
- 当前范围：`.log-header`（约第 677–689 行）。

#### 具体修改

当前：
```css
.log-header {
  padding: 14px 16px 12px;
  font-size: 14px;
  color: var(--accent);
  border-bottom: 1px solid var(--logHeaderBorder);
  letter-spacing: 2px;
}
```

改为：
```css
.log-header {
  padding: 16px 18px 13px;
  font-size: 15px;
  color: var(--accent);
  border-bottom: 1px solid var(--logHeaderBorder);
  letter-spacing: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.log-header::before {
  content: '';
  width: 3px;
  height: 16px;
  background: var(--accent);
  border-radius: 2px;
}
```

> 同时需要修改 `EventLog.js` 中 `.log-header` 的 innerHTML，当前是 `<span>历史事件</span>`，可以保留，因为 `::before` 伪元素会自动加在 `span` 之前。

#### 验收
- 打开事件抽屉，标题“历史事件”左侧有一条朱砂竖线。

---

### 3.8 朝代转场横幅强化（`client/src/styles.css`）

#### 目标
转场横幅更深、更暗、金色文字光晕更强。

#### 修改位置
- 文件：`client/src/styles.css`
- 当前范围：`#era-banner`、`.era-banner-inner`、`.era-banner-text`（约第 790–835 行）。

#### 具体修改

1. **背景加深**：
   ```css
   #era-banner {
     background: rgba(28, 24, 18, 0.78);
   }
   ```

2. **文字光晕增强**：
   ```css
   .era-banner-text {
     font-size: clamp(28px, 5.5vw, 42px);
     font-weight: 700;
     letter-spacing: 8px;
     text-shadow: 0 0 48px rgba(216, 178, 74, 0.45);
   }
   ```

3. **上下金线更亮**：
   ```css
   .era-banner-inner::before,
   .era-banner-inner::after {
     left: 15%;
     right: 15%;
     height: 1.5px;
     background: linear-gradient(to right, transparent, rgba(216, 178, 74, 0.85), transparent);
   }
   ```

4. **年份字号加大**：
   ```css
   .era-banner-year {
     font-size: 16px;
     letter-spacing: 8px;
   }
   ```

#### 验收
- 拖动时间轴跨越 1127 年，全屏出现深色转场横幅，金色文字清晰。

---

### 3.9 图例微调（`client/src/styles.css`）

#### 目标
图例更紧凑、背景更实、与背景融合更好。

#### 修改位置
- 文件：`client/src/styles.css`
- 当前范围：`#legend`（约第 745–763 行）。

#### 具体修改

```css
#legend {
  top: 50%;
  left: 14px;
  width: 100px;
  padding: 12px 14px;
  background: rgba(244, 240, 228, 0.84);
  border: 1px solid rgba(58, 52, 40, 0.22);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(58, 52, 40, 0.14);
  font-size: 12px;
  line-height: 1.85;
}
```

#### 验收
- 图例背景略实，文字清晰，不遮挡地图。

---

### 3.10 政权颜色微调（可选，优先级较低）

#### 目标
让“大越”与“大理”区分更明显，并修正“海南”与“宋”颜色重复。

#### 方案 A（推荐，改生成脚本后重新生成）
1. 修改 `server/scripts/fetch_historical_basemaps.js` 中 `ENTITY_STYLE` 部分条目：
   ```javascript
   'Đại Việt': { entity: '大越', color: '#8a9a5a', fillOpacity: 0.35 },
   'Khmer Empire': { entity: '高棉', color: '#8a6a5a', fillOpacity: 0.30 },
   'Champa': { entity: '占婆', color: '#a84a5a', fillOpacity: 0.30 },
   'Champa City States': { entity: '占婆', color: '#a84a5a', fillOpacity: 0.30 },
   'Hainan': { entity: '海南', color: '#a04a3a', fillOpacity: 0.30 },
   ```
2. 运行 `node server/scripts/fetch_historical_basemaps.js` 重新生成三个 `regimes-*.json`。
3. 重启后端。

#### 方案 B（不改脚本，直接改生成后的 JSON）
1. 在三个 `server/data/geo/historical/regimes-*.json` 中搜索替换颜色字符串。
2. 重启后端。

> 注意：方案 B 在重新运行脚本后会失效。若政权数据稳定，方案 B 更快；若以后还会重新抓取，建议方案 A。

#### 验收
- 图例中“大越”与“大理”颜色不再过于接近。
- 海南颜色与宋有轻微区分。

---

## 四、执行顺序建议

按以下顺序修改，每步完成后刷新页面验证，避免一次性改动过多难以定位问题。

1. **全局背景**：改 `styles.css` 的 `:root` 和 `body`。
2. **水印**：改 `#year-watermark`。
3. **地图水彩**：改 `TerritoryOverlay.js` 渲染参数。
4. **政权标签位置**：改 `TerritoryOverlay.js` 的 `buildRegimeLabel`。
5. **事件泡泡**：改 `styles.css` 的 `.bubble-inner` / `.bubble-seal`。
6. **时间轴按钮**：改 `Timeline.js` + `styles.css`。
7. **详情面板**：改 `styles.css` 详情相关规则。
8. **事件抽屉**：改 `styles.css` 的 `.log-header`。
9. **转场横幅**：改 `styles.css` 的 `#era-banner`。
10. **图例**：改 `styles.css` 的 `#legend`。
11. **颜色微调**：改 `fetch_historical_basemaps.js` 或 `regimes-*.json`。

---

## 五、验证与验收清单

每完成一步后，按以下场景检查：

| 场景 | 操作 | 验收标准 |
|---|---|---|
| 960 主界面 | 启动页面，默认自动播放 | 背景有宣纸纹理和暗角；地图朱红宋疆域明显；水印可见；泡泡印章小巧 |
| 事件详情 | 点击“陈桥兵变”或“熙宁变法”泡泡 | 右侧面板滑入，标题大、分隔线朱砂渐变、底部插画清晰 |
| 事件抽屉 | 点击顶栏“☰ 事件” | 左侧抽屉标题有朱砂竖线 |
| 设置面板 | 点击顶栏“⚙ 设置” | 面板样式与主题一致，复选框颜色正确 |
| 播放控制 | 点击时间轴播放/暂停 | 按钮为纯图标：播放时 ▶，暂停时 ❚❚ |
| 跨时期转场 | 拖动时间轴到 1127 | 全屏深色横幅，金色文字“北宋极盛 → 南宋·绍兴和议” |
| 1158 主界面 | 拖动到 1158 | 地图南宋疆域颜色浓，政权标签位置正确 |
| 1279 主界面 | 拖动到 1279 | 元朝疆域颜色深，事件泡泡正常 |

---

## 六、注意事项

1. **不要修改 `ChinaMap.js` 的投影逻辑**：`project()` 和 `fitProjection()` 是架构边界，保持不动。
2. **不要修改事件数据**：`server/data/seed/01-song-events.sql` 中的事件内容、坐标、分类已完整，无需改动。
3. **CSS2D 定位坑**：`.event-bubble` 仍只负责定位，所有动画继续放在 `.bubble-inner` 上。
4. **Windows 路径**：所有 import 和 Vite 路径继续用 POSIX 斜杠，不要引入反斜杠。
5. **测试浏览器**：建议使用 Chrome/Edge 1280×720 以上视口测试；移动端适配已有媒体查询，本计划以桌面效果为主。
