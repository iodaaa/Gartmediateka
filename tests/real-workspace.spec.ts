import { test, expect } from "@playwright/test";
import path from "node:path";
import * as fs from "node:fs/promises";
const fixtureRoot = process.env.GART_E2E_ROOT!;
test("real folder, multi-image upload, duplicate, properties, rename and breadcrumb", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (event) => {
    if (event.type() === "error") errors.push(event.text());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Scan хранилища", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Scan завершён" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  const before = await (await request.get("/api/library")).json();
  await request.post("/api/scan");
  const after = await (await request.get("/api/library")).json();
  expect(after.folders.length).toBe(before.folders.length);
  expect(after.indexed).toBe(1);
  await page.getByRole("button", { name: "Новая папка", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Название", exact: true })
    .fill("Папка UI");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.locator(".breadcrumbs")).toContainText("Папка UI");
  expect(
    (await fs.stat(path.join(fixtureRoot, "media", "Папка UI"))).isDirectory(),
  ).toBe(true);
  await page.getByRole("button", { name: "Загрузить", exact: true }).click();
  await page
    .getByLabel("Выбрать изображения")
    .setInputFiles(path.join(fixtureRoot, "fixtures", "image-1.jpg"));
  await page.getByLabel("Источник", { exact: true }).selectOption("GART");
  await page
    .getByRole("button", { name: "Загрузить файлы", exact: true })
    .click();
  await expect(page.locator(".upload-results")).toContainText("Загружен");
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Загрузить", exact: true }).click();
  await page
    .getByLabel("Выбрать изображения")
    .setInputFiles([
      path.join(fixtureRoot, "fixtures", "image-2.jpg"),
      path.join(fixtureRoot, "fixtures", "image-3.jpg"),
      path.join(fixtureRoot, "fixtures", "image-0.jpg"),
    ]);
  await page
    .getByRole("button", { name: "Загрузить файлы", exact: true })
    .click();
  await expect(page.locator(".upload-results .imported")).toHaveCount(2);
  await expect(page.locator(".upload-results .duplicate")).toContainText(
    "существующее.jpg",
  );
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.locator(".asset-card")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Выбрать image-1.jpg", exact: true })
    .click();
  await expect(page.locator(".properties h1")).toHaveText("image-1.jpg");
  await expect(page.locator(".metadata")).toContainText("image/jpeg");
  await expect(page.locator(".metadata")).toContainText("320 × 220");
  await expect(page.locator(".metadata")).toContainText("GART-");
  await expect(
    page.getByRole("tab", { name: "Теги", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page
        .locator(".asset-card img")
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Переименовать папку", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Название", exact: true })
    .fill("Переименованная UI");
  await page
    .getByRole("button", { name: "Переименовать", exact: true })
    .click();
  await expect(page.locator(".breadcrumbs")).toContainText(
    "Переименованная UI",
  );
  await expect(page.locator(".asset-card")).toHaveCount(3);
  const listing = await (await request.get("/api/library")).json();
  const folder = listing.folders.find(
    (f: { name: string }) => f.name === "Переименованная UI",
  );
  expect(folder).toBeTruthy();
  const assets = await (
    await request.get("/api/library?folderId=" + folder.id)
  ).json();
  for (const asset of assets.assets)
    expect(asset.storagePath.startsWith("Переименованная UI/")).toBe(true);
  await page.getByRole("button", { name: "Список", exact: true }).click();
  await expect(page.locator(".list-view .asset-card")).toHaveCount(3);
  await page
    .getByRole("textbox", { name: "Поиск в выбранной папке" })
    .fill("image-1");
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Очистить поиск" }).click();
  await page.reload();
  await expect(page.locator(".folder-tree")).toContainText(
    "Переименованная UI",
  );
  await page
    .locator(".real-tree-select")
    .filter({ hasText: "Переименованная UI" })
    .click();
  await expect(page.locator(".asset-card")).toHaveCount(3);
  // Real drag/drop goes through the same multipart service and detects the existing hash.
  const bytes = await fs.readFile(
    path.join(fixtureRoot, "fixtures", "image-1.jpg"),
  );
  const transfer = await page.evaluateHandle((values) => {
    const dt = new DataTransfer();
    dt.items.add(
      new File([new Uint8Array(values)], "dropped.jpg", { type: "image/jpeg" }),
    );
    return dt;
  }, Array.from(bytes));
  await page
    .locator(".workspace")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await page
    .getByRole("button", { name: "Загрузить файлы", exact: true })
    .click();
  await expect(page.locator(".upload-results .duplicate")).toContainText(
    "Пропущен",
  );
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  expect(errors).toEqual([]);
});

for (const [width, height] of [
  [1440, 1000],
  [1920, 1080],
  [2560, 1440],
  [390, 844],
]) {
  test(`real UI layout ${width}x${height}`, async ({ page, request }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const listing = await (await request.get("/api/library")).json();
    const folder = listing.folders.find(
      (f: { name: string }) => f.name === "Переименованная UI",
    );
    expect(folder).toBeTruthy();
    if (width < 761)
      await page.getByRole("button", { name: "Открыть меню" }).click();
    await page
      .locator(".real-tree-select")
      .filter({ hasText: "Переименованная UI" })
      .click();
    await expect(page.locator(".asset-card")).toHaveCount(3);
    await expect
      .poll(() =>
        page
          .locator(".asset-card img")
          .evaluateAll((images) =>
            images.every(
              (image) => (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const dir = process.env.GART_SCREENSHOT_DIR || "test-results/screenshots";
    await page.screenshot({
      path: path.join(dir, `gart-mvp02-${width}x${height}.png`),
      fullPage: true,
      caret: "initial",
    });
    if (width < 761) {
      await page
        .getByRole("button", { name: "Выбрать image-1.jpg", exact: true })
        .click();
      await expect(page.locator(".properties")).toBeVisible();
    }
  });
}
