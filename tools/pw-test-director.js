const { chromium } = require('/home/eileen/.npm/_npx/bbb8a2c4738e2b0c/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/eileen/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: ['--no-sandbox', '--disable-gpu'],
    env: { ...process.env, LD_LIBRARY_PATH: '/home/eileen/libs/usr/lib/x86_64-linux-gnu' },
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:8931/ascii-mirror-director.html?mock=1');
  await page.waitForTimeout(2500);
  const s1 = await page.evaluate(() => {
    const c = document.getElementById('cv');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let nonBg = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 14 || d[i+1] > 14 || d[i+2] > 14) nonBg++;
    return { w: c.width, h: c.height, pct: (100 * nonBg / (d.length/4)).toFixed(1), name: document.getElementById('now').textContent };
  });
  await page.screenshot({ path: 'pw-director-1.png' });
  // force scene cuts via click, sample twice more
  await page.click('body');
  await page.waitForTimeout(2000);
  const s2 = await page.evaluate(() => {
    const c = document.getElementById('cv');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let nonBg = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 14 || d[i+1] > 14 || d[i+2] > 14) nonBg++;
    return { pct: (100 * nonBg / (d.length/4)).toFixed(1), name: document.getElementById('now').textContent };
  });
  await page.click('body');
  await page.waitForTimeout(2000);
  const s3 = await page.evaluate(() => {
    const c = document.getElementById('cv');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let nonBg = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 14 || d[i+1] > 14 || d[i+2] > 14) nonBg++;
    return { pct: (100 * nonBg / (d.length/4)).toFixed(1), name: document.getElementById('now').textContent };
  });
  console.log(JSON.stringify({ s1, s2, s3, errors }, null, 1));
  await browser.close();
})().catch((e) => { console.error('HARNESS FAIL:', e); process.exit(1); });
