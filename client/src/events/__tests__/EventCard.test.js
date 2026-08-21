// 事件分享卡片纯函数测试（P3）：SVG 结构、XML 转义、摘要与换行
import { describe, expect, test } from 'vitest';
import { buildEventCardSVG, eventSummary } from '../EventCard.js';

describe('eventSummary 首句摘要', () => {
  test('首句截断', () => {
    expect(eventSummary('陈桥兵变，赵匡胤率军北上。后周灭亡。')).toBe('陈桥兵变，赵匡胤率军北上');
  });
  test('多种句末分隔符取最早', () => {
    expect(eventSummary('第一句！第二句。')).toBe('第一句');
    expect(eventSummary('第一句？第二句。')).toBe('第一句');
  });
  test('超长截断加省略号且不超上限', () => {
    const s = eventSummary('a'.repeat(80), 56);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBe(56);
  });
  test('空文本返回空', () => {
    expect(eventSummary('')).toBe('');
    expect(eventSummary('   ')).toBe('');
  });
});

describe('buildEventCardSVG', () => {
  test('包含年份水印/标题/地点/脚注', () => {
    const svg = buildEventCardSVG({
      year: 1127, title: '靖康之变', place: '东京开封', summary: '北宋灭亡。',
      dynastyName: '宋朝', footnote: '测试脚注',
    });
    expect(svg).toContain('1127');
    expect(svg).toContain('靖康之变');
    expect(svg).toContain('东京开封');
    expect(svg).toContain('测试脚注');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    // 朝代印章取首字去「朝」
    expect(svg).toContain('>宋</text>');
  });

  test('文本 XML 转义（引号与尖括号）', () => {
    const svg = buildEventCardSVG({ year: 1000, title: 'A<b>"c"&d', summary: '' });
    expect(svg).toContain('A&lt;b&gt;&quot;c&quot;&amp;d');
    expect(svg).not.toContain('A<b>');
  });

  test('长摘要换行为多行且封顶 4 行', () => {
    const svg = buildEventCardSVG({ year: 1000, title: 't', summary: '字'.repeat(200) });
    const lineCount = (svg.match(/<text x="64" y="\d+" font-size="24"/g) || []).length;
    expect(lineCount).toBe(4);
    expect(svg).toContain('…');
  });

  test('无截图时回退素色地图层，有截图时嵌入 image', () => {
    const plain = buildEventCardSVG({ year: 1, title: 't' });
    expect(plain).not.toContain('<image ');
    const shot = buildEventCardSVG({ year: 1, title: 't', mapDataUrl: 'data:image/png;base64,AAAA' });
    expect(shot).toContain('<image href="data:image/png;base64,AAAA"');
  });
});
