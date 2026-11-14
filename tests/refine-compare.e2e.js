const assert = require('assert');
const { chromium } = require('playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const S1 = "So what we are proposing here is a three year supply agreement with a fixed price for the first year, and then an annual adjustment that is tied to the consumer price index, with a cap of five percent per year so that neither side takes on too much risk.";
const S2 = " That is our position on the escrow today.";

async function open(b, settings) {
  const p = await b.newPage({ viewport: { width: 900, height: 900 } });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.route('https://x.test/', (r) => r.fulfill({ body: HTML, contentType: 'text/html' }));
  await p.addInitScript((st) => {
    if (location.protocol !== 'https:') return;
    localStorage.setItem('meeting-interpreter.settings.v1', JSON.stringify(st));
    window.CFG = []; window.REQ = []; window.SOCKS = [];
    class FakeWS { constructor() { this.readyState = 0; window.SOCKS.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20); }
      send(d) { if (typeof d === 'string' && d) window.CFG.push(JSON.parse(d)); if (d === '') setTimeout(() => this.onmessage && this.onmessage({ data: '{"finished":true}' }), 40); }
      close() { this.readyState = 3; setTimeout(() => this.onclose && this.onclose(), 5); }
      emit(o) { this.onmessage({ data: JSON.stringify(o) }); } }
    window.WebSocket = FakeWS;
    window.fetch = async (url, opt) => {
      const body = JSON.parse(opt.body);
      const txt = body.messages[0].content.match(/<translate>([\s\S]*)<\/translate>/)[1];
      window.REQ.push({ model: body.model, system: body.system, content: body.messages[0].content, txt });
      const tag = body.model.includes('sonnet') ? 'S' : 'H';
      const out = tag + '번역[' + txt.trim().split(/\s+/).slice(0, 4).join(' ') + '…' + txt.trim().length + '자]';
      const enc = new TextEncoder(); let i = 0;
      const stream = new ReadableStream({ async pull(ctl) {
        await new Promise((r) => setTimeout(r, i ? 40 : 200));
        if (opt.signal && opt.signal.aborted) { ctl.error(Object.assign(new Error('aborted'), { name: 'AbortError' })); return; }
        if (i >= out.length) { ctl.close(); return; }
        const piece = out.slice(i, i + 4); i += 4;
        ctl.enqueue(enc.encode('data: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: piece } }) + '\n'));
      } });
      return { ok: true, status: 200, body: stream };
    };
  }, settings);
  await p.goto('https://x.test/');
  return p;
}
const feed = async (p, text, gap) => {
  for (const w of text.match(/\s*\S+/g)) {
    await p.evaluate((w) => { const s = window.SOCKS[window.SOCKS.length - 1]; s.emit({ tokens: [{ text: w, is_final: true, translation_status: 'original', speaker: '1' }, { text: ' 소' + w.trim().length, is_final: true, translation_status: 'translation' }] }); }, w);
    await p.waitForTimeout(gap);
  }
};
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('#transcript .block')].map((b) => ({ en: b.querySelector('.en').innerText.length, ko: b.querySelector('.ko').innerText, cmp: b.querySelector('.cmp').innerText })));

