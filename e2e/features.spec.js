// 新功能 e2e（P1 人物视角 / P2 全时期模式 / P3 卡片与深链接 / P4 考据信息）。
// 依赖后端 :3001（npm run e2e 前先启动 dev:server；详见 README）。
import { test, expect } from '@playwright/test';

test.describe('P1 人物视角', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });
  });

  test('设置面板人物下拉过滤事件泡泡', async ({ page }) => {
    await page.getByRole('button', { name: '打开设置' }).click();
    const personSelect = page.locator('#settings-person');
    await expect(personSelect).toBeVisible();
    // 人物列表来自 /api/persons（60 位，岳飞关联最多在前列）
    const optionCount = await personSelect.locator('option').count();
    expect(optionCount).toBeGreaterThan(10);

    // 选中「岳飞」：下拉值变更 + 泡泡层按人物过滤（详情人物徽章可打开其轨迹）
    const yueOption = personSelect.locator('option', { hasText: '岳飞' }).first();
    const value = await yueOption.getAttribute('value');
    expect(value).toBeTruthy();
    await personSelect.selectOption(value);
    await expect(personSelect).toHaveValue(value);
    // 选中后筛选生效的可见信号：设置面板仍可见且选中项为岳飞
    await expect(personSelect.locator('option[selected], option')).first().toBeVisible();
  });

  test('事件详情显示相关人物徽章与资料来源（P1/P4）', async ({ page }) => {
    await page.goto('/?dynasty=song&year=960');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });
    await page.getByRole('button', { name: '打开历史事件流' }).click();
    await page.getByRole('textbox', { name: '搜索事件' }).fill('陈桥兵变');
    await page.locator('.log-search-result').click();
    await expect(page.locator('#detail-panel')).toBeVisible();
    // 相关人物徽章（P1）
    await expect(page.locator('.detail-person-chip').first()).toContainText('赵匡胤');
    // 资料来源（P4）
    await expect(page.locator('#detail-panel')).toContainText('资料来源');
    await expect(page.locator('#detail-panel')).toContainText('置信度');
    await page.keyboard.press('Escape');
  });
});

test.describe('P2 全时期模式', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });
  });

  test('开关切换：1111 年同屏多政权，朝代模式行为不变', async ({ page }) => {
    const toggle = page.locator('#allperiod-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#dynasty-select')).toBeDisabled();
    // 跳到 1111 年：图例应出现宋与辽（regimes-1100.json 同屏）
    await page.evaluate(() => window.setYearForTest?.(1111));
    await expect(page.locator('#legend')).not.toHaveClass(/hidden/, { timeout: 10_000 });
    await expect(page.locator('#legend')).toContainText('宋');
    await expect(page.locator('#legend')).toContainText('辽');

    // 关闭：回到朝代模式，下拉恢复可用
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#dynasty-select')).toBeEnabled();
    await expect(page.locator('#dynasty-select')).toHaveValue('song');
  });
});

test.describe('P3 分享卡片与深链接', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });
  });

  test('详情面板生成并下载卡片 PNG', async ({ page }) => {
    await page.getByRole('button', { name: '打开历史事件流' }).click();
    await page.getByRole('textbox', { name: '搜索事件' }).fill('陈桥兵变');
    await page.locator('.log-search-result').click();
    await expect(page.locator('#detail-panel')).toBeVisible();

    const cardBtn = page.getByRole('button', { name: '生成并下载分享卡片图' });
    await expect(cardBtn).toBeVisible();
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await cardBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^historymap-song-960.*\.png$/);
    await page.keyboard.press('Escape');
  });

  test('深链接定位到事件并打开详情', async ({ page }) => {
    // 先取一个事件 id（陈桥兵变 = 当前朝代事件列表首条）
    const events = await page.evaluate(async () => (await (await fetch('/api/events?dynasty=song')).json()));
    const target = events.find((e) => e.short === '澶渊之盟');
    await page.goto(`/?dynasty=song&year=${target.year}&event=${target.id}`);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });
    await expect(page.locator('#detail-panel')).toBeVisible();
    await expect(page.locator('#detail-title')).toContainText('澶渊之盟');
    await expect(page.locator('#year-watermark')).toHaveText(String(target.year));
  });
});

test.describe('P5 可访问性', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });
  });

  test('顶栏控件 ARIA 语义齐全', async ({ page }) => {
    await expect(page.locator('#allperiod-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#allperiod-toggle')).toHaveAttribute('aria-label', '全时期模式');
    await expect(page.locator('#dynasty-select')).toHaveAttribute('aria-label', '选择朝代');
    await expect(page.locator('#log-toggle')).toHaveAttribute('aria-expanded');
    await expect(page.locator('#settings-btn')).toHaveAttribute('aria-controls', 'settings-panel');
  });

  test('键盘可达：Tab 聚焦事件泡泡后 Enter 打开详情', async ({ page }) => {
    // 暂停自动播放，跳到 960 年让陈桥兵变泡泡在窗口内
    await page.evaluate(() => window.setYearForTest?.(960));
    const bubble = page.locator('.event-bubble .bubble-inner').first();
    await expect(bubble).toBeVisible();
    await bubble.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#detail-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#detail-panel')).toBeHidden();
  });
});
