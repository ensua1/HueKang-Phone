import { test, expect, type Page } from "@playwright/test";

const STORY = "/?story=huan-nan-tian";

async function unlockPhone(page: Page) {
  await page.goto(STORY);
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await expect(page.locator(".interactive-home")).toHaveCSS("opacity", "1");
}

async function openApp(page: Page, name: string) {
  await page.getByRole("button", { name: "打开" + name, exact: true }).click();
  await expect(page.locator(".app-screen:not([inert])")).toHaveCSS(
    "transform",
    "none",
  );
}

async function backHome(page: Page) {
  await page.getByRole("button", { name: "返回桌面", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "打开设置", exact: true }),
  ).toBeVisible();
}

/** 打开信息 App，进入“安”的会话并读到藏密码的那条短信。 */
async function readCodeMessage(page: Page) {
  await openApp(page, "信息");
  await page.locator(".catalog-chat").filter({ hasText: "安" }).first().click();
  await expect(page.locator(".catalog-message button").first()).toBeVisible();
  await page
    .locator(".catalog-message button")
    .filter({ hasText: "0314" })
    .first()
    .click();
}

/** 打开备忘录，进入隐藏的《回南天备忘》并用 0314 解锁。 */
async function readLockedNote(page: Page) {
  await openApp(page, "备忘录");
  await page
    .locator(".notes-list button")
    .filter({ hasText: "回南天备忘" })
    .click();
  await page.getByPlaceholder("内容密码").fill("0314");
  await page.getByRole("button", { name: "解锁内容", exact: true }).click();
  await expect(page.locator(".native-note-paper")).toBeVisible();
}

/** 等待回南天结束时的模拟来电。 */
async function waitForCall(page: Page) {
  await expect(page.locator(".incoming-call-screen")).toBeVisible({
    timeout: 15000,
  });
}

test("回南天：密码、隐藏内容、跨 App 事件、模拟来电与结局", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await unlockPhone(page);

  // 跨 App 事件：打开浏览器会向信息 App 注入一条新消息。
  await openApp(page, "浏览器");
  await backHome(page);
  await openApp(page, "信息");
  await expect(
    page.locator(".catalog-chat").filter({ hasText: "新消息" }),
  ).toHaveCount(1);
  await page.locator(".catalog-chat").filter({ hasText: "新消息" }).click();
  await expect(
    page
      .locator(".catalog-message button")
      .filter({ hasText: "存包柜在最里面那面墙" }),
  ).toHaveCount(1);
  await backHome(page);

  // 隐藏内容：读到短信后解锁隐藏备忘录与隐藏照片。
  await readCodeMessage(page);
  await backHome(page);
  await openApp(page, "相册");
  await expect(
    page.getByRole("button", { name: "查看雨里的三号站台" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看雨里的三号站台" }).click();
  await expect(page.locator(".native-detail-photos")).toBeVisible();
  await backHome(page);

  // 密码内容：解锁《回南天备忘》后推进到黎明来电。
  await readLockedNote(page);
  await waitForCall(page);
  await page.getByRole("button", { name: "接听", exact: true }).click();
  await page.getByRole("button", { name: "挂断", exact: true }).click();

  // 分支：看过照片且拿到密码，才会给出“雨停之前”的选择。
  await expect(
    page.getByRole("button", { name: "赶到三号站台", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "赶到三号站台", exact: true }).click();
  await expect(
    page.getByText(
      "结局·伞在第三格：她在雨停之前赶到三号站台，储物柜第三格里的伞还带着塑料的凉意。",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.9/huan-nan-tian-ending.png" });
  expect(errors).toEqual([]);
});

test("回南天：拒接来电得到独立结局", async ({ page }) => {
  await unlockPhone(page);
  await readCodeMessage(page);
  await backHome(page);
  await readLockedNote(page);
  await waitForCall(page);
  await page.getByRole("button", { name: "拒接", exact: true }).click();
  await expect(
    page.getByText(
      "结局·忙音：电话响到自动挂断，那天夜班谁也没有提起它。",
      { exact: true },
    ),
  ).toBeVisible();
});
