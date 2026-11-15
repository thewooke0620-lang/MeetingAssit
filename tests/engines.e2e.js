const { clickSettings } = require('./helper');   // 설정 열기 (폰 화면이면 계정 단추로)
const { clickToggle } = require('./helper');   // 시작 화면이면 '회의 시작', 아니면 위쪽 시작·정지 단추
const assert = require('assert');
const { chromium } = require('playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const S1 = "So what we are proposing here is a three year supply agreement with a fixed price for the first year, and then an annual adjustment that is tied to the consumer price index, with a cap of five percent per year so that neither side takes on too much risk.";
const S2 = " That is our position on the escrow today.";

async function open(b, settings, groqStatus) {
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.route('https://x.test/', (r) => r.fulfill({ body: HTML, contentType: 'text/html' }));
  await p.addInitScript(([st, groqStatus]) => {
    if (location.protocol !== 'https:') return;
    localStorage.setItem('meeting-interpreter.settings.v1', JSON.stringify(st));
    window.CFG = []; window.REQ = []; window.SOCKS = [];
    class FakeWS { constructor() { this.readyState = 0; window.SOCKS.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20); }
      send(d) { if (typeof d === 'string' && d) window.CFG.push(JSON.parse(d)); if (d === '') setTimeout(() => this.onmessage && this.onmessage({ data: '{"finished":true}' }), 40); }
      close() { this.readyState = 3; setTimeout(() => this.onclose && this.onclose(), 5); }
      emit(o) { this.onmessage({ data: JSON.stringify(o) }); } }
    window.WebSocket = FakeWS;
    window.fetch = async (url, opt) => {
      const groq = /groq\.com/.test(url);
      const body = JSON.parse(opt.body);
      const user = groq ? body.messages[1].content : body.messages[0].content;
      const txt = user.match(/<translate>([\s\S]*)<\/translate>/)[1];
      window.REQ.push({ p: groq ? 'groq' : 'claude', model: body.model, txt, auth: groq ? opt.headers.authorization : opt.headers['x-api-key'], extra: groq ? [body.reasoning_effort, body.include_reasoning, body.messages[0].role] : null });
      if (groq && groqStatus) return { ok: false, status: groqStatus, json: async () => ({ error: { message: 'Invalid API Key' } }) };
      const tag = groq ? 'G' : (body.model.includes('sonnet') ? 'S' : 'H');
      const out = tag + '번역[' + txt.trim().split(/\s+/).slice(0, 4).join(' ') + '…' + txt.trim().length + '자]';
      const enc = new TextEncoder(); let i = 0;
      const first = groq ? 60 : 250, step = groq ? 10 : 40;      // Groq 을 더 빠르게 흉내
      const stream = new ReadableStream({ async pull(ctl) {
        await new Promise((r) => setTimeout(r, i ? step : first));
        if (opt.signal && opt.signal.aborted) { ctl.error(Object.assign(new Error('aborted'), { name: 'AbortError' })); return; }
        if (i >= out.length) { if (groq) ctl.enqueue(enc.encode('data: [DONE]\n')); ctl.close(); return; }
        const piece = out.slice(i, i + 4); i += 4;
        const ev = groq ? { choices: [{ delta: { content: piece } }] } : { type: 'content_block_delta', delta: { type: 'text_delta', text: piece } };
        ctl.enqueue(enc.encode('data: ' + JSON.stringify(ev) + '\n\n'));
      } });
      return { ok: true, status: 200, body: stream };
    };
  }, [settings, groqStatus || 0]);
  await p.goto('https://x.test/');
  return p;
}
const feed = async (p, text, gap) => {
  for (const w of text.match(/\s*\S+/g)) {
    await p.evaluate((w) => { const s = window.SOCKS[window.SOCKS.length - 1]; s.emit({ tokens: [{ text: w, is_final: true, translation_status: 'original', speaker: '1' }] }); }, w);
    await p.waitForTimeout(gap);
  }
};
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('#transcript .block')].map((b) => b.querySelector('.ko').innerText + (b.querySelector('.cmp').innerText ? '  ||cmp: ' + b.querySelector('.cmp').innerText.replace(/\n+/g, ' / ') : '')));
const summary = async (p, title) => {
  const req = await p.evaluate(() => window.REQ);
  const by = {}; for (const r of req) by[r.p + ':' + r.model] = (by[r.p + ':' + r.model] || 0) + 1;
  console.log('\n=== ' + title + ' ===');
  console.log('요청:', JSON.stringify(by));
  console.log('전체 문장(확정/다듬기) 요청 엔진:', req.filter((r) => r.txt.trim() === S1 || r.txt.trim() === S2.trim()).map((r) => r.p + ':' + r.model.split('/').pop()).join(', '));
  console.log('rows:', await rows(p));
  console.log('pill:', await p.evaluate(() => document.getElementById('lat').textContent), '| banner:', JSON.stringify(await p.evaluate(() => document.getElementById('banner').textContent)));
  req.by = by; req.banner = await p.evaluate(() => document.getElementById('banner').textContent);
  return req;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const base = { apiKey: 'k', target: 'ko', source: 'mic', draft: true, preview: true, ver: 2, askBg: false };
  const run = async (st, title, groqStatus) => {
    const p = await open(b, Object.assign({}, base, st), groqStatus);
    await clickToggle(p); await p.waitForTimeout(400);
    await feed(p, S1, 45); await p.waitForTimeout(1500); await feed(p, S2, 45); await p.waitForTimeout(2500);
    const req = await summary(p, title);
    await clickSettings(p); await p.waitForTimeout(150);
    console.log((await p.evaluate(() => document.getElementById('statBox').textContent)).split('\n').slice(-2).join('\n'));
    return { p, req };
  };

  // A) Claude 확정 + Groq 미리 번역 + 비교
  let r = await run({ engine: 'claude', claudeKey: 'ck', groqKey: 'gk', compare: true }, 'A) 혼합: Claude 확정 + Groq 미리 번역 + 비교');
  console.log('groq 요청 형식:', JSON.stringify(r.req.find((x) => x.p === 'groq').extra), '| auth:', r.req.find((x) => x.p === 'groq').auth);
  const g = 'groq:openai/gpt-oss-120b', h = 'claude:claude-haiku-5-5';
  assert(r.req.by[g] > 0 && r.req.by[h] > 0, '혼합: 미리 번역은 Groq, 확정은 Claude');
  assert(r.req.filter((x) => x.txt.trim() === S2.trim()).some((x) => x.p === 'claude'), '확정 번역은 Claude 가 해야 함');
  assert.deepStrictEqual(r.req.find((x) => x.p === 'groq').extra, ['low', false, 'system']);
  assert.strictEqual(r.req.find((x) => x.p === 'groq').auth, 'Bearer gk');
  await r.p.close();

  // B) Groq 단독 (Claude 키 없음) + 비교
  r = await run({ engine: 'groq', groqKey: 'gk', compare: true }, 'B) Groq 단독 + 비교(다른 Groq 모델)');
  assert(!r.req.by[h] && r.req.by[g] > 0 && r.req.by['groq:llama-3.3-70b-versatile'] > 0);
  await r.p.close();

  // C) 혼합인데 Groq 키가 틀림 → Claude 로 계속
  r = await run({ engine: 'claude', claudeKey: 'ck', groqKey: 'bad' }, 'C) 혼합 + Groq 키 오류', 401);
  assert.strictEqual(r.req.by[g], 1, '키 오류 뒤에는 Groq 을 더 부르지 않음'); assert(r.req.by[h] > 0);
  assert(/Groq API 키가 올바르지 않습니다/.test(r.req.banner) && /계속합니다/.test(r.req.banner));
  await r.p.close();

  // D) Groq 단독인데 키가 틀림 → 안내
  r = await run({ engine: 'groq', groqKey: 'bad' }, 'D) Groq 단독 + 키 오류', 401);
  assert(/Groq API 키가 올바르지 않습니다/.test(r.req.banner)); assert(!r.req.by[h]);
  await r.p.close();

  // E) 예전 구성: Claude 만 (Groq 키 없음)
  r = await run({ engine: 'claude', claudeKey: 'ck' }, 'E) Claude 만');
  assert.deepStrictEqual(Object.keys(r.req.by), [h]);
  await r.p.close();

  // F) Groq 방식인데 키 없음 → 시작 전 안내
  const p = await open(b, Object.assign({}, base, { engine: 'groq' }));
  await clickToggle(p); await p.waitForTimeout(300);
  console.log('\n=== F) Groq 키 없음 ===\nbanner:', await p.evaluate(() => document.getElementById('banner').textContent), '| dialog open:', await p.evaluate(() => document.getElementById('settings').open));
  assert(/Groq API 키를 입력/.test(await p.evaluate(() => document.getElementById('banner').textContent)));
  assert.strictEqual(await p.evaluate(() => document.getElementById('settings').open), true);
  await p.close();
  await b.close();
  console.log('ENGINE TESTS PASSED');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
