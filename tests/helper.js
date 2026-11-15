// 화면 테스트 공용 도구: 가짜 Soniox(웹소켓)와 가짜 AI(Claude·Groq) 응답으로 앱을 띄운다. 실제 API 는 부르지 않는다.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// 브라우저 안에서 실행되는 부분. 요청 종류를 가려서 window.REQ 에 기록하고 가짜 답을 돌려준다
//   translate: 번역 / digest: 회의 정리(한 번에 받는 요청) / assist-q: 질문에 대한 답변 제안 / assist-ko: 한국어를 영어로 / assist-act: 빠른 답변 단추
// window.MOCK 으로 테스트마다 응답을 바꿀 수 있다
function pageMock(st) {
  if (location.protocol !== 'https:') return;
  if (st && !localStorage.getItem('meeting-interpreter.settings.v1')) localStorage.setItem('meeting-interpreter.settings.v1', JSON.stringify(st));
  window.REQ = []; window.SOCKS = []; window.CFG = [];
  window.MOCK = { digest: null, digestStatus: 200, assist: null, assistStatus: 200, assistDelay: 30 };
  window.WebSocket = class {
    constructor() { this.readyState = 0; window.SOCKS.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20); }
    // 빈 문자열(소리 끝)을 받으면 실제 Soniox처럼 잠시 뒤 finished 를 보낸다. window.MOCK.noFinish 면 보내지 않는다
    send(d) {
      if (typeof d === 'string' && d) window.CFG.push(JSON.parse(d));
      if (d === '' && !window.MOCK.noFinish) setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ finished: true }) }), 40);
    }
    close() { this.readyState = 3; setTimeout(() => this.onclose && this.onclose(), 5); }
    emit(o) { this.onmessage({ data: JSON.stringify(o) }); }
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opt) => {
    // Claude·Groq 가 아닌 주소(예: 가짜 Supabase)는 그대로 보낸다 (테스트가 page.route 로 받는다)
    if (!/anthropic\.com|groq\.com/.test(String(url))) return realFetch(url, opt);
    const groq = /groq\.com/.test(url);
    const body = JSON.parse(opt.body);
    const system = groq ? body.messages[0].content : body.system;
    const user = groq ? body.messages[1].content : body.messages[0].content;
    const kind = !body.stream ? 'digest' : /<translate>/.test(user) ? 'translate' : /<korean>/.test(user) ? 'assist-ko' : /<action>/.test(user) ? 'assist-act' : 'assist-q';
    const rec = { kind, p: groq ? 'groq' : 'claude', model: body.model, system, user, aborted: false };
    window.REQ.push(rec);
    if (kind === 'digest') {
      // 실제 fetch 처럼 중간에 그만두면(abort) 바로 끝난다
      await new Promise((res, rej) => {
        const t = setTimeout(res, window.MOCK.digestDelay || 120);
        if (opt.signal) opt.signal.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
      });
      if (window.MOCK.digestFailOnce) { window.MOCK.digestFailOnce--; return { ok: false, status: 529, json: async () => ({ error: { message: 'Overloaded' } }) }; }
      if (window.MOCK.digestStatus !== 200) return { ok: false, status: window.MOCK.digestStatus, json: async () => ({ error: { message: 'mock error' } }) };
      const n = user.split('<transcript>')[1].split('</transcript>')[0].trim().split('\n').length;
      const d = window.MOCK.digest || {
        title: '계약 초안 검토 ' + n + '줄',
        summary: ['계약 초안을 검토했다.', '위약금 조항을 논의했다.'],
        decisions: ['금요일까지 위약금 조항을 확인한다.'], todos: ['수정 초안을 보낸다.'],
        terms: [{ en: 'escrow', ko: '에스크로' }, { en: 'Acme Corp', ko: '' }, { en: 'penalty clause', ko: '위약금 조항' }],
        facts: ['납기는 발주 후 6주다.'],
        questions: [{ en: 'Can you confirm the penalty clause by Friday?', ko: '금요일까지 위약금 조항을 확인해 줄 수 있나요?', answer: '' }]
      };
      const text = typeof d === 'string' ? d : JSON.stringify(d);
      return { ok: true, status: 200, json: async () => (groq ? { choices: [{ message: { content: text } }] } : { content: [{ type: 'text', text }] }) };
    }
    if (kind === 'translate' && window.MOCK.trStatus) return { ok: false, status: window.MOCK.trStatus, json: async () => ({ error: { message: window.MOCK.trMessage || 'mock error' } }) };
    if (kind !== 'translate' && window.MOCK.assistStatus !== 200) return { ok: false, status: window.MOCK.assistStatus, json: async () => ({ error: { message: 'mock error' } }) };
    let out, first, step;
    if (kind === 'translate') {
      const txt = user.match(/<translate>([\s\S]*)<\/translate>/)[1];
      out = '번역[' + txt.trim().split(/\s+/).slice(0, 3).join(' ') + ']'; first = window.MOCK.trDelay || 60; step = 10;
    } else {
      out = window.MOCK.assist || (kind === 'assist-ko'
        ? 'EN: Could we revisit the price?\nKO: 가격을 다시 논의할 수 있을까요?\nEN: Would it be possible to revisit the pricing?\nKO: 가격을 다시 검토해 주실 수 있을까요?'
        : 'EN: Yes, we can confirm by Friday.\nKO: 네, 금요일까지 확인드리겠습니다.\nEN: Let me check with my team and get back to you by Friday.\nKO: 팀과 확인한 뒤 금요일까지 답변드리겠습니다.');
      first = window.MOCK.assistDelay; step = window.MOCK.assistDelay;
    }
    const enc = new TextEncoder(); let i = 0;
    const stream = new ReadableStream({ async pull(ctl) {
      await wait(i ? step : first);
      if (opt.signal && opt.signal.aborted) { rec.aborted = true; ctl.error(Object.assign(new Error('aborted'), { name: 'AbortError' })); return; }
      if (i >= out.length) { if (groq) ctl.enqueue(enc.encode('data: [DONE]\n')); ctl.close(); return; }
      const piece = out.slice(i, i + 12); i += 12;
      const ev = groq ? { choices: [{ delta: { content: piece } }] } : { type: 'content_block_delta', delta: { type: 'text_delta', text: piece } };
      ctl.enqueue(enc.encode('data: ' + JSON.stringify(ev) + '\n\n'));
    } });
    return { ok: true, status: 200, body: stream };
  };
}

