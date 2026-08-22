import * as THREE from 'three';

/**
 * 河道带（Web 版，对齐 Android RiverRibbons.kt / MapShaders.FRAG_RIVER，2026-08-22 阶段④）。
 *
 * 旧 Web 端河流是 1px THREE.Line 发丝线，Android 已是有机河道带（变宽三角带 + 三层
 * 河带 + 顺流微动画）——本模块把 Android 方案移植回 Web，参数逐项镜像
 * MapVisualTokens.MapParams 的 RIVER_*（视觉层 token，按「颜色例外」约定不入
 * contract/tokens.json，双端靠注释互指同步）。
 *
 * 分层（片元着色器内按跨河坐标 side 合成，与 Android 完全同构）：
 *   水痕 wash（最宽、两岸羽化）→ 主体 body → 脊线 spine（仅大江，随流动呼吸）。
 * 变宽：宽度随归一化弧长 smoothstep，上游 RIVER_TAPER_HEAD 收窄、入海口 RIVER_TAPER_MOUTH 放宽。
 */

// —— 镜像 Android MapVisualTokens.MapParams（改值需双端同步）——
const RIVER = {
  WASH_WIDTH_MAJOR_DIV: 130, WASH_WIDTH_MINOR_DIV: 250,
  WASH_WIDTH_MIN: 10, WASH_WIDTH_MIN_MINOR: 6,
  BODY_WIDTH_MAJOR_DIV: 500, BODY_WIDTH_MINOR_DIV: 700,
  BODY_WIDTH_MIN: 3.4, BODY_WIDTH_MIN_MINOR: 2.2,
  SPINE_WIDTH_DIV: 1400, SPINE_WIDTH_MIN: 1.1,
  TAPER_HEAD: 0.55, TAPER_MOUTH: 1.3,
  FLOW_WAVE: 46, FLOW_SPEED: 0.05, FLOW_AMP: 0.07,
};
// 颜色/分层 alpha（MapVisualTokens.Color RIVER_* 与 Alpha.MAJOR/MINOR_RIVER_*）
const WASH_RGB = [127 / 255, 155 / 255, 160 / 255];   // #7F9BA0
const BODY_RGB = [82 / 255, 118 / 255, 125 / 255];    // #52767D
const ALPHA = { majorWash: 46 / 255, majorBody: 96 / 255, majorSpine: 124 / 255, minorWash: 30 / 255, minorBody: 60 / 255 };
// 贴图像素语义基准（Android mapTextureSize 的常用档；宽度换算 minPx 项的分母）
const TEX_WIDTH_REF = 2048;

