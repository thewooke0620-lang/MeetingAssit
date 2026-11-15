// 데스크톱 앱(Electron) 실제 실행 확인: 앱 화면을 불러오는지, window.desktop 이 있는지, 자막 팝업이 항상 위에 떠서 자막을 받는지
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
    assert.strictEqual(await win.evaluate(() => typeof window.desktop.popup), 'function');
    assert.strictEqual(await win.evaluate(() => document.body.classList.contains('desktop')), true);
    assert.strictEqual(await win.evaluate(() => typeof require), 'undefined', '앱 화면에서 컴퓨터 기능(require)에 접근할 수 없음');
    // 작은 창: 따로 떠 있는 자막 팝업(항상 위)이 열리고, 본 창의 자막을 받는다
    await win.evaluate(() => { for (const t of ['We reviewed the draft.', 'Delivery takes 6 weeks.']) { processTokens(core, [{ text: t, is_final: true, translation_status: 'original', speaker: '1' }]); core.breakNext = true; } render(); });
    const [pop] = await Promise.all([app.waitForEvent('window'), win.evaluate(() => setPopup(true))]);
    await pop.waitForLoadState('domcontentloaded'); await pop.waitForTimeout(1200);
    const info = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({ title: w.getTitle(), top: w.isAlwaysOnTop(), b: w.getBounds() })));
    console.log('창들', info);
    const pw = info.find((w) => w.title === '자막');
    assert(pw && pw.top && pw.b.height < 300, '팝업은 작고 항상 위');
    const lines = await pop.$$eval('#pvLines .pv-line', (n) => n.map((x) => x.innerText));
    console.log('팝업 자막', lines);
    assert.strictEqual(lines.length, 2); assert(/6 weeks/.test(lines[1]));
    await pop.uncheck('#pvBlur'); await pop.fill('#pvOpacity', '60'); await pop.dispatchEvent('#pvOpacity', 'input'); await pop.waitForTimeout(200);
    const opa = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === '자막').getOpacity());
    assert(Math.abs(opa - 0.6) < 0.02, '투명도 ' + opa);
    await pop.click('#pvClose'); await win.waitForTimeout(500);
    assert.strictEqual(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1, '팝업 닫힘');
    assert.strictEqual(await win.textContent('#pip'), '작은 창');
    // 앱 밖의 주소로는 이동하지 않는다
    await win.evaluate(() => { location.href = 'https://example.com/'; }); await win.waitForTimeout(500);
    assert(win.url().startsWith('http://127.0.0.1:8123/'), win.url());
    console.log('DESKTOP SMOKE PASSED');
  } finally { await Promise.race([app.close(), new Promise((r) => setTimeout(r, 3000))]); server.close(); }
})().then(() => process.exit(0)).catch((e) => { console.error('FAILED', e); process.exit(1); });
