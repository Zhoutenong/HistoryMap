import { describe, it, expect } from 'vitest';
import { parseViewParams, viewToQuery, buildShareUrl } from '../share.js';

describe('parseViewParams', () => {
  it('解析完整深链接', () => {
    expect(parseViewParams('?dynasty=song&year=1127&event=5')).toEqual({
      dynasty: 'song',
      year: 1127,
      event: 5,
    });
  });

  it('容忍省略前导 ? 与无关参数', () => {
    expect(parseViewParams('dynasty=song&event=3&foo=1&s=xyz')).toEqual({ dynasty: 'song', event: 3 });
  });

  it('拒绝非法值：非数字年份/事件、越界年份', () => {
    expect(parseViewParams('?dynasty=song&year=abc')).toEqual({ dynasty: 'song' });
    expect(parseViewParams('?year=0&event=-1')).toBeNull();
    expect(parseViewParams('?event=0')).toBeNull();
    expect(parseViewParams('?year=100000')).toBeNull();
    expect(parseViewParams('?dynasty=宋 朝')).toBeNull();
  });

  it('没有任何视图参数时返回 null', () => {
    expect(parseViewParams('')).toBeNull();
    expect(parseViewParams('?s=abc')).toBeNull();
  });
});

describe('viewToQuery', () => {
  it('只序列化有效字段', () => {
    expect(viewToQuery({ dynasty: 'song', year: 1005 })).toBe('?dynasty=song&year=1005');
    expect(viewToQuery({ dynasty: 'song', year: undefined })).toBe('?dynasty=song');
    expect(viewToQuery({})).toBe('');
  });

  it('与 parseViewParams 往返一致', () => {
    const view = { dynasty: 'song', year: 1127, event: 5 };
    expect(parseViewParams(viewToQuery(view))).toEqual(view);
  });
});

describe('buildShareUrl', () => {
  it('非浏览器环境退回相对查询串', () => {
    expect(buildShareUrl({ dynasty: 'song', event: 7 })).toBe('?dynasty=song&event=7');
  });
});
