import { test, expect, type Page, type Locator } from "@playwright/test";
import * as fs from "node:fs/promises";
import path from "node:path";
const base = process.env.GART_E2E_ROOT!;
async function box(page: Page, last: number, ctrl = false) {
  const cards = page.locator(".asset-card");
  const first = (await cards.first().boundingBox())!,
    end = (await cards.nth(last).boundingBox())!;
  if (ctrl) await page.keyboard.down("Control");
  await page.mouse.move(first.x - 8, first.y - 5);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width - 3, end.y + end.height - 3, {
    steps: 12,
  });
  await expect(page.locator(".selection-marquee")).toBeVisible();
  await page.mouse.up();
  if (ctrl) await page.keyboard.up("Control");
}
async function drag(
  page: Page,
  source: Locator,
  target: Locator,
  valid = true,
) {
  const a = (await source.boundingBox())!,
    b = (await target.boundingBox())!;
  await page.mouse.move(a.x + 30, a.y + 30);
  await page.mouse.down();
  await page.mouse.move(a.x + 45, a.y + 45, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  if (valid) await expect(page.locator(".valid-drop-target")).toHaveCount(1);
  else await expect(page.locator(".valid-drop-target")).toHaveCount(0);
  await expect(page.locator(".internal-drag-status")).toContainText(
    "Перемещение файлов:",
  );
  await page.mouse.up();
}
test("MVP05 folder states, marquee modifiers, internal/external DnD, Unicode and duplicate Scan", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let ingests = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/ingest")) ingests++;
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Scan хранилища", exact: true })
    .click();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  for (const name of ["Empty", "Filled"]) {
    const state = name === "Empty" ? "empty" : "filled";
    await expect(
      page.locator(".central-folder").filter({ hasText: name }).locator("svg"),
    ).toHaveAttribute("data-folder-state", state);
    await expect(
      page
        .locator(".real-tree-select")
        .filter({ hasText: name })
        .locator("svg"),
    ).toHaveAttribute("data-folder-state", state);
  }
  await page.locator(".central-folder").filter({ hasText: "Source" }).click();
  await expect(page.locator(".asset-card")).toHaveCount(3);
  await box(page, 0);
  await expect(page.locator(".asset-card.is-selected")).toHaveCount(1);
  await box(page, 1);
  await expect(page.locator(".asset-card.is-selected")).toHaveCount(2);
  await box(page, 0, true);
  await expect(page.locator(".asset-card.is-selected")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".asset-card.is-selected")).toHaveCount(0);
  await page.locator(".asset-card").nth(0).click();
  await page
    .locator(".asset-card")
    .nth(2)
    .click({ modifiers: ["Shift"] });
  await expect(page.locator(".asset-card.is-selected")).toHaveCount(3);
  await page.locator(".asset-checkbox").nth(1).click();
  await expect(page.locator(".asset-card.is-selected")).toHaveCount(2);
  await page
    .locator(".asset-card")
    .nth(0)
    .click({ modifiers: ["Control"] });
  await expect(page.locator(".asset-card.is-selected")).toHaveCount(1);
  // Internal drag to blank space must not open upload or issue ingest, including native image drag.
  const area = (await page.locator(".asset-scroll").boundingBox())!,
    card = (await page.locator(".asset-card").first().boundingBox())!;
  await page.mouse.move(card.x + 25, card.y + 25);
  await page.mouse.down();
  await page.mouse.move(card.x + 45, card.y + 45, { steps: 5 });
  await page.mouse.move(area.x + area.width - 15, area.y + area.height - 20, {
    steps: 15,
  });
  await page.mouse.up();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  expect(ingests).toBe(0);
  await expect(page.locator(".asset-card.is-selected")).toHaveCount(1);
  await drag(
    page,
    page.locator(".asset-card").first(),
    page.locator(".real-tree-select").filter({ hasText: "Source" }),
    false,
  );
  await expect(page.locator(".asset-card")).toHaveCount(3);
  await drag(
    page,
    page.locator(".asset-card").first(),
    page.locator(".real-tree-select").filter({ hasText: "SidebarDest" }),
  );
  await expect(page.locator(".asset-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Выбрать всё", exact: true }).click();
  await drag(
    page,
    page.locator(".asset-card").first(),
    page.locator(".real-tree-select").filter({ hasText: "SidebarDest" }),
  );
  await expect(page.locator(".asset-card")).toHaveCount(0);
  await page
    .locator(".real-tree-select")
    .filter({ hasText: "SidebarDest" })
    .click();
  await expect(page.locator(".asset-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Выбрать всё", exact: true }).click();
  await drag(
    page,
    page.locator(".asset-card").first(),
    page.locator(".central-folder").filter({ hasText: "Nested" }),
  );
  await expect(page.locator(".asset-card")).toHaveCount(0);
  await page.locator(".central-folder").filter({ hasText: "Nested" }).click();
  await expect(page.locator(".asset-card")).toHaveCount(3);
  for (const query of ["иванов", "ИВАНОВ", " ИвАнОв "]) {
    await page.getByLabel("Поиск в выбранной папке").fill(query);
    await expect
      .poll(async () => {
        const data = await (
          await request.get(
            "/api/library?folderId=" +
              encodeURIComponent(
                (await (await request.get("/api/library")).json()).folders.find(
                  (f: { storagePath: string }) =>
                    f.storagePath === "SidebarDest/Nested",
                ).id,
              ) +
              "&q=" +
              encodeURIComponent(query),
          )
        ).json();
        return data.total;
      })
      .toBe(3);
    await expect(page.locator(".asset-card")).toHaveCount(3);
  }
  await page.getByLabel("Поиск в выбранной папке").fill("");
  const bytes = await fs.readFile(path.join(base, "fixtures", "4.jpg"));
  const transfer = await page.evaluateHandle(
    ({ bytes }) => {
      const dt = new DataTransfer();
      dt.items.add(
        new File([new Uint8Array(bytes)], "Внешний.jpg", {
          type: "image/jpeg",
        }),
      );
      return dt;
    },
    { bytes: [...bytes] },
  );
  await page
    .locator(".asset-scroll")
    .dispatchEvent("dragenter", { dataTransfer: transfer });
  await page
    .locator(".asset-scroll")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page
    .getByRole("button", { name: "Загрузить файлы", exact: true })
    .click();
  await expect(page.locator(".upload-summary")).toContainText("Загружено: 1");
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  expect(ingests).toBe(1);
  await fs.copyFile(
    path.join(base, "fixtures", "1.jpg"),
    path.join(base, "media", "Empty", "другое_имя.jpg"),
  );
  await fs.copyFile(
    path.join(base, "fixtures", "5.jpg"),
    path.join(base, "media", "Empty", "новый.jpg"),
  );
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.locator(".scan-summary")).toContainText("Точных дублей: 1");
  await expect(page.locator(".scan-summary")).toContainText(
    "Найдено новых файлов: 1",
  );
  await expect(page.locator(".scan-duplicates")).toContainText("Иванов_1.jpg");
  await expect(page.locator(".scan-duplicates")).toContainText("SHA-256:");
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.locator(".scan-summary")).toContainText(
    "Найдено новых файлов: 0",
  );
  await expect(page.locator(".scan-summary")).toContainText("Точных дублей: 1");
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await page.screenshot({
    path: path.join(
      process.env.GART_SCREENSHOT_DIR || "test-results",
      "gart-mvp05.png",
    ),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
