/**
 * 双端共享数值契约 —— 由 scripts/gen-contract-tokens.mjs 从 contract/tokens.json 自动生成。
 * ⚠️ 请勿手工编辑：改动契约请修改 contract/tokens.json 后运行 `npm run contract:tokens:write`，
 * 并在提交前保证 `npm run contract:tokens`（生成物与契约 diff 校验）通过。
 * 双端共享数值契约（codebase-review-plan.md A2 第二步）：Web（client/src/contract-tokens.js）与 Android（ContractTokens.kt）以及服务端参考实现（overlay-merge.js）都以本文件为唯一事实来源。改数值请改这里，再运行 `npm run contract:tokens:write` 重生成双端产物，提交前保证 `npm run contract:tokens`（生成物与契约 diff 核对）通过。颜色属视觉层（design-tokens.json / MapVisualTokens 管线），不入本契约。
 */
const PROJECTION = Object.freeze({ fitWidth: 1000, fitHeight: 800 });
const LOD = Object.freeze({ hysteresis: 0.02, thresholds: Object.freeze([0.4, 0.24, 0.13]) });
const COLLISION = Object.freeze({ gap: 6, maxPush: 64, viewportPad: 6 });
const PLACE_KINDS = Object.freeze(["capital","battlefield","academy"]);
const CATEGORIES = Object.freeze([
  Object.freeze({ id: "era", label: "时代格局", labelShort: "政治" }),
  Object.freeze({ id: "figure", label: "名人轨迹", labelShort: "人物" }),
  Object.freeze({ id: "military", label: "军事·领土", labelShort: "军事" }),
  Object.freeze({ id: "economy", label: "经济变革", labelShort: "经济" }),
  Object.freeze({ id: "invention", label: "重要发明", labelShort: "文化" }),
]);
const SPEEDS = Object.freeze({ slow: 40, normal: 20, fast: 10 });
const CONTRACT = Object.freeze({
  version: 1,
  projection: PROJECTION,
  lod: LOD,
  collision: COLLISION,
  placeKinds: PLACE_KINDS,
  categories: CATEGORIES,
  speeds: SPEEDS,
});

export { PROJECTION, LOD, COLLISION, PLACE_KINDS, CATEGORIES, SPEEDS, CONTRACT };
export default CONTRACT;
