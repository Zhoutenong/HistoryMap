// 设置导入/导出：纯函数，无 DOM 依赖，便于单测。
// 支持两种载体：
//   1. JSON 文本（复制/粘贴、下载/上传文件）
//   2. URL 参数（?s=<base64url(JSON)>，分享设置链接）
// 导入一律走 store.js 的 sanitizeSettings 校验，非法数据不会写入。

import { sanitizeSettings, defaultSettings } from './store.js';

/** 把设置序列化为可读 JSON 文本（导出用）。 */
export function exportSettingsText(settings = {}) {
  return JSON.stringify({ ...defaultSettings, ...settings }, null, 2);
}

/**
 * 解析 JSON 文本为合法设置对象。
 * @param {string} text
 * @returns {object|null} 合法设置对象；JSON 非法时返回 null
 */
export function importSettingsText(text) {
  try {
    const parsed = JSON.parse(String(text || ''));
    return sanitizeSettings(parsed);
  } catch {
    return null;
  }
}

/** 把设置编码为 URL 安全的 base64url 字符串（分享链接用）。 */
export function settingsToParam(settings = {}) {
  return toBase64Url(JSON.stringify({ ...defaultSettings, ...settings }));
}

/**
 * 从 URL 参数值解码设置。
 * @param {string|null|undefined} value URLSearchParams.get('s') 的结果
 * @returns {object|null} 合法设置对象；参数缺失/编码损坏时返回 null
 */
export function settingsFromParam(value) {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const parsed = JSON.parse(fromBase64Url(value));
    return sanitizeSettings(parsed);
  } catch {
    return null;
  }
}

// —— base64url 编解码（TextEncoder/TextDecoder 在 Node 与浏览器通用）——

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
