import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const API = process.env.E2E_API_BASE_URL ?? "http://localhost:3000";
const WEB = process.env.E2E_WEB_BASE_URL ?? "http://localhost:3001";
const stamp = Date.now().toString(36);

async function waitForApi() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${API}/games/launch/status`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("API not ready");
}

async function clearAuthRateLimits() {
  try {
    const { execSync } = await import("node:child_process");
    execSync(
      'docker exec reviewo-dev-redis-1 sh -c "redis-cli KEYS \'api:rate:auth:*\' | xargs -r redis-cli DEL"',
      { stdio: "ignore" }
    );
  } catch {
    // best-effort
  }
}

async function forceRuLocale(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("reviewo.localePreference", "ru");
  });
}

async function dismissShareWallIfAny(page: Page) {
  const close = page.getByRole("button", { name: /Закрыть|Close/i });
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await expect(close).toBeHidden({ timeout: 10_000 });
  }
}

async function registerViaUi(page: Page, label: string) {
  const email = `e2e-${label}-${stamp}@example.com`;
  const password = "Password123!";
  const displayName = `E2E ${label} ${stamp}`;

  await page.goto(`/profile?next=${encodeURIComponent("/games/community")}`);
  await expect(page.locator(".minimal-auth-panel")).toBeVisible({ timeout: 45_000 });

  await page.locator(".segmented-control button").filter({ hasText: /Register|Регистрация/i }).click();
  await page.locator(".minimal-auth-panel input[autocomplete='name']").fill(displayName);
  await page.locator(".minimal-auth-panel input[type='email']").fill(email);
  await page.locator(".minimal-auth-panel input[type='password']").fill(password);
  await page.locator(".minimal-auth-panel button[type='submit']").click();

  const authError = page
    .locator(".minimal-auth-panel")
    .getByText(/Too many|Слишком много|не удалось|failed/i);
  await page.waitForTimeout(1200);
  if (await authError.first().isVisible().catch(() => false)) {
    throw new Error(`Auth failed: ${(await authError.first().innerText()).trim()}`);
  }

  await expect(
    page.getByRole("banner").getByRole("button", { name: /Выйти|Sign out/i })
  ).toBeVisible({ timeout: 45_000 });
  return { displayName, email, password };
}

async function createDotaProfileViaUi(page: Page) {
  await page.goto("/dota/create");
  const submit = page.locator('button[data-analytics="dota_create_submit"]');
  await expect(submit).toBeVisible({ timeout: 45_000 });

  await page.locator("label").filter({ has: page.getByRole("checkbox", { name: "1" }) }).click();
  await expect(page.getByRole("checkbox", { name: "1" })).toBeChecked();
  await page.getByPlaceholder("3500").fill("4200");
  await submit.scrollIntoViewIfNeeded();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/dota\/profiles\/?$/.test(new URL(response.url()).pathname),
    { timeout: 45_000 }
  );

  await submit.click({ force: true });
  const response = await responsePromise;
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Dota profile create failed (${response.status()}): ${body.slice(0, 400)}`);
  }

  await page.waitForURL(/\/dota\/(?!create)/, { timeout: 60_000 });
}

async function newAuthedPage(browser: Browser, label: string): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  const context = await browser.newContext({
    locale: "ru-RU",
    extraHTTPHeaders: { "Accept-Language": "ru" }
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  await forceRuLocale(page);
  await registerViaUi(page, label);
  await createDotaProfileViaUi(page);
  return { context, page };
}

async function createPartyFromCommunity(page: Page) {
  await page.goto("/games/community");
  const createTrigger = page.getByRole("button", {
    name: /Создать команду \/ пати|Create team \/ party/i
  });
  await expect(createTrigger).toBeVisible({ timeout: 45_000 });
  await createTrigger.click();
  const partyBtn = page.getByRole("button", { name: /^(Пати|Party)$/ });
  await expect(partyBtn).toBeVisible({ timeout: 15_000 });
  await partyBtn.click();
  await page.waitForURL(/\/dota\/teams\/party-/, { timeout: 60_000 });
  await dismissShareWallIfAny(page);
}

async function setJoinMode(page: Page, mode: "OPEN" | "CONFIRM") {
  const openRe = /Сразу в команду|Join instantly/i;
  const confirmRe = /Подтверждаю лично|Confirm myself/i;
  const either = page.getByRole("button", { name: /Сразу в команду|Подтверждаю лично|Join instantly|Confirm myself/i }).first();
  await expect(either).toBeVisible({ timeout: 20_000 });

  const want = mode === "OPEN" ? openRe : confirmRe;
  if (await page.getByRole("button", { name: want }).first().isVisible().catch(() => false)) {
    return;
  }

  await either.click();
  await expect(page.getByRole("button", { name: want }).first()).toBeVisible({ timeout: 10_000 });
}

async function claimOwnSlot(page: Page, roleIndex = 0) {
  const wantRole = page.getByRole("button", { name: /Хочу эту роль|Want this role|Занять слот/i });
  const count = await wantRole.count();
  if (count === 0) {
    return;
  }
  await wantRole.nth(Math.min(roleIndex, count - 1)).click();
  await page.waitForTimeout(900);
}

async function readJoinUrl(page: Page): Promise<string> {
  const invitePanel = page.getByRole("complementary", {
    name: /Быстрое приглашение|Quick invite/i
  });
  await expect(invitePanel).toBeVisible({ timeout: 20_000 });

  // Ensure short code exists (may need first share click).
  const code = invitePanel.locator("code");
  if (!(await code.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Найти игроков|Find players/i }).first().click();
    await page.waitForTimeout(800);
  }

  const raw = ((await code.innerText()) || "").trim();
  if (!raw) {
    throw new Error("Empty invite code on party page");
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }
  if (raw.startsWith("localhost") || raw.startsWith("127.0.0.1")) {
    return `http://${raw}`;
  }
  if (raw.startsWith("/j/")) {
    return `${WEB}${raw}`;
  }
  return `${WEB}/j/${raw}`;
}

