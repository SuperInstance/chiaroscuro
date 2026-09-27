const { chromium } = require('/home/eileen/.npm/_npx/bbb8a2c4738e2b0c/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/eileen/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: ['--no-sandbox', '--disable-gpu'],
    env: { ...process.env, LD_LIBRARY_PATH: '/home/eileen/libs/usr/lib/x86_64-linux-gnu' },
  });
  const presets = ['① The Original','② The Sculptor','Green Matrix','Amber Terminal','Ink & Paper','Blueprint','Neon Noir','Ghost','Wireframe','Molten','Deep Sea','Pulp Comic'];
  const results = [];
  for (const name of presets) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('http://localhost:8931/ascii-mirror-studio.html?mock=1&preset=' + encodeURIComponent(name));
    await page.waitForTimeout(1600);
    const state = await page.evaluate(() => {
      const c = document.getElementById('cv');
      const d = document.getElementById('cv').getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let nonBg = 0, colored = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 14 || d[i+1] > 14 || d[i+2] > 14) nonBg++;
        if (Math.abs(d[i]-d[i+1]) > 25 || Math.abs(d[i+1]-d[i+2]) > 25) colored++;
      }
      return { w: c.width, h: c.height, nonBg, colored, pct: (100*nonBg/(d.length/4)).toFixed(1) };
    });
    results.push({ preset: name, errors, ...state });
    await page.close();
  }
  // slider live response
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:8931/ascii-mirror-studio.html?mock=1&preset=The%20Sculptor');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const r = document.querySelectorAll('#c-grid input[type=range]')[0];
    r.value = 150; r.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(600);
  const sliderTest = await page.evaluate(() => document.getElementById('cv').width);
  results.push({ test: 'density-slider', cvWidth: sliderTest });
  console.log(JSON.stringify(results, null, 1));
  await browser.close();
})().catch((e) => { console.error('HARNESS FAIL:', e); process.exit(1); });
