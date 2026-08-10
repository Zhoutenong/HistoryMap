import { describe, it, expect } from 'vitest';
import { searchEvents, splitHighlight } from '../EventLog.js';

const events = [
  { id: 1, year: 960, short: '陈桥兵变', title: '陈桥兵变 · 北宋建立', place: '陈桥驿' },
  { id: 2, year: 1004, short: '澶渊之盟', title: '宋辽澶渊之盟', place: '澶州' },
  { id: 3, year: 1127, short: '靖康之变', title: '北宋覆亡', place: '东京', detail: '金军南下，东京失守。' },
];

describe('searchEvents', () => {
  it('按字段过滤命中', () => {
    expect(searchEvents(events, '东京').map((e) => e.id)).toEqual([3]);
    expect(searchEvents(events, '1127').map((e) => e.id)).toEqual([3]);
  });

  it('不区分大小写', () => {
    expect(searchEvents([{ id: 1, year: 960, title: 'Song Dynasty' }], 'song').map((e) => e.id)).toEqual([1]);
  });

  it('相关性排序：标题/简称命中优先于正文命中', () => {
    const evs = [
      { id: 1, year: 1100, short: '王安石', title: '王安石变法', detail: '北宋改革' },
      { id: 2, year: 1069, short: '变法开始', title: '熙宁变法', detail: '王安石主导的新法推行' },
    ];
    expect(searchEvents(evs, '王安石').map((e) => e.id)).toEqual([1, 2]);
  });

  it('同分按年份升序（结果稳定）', () => {
    const evs = [
      { id: 1, year: 1100, short: '甲', place: '东京' },
      { id: 2, year: 1000, short: '乙', place: '东京' },
    ];
    expect(searchEvents(evs, '东京').map((e) => e.id)).toEqual([2, 1]);
  });

  it('空查询返回空数组', () => {
    expect(searchEvents(events, '  ')).toEqual([]);
    expect(searchEvents(events, '')).toEqual([]);
  });
});

describe('splitHighlight', () => {
  it('拆出命中/未命中段', () => {
    expect(splitHighlight('陈桥兵变 · 北宋建立', '兵变')).toEqual([
      { text: '陈桥', match: false },
      { text: '兵变', match: true },
      { text: ' · 北宋建立', match: false },
    ]);
  });

  it('多处命中且不区分大小写', () => {
    expect(splitHighlight('Song Song', 'song')).toEqual([
      { text: 'Song', match: true },
      { text: ' ', match: false },
      { text: 'Song', match: true },
    ]);
  });

  it('空查询返回单段未命中', () => {
    expect(splitHighlight('abc', '')).toEqual([{ text: 'abc', match: false }]);
    expect(splitHighlight('', 'x')).toEqual([{ text: '', match: false }]);
  });
});
