const { clickToggle } = require('./helper');   // 시작 화면이면 '회의 시작', 아니면 위쪽 시작·정지 단추
const assert = require('assert');
const { chromium } = require('playwright'); const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ALL = ['terms', 'translation_terms', 'text'];
  const cases = [
    ['context msg', ['Invalid context'], [[1000, ALL], [1000, ['terms']]], '듣는 중'],
    ['unknown msg', ['Bad request'], [[1000, ALL], [null, ['terms']]], '듣는 중'],
    ['endpoint then context', ['max_endpoint_delay_ms unsupported', 'context too long'], [[1000, ALL], [null, ALL], [null, ['terms']]], '듣는 중'],
    ['real error', ['Bad request', 'Bad request'], [[1000, ALL], [null, ['terms']]], '오류']
  ];
  for (const [name, msgs, wantCfg, wantStatus] of cases) {
    const p = await b.newPage(); p.on('pageerror', (e) => console.log('PAGEERR', e.message));
    await p.route('https://x.test/', (r) => r.fulfill({ body: HTML, contentType: 'text/html' }));
    await p.addInitScript(() => { if (location.protocol !== 'https:') return;
      localStorage.setItem('meeting-interpreter.settings.v1', JSON.stringify({ apiKey: 'k', engine: 'soniox', target: 'ko', source: 'mic', ver: 2, terms: 'escrow = 에스크로', brief: '배경' }));
      window.CFG = []; window.SOCKS = [];
      window.WebSocket = class { constructor() { this.readyState = 0; window.SOCKS.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20); }
        send(d) { if (typeof d === 'string' && d) window.CFG.push(JSON.parse(d)); if (d === '') setTimeout(() => this.onmessage && this.onmessage({ data: '{"finished":true}' }), 40); } close() { this.readyState = 3; setTimeout(() => this.onclose && this.onclose(), 5); } };
    });
    await p.goto('https://x.test/'); await clickToggle(p); await p.waitForTimeout(300);
    for (const m of msgs) { await p.evaluate((m) => { const s = window.SOCKS[window.SOCKS.length - 1]; s.onmessage({ data: JSON.stringify({ error_code: 400, error_message: m }) }); }, m); await p.waitForTimeout(2200); }
    console.log(name, '=>', JSON.stringify(await p.evaluate(() => window.CFG.map((c) => [c.max_endpoint_delay_ms || null, Object.keys(c.context || {})]))), '|', await p.evaluate(() => document.getElementById('status').textContent), '|', await p.evaluate(() => document.getElementById('banner').textContent));
    assert.deepStrictEqual(await p.evaluate(() => window.CFG.map((c) => [c.max_endpoint_delay_ms || null, Object.keys(c.context || {})])), wantCfg, name);
    assert.strictEqual(await p.evaluate(() => document.getElementById('status').textContent), wantStatus, name);
    await p.close();
  }
  await b.close();
  console.log('SONIOX FALLBACK TESTS PASSED');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
