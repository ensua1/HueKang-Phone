import { test, expect, type Page } from "@playwright/test";

const STORY = "/?story=xiuning-kai";

async function unlockPhone(page: Page) {
  await page.goto(STORY);
  await page.getByRole("button", { name: "轻触解锁" }).click();
  // 0205 是纯数字 4 位密码，输入到 4 位会自动提交
  for (const d of ["0", "2", "0", "5"])
    await page.getByRole("button", { name: "密码键" + d, exact: true }).click();
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
}

/** 打开 KakaoTalk，进入指定会话。 */
async function openKakaoThread(page: Page, threadName: string) {
  await openApp(page, "KakaoTalk");
  await page.locator(".kzkr").filter({ hasText: threadName }).first().click();
}

test("休宁凯：主线选择流程——然竣报信到杋圭回国", async ({ page }) => {
  await unlockPhone(page);
  await openKakaoThread(page, "然竣哥");

  // 读然竣的消息"你男朋友的前男友要回国了"
  await expect(page.locator(".kzbub").first()).toBeVisible();
  await page
    .locator(".kzbub")
    .filter({ hasText: "前男友要回国了" })
    .first()
    .click();

  // 第一轮选择浮层出现
  await expect(page.locator(".story-overlay")).toBeVisible({ timeout: 8000 });
  await page.getByRole("button", { name: "哥…我说过了还不是男朋友.." }).click();

  // 然竣追问后第二轮选择
  await expect(page.locator(".story-overlay")).toBeVisible({ timeout: 8000 });
  await page.getByRole("button", { name: "我知道了" }).click();

  // 群聊弹出杋圭"我回来了" + 结局
  await expect(page.locator(".story-overlay.ending")).toBeVisible({
    timeout: 8000,
  });
  await expect(page.locator(".story-overlay.ending p")).toContainText(
    "杋圭回国了",
  );
});

test("休宁凯：休闲store买面包触发太显KKT消息", async ({ page }) => {
  await unlockPhone(page);
  await openApp(page, "休闲store");

  // 点击巧克力海螺面包商品（商家 tab），进入详情页触发 read 事件
  await expect(page.locator(".delivery-merchant").first()).toBeVisible();
  await page
    .locator(".delivery-merchant")
    .filter({ hasText: "巧克力海螺面包" })
    .first()
    .click();

  // read 事件触发 unlock + notification，通知以顶部 banner 形式弹出
  await expect(page.locator(".device-banner")).toBeVisible({ timeout: 8000 });
  await expect(page.locator(".device-banner")).toContainText(
    "你怎么知道我今天想吃这个",
  );

  // 详情页返回 App 列表，再回桌面
  await page.getByRole("button", { name: "返回", exact: true }).last().click();
  await backHome(page);
  await openKakaoThread(page, "太显");

  // 太显的回复"你怎么知道我今天想吃这个"已解锁可见
  await expect(
    page.locator(".kzbub").filter({ hasText: "你怎么知道我今天想吃这个" }),
  ).toBeVisible({ timeout: 8000 });
});

test("休宁凯：主线外关键词触发太显和然竣回复", async ({ page }) => {
  await unlockPhone(page);

  // 打开太显会话，输入关键词"猫"发送
  await openKakaoThread(page, "太显");
  await page.getByRole("textbox", { name: "KKT消息" }).fill("猫");
  await page.getByRole("button", { name: "发送KKT消息" }).click();

  // 太显的回复消息解锁后在会话中可见
  await expect(
    page.locator(".kzbub").filter({ hasText: "都说了我不是猫啊" }),
  ).toBeVisible({ timeout: 8000 });

  // 回桌面，打开然竣会话，输入"拉面"
  await page.getByRole("button", { name: "返回", exact: true }).last().click();
  await backHome(page);
  await openKakaoThread(page, "然竣哥");
  await page.getByRole("textbox", { name: "KKT消息" }).fill("拉面");
  await page.getByRole("button", { name: "发送KKT消息" }).click();

  // 然竣的回复消息解锁后在会话中可见
  await expect(
    page.locator(".kzbub").filter({ hasText: "婉拒了，控制饮食不吃" }),
  ).toBeVisible({ timeout: 8000 });
});