async function launch() {
  return chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
}

// 새 브라우저 창(저장소가 비어 있는 상태)에 앱을 연다. settings 는 처음 저장해 둘 설정
async function openApp(browser, settings, opts) {
  opts = opts || {};
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 820, height: 1000 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] }, opts.context || {}));
  await ctx.route('https://x.test/', (r) => r.fulfill({ body: HTML, contentType: 'text/html' }));
  // 정지 후 정리 화면 자동 열기는 따로 시험한다. 지정하지 않았으면 끈다
  await ctx.addInitScript(pageMock, Object.assign({ openAfterStop: false }, settings));
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => { p.errors.push(e.message); console.log('PAGEERR', e.message); });
  p.answer = null;                                   // prompt 창에 넣을 답 (null 이면 취소)
  p.on('dialog', (d) => (d.type() === 'prompt' ? (p.answer === null ? d.dismiss() : d.accept(p.answer)) : d.accept()));
  await p.goto('https://x.test/'); await p.waitForTimeout(400);
  return p;
}

// 영어를 한 단어씩 확정 토큰으로 흘려보낸다
async function speak(p, text, gap) {
  for (const w of text.match(/\s*\S+/g)) {
    await p.evaluate((w) => window.SOCKS[window.SOCKS.length - 1].emit({ tokens: [{ text: w, is_final: true, translation_status: 'original', speaker: '1' }] }), w);
    await p.waitForTimeout(gap || 12);
  }
}

// 시작·정지: 시작 화면에서는 큰 '회의 시작' 단추, 그 밖에는 위쪽 막대의 시작·정지 단추를 누른다
const clickToggle = async (p) => { await p.click((await p.isVisible('#homeStart')) ? '#homeStart' : '#toggle'); };
const toggle = async (p) => { await clickToggle(p); await p.waitForTimeout(300); };
// 시작 → 말하기 → 정지 → 자동 저장과 정리가 끝날 때까지 기다림
async function meeting(p, text, after) { await toggle(p); await speak(p, text); await p.waitForTimeout(400); await clickToggle(p); await p.waitForTimeout(after || 4900); }
const openSettings = async (p) => { await p.click('#openSettings'); await p.waitForTimeout(300); };
const closeSettings = (p) => p.click('#cancelSettings');
const saveSettings = async (p) => { await p.click('#saveSettings'); await p.waitForTimeout(250); };
const meets = (p) => p.evaluate(() => [...document.querySelectorAll('#meetList .mrow')].map((r) => r.querySelector('.mtitle').textContent + ' | ' + r.querySelector('.mmeta').textContent));
const reqs = (p, kind) => p.evaluate((kind) => window.REQ.filter((r) => !kind || r.kind === kind), kind);
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('meeting-interpreter.settings.v1')));

const BASE = { apiKey: 'k', claudeKey: 'ck', engine: 'claude', target: 'ko', source: 'mic', draft: false, preview: false, ver: 2, openAfterStop: false };   // 정지 후 정리 화면 자동 열기는 따로 시험한다

function run(name, fn) {
  (async () => { const b = await launch(); try { await fn(b); console.log(name + ' PASSED'); } finally { await b.close(); } })()
    .catch((e) => { console.error('FAILED', e); process.exit(1); });
}

module.exports = { launch, openApp, speak, toggle, meeting, openSettings, closeSettings, saveSettings, meets, reqs, stored, BASE, run, clickToggle };
