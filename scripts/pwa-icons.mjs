import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Render the existing four-color sidebar mark; no new artwork or external assets.
const directory = new URL('../apps/web/public/icons/', import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>
      body { margin: 0; width: 100vw; height: 100vh; display: grid; place-items: center; background: #fff; }
      .mark { display: grid; grid-template-columns: repeat(2, 22vw); gap: 7vw; }
      i { width: 22vw; height: 22vw; border-radius: 6vw; background: #4285f4; }
      i:nth-child(2) { background: #ea4335; } i:nth-child(3) { background: #fbbc05; } i:nth-child(4) { background: #34a853; }
    </style><div class="mark"><i></i><i></i><i></i><i></i></div>`);
    await page.screenshot({ path: fileURLToPath(new URL(name, directory)) });
    await page.close();
  }
} finally { await browser.close(); }
