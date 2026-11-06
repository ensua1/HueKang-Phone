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

/** 从当前会话返回到 KKT 会话列表（可能已停留在别的会话里）。 */
async function backToKakaoList(page: Page) {
  if (await page.locator(".kzkk").isVisible().catch(() => false)) return;
  await page.getByRole("button", { name: "返回", exact: true }).last().click();
  await expect(page.locator(".kzkk")).toBeVisible();
}

test("休宁凯：主线选择流程——然竣报信到杋圭回国", async ({ page }) => {
  await unlockPhone(page);

  // start 时然竣发来 KKT 消息 + 顶部 banner
  await expect(page.locator(".device-banner")).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".device-banner")).toContainText("然竣哥");
  // 点击 banner 跳转到然竣对话框
  await page.locator(".device-banner").click();

  // 进入然竣对话框后，回复选项直接出现在输入框上方（不需点气泡）
  await expect(page.locator(".kzinline-choice").first()).toBeVisible({
    timeout: 8000,
  });
  await page.getByRole("button", { name: "哥…我说过了还不是男朋友.." }).click();

  // 然竣追问后第二轮内联选项
  await expect(page.locator(".kzinline-choice").first()).toBeVisible({
    timeout: 8000,
  });
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

  // 点击巧克力海螺面包商品，进入详情页
  await expect(page.locator(".delivery-merchant").first()).toBeVisible();
  await page
    .locator(".delivery-merchant")
    .filter({ hasText: "巧克力海螺面包" })
    .first()
    .click();

  // 详情页点击"立即下单"按钮触发 order 事件
  await expect(page.getByRole("button", { name: /立即下单/ })).toBeVisible({
    timeout: 8000,
  });
  await page.getByRole("button", { name: /立即下单/ }).click();

  // order 事件触发 notification，顶部 banner 弹出
  await expect(page.locator(".device-banner")).toBeVisible({ timeout: 8000 });
  await expect(page.locator(".device-banner")).toContainText("太显");

  // 回桌面，检查 KKT 图标红点
  await backHome(page);
  await expect(page.locator(".app-badge").first()).toBeVisible({
    timeout: 8000,
  });

  // 打开 KKT，进入太显会话查看回复
  await openKakaoThread(page, "太显");
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

  // 太显的回复消息直接在对话框出现（不弹 banner）
  await expect(
    page.locator(".kzbub").filter({ hasText: "都说了我不是猫啊" }),
  ).toBeVisible({ timeout: 8000 });

  // 回桌面，打开然竣会话，输入"拉面"
  await page.getByRole("button", { name: "返回", exact: true }).last().click();
  await backHome(page);
  await openKakaoThread(page, "然竣哥");
  await page.getByRole("textbox", { name: "KKT消息" }).fill("拉面");
  await page.getByRole("button", { name: "发送KKT消息" }).click();

  // 然竣的回复消息直接在对话框出现
  await expect(
    page.locator(".kzbub").filter({ hasText: "婉拒了，控制饮食不吃" }),
  ).toBeVisible({ timeout: 8000 });
});

test("休宁凯：NPC互动按对话框隔离，不会跨会话触发", async ({ page }) => {
  await unlockPhone(page);

  // 在太显会话发"猫"，太显应当回复
  await openKakaoThread(page, "太显");
  await page.getByRole("textbox", { name: "KKT消息" }).fill("猫");
  await page.getByRole("button", { name: "发送KKT消息" }).click();
  await expect(
    page.locator(".kzbub").filter({ hasText: "都说了我不是猫啊" }),
  ).toBeVisible({ timeout: 8000 });

  // 切到然竣会话：这里不应出现太显的回复
  await page.getByRole("button", { name: "返回", exact: true }).last().click();
  await backHome(page);
  await openKakaoThread(page, "然竣哥");
  await expect(
    page.locator(".kzbub").filter({ hasText: "都说了我不是猫啊" }),
  ).toHaveCount(0);

  // 然竣会话发"猫"：太显不应被唤醒，然竣自己随机回一句
  await page.getByRole("textbox", { name: "KKT消息" }).fill("猫");
  await page.getByRole("button", { name: "发送KKT消息" }).click();
  await expect(
    page.locator(".kzbub").filter({ hasText: "都说了我不是猫啊" }),
  ).toHaveCount(0);
  await expect(page.locator(".kzm").last()).toBeVisible({ timeout: 8000 });

  // 回到太显会话：消息仍然是先前那一条，不会多出然竣的回应
  await page.getByRole("button", { name: "返回", exact: true }).last().click();
  await backHome(page);
  await openKakaoThread(page, "太显");
  await expect(
    page.locator(".kzbub").filter({ hasText: "都说了我不是猫啊" }),
  ).toHaveCount(1);
});

test("休宁凯：对话气泡不重播动画，重新打开已看过的会话直接显示", async ({
  page,
}) => {
  await unlockPhone(page);
  await openKakaoThread(page, "太显");

  // 首次打开：气泡带淡入动画 class，并按 0.5s 递增延迟
  await expect(page.locator(".kzm.kzmsg-in").first()).toBeVisible();
  await expect(page.locator(".kzm.kzmsg-in")).toHaveCount(2);

  // 返回会话列表，再次打开同一会话：历史气泡不再带动画 class
  await page.getByRole("button", { name: "返回", exact: true }).last().click();
  await expect(page.locator(".kzkr").first()).toBeVisible();
  await page.locator(".kzkr").filter({ hasText: "太显" }).first().click();

  await expect(page.locator(".kzm").first()).toBeVisible();
  await expect(page.locator(".kzm.kzmsg-in")).toHaveCount(0);
});

test("休宁凯：主线结束可选择重新开始或探索主线外互动", async ({
  page,
}) => {
  await unlockPhone(page);

  // 走完主线：banner → 两轮选择 → 结局
  await expect(page.locator(".device-banner")).toBeVisible({ timeout: 10000 });
  await page.locator(".device-banner").click();
  await expect(page.locator(".kzinline-choice").first()).toBeVisible({
    timeout: 8000,
  });
  await page.getByRole("button", { name: "哥…我说过了还不是男朋友.." }).click();
  await expect(page.locator(".kzinline-choice").first()).toBeVisible({
    timeout: 8000,
  });
  await page.getByRole("button", { name: "我知道了" }).click();

  // 结局弹窗提供两个选项
  const ending = page.locator(".story-overlay.ending");
  await expect(ending).toBeVisible({ timeout: 8000 });
  await expect(
    ending.getByRole("button", { name: "重新开始" }),
  ).toBeVisible();
  await expect(
    ending.getByRole("button", { name: "探索主线外互动" }),
  ).toBeVisible();

  // 选"探索主线外互动"：弹窗关闭，主线进度保留，仍可与 NPC 互动
  await ending.getByRole("button", { name: "探索主线外互动" }).click();
  await expect(ending).toHaveCount(0);

  await backToKakaoList(page);
  await page.locator(".kzkr").filter({ hasText: "太显" }).first().click();
  // 主线消息仍在（进度没被清空）
  await expect(
    page.locator(".kzbub").filter({ hasText: "想吃巧克力海螺面包" }),
  ).toBeVisible({ timeout: 8000 });
  // 且还能继续和太显互动
  await page.getByRole("textbox", { name: "KKT消息" }).fill("猫");
  await page.getByRole("button", { name: "发送KKT消息" }).click();
  await expect(
    page.locator(".kzbub").filter({ hasText: "都说了我不是猫啊" }),
  ).toBeVisible({ timeout: 8000 });
});
