import { test, expect } from '@playwright/test';

test.describe('HistoryMap smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });
    await expect(page.locator('#dynasty-select')).toHaveValue('song');
  });

  test('loads the map and switches between Song and Jin', async ({ page }) => {
    await expect(page).toHaveTitle(/中国历史地图/);
    await expect(page.locator('#scene-container')).toBeVisible();
    await expect(page.locator('#dynasty-select option')).toHaveCount(2);

    await page.locator('#dynasty-select').selectOption('jin');
    await expect(page.locator('#dynasty-select')).toHaveValue('jin');
    await expect(page.locator('.brand-seal')).toHaveText('金');

    await page.locator('#dynasty-select').selectOption('song');
    await expect(page.locator('#dynasty-select')).toHaveValue('song');
    await expect(page.locator('.brand-seal')).toHaveText('宋');
  });

  test('searches an unseen event in the event log', async ({ page }) => {
    await page.getByRole('button', { name: '打开历史事件流' }).click();
    const search = page.getByRole('textbox', { name: '搜索事件' });
    await search.fill('陈桥兵变');
    await expect(page.locator('.log-search-result')).toContainText('陈桥兵变');
    await expect(page.locator('.log-search-result')).toHaveCount(1);

    await search.fill('不存在的历史事件');
    await expect(page.locator('.log-empty')).toHaveText('没有匹配的事件');
  });

  test('opens event details and closes them with Escape', async ({ page }) => {
    await page.getByRole('button', { name: '打开历史事件流' }).click();
    await page.getByRole('textbox', { name: '搜索事件' }).fill('陈桥兵变');
    await page.locator('.log-search-result').click();
    await expect(page.locator('#detail-panel')).toBeVisible();
    await expect(page.locator('#detail-title')).toContainText('陈桥兵变');

    await page.keyboard.press('Escape');
    await expect(page.locator('#detail-panel')).toBeHidden();
  });

  test('toggles the settings panel', async ({ page }) => {
    const settings = page.getByRole('button', { name: '打开设置' });
    await settings.click();
    await expect(page.locator('#settings-panel')).toBeVisible();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-panel')).toBeHidden();
  });
});
