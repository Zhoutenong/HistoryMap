// 兼容旧浏览器的 DOM 工具（Chrome 83 级别，见 vite build.target）。
// Element.replaceChildren() 需 Chrome 86+，此处统一提供兼容实现。

/** 清空元素全部子节点（等价于 el.replaceChildren()） */
export function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
