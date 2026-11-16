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
    const kind = !body.stream ? (/<learn>/.test(user) ? 'learn' : /<livesum>/.test(user) ? 'livesum' : /<ask>/.test(user) ? 'ask' : /<phrases>/.test(user) ? 'phrases' : /<meanings>/.test(user) ? 'meanings' : 'digest') : /<translate>/.test(user) ? 'translate' : /<korean>/.test(user) ? 'assist-ko' : /<action>/.test(user) ? 'assist-act' : 'assist-q';
    const rec = { kind, p: groq ? 'groq' : 'claude', model: body.model, system, user, aborted: false };
    window.REQ.push(rec);
    // 폰 대화 듣기의 요약·질문, 학습 탭의 표현 고르기·뜻 묻기
    if (kind === 'livesum' || kind === 'ask' || kind === 'phrases' || kind === 'meanings') {
      await wait(window.MOCK.extraDelay || 60);
      let d;
      if (kind === 'livesum') d = window.MOCK.livesum || { summary: ['가격 조건을 논의했다.', '납기를 확인했다.'], decisions: ['금요일까지 답을 준다.'], todos: [], open: ['위약금 조항은 아직 미정.'] };
      else if (kind === 'ask') d = window.MOCK.ask || '가격과 납기를 이야기했습니다. (질문: ' + (user.match(/<question>([\s\S]*?)<\/question>/) || [, ''])[1] + ')';
      else if (kind === 'phrases') d = window.MOCK.phrases || { phrases: [{ en: 'circle back', ko: '나중에 다시 논의하다', note: '회의 끝에 다음 논의를 약속할 때', example: 'Can we circle back on the pricing next week?' }, { en: 'on the same page', ko: '생각이 같다', note: '서로 이해가 맞는지 확인할 때', example: 'I think we are on the same page.' }] };
      else d = { items: (user.match(/^- (.+)$/gm) || []).map((l) => ({ en: l.slice(2), ko: '뜻:' + l.slice(2) })) };
      const text = typeof d === 'string' ? d : JSON.stringify(d);
      return { ok: true, status: 200, json: async () => (groq ? { choices: [{ message: { content: text } }] } : { content: [{ type: 'text', text }] }) };
    }
    if (kind === 'learn') {
      const text = JSON.stringify(window.MOCK.learn || { work: 'HR 시스템 구축 컨설턴트. SuccessFactors EC 설계 중.', style: '공손하고 결론부터 말함.', terms: [{ en: 'Employee Central', ko: '' }, { en: 'role mapping', ko: '역할 매핑' }] });
      return { ok: true, status: 200, json: async () => (groq ? { choices: [{ message: { content: text } }] } : { content: [{ type: 'text', text }] }) };
    }
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
// 폰(좁은 화면)의 대화 듣기 화면에서는 위쪽의 ❚❚/▶(다시 시작)와 ■(끝내기)를 쓴다
const clickToggle = async (p) => {
  if (await p.isVisible('#homeStart')) return p.click('#homeStart');
  if (await p.isVisible('#fab')) return p.click('#fab');
  if (await p.isVisible('#toggle')) return p.click('#toggle');
  const running = await p.evaluate(() => R.running || R.starting);
  return p.click(running ? '#lvStop' : '#lvPause');
};
const toggle = async (p) => { await clickToggle(p); await p.waitForTimeout(300); };
// 시작 → 말하기 → 정지 → 자동 저장과 정리가 끝날 때까지 기다림
async function meeting(p, text, after) { await toggle(p); await speak(p, text); await p.waitForTimeout(400); await clickToggle(p); await p.waitForTimeout(after || 4900); }
// 설정 열기: 위쪽 막대의 '설정', 폰의 시작 화면처럼 막대가 없으면 계정 단추 → '설정'
const clickSettings = async (p) => {
  if (await p.isVisible('#liveMore') && !(await p.isVisible('#openSettings'))) await p.click('#liveMore');
  if (await p.isVisible('#openSettings')) { await p.click('#openSettings'); return; }
  if (await p.isVisible('#lvSet')) { await p.click('#lvSet'); return; }   // 폰 대화 듣기 화면의 ⚙
  await p.click((await p.isVisible('#acctChip')) ? '#acctChip' : '#sideAcct'); await p.waitForTimeout(150);   // PC 시작 화면: 계정은 왼쪽 아래
  await p.click('#acctSheet .sh-box.link:has-text("설정")');
};
const openSettings = async (p) => { await clickSettings(p); await p.waitForTimeout(300); };
// 폴더 창 (이름이 없으면 지금 폴더). 폴더의 지난 회의 목록(#meetList)도 여기에 있다
const openFolder = async (p, name) => { await p.evaluate((n) => openPackEditor((n ? packs.find((x) => x.name === n) : currentPack()).id), name || null); await p.waitForTimeout(350); };
const closeFolder = async (p) => { await p.click('#pdCancel'); await p.waitForTimeout(150); };
const closeSettings = (p) => p.click('#cancelSettings');
const saveSettings = async (p) => { await p.click('#saveSettings'); await p.waitForTimeout(250); };
const meets = (p) => p.evaluate(() => [...document.querySelectorAll('#meetList .mrow')].map((r) => r.querySelector('.mtitle').textContent + ' | ' + r.querySelector('.mmeta').textContent));
const reqs = (p, kind) => p.evaluate((kind) => window.REQ.filter((r) => !kind || r.kind === kind), kind);
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('meeting-interpreter.settings.v1')));

