const { clickSettings } = require('./helper');   // 설정 열기 (폰 화면이면 계정 단추로)
const { clickToggle } = require('./helper');   // 시작 화면이면 '회의 시작', 아니면 위쪽 시작·정지 단추
const assert = require('assert');
const { chromium } = require('playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const SENTS = ["We reviewed the draft agreement over the weekend.", " The delivery schedule looks fine to us.", " So what we are proposing here is a three year supply agreement with a fixed price for the first year, and then an annual adjustment that is tied to the consumer price index.", " Can you confirm the penalty clause by Friday?"];

async function open(b, settings) {
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.route('https://x.test/', (r) => r.fulfill({ body: HTML, contentType: 'text/html' }));
  await p.addInitScript((st) => {
    if (location.protocol !== 'https:') return;
    localStorage.setItem('meeting-interpreter.settings.v1', JSON.stringify(st));
    window.SOCKS = [];
    class FakeWS { constructor() { this.readyState = 0; window.SOCKS.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20); }
      send() {} close() { this.readyState = 3; setTimeout(() => this.onclose && this.onclose(), 5); }
      emit(o) { this.onmessage({ data: JSON.stringify(o) }); } }
    window.WebSocket = FakeWS;
    window.fetch = async (url, opt) => {
      const groq = /groq\.com/.test(url);
      const body = JSON.parse(opt.body);
      const user = groq ? body.messages[1].content : body.messages[0].content;
      const txt = user.match(/<translate>([\s\S]*)<\/translate>/)[1];
      const out = (groq ? 'G' : 'H') + '번역[' + txt.trim().split(/\s+/).slice(0, 3).join(' ') + '…]';
      const enc = new TextEncoder(); let i = 0;
      const first = groq ? 150 : 500, step = groq ? 15 : 60;       // Groq 0.15초, Claude 0.5초로 흉내
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
  }, settings);
  await p.goto('https://x.test/');
  return p;
}
// 영어 토큰을 흘려보내고, 문장이 끝나면 lagMs 뒤에 Soniox 번역(마침표 포함)을 보낸다
const speak = async (p, sents, lagMs) => {
  for (const s of sents) {
    for (const w of s.match(/\s*\S+/g)) {
      await p.evaluate((w) => window.SOCKS[window.SOCKS.length - 1].emit({ tokens: [{ text: w, is_final: true, translation_status: 'original', speaker: '1' }] }), w);
      await p.waitForTimeout(40);
    }
    await p.waitForTimeout(lagMs);
    await p.evaluate((t) => window.SOCKS[window.SOCKS.length - 1].emit({ tokens: [{ text: t, is_final: true, translation_status: 'translation' }] }), ' 소번역 ' + s.trim().split(' ')[0] + '.');
    await p.waitForTimeout(1300);
  }
};
const stats = async (p) => { await clickSettings(p); await p.waitForTimeout(150); const t = await p.evaluate(() => document.getElementById('statBox').textContent); await p.click('#cancelSettings'); return t; };
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('#transcript .block')].map((b) => b.querySelector('.ko').innerText + '  || ' + b.querySelector('.cmp').innerText.replace(/\n+/g, ' / ')));

(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const base = { apiKey: 'k', target: 'ko', source: 'mic', draft: true, preview: true, ver: 2, askBg: false };

  let p = await open(b, Object.assign({}, base, { engine: 'claude', claudeKey: 'ck', groqKey: 'gk', compare: true }));
  await clickToggle(p); await p.waitForTimeout(400);
  await speak(p, SENTS, 120); await p.waitForTimeout(1500);
  console.log('=== A) Claude 확정 + Groq 미리 번역 + 비교 (가짜 응답: Soniox 0.12초, Groq 0.15초~, Claude 0.5초~) ===');
  console.log((await rows(p)).join('\n'));
  const avg = (text, name) => { const m = text.match(new RegExp(name + ': 평균 ([0-9.]+)초')); return m ? parseFloat(m[1]) : null; };
  const sa = await stats(p);
  console.log('\n' + sa);
  assert(avg(sa, 'Soniox') !== null && avg(sa, 'Haiku') !== null && avg(sa, 'GPT-OSS 120B') !== null, '세 엔진의 속도가 모두 기록되어야 함');
  assert(avg(sa, 'Soniox') < avg(sa, 'Haiku') && avg(sa, 'GPT-OSS 120B') < avg(sa, 'Haiku'), '가짜 응답 속도 순서대로 기록되어야 함');
  assert(/미리 번역 엔진 GPT-OSS 120B/.test(sa));
  await p.close();

  p = await open(b, Object.assign({}, base, { engine: 'soniox' }));
  await clickToggle(p); await p.waitForTimeout(400);
  await speak(p, SENTS.slice(0, 2), 200); await p.waitForTimeout(500);
  const sb = await stats(p);
  console.log('\n=== B) Soniox 내장만 (0.2초로 흉내) ===\n' + sb);
  assert(/Soniox: 평균/.test(sb) && !/Haiku/.test(sb));
  await p.close();

  p = await open(b, Object.assign({}, base, { engine: 'groq', groqKey: 'gk', draft: false }));
  await clickToggle(p); await p.waitForTimeout(400);
  await speak(p, SENTS.slice(0, 2), 100); await p.waitForTimeout(500);
  const sc = await stats(p);
  console.log('\n=== C) Groq 단독, 미리 번역 끔, 비교 끔 ===\n' + sc);
  assert(/GPT-OSS 120B: 평균/.test(sc) && !/Haiku:/.test(sc));
  await p.close();
  await b.close();
  console.log('ENGINE SPEED TESTS PASSED');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
