import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings, loadSettings, sanitizeSettings, saveSettings } from '../store.js';

const originalStorage = globalThis.localStorage;

afterEach(() => {
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
});

describe('settings store without a DOM', () => {
  it('returns defaults when localStorage is unavailable', () => {
    delete globalThis.localStorage;
    expect(loadSettings()).toEqual(defaultSettings);
    expect(saveSettings({ speed: 'fast' }).speed).toBe('fast');
  });

  it('merges and filters persisted settings', () => {
    const values = new Map([
      ['historymap.settings.v1', JSON.stringify({ categories: ['era', '', 'military'], speed: 'slow' })],
    ]);
    globalThis.localStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    expect(loadSettings()).toMatchObject({ categories: ['era', 'military'], speed: 'slow', autoplay: true });
    expect(saveSettings({ autoplay: false })).toMatchObject({ speed: 'slow', autoplay: false });
  });
});

describe('sanitizeSettings', () => {
  it('非法输入回退到默认值', () => {
    expect(sanitizeSettings(null)).toEqual(defaultSettings);
    expect(sanitizeSettings('oops')).toEqual(defaultSettings);
    expect(sanitizeSettings([1, 2])).toEqual(defaultSettings);
  });

  it('部分对象与默认值合并', () => {
    const s = sanitizeSettings({ speed: 'fast' });
    expect(s.speed).toBe('fast');
    expect(s.autoplay).toBe(defaultSettings.autoplay);
    expect(s.categories).toEqual(defaultSettings.categories);
  });

  it('过滤未知分类并去重', () => {
    const s = sanitizeSettings({ categories: ['era', 'era', 'bogus', 'military'] });
    expect(s.categories).toEqual(['era', 'military']);
  });

  it('非法速度与非法布尔开关回退默认', () => {
    const s = sanitizeSettings({ speed: 'warp', showOverlay: 'yes', autoplay: 1 });
    expect(s.speed).toBe(defaultSettings.speed);
    expect(s.showOverlay).toBe(defaultSettings.showOverlay);
    expect(s.autoplay).toBe(defaultSettings.autoplay);
  });

  it('合法布尔开关原样保留', () => {
    const s = sanitizeSettings({ showBaseMap: true, autoplay: false });
    expect(s.showBaseMap).toBe(true);
    expect(s.autoplay).toBe(false);
  });
});
