import { test, expect } from "@playwright/test";
import path from "node:path";

test("gallery, filtering, selection, tabs and session-only controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  await page.goto("/");
  await expect(page.locator(".asset-card")).toHaveCount(9);
  await expect(page.locator(".properties h1")).toHaveText("Терраса_вид.jpg");
  await page
    .getByRole("button", { name: "Выбрать DSC_8321.jpg", exact: true })
    .click();
  await expect(page.locator(".properties h1")).toHaveText("DSC_8321.jpg");
  await page.getByRole("tab", { name: "Теги", exact: true }).click();
  await expect(page.locator(".tags")).toContainText("Стекло");
  await page.getByRole("tab", { name: "Комментарии", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Новый комментарий" })
    .fill("Проверка демосессии");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(page.locator(".comment")).toContainText("Проверка демосессии");
  await page
    .getByRole("textbox", { name: "Поиск по медиатеке" })
    .fill("Терраса");
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Очистить поиск" }).click();
  await page.locator(".filter-chip").filter({ hasText: "Видео" }).click();
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await expect(page.locator(".asset-name")).toHaveText("Видео_облет.mp4");
  await page.locator(".filter-chip").filter({ hasText: "Все" }).click();
  await page.getByRole("button", { name: "Список", exact: true }).click();
  await expect(page.locator(".list-view .asset-card")).toHaveCount(9);
  await page.getByRole("button", { name: "Галерея", exact: true }).click();
  await page.getByRole("button", { name: "Загрузить", exact: true }).click();
  await expect(page.locator("dialog")).toBeVisible();
  await expect(page.locator("dialog")).toContainText("загрузка отключена");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Новая папка", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Название", exact: true })
    .fill("Тестовая папка");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.locator(".folder-tree")).toContainText("Тестовая папка");
  await page.reload();
  await expect(page.locator(".folder-tree")).not.toContainText(
    "Тестовая папка",
  );
  expect(errors).toEqual([]);
});

for (const [width, height] of [
  [1440, 1000],
  [1920, 1080],
  [2560, 1440],
  [1024, 768],
  [390, 844],
]) {
  test(`layout and screenshot ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Галерея", exact: true }).click();
    await expect(page.locator(".asset-card")).toHaveCount(9);
    // Wait for the actual sprite asset, including CSS background-image decoding.
    await page.evaluate(async () => {
      const image = new Image();
      image.src = "/demo/architecture-sheet.png";
      await image.decode();
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width > 1050) {
      await expect(page.locator(".sidebar")).toBeVisible();
      await expect(page.locator(".properties")).toBeVisible();
      const panes = await page
        .locator(".sidebar, .workspace, .properties")
        .evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return { left: r.left, right: r.right };
          }),
        );
      expect(panes[0].right).toBeLessThanOrEqual(panes[1].left + 1);
      expect(panes[1].right).toBeLessThanOrEqual(panes[2].left + 1);
    }
    const screenshotDir =
      process.env.GART_SCREENSHOT_DIR || "test-results/screenshots";
    await page.screenshot({
      path: path.join(screenshotDir, `gart-${width}x${height}.png`),
      fullPage: true,
      caret: "initial",
    });
    if (width < 761) {
      await page
        .getByRole("button", { name: "Открыть меню", exact: true })
        .click();
      await expect(page.locator(".sidebar")).toBeVisible();
      await page
        .locator(".mobile-sidebar-title")
        .getByRole("button", { name: "Закрыть меню" })
        .click();
      await page
        .getByRole("button", { name: "Выбрать Терраса_вид.jpg" })
        .click();
      await expect(page.locator(".properties")).toBeVisible();
      await page
        .getByRole("button", { name: "Закрыть свойства", exact: true })
        .last()
        .click();
      await expect(page.locator(".properties")).not.toBeVisible();
    }
  });
}
