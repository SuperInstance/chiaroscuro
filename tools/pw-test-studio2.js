const { chromium } = require('/home/eileen/.npm/_npx/bbb8a2c4738e2b0c/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/eileen/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
    env: { ...process.env, LD_LIBRARY_PATH: '/home/eileen/libs/usr/lib/x86_64-linux-gnu' },
  });
  const configs = [
    { preset: 'The Original', name: 'glyph' },
    { preset: 'Silver Halide', name: 'pixel' },
    { preset: 'Dotscape', name: 'braille' },
    { preset: 'Woodcut Match', name: 'match' },
    { preset: 'Halftone Press', name: 'halftone' },
    { preset: 'Green Matrix', name: 'trails' },
    { preset: 'Pulp Comic', name: 'posterize' },
  ];
  const results = [];
  for (const cfg of configs) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('http://localhost:8931/ascii-mirror-studio2.html?mock=1&preset=' + encodeURIComponent(cfg.preset));
    await page.waitForTimeout(2200);
    const state = await page.evaluate(() => {
      const c = document.getElementById('cv');
      if (!c.width) return { dead: true };
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let nonBg = 0, colored = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 14 || d[i+1] > 14 || d[i+2] > 14) nonBg++;
        if (Math.abs(d[i]-d[i+1]) > 25 || Math.abs(d[i+1]-d[i+2]) > 25) colored++;
      }
      return { w: c.width, h: c.height, pct: (100*nonBg/(d.length/4)).toFixed(1), colored };
    });
    results.push({ engine: cfg.name, errors: errors.slice(0,2), ...state });
    await page.close();
  }
  // export test: click export and capture download
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:8931/ascii-mirror-studio2.html?mock=1&preset=Neon%20Noir');
  await page.waitForTimeout(1200);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.click('#btn-export'),
  ]);
  const exportPath = '/home/eileen/.openclaw/workspace/ascii-mirror/export-test.html';
  await download.saveAs(exportPath);
  const exported = await page.evaluate(() => document.getElementById('cv').width);
  // verify exported file contains baked settings and boots standalone
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors2 = [];
  page2.on('pageerror', (e) => errors2.push(String(e)));
  await page2.goto('file://' + exportPath.replace(/^\/home/, 'home').replace(/^home/, '/home') + '?mock=1');
  await page2.waitForTimeout(2000);
  const boot = await page2.evaluate(() => ({ panelHidden: getComputedStyle(document.getElementById('panel')).display === 'none', w: document.getElementById('cv').width }));
  results.push({ test: 'export', downloadSize: (await require('fs').promises.stat(exportPath)).size, bootsStandalone: boot, errors: errors2.slice(0,2) });
  console.log(JSON.stringify(results, null, 1));
  await browser.close();
})().catch((e) => { console.error('HARNESS FAIL:', e); process.exit(1); });
