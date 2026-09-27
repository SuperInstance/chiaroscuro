// Playwright harness for the ASCII mirror mock play-test
// Uses the playwright CLI's cached browser with locally-extracted nss libs.
const { chromium } = require('/home/eileen/.npm/_npx/bbb8a2c4738e2b0c/node_modules/playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/eileen/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: ['--no-sandbox', '--disable-gpu'],
    env: { ...process.env, LD_LIBRARY_PATH: '/home/eileen/libs/usr/lib/x86_64-linux-gnu' },
  });
  const results = [];
  for (const cfg of [
    { res: 90, con: 25, name: 'default' },
    { res: 40, con: 25, name: 'low-density' },
    { res: 150, con: 25, name: 'high-density' },
    { res: 90, con: 45, name: 'high-contrast' },
    { res: 90, con: 10, name: 'low-contrast' },
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://localhost:8931/ascii-mirror-test.html?mock=1&res=${cfg.res}&con=${cfg.con}`);
    await page.waitForTimeout(2000); // let a few frames render
    const state = await page.evaluate(() => {
      const c = document.getElementById('ascii-canvas');
      const ctx = c.getContext('2d');
      const img = ctx.getImageData(0, 0, c.width, c.height);
      let nonBg = 0, bright = 0, colored = 0;
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
        if (r > 12 || g > 12 || b > 12) nonBg++;
        if (r > 200 && g > 200 && b > 200) bright++;
        if (Math.abs(r - g) > 25 || Math.abs(g - b) > 25) colored++;
      }
      return {
        canvasW: c.width, canvasH: c.height,
        totalPx: d.length / 4, nonBg, bright, colored,
        resSlider: document.getElementById('resolution').value,
        conSlider: document.getElementById('contrast').value,
        visible: c.offsetParent !== null || getComputedStyle(c).display !== 'none',
      };
    });
    await page.screenshot({ path: `pw-shot-${cfg.name}.png` });
    results.push({ cfg, errors, state });
    await page.close();
  }
  // Interactivity: drag sliders live
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:8931/ascii-mirror-test.html?mock=1');
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => document.getElementById('ascii-canvas').width);
  await page.fill('#resolution', '120'); // range inputs: use fill? use evaluate + input event
  await page.evaluate(() => {
    const s = document.getElementById('resolution');
    s.value = 120; s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ w: document.getElementById('ascii-canvas').width, v: document.getElementById('resolution').value }));
  results.push({ test: 'slider-res-change', before, after });
  await page.screenshot({ path: 'pw-shot-slider-changed.png' });
  console.log(JSON.stringify(results, null, 1));
  await browser.close();
})().catch((e) => { console.error('HARNESS FAIL:', e); process.exit(1); });
