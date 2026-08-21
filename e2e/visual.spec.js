// P5 视觉回归基线 + 移动端/平板视口核心流程。
// 截图只针对 DOM 稳定区域（顶栏/时间轴/详情面板）——WebGL 水彩含随机颗粒，
// 画布级像素比对会 flaky。
// 基线更新：npx playwright test e2e/visual.spec.js --update-snapshots
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
];

test.describe('核心流程（视口矩阵）', () => {
  for (const vp of VIEWPORTS) {
    test(`[${vp.name}] 切朝代→搜索→详情→设置→关闭`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });

      await page.locator('#dynasty-select').selectOption('tang');
      await expect(page.locator('.brand-seal')).toHaveText('唐');

      await page.getByRole('button', { name: '打开历史事件流' }).click();
      await page.getByRole('textbox', { name: '搜索事件' }).fill('玄武');
      const results = page.locator('.log-search-result');
      if (await results.count() > 0) {
        await results.first().click();
        await expect(page.locator('#detail-panel')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#detail-panel')).toBeHidden();
      }

      await page.getByRole('button', { name: '打开设置' }).click();
      await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
      // 人物视角区（P1）在手机/平板视口均可用
      await expect(page.locator('#settings-person')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#settings-panel')).toBeHidden();
      await context.close();
    });
  }
});

test.describe('视觉基线（DOM 稳定区域）', () => {
  test('顶栏 + 时间轴（desktop）', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });
    await page.evaluate(() => window.pauseForTest?.());
    await expect(page.locator('#topbar')).toHaveScreenshot('topbar.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
    await expect(page.locator('#timeline')).toHaveScreenshot('timeline.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('详情面板（desktop）', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });
    await page.getByRole('button', { name: '打开历史事件流' }).click();
    await page.getByRole('textbox', { name: '搜索事件' }).fill('陈桥兵变');
    await page.locator('.log-search-result').click();
    await expect(page.locator('#detail-panel')).toBeVisible();
    await expect(page.locator('#detail-panel')).toHaveScreenshot('detail-panel.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('详情面板（phone 390×844，底部抽屉形态）', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });
    await page.getByRole('button', { name: '打开历史事件流' }).click();
    await page.getByRole('textbox', { name: '搜索事件' }).fill('陈桥兵变');
    await page.locator('.log-search-result').click();
    await expect(page.locator('#detail-panel')).toBeVisible();
    await expect(page.locator('#detail-panel')).toHaveScreenshot('detail-panel-mobile.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
    await context.close();
  });
});
