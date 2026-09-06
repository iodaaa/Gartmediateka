import { test, expect } from "@playwright/test";
import path from "node:path";
import * as fs from "node:fs/promises";
import { unzip } from "./zip-helper";
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

test("MVP03 picker/drop both directions, selection, downloads, trash, restore, folder and project", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Новая папка", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Название", exact: true })
    .fill("MVP03 files");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.locator(".breadcrumbs")).toContainText("MVP03 files");
  const drop = async (names: string[], target = ".workspace") => {
    const values = await Promise.all(
      names.map(async (name) => ({
        name,
        bytes: Array.from(
          await fs.readFile(path.join(fixtureRoot, "fixtures", name)),
        ),
      })),
    );
    const transfer = await page.evaluateHandle((files) => {
      const dt = new DataTransfer();
      for (const f of files)
        dt.items.add(
          new File([new Uint8Array(f.bytes)], f.name, { type: "image/jpeg" }),
        );
      return dt;
    }, values);
    await page
      .locator(target)
      .dispatchEvent("drop", { dataTransfer: transfer });
    await transfer.dispose();
  };
  await drop(["image-4.jpg"]);
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator(".upload-picker").click();
  await (
    await chooserPromise
  ).setFiles(path.join(fixtureRoot, "fixtures", "image-5.jpg"));
  await expect(page.locator(".pending-files li")).toHaveCount(2);
  await page
    .getByLabel("Выбрать изображения", { exact: true })
    .dispatchEvent("cancel");
  await drop(["image-6.jpg", "image-4.jpg"], "dialog");
  await expect(page.locator(".pending-files li")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Загрузить файлы", exact: true })
    .click();
  await expect(page.locator(".upload-summary")).toContainText(
    "Загружено: 3 · Пропущено: 1 · Ошибок: 0",
  );
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.locator(".asset-card")).toHaveCount(3);
  // Picker opened first, cancelled, followed by a multi-file drop on the modal.
  await page.getByRole("button", { name: "Загрузить", exact: true }).click();
  const picker = page.waitForEvent("filechooser");
  await page.locator(".upload-picker").click();
  await (await picker).setFiles([]);
  await drop(["image-4.jpg", "image-5.jpg"], "dialog");
  await page
    .getByRole("button", { name: "Загрузить файлы", exact: true })
    .click();
  await expect(page.locator(".upload-summary")).toContainText("Пропущено: 2");
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  const cards = page.locator(".asset-card");
  await cards.nth(0).click();
  await cards.nth(1).click({ modifiers: ["Control"] });
  await expect(page.getByRole("toolbar")).toContainText("Выбрано: 2");
  await cards.nth(0).click({ modifiers: ["Control"] });
  await expect(page.getByRole("toolbar")).toContainText("Выбрано: 1");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar")).toHaveCount(0);
  await cards.nth(0).click();
  await cards.nth(2).click({ modifiers: ["Shift"] });
  await expect(page.getByRole("toolbar")).toContainText("Выбрано: 3");
  await page
    .getByRole("button", { name: "Снять выделение", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Выделить image-4.jpg", exact: true })
    .check();
  const single = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать", exact: true }).click();
  const one = await single;
  expect(one.suggestedFilename()).toBe("image-4.jpg");
  expect(await fs.readFile((await one.path())!)).toEqual(
    await fs.readFile(path.join(fixtureRoot, "fixtures", "image-4.jpg")),
  );
  await page.getByRole("button", { name: "Выбрать всё", exact: true }).click();
  const zipEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать", exact: true }).click();
  const zip = await zipEvent;
  expect((await unzip(await fs.readFile((await zip.path())!))).size).toBe(3);
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(page.locator("dialog")).toContainText("Файлов: 3");
  await page.getByRole("button", { name: "В корзину", exact: true }).click();
  await expect(cards).toHaveCount(0);
  await page.getByRole("button", { name: "Корзина", exact: true }).click();
  await expect(page.locator(".trash-list article")).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await page
      .locator(".trash-list")
      .getByRole("button", { name: "Восстановить", exact: true })
      .first()
      .click();
    await expect(page.locator(".trash-list article")).toHaveCount(2 - i);
  }
  await page
    .locator(".real-tree-select")
    .filter({ hasText: "MVP03 files" })
    .click();
  await expect(cards).toHaveCount(3);
  // Single delete and restore.
  await cards.first().click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page.getByRole("button", { name: "В корзину", exact: true }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole("button", { name: "Корзина", exact: true }).click();
  await page
    .locator(".trash-list")
    .getByRole("button", { name: "Восстановить", exact: true })
    .click();
  await expect(page.locator(".trash-list article")).toHaveCount(0);
  await page
    .locator(".real-tree-select")
    .filter({ hasText: "MVP03 files" })
    .click();
  await expect(cards).toHaveCount(3);
  await page.getByRole("button", { name: "Новая папка", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Название", exact: true })
    .fill("Child");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.locator(".breadcrumbs")).toContainText("Child");
  await fs.writeFile(
    path.join(fixtureRoot, "media", "MVP03 files", "Child", "document.txt"),
    "untouched document",
  );
  await page
    .locator(".breadcrumbs")
    .getByRole("button", { name: "MVP03 files", exact: true })
    .click();
  await expect(cards).toHaveCount(3);
  await page.getByRole("button", { name: "Выбрать всё", exact: true }).click();
  await page.getByRole("button", { name: "Переместить", exact: true }).click();
  await page.getByLabel("Поиск папки", { exact: true }).fill("Child");
  await page
    .locator(".picker-tree")
    .getByRole("button", { name: "Child", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Переместить сюда", exact: true })
    .click();
  await expect(cards).toHaveCount(0);
  const folderZip = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать папку ZIP", exact: true })
    .click();
  const folderEntries = await unzip(
    await fs.readFile((await (await folderZip).path())!),
  );
  expect(folderEntries.get("MVP03 files/Child/document.txt")?.toString()).toBe(
    "untouched document",
  );
  await page
    .getByRole("button", { name: "Удалить папку", exact: true })
    .click();
  await expect(page.locator("dialog")).toContainText(
    "Файлов: 4. Вложенных папок: 1.",
  );
  await page.getByRole("button", { name: "В корзину", exact: true }).click();
  await page.getByRole("button", { name: "Корзина", exact: true }).click();
  await expect(page.locator(".trash-list article")).toHaveCount(1);
  await fs.mkdir(path.join(fixtureRoot, "media", "MVP03 files"));
  await page
    .locator(".trash-list")
    .getByRole("button", { name: "Восстановить", exact: true })
    .click();
  await expect(page.locator(".error-banner")).toContainText("Конфликт");
  await fs.rename(
    path.join(fixtureRoot, "media", "MVP03 files"),
    path.join(fixtureRoot, "media", "kept-conflict"),
  );
  await page
    .locator(".trash-list")
    .getByRole("button", { name: "Восстановить", exact: true })
    .click();
  await expect(page.locator(".trash-list article")).toHaveCount(0);
  expect(
    await fs.readFile(
      path.join(fixtureRoot, "media", "MVP03 files", "Child", "document.txt"),
      "utf8",
    ),
  ).toBe("untouched document");
  await page.getByRole("button", { name: "Новый проект", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Номер проекта", exact: true })
    .fill("GART-0264");
  await page
    .getByRole("textbox", { name: "Название", exact: true })
    .fill("Иванов");
  await page.getByRole("spinbutton", { name: "Год", exact: true }).fill("2026");
  await page
    .getByRole("button", { name: "Создать проект", exact: true })
    .click();
  // Return from Trash after project creation and navigate the project through real breadcrumbs.
  await expect(page.locator("dialog")).toHaveCount(0);
  const listing = await (await request.get("/api/library")).json();
  const projectFolder = listing.folders.find(
    (f: { name: string }) => f.name === "GART-0264_Иванов",
  );
  expect(projectFolder).toBeTruthy();
  expect(
    (
      await fs.readdir(
        path.join(
          fixtureRoot,
          "media",
          "01_КЛИЕНТСКИЕ_ПРОЕКТЫ",
          "2026",
          "GART-0264_Иванов",
        ),
      )
    ).length,
  ).toBe(6);
  await page.reload();
  await expect(page.locator(".folder-tree")).toContainText(
    "01_КЛИЕНТСКИЕ_ПРОЕКТЫ",
  );
  await page
    .getByRole("button", {
      name: "Раскрыть 01_КЛИЕНТСКИЕ_ПРОЕКТЫ",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Раскрыть 2026", exact: true })
    .click();
  await page
    .locator(".real-tree-select")
    .filter({ hasText: "GART-0264_Иванов" })
    .click();
  await expect(page.locator(".breadcrumbs")).toContainText("GART-0264_Иванов");
  expect(errors).toEqual([]);
});
