// 兼容旧 WebView 的 DOM 工具。
// Android 真机（如 P20 自带 WebView Chrome 83）不支持 Element.replaceChildren()
// （Chrome 86+ 才引入），此处统一提供兼容实现，对现代浏览器同样成立。

/** 清空元素全部子节点（等价于 el.replaceChildren()） */
export function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