const BASE = { apiKey: 'k', claudeKey: 'ck', engine: 'claude', target: 'ko', source: 'mic', draft: false, preview: false, ver: 2, openAfterStop: false, onboarded: true, askBg: false };   // 정지 후 정리 화면 자동 열기, 사용자 등록 창, 시작할 때 묻는 창은 따로 시험한다

function run(name, fn) {
  (async () => { const b = await launch(); try { await fn(b); console.log(name + ' PASSED'); } finally { await b.close(); } })()
    .catch((e) => { console.error('FAILED', e); process.exit(1); });
}

// 왼쪽 메뉴의 '＋ 새 폴더' → 폴더 만들기 창에 적고 만들기
async function newPack(p, name, topic, people) {
  await p.click('#sidePackNew'); await p.waitForTimeout(150);
  await p.fill('#pdName', name);
  if (topic) await p.fill('#pdTopic', topic);
  if (people) await p.fill('#pdPeople', people);
  await p.click('#pdOk'); await p.waitForTimeout(400);
}

// 가짜 Supabase 서버 (인증 + 표 두 개). 실제 Supabase 는 부르지 않는다
const SB = 'https://sb.test';
function fakeSupabase() {
  const db = { users: {}, rows: { packs: new Map(), meetings: new Map() }, clock: 0, down: false, calls: [], confirm: false, redirects: [] };
  const ts = () => new Date(Date.UTC(2026, 0, 1) + (++db.clock) * 1000).toISOString();
  const tokenFor = (u) => ({ access_token: 'at-' + u.id + '-' + db.clock, refresh_token: 'rt-' + u.id, expires_in: 3600, user: { id: u.id, email: u.email } });
  const userOf = (req) => { const m = /Bearer at-(u\d+)-/.exec(req.headers()['authorization'] || ''); return m && m[1]; };
  async function handle(route) {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: body === undefined ? '' : JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (db.down) return route.abort('internetdisconnected');
    if (req.headers()['apikey'] !== 'anon-key') return json(401, { message: 'Invalid API key' });
    db.calls.push(req.method() + ' ' + path);
    if (path === '/auth/v1/signup') {
      const b = JSON.parse(req.postData());
      if (db.users[b.email]) return json(422, { msg: 'User already registered' });
      const u = db.users[b.email] = { id: 'u' + (Object.keys(db.users).length + 1), email: b.email, pw: b.password, ok: !db.confirm };
      db.redirects.push(url.searchParams.get('redirect_to'));
      // 이메일 확인이 켜져 있으면 토큰 없이 사용자만 돌려준다 (Supabase 와 같음)
      if (db.confirm) return json(200, { id: u.id, email: u.email });
      return json(200, tokenFor(u));
    }
    if (path === '/auth/v1/resend') { db.redirects.push(url.searchParams.get('redirect_to')); return json(200, {}); }
    if (path === '/auth/v1/user') {
      const uid = userOf(req), u = Object.values(db.users).find((x) => x.id === uid);
      return u ? json(200, { id: u.id, email: u.email }) : json(401, { msg: 'invalid JWT' });
    }
    if (path === '/auth/v1/token') {
      const b = JSON.parse(req.postData());
      const u = url.searchParams.get('grant_type') === 'password' ? db.users[b.email] : Object.values(db.users).find((x) => 'rt-' + x.id === b.refresh_token);
      if (!u || (b.email && u.pw !== b.password)) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      if (u.ok === false) return json(400, { error: 'invalid_grant', error_description: 'Email not confirmed' });
      return json(200, tokenFor(u));
    }
    if (path === '/auth/v1/logout') return json(204);
    const m = /^\/rest\/v1\/(packs|meetings)$/.exec(path);
    if (m) {
      const uid = userOf(req);
      if (!uid) return json(401, { message: 'JWT expired' });
      const table = db.rows[m[1]];
      if (req.method() === 'POST') {
        for (const r of JSON.parse(req.postData())) table.set(uid + '|' + r.id, { id: r.id, user_id: uid, data: r.data, deleted: !!r.deleted, updated_at: ts() });
        return json(201);
      }
      let list = [...table.values()].filter((r) => r.user_id === uid);
      const gt = url.searchParams.get('updated_at');
      if (gt) list = list.filter((r) => r.updated_at > gt.replace(/^gt\./, ''));
      if (url.searchParams.get('deleted') === 'eq.false') list = list.filter((r) => !r.deleted);
      const idq = url.searchParams.get('id');
      if (idq) list = list.filter((r) => r.id === idq.replace(/^eq\./, ''));
      list.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
      return json(200, list.slice(0, Number(url.searchParams.get('limit') || 1000)).map((r) => ({ id: r.id, data: r.data, deleted: r.deleted, updated_at: r.updated_at })));
    }
    return json(404, { message: 'not found' });
  }
  return { db, handle, tokenFor };
}

module.exports = { openFolder, closeFolder, fakeSupabase, SB, newPack, launch, openApp, speak, toggle, meeting, openSettings, closeSettings, saveSettings, meets, reqs, stored, BASE, run, clickToggle, clickSettings };
