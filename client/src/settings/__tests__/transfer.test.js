import { describe, it, expect } from 'vitest';
import {
  exportSettingsText,
  importSettingsText,
  settingsToParam,
  settingsFromParam,
} from '../transfer.js';
import { defaultSettings } from '../store.js';

describe('exportSettingsText / importSettingsText', () => {
  it('设置对象文本导出后可原样导入', () => {
    const s = { ...defaultSettings, speed: 'fast', categories: ['era'] };
    expect(importSettingsText(exportSettingsText(s))).toEqual(s);
  });

  it('非法 JSON 返回 null', () => {
    expect(importSettingsText('not json')).toBeNull();
    expect(importSettingsText('')).toBeNull();
    expect(importSettingsText('{"year": 960}')).not.toBeNull();  // 合法 JSON 但字段不相关 → 合并默认值
  });

  it('部分文本与默认值合并并过滤非法分类', () => {
    const s = importSettingsText('{"speed":"slow","categories":["bogus","military"]}');
    expect(s.speed).toBe('slow');
    expect(s.categories).toEqual(['military']);
    expect(s.autoplay).toBe(defaultSettings.autoplay);
  });
});

describe('settingsToParam / settingsFromParam', () => {
  it('base64url 往返无损', () => {
    const s = { ...defaultSettings, categories: ['military'], autoplay: false, showBaseMap: true };
    expect(settingsFromParam(settingsToParam(s))).toEqual(s);
  });

  it('参数为 URL 安全字符（无 + / = 裸字符）', () => {
    const p = settingsToParam({ ...defaultSettings, speed: 'fast' });
    expect(p).not.toMatch(/[+/=]/);
  });

  it('垃圾/缺失参数返回 null', () => {
    expect(settingsFromParam('!!!')).toBeNull();
    expect(settingsFromParam('')).toBeNull();
    expect(settingsFromParam(null)).toBeNull();
    expect(settingsFromParam(undefined)).toBeNull();
  });
});
