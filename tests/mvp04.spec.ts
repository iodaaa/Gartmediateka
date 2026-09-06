import { test, expect } from "@playwright/test";
import * as fs from "node:fs/promises";
import path from "node:path";
const base = process.env.GART_E2E_ROOT!;
test("MVP04 affected UI: folder picker, previews, filenames, rename, naming and scan duplicates", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Scan хранилища", exact: true })
    .click();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.locator(".central-folders")).toContainText("Inbox");
  await page.locator(".central-folder").filter({ hasText: "Inbox" }).click();
  await expect(page.locator(".breadcrumbs")).toContainText("Inbox");
  await expect(
    page.getByRole("heading", { name: "В этой папке пусто" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Загрузить", exact: true }).click();
  await page.getByLabel("Выбрать изображения", { exact: true }).setInputFiles([
    {
      name: "photo.jpg",
      mimeType: "image/jpeg",
      buffer: await fs.readFile(path.join(base, "fixtures", "0.jpg")),
    },
    {
      name: "photo.jpg",
      mimeType: "image/jpeg",
      buffer: await fs.readFile(path.join(base, "fixtures", "1.jpg")),
    },
  ]);
  await expect(page.locator(".name-preview")).toContainText("photo (2).jpg");
  await page
    .getByRole("button", { name: "Загрузить файлы", exact: true })
    .click();
  await expect(page.locator(".upload-summary")).toContainText("Загружено: 2");
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  expect((await fs.readdir(path.join(base, "media", "Inbox"))).sort()).toEqual([
    "photo (2).jpg",
    "photo.jpg",
  ]);
  await expect(page.locator(".asset-card")).toHaveCount(2);
  for (const name of ["photo.jpg", "photo (2).jpg"]) {
    await page
      .getByRole("button", { name: "Выбрать " + name, exact: true })
      .click();
    await expect(page.locator(".properties h1")).toHaveText(name);
    await expect
      .poll(() =>
        page
          .locator(".properties .real-media-image")
          .evaluate((e: HTMLImageElement) => e.naturalWidth > 0),
      )
      .toBe(true);
    expect(
      await page
        .locator(".properties .real-media-image")
        .evaluate((e) => getComputedStyle(e).objectFit),
    ).toBe("contain");
    const box = await page
      .getByRole("button", { name: "Выбрать " + name, exact: true })
      .locator(".thumbnail")
      .boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(4 / 3, 1);
  }
  await page.getByRole("button", { name: "Выбрать всё", exact: true }).click();
  await page.getByRole("button", { name: "Переместить", exact: true }).click();
  await expect(page.locator(".folder-picker select")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Поиск папки", exact: true })
    .fill("Nested");
  await page
    .locator(".picker-tree")
    .getByRole("button", { name: "Nested", exact: true })
    .click();
  await expect(page.locator(".picker-breadcrumb")).toContainText("GART_FILES");
  await expect(page.locator(".picker-breadcrumb")).toContainText("Destination");
  await page
    .getByRole("button", { name: "Переместить сюда", exact: true })
    .click();
  await expect(page.locator(".asset-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Все файлы", exact: true }).click();
  await page
    .locator(".central-folder")
    .filter({ hasText: "Destination" })
    .click();
  await page.locator(".central-folder").filter({ hasText: "Nested" }).click();
  await expect(page.locator(".asset-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Выбрать всё", exact: true }).click();
  await page
    .getByRole("button", { name: "Переименовать", exact: true })
    .click();
  await page
    .getByLabel("Шаблон без расширения", { exact: true })
    .fill("Кадр_{counter}");
  await page
    .getByRole("button", { name: "Проверить имена", exact: true })
    .click();
  await expect(page.locator(".name-preview")).toContainText("Кадр_001.jpg");
  await expect(page.locator(".name-preview")).toContainText("Кадр_002.jpg");
  expect(
    await fs.readdir(path.join(base, "media", "Destination", "Nested")),
  ).toContain("photo.jpg");
  await page
    .getByRole("button", { name: "Применить переименование", exact: true })
    .click();
  await expect(page.locator(".asset-name").first()).toContainText("Кадр_");
  await page
    .getByRole("button", { name: "Выбрать Кадр_001.jpg", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Переименовать", exact: true })
    .click();
  await page
    .getByLabel("Шаблон без расширения", { exact: true })
    .fill("Плакат");
  await page
    .getByRole("button", { name: "Проверить имена", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Применить переименование", exact: true })
    .click();
  await expect(page.locator(".asset-name")).toContainText([
    "Кадр_002.jpg",
    "Плакат.jpg",
  ]);
  await page
    .getByRole("button", { name: "Выбрать Кадр_002.jpg", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Переименовать", exact: true })
    .click();
  await page
    .getByLabel("Шаблон без расширения", { exact: true })
    .fill("Плакат");
  await page
    .getByRole("button", { name: "Проверить имена", exact: true })
    .click();
  await expect(page.locator(".name-preview")).toContainText("Конфликт");
  await expect(
    page.getByRole("button", { name: "Применить переименование", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Закрыть диалог", exact: true })
    .click();
  // A single-file move with current-folder rejection and expandable search tree.
  await page.getByRole("button", { name: "Переместить", exact: true }).click();
  await page.getByLabel("Поиск папки", { exact: true }).fill("Nested");
  await expect(
    page
      .locator(".picker-tree")
      .getByRole("button", { name: "Nested", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Поиск папки", { exact: true }).fill("Inbox");
  await page
    .locator(".picker-tree")
    .getByRole("button", { name: "Inbox", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Переместить сюда", exact: true })
    .click();
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Все файлы", exact: true }).click();
  await page
    .locator(".central-folder")
    .filter({ hasText: "01_КЛИЕНТСКИЕ_ПРОЕКТЫ" })
    .click();
  await page.locator(".central-folder").filter({ hasText: "2026" }).click();
  await page
    .locator(".central-folder")
    .filter({ hasText: "GART-0111_Иванов" })
    .click();
  await page
    .locator(".central-folder")
    .filter({ hasText: "01_ОТ_КЛИЕНТА" })
    .click();
  await page.getByRole("button", { name: "Загрузить", exact: true }).click();
  await page
    .getByLabel("Выбрать изображения", { exact: true })
    .setInputFiles([
      path.join(base, "fixtures", "2.jpg"),
      path.join(base, "fixtures", "3.jpg"),
    ]);
  await expect(page.locator(".upload-naming")).toContainText(
    "Рекомендация: Фото от клиента",
  );
  await page
    .getByRole("button", { name: "Применить рекомендацию", exact: true })
    .click();
  await expect(page.locator(".name-preview")).toContainText(
    "GART-0111_Иванов_001.jpg",
  );
  await page
    .getByRole("button", { name: "Загрузить файлы", exact: true })
    .click();
  await expect(page.locator(".upload-summary")).toContainText("Загружено: 2");
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  const dest = path.join(
    base,
    "media",
    "01_КЛИЕНТСКИЕ_ПРОЕКТЫ",
    "2026",
    "GART-0111_Иванов",
    "01_ОТ_КЛИЕНТА",
  );
  expect(await fs.readdir(dest)).toContain("GART-0111_Иванов_002.jpg");
  await fs.copyFile(
    path.join(base, "fixtures", "4.jpg"),
    path.join(base, "media", "Inbox", "unique.jpg"),
  );
  await fs.copyFile(
    path.join(base, "media", "Destination", "Nested", "Плакат.jpg"),
    path.join(base, "media", "Inbox", "found-copy.jpg"),
  );
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.locator(".scan-summary")).toContainText(
    "Найдено новых файлов: 1",
  );
  await expect(page.locator(".scan-summary")).toContainText("Точных дублей: 1");
  await expect(page.locator(".scan-duplicates")).toContainText(
    "found-copy.jpg",
  );
  await page
    .getByRole("button", { name: "Показать существующий", exact: true })
    .click();
  await expect(page.locator(".properties h1")).toHaveText("Плакат.jpg");
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.locator(".scan-summary")).toContainText(
    "Найдено новых файлов: 0",
  );
  await page
    .getByRole("button", { name: "Оставить обе физические копии", exact: true })
    .click();
  await expect(page.locator(".scan-duplicates")).toContainText(
    "Обе физические копии оставлены",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", {
      name: "Переместить найденную копию в корзину",
      exact: true,
    })
    .click();
  await expect(page.locator(".scan-duplicates article")).toHaveCount(0);
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  expect((await (await request.get("/api/library")).json()).indexed).toBe(5);
  const screenshotDir = process.env.GART_SCREENSHOT_DIR || "test-results";
  await page.screenshot({
    path: path.join(screenshotDir, "gart-mvp04-focused.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
