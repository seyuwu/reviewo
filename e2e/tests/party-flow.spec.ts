import { expect, test, type Page } from "@playwright/test";

const API = process.env.E2E_API_BASE_URL ?? "http://localhost:3000";
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

async function forceRuLocale(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("reviewo.localePreference", "ru");
  });
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

  const authError = page.locator(".minimal-auth-panel").getByText(/Too many|Слишком много|не удалось|failed/i);
  await page.waitForTimeout(1500);
  if (await authError.first().isVisible().catch(() => false)) {
    throw new Error(`Auth failed: ${(await authError.first().innerText()).trim()}`);
  }

  // After register, profile swaps to authenticated dashboard (no .signed-in-box).
  await expect(page.getByRole("banner").getByRole("button", { name: /Выйти|Sign out/i })).toBeVisible({
    timeout: 45_000
  });
  return { email, password, displayName };
}

async function createDotaProfileViaUi(page: Page) {
  await page.goto("/dota/create");
  const submit = page.locator('button[data-analytics="dota_create_submit"]');
  await expect(submit).toBeVisible({ timeout: 45_000 });

  // Click chip label — input has pointer-events:none; force-check skips React onChange.
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

  let response;
  try {
    response = await responsePromise;
  } catch {
    const err = page.locator('[class*="formError"], .form-feedback');
    const errText = (await err.first().textContent().catch(() => null))?.trim();
    throw new Error(`No POST /dota/profiles after submit${errText ? `: ${errText}` : ""}`);
  }

  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Dota profile create failed (${response.status()}): ${body.slice(0, 400)}`);
  }

  await page.waitForURL(/\/dota\/(?!create)/, { timeout: 60_000 });
}

async function copyJoinUrl(page: Page): Promise<string> {
  const copied = page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("clipboard timeout")), 15_000);
        const original = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = async (text: string) => {
          window.clearTimeout(timeout);
          navigator.clipboard.writeText = original;
          await original(text);
          resolve(text);
        };
      })
  );

  await page.getByRole("button", { name: /Скопировать ссылку на команду|Copy team link/i }).click();
  return copied;
}

test.describe("party UI flow", () => {
  test.beforeAll(async () => {
    await waitForApi();
    // Dev e2e burns through auth:register:ip (10/hour). Clear so re-runs work.
    try {
      const { execSync } = await import("node:child_process");
      execSync(
        'docker exec reviewo-dev-redis-1 sh -c "redis-cli KEYS \'api:rate:auth:register:*\' | xargs -r redis-cli DEL"',
        { stdio: "ignore" }
      );
    } catch {
      // Redis flush is best-effort when docker CLI unavailable.
    }
  });

  test("register → profile → party buttons → leave", async ({ page, context }) => {
    test.setTimeout(240_000);
    await forceRuLocale(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await registerViaUi(page, "cap");
    await createDotaProfileViaUi(page);

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

    await page.getByRole("button", { name: /Сразу в команду|Join instantly/i }).first().click();
    await page.getByRole("button", { name: /Подтверждаю лично|Confirm myself/i }).first().click();

    const claim = page.getByRole("button", { name: /Занять слот|Take slot/i }).first();
    await expect(claim).toBeVisible({ timeout: 20_000 });
    await claim.click();

    const findBtn = page.getByRole("button", { name: /^(Искать|Find)$/i }).first();
    if (await findBtn.isVisible().catch(() => false)) {
      await findBtn.click();
    }

    const joinUrl = await copyJoinUrl(page);
    expect(joinUrl).toMatch(/\/dota\/teams\/party-/);
    expect(joinUrl).toMatch(/[?&]join=/);

    const chatInput = page.getByPlaceholder(/Сообщение составу|Message the roster/i);
    await chatInput.fill(`e2e hello ${stamp}`);
    await page.getByRole("button", { name: /^Отправить$|^Send$/i }).click();
    await expect(page.getByText(`e2e hello ${stamp}`)).toBeVisible({ timeout: 20_000 });

    const extend = page.getByRole("button", { name: /Продлить \+3ч|Extend \+3h/i });
    if (await extend.isVisible().catch(() => false)) {
      await extend.click();
    }

    const voiceCreate = page.getByRole("button", {
      name: /Создать войс|Войти в войс|Create voice|Join voice/i
    });
    if (await voiceCreate.isVisible().catch(() => false)) {
      await voiceCreate.click();
      await expect
        .poll(
          async () =>
            page.getByRole("button", { name: /Войти в войс|Join voice|Копировать|Copy/i }).count(),
          { timeout: 45_000 }
        )
        .toBeGreaterThan(0);
    }

    const memberContext = await context.browser()!.newContext({
      locale: "ru-RU",
      extraHTTPHeaders: { "Accept-Language": "ru" }
    });
    await memberContext.grantPermissions(["clipboard-read", "clipboard-write"]);
    const memberPage = await memberContext.newPage();
    await forceRuLocale(memberPage);

    await registerViaUi(memberPage, "mem");
    await createDotaProfileViaUi(memberPage);
    await memberPage.goto(joinUrl);
    await memberPage.waitForURL(/\/dota\/teams\/party-/, { timeout: 60_000 });
    await expect(
      memberPage.getByText(/Заявка отправлена|Application sent/i).first()
    ).toBeVisible({ timeout: 45_000 });

    await page.reload();
    await expect(page.getByText(/Заявок:|Applications:/i).first()).toBeVisible({
      timeout: 45_000
    });

    const appsTrigger = page.getByRole("button", { name: /Заявки \(|Applications \(/i }).first();
    await expect(appsTrigger).toBeVisible({ timeout: 20_000 });
    await appsTrigger.click();

    const appsDialog = page.getByRole("dialog");
    await expect(appsDialog).toBeVisible({ timeout: 15_000 });
    const acceptApp = appsDialog.getByRole("button", { name: /Принять|Accept/i }).first();
    await expect(acceptApp).toBeVisible({ timeout: 10_000 });
    await acceptApp.click();

    const kick = page.getByRole("button", { name: /Кикнуть|Kick/i }).first();
    await expect(kick).toBeVisible({ timeout: 20_000 });
    await kick.click();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Покинуть пати|Leave party/i }).click();
    await page.waitForURL(/\/games\/community|\/dota\//, { timeout: 60_000 });

    await memberContext.close();
  });
});
