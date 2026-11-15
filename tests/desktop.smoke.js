// 데스크톱 앱(Electron) 실제 실행 확인: 앱 화면을 불러오는지, window.desktop 이 있는지, 작은 창이 항상 위로 줄어드는지
// desktop/ 에서 npm install 을 한 뒤, 화면이 없는 서버에서는 xvfb-run 으로 돌린다. 실제 Windows 소리 받기는 여기서 확인할 수 없다
const assert = require('assert');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { _electron: electron } = require('playwright');

(async () => {
  const root = path.join(__dirname, '..');
  const server = http.createServer((req, res) => {
    const html = fs.readFileSync(path.join(root, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html);
  }).listen(8123);
  const app = await electron.launch({
    executablePath: require(path.join(root, 'desktop', 'node_modules', 'electron')),
    args: [path.join(root, 'desktop'), '--no-sandbox', '--no-proxy-server'],
    env: Object.assign({}, process.env, { MEETINGASSIT_URL: 'http://127.0.0.1:8123/' })
  });
  try {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded'); await win.waitForTimeout(800);
    assert.strictEqual(await win.title(), '회의 통역 도우미');
    assert.strictEqual(await win.evaluate(() => typeof window.desktop.compact), 'function');
    assert.strictEqual(await win.evaluate(() => document.body.classList.contains('desktop')), true);
    assert.strictEqual(await win.evaluate(() => typeof require), 'undefined', '앱 화면에서 컴퓨터 기능(require)에 접근할 수 없음');
    const before = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { b: w.getBounds(), top: w.isAlwaysOnTop() }; });
    await win.evaluate(() => setCompact(true)); await win.waitForTimeout(400);
    const small = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { b: w.getBounds(), top: w.isAlwaysOnTop() }; });
    console.log('창 크기', before, '→', small);
    assert.strictEqual(small.top, true); assert(small.b.height < before.b.height);
    await win.evaluate(() => setCompact(false)); await win.waitForTimeout(400);
    const back = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { b: w.getBounds(), top: w.isAlwaysOnTop() }; });
    assert.strictEqual(back.top, false); assert.deepStrictEqual(back.b, before.b);
    // 앱 밖의 주소로는 이동하지 않는다
    await win.evaluate(() => { location.href = 'https://example.com/'; }); await win.waitForTimeout(500);
    assert(win.url().startsWith('http://127.0.0.1:8123/'), win.url());
    console.log('DESKTOP SMOKE PASSED');
  } finally { await Promise.race([app.close(), new Promise((r) => setTimeout(r, 3000))]); server.close(); }
})().then(() => process.exit(0)).catch((e) => { console.error('FAILED', e); process.exit(1); });