(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const base = { apiKey: 'k', claudeKey: 'c', engine: 'claude', target: 'ko', source: 'mic', draft: true, preview: true, ver: 2,
    terms: 'Acme Corp\nescrow = 에스크로', brief: 'A사와 공급 계약 조건 협의' };

  // ---- 1) 다듬기 + 비교 모드 ----
  let p = await open(b, Object.assign({}, base, { compare: true }));
  await p.click('#toggle'); await p.waitForTimeout(300);
  console.log('SONIOX CONFIG context:', JSON.stringify(await p.evaluate(() => window.CFG[0].context)), '| translation:', JSON.stringify(await p.evaluate(() => window.CFG[0].translation)));
  const cfg0 = await p.evaluate(() => window.CFG[0]);
  assert.deepStrictEqual(cfg0.context.terms, ['Acme Corp', 'escrow']);
  assert.deepStrictEqual(cfg0.context.translation_terms, [{ source: 'escrow', target: '에스크로' }]);
  assert(cfg0.context.text, '회의 배경이 Soniox 설정에 들어가야 함');
  assert.strictEqual(cfg0.max_endpoint_delay_ms, 1000);
  // 첫 줄의 번역이 비는 순간이 있는지 50ms 마다 기록
  await p.evaluate(() => { window.SEEN = []; setInterval(() => { const k = document.querySelector('#transcript .block .ko'); if (k) window.SEEN.push(k.innerText); }, 50); });
  await feed(p, S1.slice(0, 160), 45);
  await p.waitForTimeout(700);
  console.log('\nMID (말하는 중, 조각 번역):'); console.log(await rows(p));
  await feed(p, S1.slice(160), 45);
  await p.waitForTimeout(150);
  console.log('\nJUST AFTER SENTENCE END (합친 직후):'); console.log(await rows(p));
  await p.waitForTimeout(2500);
  await feed(p, S2, 45);
  await p.waitForTimeout(3000);
  console.log('\nFINAL:'); console.log(await rows(p));
  const seen = await p.evaluate(() => window.SEEN);
  const firstFilled = seen.findIndex((x) => x.trim());
  console.log('\n첫 줄 번역이 뜬 뒤 비는 순간:', seen.slice(firstFilled).filter((x) => !x.trim()).length, '회 / 변화 과정:', [...new Set(seen)].length, '단계');
  assert.strictEqual(seen.slice(firstFilled).filter((x) => !x.trim()).length, 0, '번역이 뜬 뒤 화면이 비면 안 됨');
  assert.strictEqual((await rows(p)).length, 2, '긴 문장은 끝난 뒤 한 줄로 합쳐져야 함');
  const req = await p.evaluate(() => window.REQ);
  console.log('\nCLAUDE 요청 수:', req.length, '(Haiku', req.filter((r) => r.model.includes('haiku')).length, '/ Sonnet', req.filter((r) => r.model.includes('sonnet')).length + ')');
  const withShown = req.find((r) => /Shown translation/.test(r.content));
  console.log('\n앞 번역을 참고로 준 요청 예:\n' + (withShown ? withShown.content : 'NONE'));
  console.log('\nSYSTEM PROMPT 끝부분:\n' + req[1].system.slice(-260));
  const merged = req.filter((r) => r.txt.trim() === S1);
  console.log('\n전체 문장 다듬기 요청:', merged.map((r) => r.model));
  assert(withShown, '앞 문장의 번역을 참고로 준 요청이 있어야 함');
  assert(merged.length >= 1, '합친 문장 전체를 다시 번역해야 함');
  assert(req.some((r) => r.model.includes('sonnet')), '비교 모드에서 다른 모델 요청이 있어야 함');
  await p.click('#lat'); await p.waitForTimeout(200);
  console.log('\n속도 기록:\n' + await p.evaluate(() => document.getElementById('statBox').textContent));
  await p.click('#cancelSettings');
  await p.close();

  // ---- 2) Soniox 가 context 를 거부하면 빼고 재연결 ----
  p = await open(b, base);
  await p.click('#toggle'); await p.waitForTimeout(300);
  await p.evaluate(() => window.SOCKS[0].emit({ error_code: 400, error_message: 'Invalid context: unknown field translation_terms' }));
  await p.waitForTimeout(1300);
  console.log('\nFALLBACK configs:', JSON.stringify(await p.evaluate(() => window.CFG.map((c) => c.context))), '| status:', await p.evaluate(() => document.getElementById('status').textContent), '| banner:', JSON.stringify(await p.evaluate(() => document.getElementById('banner').textContent)));
  const ctxs = await p.evaluate(() => window.CFG.map((c) => c.context));
  assert(ctxs[0].translation_terms && ctxs[0].text, '처음에는 번역어 지정과 회의 배경을 보냄');
  assert.deepStrictEqual(Object.keys(ctxs[ctxs.length - 1]), ['terms'], '거부되면 용어만 남기고 다시 연결');
  assert.strictEqual(await p.evaluate(() => document.getElementById('status').textContent), '듣는 중');
  await p.close();

  // ---- 3) 다듬기 끔 + 비교 끔: 예전 동작 ----
  p = await open(b, Object.assign({}, base, { refine: false }));
  await p.click('#toggle'); await p.waitForTimeout(300);
  await feed(p, S1 + S2, 30); await p.waitForTimeout(2500);
  console.log('\nREFINE OFF rows:'); console.log(await rows(p));
  console.log('요청 수:', await p.evaluate(() => window.REQ.length), '| Sonnet 요청:', await p.evaluate(() => window.REQ.filter((r) => r.model.includes('sonnet')).length));
  assert.strictEqual((await rows(p)).length, 3, '다듬기를 끄면 긴 문장이 합쳐지지 않음');
  assert.strictEqual(await p.evaluate(() => window.REQ.filter((r) => r.model.includes('sonnet')).length), 0);
  await p.close();
  await b.close();
  console.log('REFINE/COMPARE TESTS PASSED');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