/** Chaikin 轻量平滑（每段 1/4、3/4 各插一点，保持端点）——与 Android RiverRibbonBuilder.chaikin 一致。 */
export function chaikin(points) {
  if (points.length < 3) return points.slice();
  const out = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    out.push([p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25]);
    out.push([p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * 各层河带宽（世界单位）。旧纹理管线宽度语义换算：strokeWidth px @ 贴图宽 TEX_WIDTH_REF
 * ↔ 世界宽 boxWidth（与 Android width(div, minPx) 同式，双基准取大）。
 * @param {number} boxWidth 世界包围盒宽
 * @param {number} rank 河级（1 大江 / 2 中河 / 3+ 支流）
 */
export function riverLayerWidths(boxWidth, rank = 1) {
  const major = rank <= 1;
  const w = (div, minPx) => Math.max((boxWidth * minPx) / TEX_WIDTH_REF, boxWidth / div);
  const wash = major ? w(RIVER.WASH_WIDTH_MAJOR_DIV, RIVER.WASH_WIDTH_MIN)
    : w(RIVER.WASH_WIDTH_MINOR_DIV, RIVER.WASH_WIDTH_MIN_MINOR);
  const body = major ? w(RIVER.BODY_WIDTH_MAJOR_DIV, RIVER.BODY_WIDTH_MIN)
    : w(RIVER.BODY_WIDTH_MINOR_DIV, RIVER.BODY_WIDTH_MIN_MINOR);
  const spine = w(RIVER.SPINE_WIDTH_DIV, RIVER.SPINE_WIDTH_MIN);
  return { wash, body, spine, major };
}

/**
 * 单条河的三角带顶点（纯函数，供单测）：逐点沿法线外扩 ±halfWidth(s)。
 * 顶点交错 [左岸, 右岸]，属性 side=±1（跨河坐标）、s=累计弧长（上游=0）。
 * @param {[number,number][]} pts 世界坐标折线（≥2 点，稀疏折线先经 chaikin 平滑）
 * @param {object} opts { washWidth, taperHead, taperMouth }
 * @returns {{ positions:number[], sides:number[], arc:number[], count:number } | null}
 */
export function buildRiverVertices(pts, opts = {}) {
  const n = pts.length;
  if (n < 2) return null;
  const washWidth = opts.washWidth ?? 8;
  const taperHead = opts.taperHead ?? RIVER.TAPER_HEAD;
  const taperMouth = opts.taperMouth ?? RIVER.TAPER_MOUTH;
  const s = [0];
  for (let i = 1; i < n; i++) {
    s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  const total = s[n - 1];
  if (!(total > 0)) return null;
  const positions = [];
  const sides = [];
  const arc = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(i - 1, 0)];
    const next = pts[Math.min(i + 1, n - 1)];
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    let len = Math.hypot(dx, dy);
    if (len <= 0) { dx = 1; dy = 0; len = 1; }
    dx /= len; dy /= len;
    const nx = -dy;
    const ny = dx;
    // 变宽：t=s/total 做 smoothstep（上游缓收、入海口缓放）
    const t = Math.min(1, Math.max(0, s[i] / total));
    const k = taperHead + (taperMouth - taperHead) * (t * t * (3 - 2 * t));
    const h = (washWidth * 0.5) * k;
    const x = pts[i][0];
    const y = pts[i][1];
    positions.push(x + nx * h, y + ny * h, x - nx * h, y - ny * h);
    sides.push(1, -1);
    arc.push(s[i], s[i]);
  }
  return { positions, sides, arc, count: n * 2 };
}

const VERT_RIVER = /* glsl */`
  attribute float aSide;
  attribute float aS;
  varying float vSide;
  varying float vS;
  void main() {
    vSide = aSide;
    vS = aS;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 逐行移植 Android MapShaders.FRAG_RIVER（三层河带 + 顺流微动画）
const FRAG_RIVER = /* glsl */`
  uniform vec4 uWash;
  uniform vec4 uBody;
  uniform vec4 uSpine;
  uniform vec4 uFracs;
  uniform vec3 uFlow;
  uniform float uAlpha;
  varying float vSide;
  varying float vS;
  void main() {
    float a = abs(vSide);
    float flow = 0.5 + 0.5 * cos(6.28318 * (vS / uFlow.x - uFlow.y * uFlow.z));
    vec3 bodyRgb = uBody.rgb * (1.0 + (flow - 0.5) * uFracs.w);
    float washA = uWash.a * (1.0 - smoothstep(0.55, 1.0, a));
    vec3 rgb = uWash.rgb;
    float alpha = washA;
    float bodyMask = 1.0 - smoothstep(uFracs.x - 0.06, uFracs.x + 0.06, a);
    rgb = mix(rgb, bodyRgb, bodyMask);
    alpha = alpha + uBody.a * bodyMask * (1.0 - alpha);
    if (uFracs.z > 0.5) {
      float spineMask = (1.0 - smoothstep(uFracs.y, uFracs.y + 0.3, a)) * (0.8 + 0.2 * flow);
      rgb = mix(rgb, uSpine.rgb, spineMask);
      alpha = alpha + uSpine.a * spineMask * (1.0 - alpha) * 0.55;
    }
    gl_FragColor = vec4(rgb, alpha * uAlpha);
  }
`;

/**
 * 组装单条河的 THREE.Mesh（三角带 + 河带着色器）。
 * uTime 顺流推进与 fadeIn 透明度经 onBeforeRender 同步（无需占用主渲染循环）。
 * @param {[number,number][]} worldPts 世界坐标折线（project() 输出，未镜像）
 * @param {{ boxWidth:number, rank?:number }} opts
 */
export function buildRiverRibbonMesh(worldPts, { boxWidth, rank = 1 } = {}) {
  // 稀疏折线（≤10 点）两次 Chaikin 平滑出毛笔运笔弧度（与 Android 同阈值）
  const smoothed = worldPts.length <= 10 ? chaikin(chaikin(worldPts)) : chaikin(worldPts);
  const { wash, body, spine, major } = riverLayerWidths(boxWidth, rank);
  const built = buildRiverVertices(smoothed, { washWidth: wash });
  if (!built) return null;

  const geometry = new THREE.BufferGeometry();
  // position 必须是 3 分量（three 的包围球/拾取按 vec3 读取，vec2 会越界出 NaN）
  const pos3 = [];
  for (let i = 0; i < built.positions.length; i += 2) pos3.push(built.positions[i], built.positions[i + 1], 0);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos3, 3));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(built.sides, 1));
  geometry.setAttribute('aS', new THREE.Float32BufferAttribute(built.arc, 1));
  const indices = [];
  for (let i = 0; i + 3 < built.count; i += 2) {
    indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  geometry.setIndex(indices);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT_RIVER,
    fragmentShader: FRAG_RIVER,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uWash: { value: new THREE.Vector4(...WASH_RGB, major ? ALPHA.majorWash : ALPHA.minorWash) },
      uBody: { value: new THREE.Vector4(...BODY_RGB, major ? ALPHA.majorBody : ALPHA.minorBody) },
      uSpine: { value: new THREE.Vector4(...BODY_RGB, ALPHA.majorSpine) },
      // 分层带宽比 [主体/水痕, 脊线/水痕, 是否大江, 流动幅度]（与几何同源，避免两处口径不一）
      uFracs: { value: new THREE.Vector4(body / wash, spine / wash, major ? 1 : 0, RIVER.FLOW_AMP) },
      uFlow: { value: new THREE.Vector3(RIVER.FLOW_WAVE, RIVER.FLOW_SPEED, 0) },
      uAlpha: { value: 1 },
    },
  });
  material.userData.lodAlpha = 1;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.onBeforeRender = () => {
    const u = material.uniforms;
    u.uFlow.value.z = (performance.now() / 1000) % 3600;
    // LOD 档位 alpha（applyVisibility 写入 userData）× fadeIn 补间（material.opacity）
    u.uAlpha.value = material.userData.lodAlpha * material.opacity;
  };
  return mesh;
}
