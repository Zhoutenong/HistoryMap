// 事件详情深链接（share / deep link）：
// URL 查询参数 ?dynasty=song&year=1127&event=5 恢复「朝代 + 年份 + 详情」视图。
// 本文件只做纯字符串解析/序列化（单测覆盖）；浏览器侧的 history 路由接线在 main.js。
// copyText 为浏览器剪贴板小工具，详情面板与设置面板共用。

/** 合法的朝代 id 形态（与后端 dynasties.id 一致：小写字母/数字/_/-）。 */
const DYNASTY_RE = /^[a-z0-9_-]+$/i;

/**
 * 解析 URL 查询字符串中的视图参数。
 * @param {string} [search] location.search（可省略前导 '?'）
 * @returns {{dynasty?: string, year?: number, event?: number}|null}
 *   只保留通过校验的字段；没有任何有效字段时返回 null。
 */
export function parseViewParams(search = '') {
  const params = new URLSearchParams(search);
  const view = {};
  const dynasty = params.get('dynasty');
  if (dynasty && DYNASTY_RE.test(dynasty)) view.dynasty = dynasty;
  const year = Number(params.get('year'));
  if (params.get('year') && Number.isInteger(year) && year > 0 && year <= 9999) view.year = year;
  const event = Number(params.get('event'));
  if (params.get('event') && Number.isInteger(event) && event > 0) view.event = event;
  return Object.keys(view).length ? view : null;
}

/**
 * 把视图对象序列化为查询字符串（只含有效字段，空视图返回 ''）。
 * @param {{dynasty?: string, year?: number, event?: number}} [view]
 * @returns {string} 例如 '?dynasty=song&year=1127&event=5'
 */
export function viewToQuery(view = {}) {
  const params = new URLSearchParams();
  if (view.dynasty) params.set('dynasty', String(view.dynasty));
  if (view.year !== undefined && view.year !== null) params.set('year', String(view.year));
  if (view.event !== undefined && view.event !== null) params.set('event', String(view.event));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * 生成完整分享链接（origin + pathname + 视图参数）。
 * 非浏览器环境（单测/SSR）下退回相对查询串。
 */
export function buildShareUrl(view = {}) {
  const base = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : '';
  return `${base}${viewToQuery(view)}`;
}

/**
 * 复制文本到剪贴板。
 * 优先 navigator.clipboard；非安全上下文或权限失败时回退隐藏 textarea + execCommand。
 * @param {string} text
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 权限被拒等场景，落到 execCommand 回退
    }
  }
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    // execCommand 抛错时 ok 保持 false
  }
  ta.remove();
  return ok;
}
