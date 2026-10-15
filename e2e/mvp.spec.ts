import { expect, test, type Browser, type Page } from '@playwright/test';
import { admin, people } from './accounts';

type Account = { name: string; email: string; password: string };

// Each person signs in from their own address, as on separate devices; the sign-in rate limit is per IP.
const addresses = new Map<string, string>();
const address = (email: string) => addresses.get(email) ?? addresses.set(email, `10.0.0.${addresses.size + 10}`).get(email)!;

const toured = new Set<string>();

async function signIn(browser: Browser, account: Account) {
  const page = await (await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': address(account.email) } })).newPage();
  await page.goto('/giris');
  await page.getByLabel('E-posta').fill(account.email);
  await page.getByLabel('Şifre', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Genel Bakış', level: 1 })).toBeVisible();
  // Only the first sign-in opens the mascot tour; skipping it is remembered.
  if (!toured.has(account.email)) {
    await page.getByRole('button', { name: 'Atla' }).click();
    toured.add(account.email);
  }
  await expect(page.getByRole('dialog')).toBeHidden();
  return page;
}

async function moveCard(page: Page, title: string, action: string) {
  await page.getByRole('button', { name: `${title} durumunu değiştir` }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

const card = (page: Page, title: string) => page.locator('.task-card', { hasText: title });
const metric = (page: Page, label: string) => page.locator('.metric-card', { hasText: label }).locator('strong');

/** The page must fit the phone width; horizontal scrolling belongs only inside dedicated scrollers. */
async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

test('başkan davetinden onaylı teslim ve rapora kadar akış çalışır', async ({ browser, request }) => {
  const title = 'Afiş tasarımını hazırla';

  await test.step('başkan kullanıcıları davet eder; davetliler şifresini belirler', async () => {
    const chief = await signIn(browser, admin);
    await chief.goto('/kullanicilar');
    for (const person of Object.values(people)) {
      await chief.getByRole('button', { name: 'Kullanıcı ekle' }).first().click();
      const form = chief.getByRole('dialog');
      await form.getByLabel('Ad soyad').fill(person.name);
      await form.getByLabel('E-posta').fill(person.email);
      await form.getByRole('button', { name: 'Ekle ve davet gönder' }).click();
      await expect(chief.getByRole('dialog')).toBeHidden();
      await expect(chief.getByRole('cell', { name: `${person.name} ${person.email}` })).toBeVisible();
      await expect(chief.getByRole('link', { name: person.email, exact: true })).toHaveAttribute('href', `mailto:${person.email}`);
    }
    for (const person of Object.values(people)) {
      const { url } = await (await request.get(`/__e2e/mail?email=${encodeURIComponent(person.email)}`)).json() as { url: string };
      const page = await (await browser.newContext()).newPage();
      await page.goto(url);
      await expect(page).toHaveURL(/\/sifre-belirle/);
      await page.getByLabel('Yeni şifre').fill(person.password);
      await page.getByLabel('Şifre tekrarı').fill(person.password);
      await page.getByRole('button', { name: 'Şifreyi kaydet' }).click();
      await expect(page.getByText('Şifreniz belirlendi')).toBeVisible();
      await page.context().close();
    }

    await chief.goto('/komiteler');
    for (const [committee, members] of [['Etkinlik', [[people.lead, 'Komite başkanı'], [people.member, 'Üye']]], ['Medya', [[people.outsider, 'Üye']]]] as const) {
      await chief.getByRole('button', { name: 'Komite oluştur' }).first().click();
      await chief.getByRole('dialog').getByLabel('Komite adı').fill(committee);
      await chief.getByRole('dialog').getByRole('button', { name: 'Oluştur', exact: true }).click();
      await expect(chief.getByRole('heading', { name: committee })).toBeVisible();
      for (const [person, role] of members) {
        await chief.getByLabel('Eklenecek kişi').selectOption({ label: `${person.name} · ${person.email}` });
        await chief.getByLabel('Komite rolü', { exact: true }).selectOption({ label: role });
        await chief.getByRole('button', { name: 'Ekle', exact: true }).click();
        await expect(chief.getByLabel(`${person.name} komite rolü`)).toBeVisible();
        await expect(chief.getByRole('link', { name: person.email, exact: true })).toHaveAttribute('href', `mailto:${person.email}`);
      }
    }
    await chief.context().close();
  });

  const member = await signIn(browser, people.member);
  const lead = await signIn(browser, people.lead);

  await test.step('üye kendi görevini açar, ilerletir ve incelemeye gönderir', async () => {
    await member.goto('/panolar');
    await member.getByRole('button', { name: 'Görev ekle' }).click();
    await member.getByLabel('Başlık').fill(title);
    const due = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
    await member.getByLabel('Son tarih').fill(due);
    await member.getByRole('button', { name: 'Görevi oluştur' }).click();
    await expect(card(member, title)).toBeVisible();
    const emailLink = card(member, title).getByRole('link', { name: people.member.email, exact: true });
    await expect(emailLink).toHaveAttribute('href', `mailto:${people.member.email}`);
    // Prevent opening the OS mail application while verifying the card does not open its dialog.
    await emailLink.evaluate(link => link.addEventListener('click', event => event.preventDefault(), { once: true }));
    await emailLink.click();
    await expect(member.getByRole('dialog')).toBeHidden();
    const linkedTaskId = await member.evaluate(async () => (await (await fetch('/api/tasks')).json())[0].id as string);
    await member.goto(`/panolar?gorev=${linkedTaskId}`);
    await expect(member.getByRole('dialog').getByLabel('Başlık')).toHaveValue(title);
    await member.getByRole('dialog').getByRole('button', { name: 'Kapat', exact: true }).click();
    await moveCard(member, title, 'Devam ediyor sütununa taşı');
    await expect(member.locator('.board-column', { hasText: 'Devam ediyor' }).getByText(title)).toBeVisible();
    // Members cannot complete their own work.
    await member.getByRole('button', { name: `${title} durumunu değiştir` }).click();
    await expect(member.getByRole('menuitem', { name: 'Onayla ve tamamla' })).toHaveCount(0);
    await member.getByRole('menuitem', { name: 'İncelemeye gönder' }).click();
    await expect(member.getByText(`“${title}” incelemeye gönderildi.`)).toBeVisible();
  });

  await test.step('komite başkanı gerekçeyle reddeder', async () => {
    await lead.goto('/panolar');
    await moveCard(lead, title, 'Reddet ve geri gönder');
    await lead.getByLabel('Gerekçe').fill('Logo çevresinde boşluk eksik.');
    await lead.getByRole('button', { name: 'Reddet', exact: true }).click();
    await expect(lead.locator('.board-column', { hasText: 'Devam ediyor' }).getByText(title)).toBeVisible();
  });

  await test.step('üye gerekçeyi görür, çıktı ekler ve yeniden teslim eder', async () => {
    await member.reload();
    await expect(card(member, title).getByText('Düzeltme istendi')).toBeVisible();
    // Keyboard: the card title opens the task window with Enter.
    await card(member, title).getByRole('button', { name: `${title} görevini aç` }).focus();
    await member.keyboard.press('Enter');
    const dialog = member.getByRole('dialog');
    await expect(dialog.getByText('Logo çevresinde boşluk eksik.')).toBeVisible();
    await dialog.getByLabel('Bağlantı adresi').fill('https://drive.google.com/afis-son.pdf');
    await dialog.getByLabel('Bağlantı adı').fill('Son afiş');
    await dialog.getByRole('button', { name: 'Ekle', exact: true }).click();
    await expect(dialog.getByRole('link', { name: /Son afiş/ })).toBeVisible();
    await dialog.getByLabel('Yeni yorum').fill('Boşluğu düzelttim.');
    await dialog.getByRole('button', { name: 'Gönder' }).click();
    await expect(dialog.getByText('Boşluğu düzelttim.')).toBeVisible();
    await member.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await moveCard(member, title, 'İncelemeye gönder');
    await expect(member.getByText(`“${title}” incelemeye gönderildi.`)).toBeVisible();
  });

  await test.step('komite başkanı onaylar; iş raporlara zamanında olarak yansır', async () => {
    await lead.reload();
    await moveCard(lead, title, 'Onayla ve tamamla');
    await expect(lead.getByText(`“${title}” onaylandı ve tamamlandı.`)).toBeVisible();

    await member.goto('/profilim');
    await expect(metric(member, 'Tamamlanan')).toHaveText('1');
    const row = member.locator('.report-table tr', { hasText: title });
    await expect(row.getByText('Zamanında')).toBeVisible();
    await expect(row.getByRole('link', { name: 'Son afiş' })).toBeVisible();
    await expect(row.getByText('1 ret')).toBeVisible();

    await lead.goto('/raporlar');
    await expect(lead.getByRole('heading', { name: 'Etkinlik', level: 1 })).toBeVisible();
    await expect(lead.locator('.report-table tr', { hasText: people.member.name }).first()).toBeVisible();

    const chief = await signIn(browser, admin);
    await chief.goto('/raporlar');
    await expect(metric(chief, 'Tamamlanan')).toHaveText('1');
    await chief.getByRole('link', { name: 'Medya' }).click();
    await expect(chief.getByRole('heading', { name: 'Medya', level: 1 })).toBeVisible();
    await chief.context().close();
  });

  await test.step('başka komitenin üyesi görevi ve raporu göremez', async () => {
    const outsider = await signIn(browser, people.outsider);
    const tasks = await (await member.request.get('/api/tasks')).json() as Array<{ id: string; title: string }>;
    const id = tasks.find(task => task.title === title)!.id;
    expect((await outsider.request.get(`/api/tasks/${id}`)).status()).toBe(404);
    expect((await outsider.request.get(`/api/tasks/${id}/details`)).status()).toBe(404);
    expect((await outsider.request.get('/api/reports/overview')).status()).toBe(403);
    await outsider.goto('/raporlar');
    await expect(outsider.getByText('Bu alana erişimin yok')).toBeVisible();
    await outsider.goto('/panolar');
    await expect(outsider.getByText(title)).toHaveCount(0);
    await outsider.context().close();
  });

  await test.step('telefon genişliğinde sayfalar taşmaz ve menü klavyeyle kapanır', async () => {
    await member.setViewportSize({ width: 375, height: 812 });
    for (const path of ['/', '/panolar', '/profilim']) {
      await member.goto(path);
      await expect(member.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoPageOverflow(member);
      await member.screenshot({ path: `test-results/mobile-${path.slice(1) || 'overview'}.png`, fullPage: true });
    }
    await member.getByRole('button', { name: 'Menüyü aç' }).click();
    await expect(member.getByRole('complementary', { name: 'Ana menü' })).toHaveClass(/is-open/);
    await member.keyboard.press('Escape');
    await expect(member.getByRole('complementary', { name: 'Ana menü' })).not.toHaveClass(/is-open/);

    const chief = await signIn(browser, admin);
    await chief.setViewportSize({ width: 375, height: 812 });
    for (const path of ['/raporlar', '/komiteler', '/kullanicilar']) {
      await chief.goto(path);
      await expect(chief.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoPageOverflow(chief);
      await chief.screenshot({ path: `test-results/mobile-${path.slice(1)}.png`, fullPage: true });
    }
    await chief.context().close();
  });
});