async function sendChat(page: Page, text: string) {
  const chatInput = page.getByPlaceholder(/Написать сообщение|Message the roster|Message/i);
  await expect(chatInput).toBeVisible({ timeout: 15_000 });
  await chatInput.fill(text);
  await page.getByRole("button", { name: /^Отправить$|^Send$/i }).click();
  await expect(page.getByText(text)).toBeVisible({ timeout: 20_000 });
}

async function acceptFirstApplication(page: Page) {
  const appsTrigger = page.getByRole("button", { name: /Заявки \(|Applications \(/i }).first();
  await expect(appsTrigger).toBeVisible({ timeout: 45_000 });
  await appsTrigger.click();
  const appsDialog = page.getByRole("dialog");
  await expect(appsDialog).toBeVisible({ timeout: 15_000 });
  await appsDialog.getByRole("button", { name: /Принять|Accept/i }).first().click();
}

test.describe("party UI scenarios", () => {
  test.beforeAll(async () => {
    await waitForApi();
    await clearAuthRateLimits();
  });

  test.beforeEach(async () => {
    await clearAuthRateLimits();
  });

  test("CONFIRM: create → claim → chat → apply → accept → kick → leave", async ({
    page,
    context,
    browser
  }) => {
    test.setTimeout(300_000);
    await forceRuLocale(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await registerViaUi(page, "cap");
    await createDotaProfileViaUi(page);
    await createPartyFromCommunity(page);
    await setJoinMode(page, "CONFIRM");
    await claimOwnSlot(page, 0);

    const joinUrl = await readJoinUrl(page);
    expect(joinUrl).toMatch(/\/j\/[A-Za-z0-9_-]+|\/dota\/teams\/party-/);

    await sendChat(page, `e2e hello ${stamp}`);

    const extend = page.getByRole("button", { name: /Продлить \+3ч|Extend \+3h/i });
    if (await extend.isVisible().catch(() => false)) {
      await extend.click();
    }

    // Voice create redirects to Discord OAuth when unlinked — only assert CTA exists.
    await expect(
      page.getByRole("button", { name: /Создать войс|Войти в войс|Create voice|Join voice/i })
    ).toBeVisible({ timeout: 10_000 });

    const member = await newAuthedPage(browser, "mem");
    await member.page.goto(joinUrl);
    await member.page.waitForURL(/\/dota\/teams\/party-/, { timeout: 60_000 });
    await dismissShareWallIfAny(member.page);

    // CONFIRM guest: claim a free role.
    const applyBtn = member.page
      .getByRole("button", { name: /Подать заявку|Место свободно|Хочу эту роль|Claim|Apply/i })
      .first();
    if (await applyBtn.isVisible().catch(() => false)) {
      await applyBtn.click();
    }

    await expect(
      member.page.getByText(/Заявка отправлена|Application sent/i).first()
    ).toBeVisible({ timeout: 45_000 });

    await page.reload();
    await acceptFirstApplication(page);

    const kick = page.getByRole("button", { name: /Кикнуть|Kick/i }).first();
    await expect(kick).toBeVisible({ timeout: 20_000 });
    await kick.click();

    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: /Покинуть пати|Leave party|Распустить|Disband/i })
      .click();
    await page.waitForURL(/\/games\/community|\/dota\//, { timeout: 60_000 });

    await member.context.close();
  });

  test("OPEN: join link → instant member + chat history", async ({ page, context, browser }) => {
    test.setTimeout(240_000);
    await forceRuLocale(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await registerViaUi(page, "opencap");
    await createDotaProfileViaUi(page);
    await createPartyFromCommunity(page);
    await setJoinMode(page, "OPEN");
    await claimOwnSlot(page, 0);
    await sendChat(page, `open hist ${stamp}`);

    const joinUrl = await readJoinUrl(page);
    const member = await newAuthedPage(browser, "openmem");
    await member.page.goto(joinUrl);
    await member.page.waitForURL(/\/dota\/teams\/party-/, { timeout: 60_000 });
    await dismissShareWallIfAny(member.page);

    const openClaim = member.page
      .getByRole("button", {
        name: /Место свободно|Хочу эту роль|Занять слот|Claim|Join/i
      })
      .first();
    if (await openClaim.isVisible().catch(() => false)) {
      await openClaim.click();
    }

    await expect(
      member.page.getByRole("button", { name: /Покинуть пати|Leave party/i })
    ).toBeVisible({ timeout: 45_000 });

    await expect(member.page.getByText(`open hist ${stamp}`)).toBeVisible({ timeout: 45_000 });

    await member.context.close();
  });

  test("multi-apply: accept one cancels other applications", async ({
    page,
    context,
    browser
  }) => {
    test.setTimeout(300_000);
    await forceRuLocale(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await registerViaUi(page, "capA");
    await createDotaProfileViaUi(page);
    await createPartyFromCommunity(page);
    await setJoinMode(page, "CONFIRM");
    await claimOwnSlot(page, 0);
    const joinUrlA = await readJoinUrl(page);

    const capB = await newAuthedPage(browser, "capB");
    await createPartyFromCommunity(capB.page);
    await setJoinMode(capB.page, "CONFIRM");
    await claimOwnSlot(capB.page, 0);
    const joinUrlB = await readJoinUrl(capB.page);

    const applicant = await newAuthedPage(browser, "apps");

    for (const url of [joinUrlA, joinUrlB]) {
      await applicant.page.goto(url);
      await applicant.page.waitForURL(/\/dota\/teams\/party-/, { timeout: 60_000 });
      await dismissShareWallIfAny(applicant.page);
      const applyBtn = applicant.page
        .getByRole("button", { name: /Подать заявку|Место свободно|Хочу эту роль|Apply/i })
        .first();
      if (await applyBtn.isVisible().catch(() => false)) {
        await applyBtn.click();
      }
      await expect(
        applicant.page.getByText(/Заявка отправлена|Application sent/i).first()
      ).toBeVisible({ timeout: 45_000 });
    }

    await page.reload();
    await acceptFirstApplication(page);

    await expect
      .poll(
        async () => {
          await capB.page.reload();
          return capB.page.getByRole("button", { name: /Заявки \(|Applications \(/i }).count();
        },
        { timeout: 45_000 }
      )
      .toBe(0);

    await capB.context.close();
    await applicant.context.close();
  });

  test("CONFIRM: decline application", async ({ page, context, browser }) => {
    test.setTimeout(240_000);
    await forceRuLocale(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await registerViaUi(page, "decap");
    await createDotaProfileViaUi(page);
    await createPartyFromCommunity(page);
    await setJoinMode(page, "CONFIRM");
    await claimOwnSlot(page, 0);
    const joinUrl = await readJoinUrl(page);

    const applicant = await newAuthedPage(browser, "deapp");
    await applicant.page.goto(joinUrl);
    await applicant.page.waitForURL(/\/dota\/teams\/party-/, { timeout: 60_000 });
    await dismissShareWallIfAny(applicant.page);
    const applyBtn = applicant.page
      .getByRole("button", { name: /Подать заявку|Место свободно|Хочу эту роль|Apply/i })
      .first();
    if (await applyBtn.isVisible().catch(() => false)) {
      await applyBtn.click();
    }
    await expect(
      applicant.page.getByText(/Заявка отправлена|Application sent/i).first()
    ).toBeVisible({ timeout: 45_000 });

    await page.reload();
    const appsTrigger = page.getByRole("button", { name: /Заявки \(|Applications \(/i }).first();
    await expect(appsTrigger).toBeVisible({ timeout: 45_000 });
    await appsTrigger.click();
    const appsDialog = page.getByRole("dialog");
    await appsDialog.getByRole("button", { name: /Отклонить|Decline/i }).first().click();

    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByRole("button", { name: /Заявки \(|Applications \(/i }).count();
        },
        { timeout: 45_000 }
      )
      .toBe(0);

    await applicant.context.close();
  });
});
