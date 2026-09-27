const { chromium } = require('/home/eileen/.npm/_npx/bbb8a2c4738e2b0c/node_modules/playwright-core');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/eileen/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
    env: { ...process.env, LD_LIBRARY_PATH: '/home/eileen/libs/usr/lib/x86_64-linux-gnu' },
  });
  const out = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  await page.goto('http://localhost:8931/ascii-mirror-studio2.html?mock=1&preset=The%20Original');
  await page.waitForTimeout(2500);
  out.push({ bootErrors: errors.slice(0, 2), fontOptions: await page.evaluate(() => document.querySelectorAll('#c-grid select')[0].options.length), hasFs: await page.evaluate(() => !!document.getElementById('btn-fs')), hasTerm: await page.evaluate(() => !!document.getElementById('btn-term')) });
  // switch to wild fonts, ensure render survives
  for (const f of ['wingdings', 'comicsans', 'vt323', 'barcode39']) {
    const before = errors.length;
    await page.selectOption('#c-grid select', f);
    await page.waitForTimeout(900);
    out.push({ font: f, newErrors: errors.slice(before, before + 2) });
  }
  // fullscreen button visible (can't actually fullscreen in headless; check no throw)
  await page.click('#btn-fs').catch((e) => out.push({ fsClickErr: String(e).slice(0, 80) }));
  // terminal export
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.click('#btn-term'),
  ]);
  const p = '/home/eileen/.openclaw/workspace/ascii-mirror/term-export-test.py';
  await dl.saveAs(p);
  const py = await fs.promises.readFile(p, 'utf8');
  out.push({ termBytes: py.length, shebang: py.startsWith('#!'), hasCv2: py.includes('import cv2'), hasParams: py.includes('"density"') || py.includes("'density'") });
  await browser.close();
  // python syntax check
  const chk = require('child_process').spawnSync('python3', ['-c', 'import py_compile,sys; py_compile.compile(sys.argv[1], doraise=True)', p]);
  out.push({ pySyntax: chk.status === 0 ? 'OK' : chk.stderr.toString().slice(0, 300) });
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error('HARNESS FAIL:', e); process.exit(1); });
