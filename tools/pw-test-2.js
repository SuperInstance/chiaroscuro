const { chromium } = require('/home/eileen/.npm/_npx/bbb8a2c4738e2b0c/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/eileen/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: ['--no-sandbox', '--disable-gpu'],
    env: { ...process.env, LD_LIBRARY_PATH: '/home/eileen/libs/usr/lib/x86_64-linux-gnu' },
  });
  const results = [];
  for (const cfg of [
    { res: 100, relief: 55, light: 315, detail: 45, name: 'default' },
    { res: 140, relief: 90, light: 45, detail: 20, name: 'heavy-relief' },
    { res: 60, relief: 10, light: 180, detail: 90, name: 'flat-braille' },
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:8931/ascii-mirror-2.html?mock=1&res=${cfg.res}&relief=${cfg.relief}&light=${cfg.light}&detail=${cfg.detail}`);
    await page.waitForTimeout(2000);
    const state = await page.evaluate(() => {
      const c = document.getElementById('ascii-canvas');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonBg = 0, colored = 0, glyphSamples = new Set();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 12 || d[i+1] > 12 || d[i+2] > 12) nonBg++;
        if (Math.abs(d[i]-d[i+1]) > 25 || Math.abs(d[i+1]-d[i+2]) > 25) colored++;
      }
      // sample the char variety by reading back via canvas isn't trivial; report pixel stats
      return { w: c.width, h: c.height, nonBg, colored, relief: document.getElementById('relief').value };
    });
    await page.screenshot({ path: `pw2-${cfg.name}.png` });
    results.push({ cfg: cfg.name, errors, state });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 1));
  await browser.close();
})().catch((e) => { console.error('HARNESS FAIL:', e); process.exit(1); });
