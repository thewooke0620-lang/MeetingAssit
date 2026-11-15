const { clickToggle } = require('./helper');   // 시작 화면이면 '회의 시작', 아니면 위쪽 시작·정지 단추
const { chromium, devices } = require('playwright'); const fs = require('fs'); const assert = require('assert');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  for (const [name, opts] of [['PC', { viewport: { width: 900, height: 800 } }], ['Android 폰', devices['Pixel 7']]]) {
    const ctx = await b.newContext(Object.assign({}, opts, { permissions: ['microphone'] }));
    await ctx.route('https://x.test/', (r) => r.fulfill({ body: HTML, contentType: 'text/html' }));
    await ctx.addInitScript(() => { if (location.protocol !== 'https:') return;
      localStorage.setItem('meeting-interpreter.settings.v1', JSON.stringify({ apiKey: 'k', engine: 'soniox', target: 'ko', source: 'mic', ver: 2 }));
      window.GUM = []; const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (c) => { window.GUM.push(c); return orig(c); };
      window.WebSocket = class { constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20); } send() {} close() { this.readyState = 3; setTimeout(() => this.onclose && this.onclose(), 5); } };
    });
    const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERR', e.message));
    await p.goto('https://x.test/'); await p.waitForTimeout(300);
    const opts2 = await p.evaluate(() => [...document.querySelectorAll('#source option')].map((o) => o.value));
    await clickToggle(p); await p.waitForTimeout(500);
    const status1 = await p.textContent('#status');
    await clickToggle(p); await p.waitForTimeout(200);
    await p.click('#openSettings'); await p.check('#micClean'); await p.click('#saveSettings'); await p.waitForTimeout(200);
    await clickToggle(p); await p.waitForTimeout(500);
    const gum = await p.evaluate(() => window.GUM.map((c) => c.audio));
    console.log(name, '| 입력 선택지:', opts2, '| 상태:', status1, '\n  기본:', JSON.stringify(gum[0]), '\n  제거 켬:', JSON.stringify(gum[1]));
    assert.deepStrictEqual(gum[0], { echoCancellation: false, noiseSuppression: false, autoGainControl: true });
    assert.deepStrictEqual(gum[1], { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    await ctx.close();
  }
  await b.close(); console.log('MIC TEST PASSED');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
