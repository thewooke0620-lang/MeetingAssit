const { chromium } = require('playwright');
const fs = require('fs'), assert = require('assert');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const mock = (st) => {
  if (location.protocol !== 'https:') return;
  if (!localStorage.getItem('meeting-interpreter.settings.v1')) localStorage.setItem('meeting-interpreter.settings.v1', JSON.stringify(st));
  window.TITLE_REQ = []; window.SOCKS = [];
  window.WebSocket = class { constructor() { this.readyState = 0; window.SOCKS.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20); }
    send() {} close() { this.readyState = 3; setTimeout(() => this.onclose && this.onclose(), 5); }
    emit(o) { this.onmessage({ data: JSON.stringify(o) }); } };
  window.fetch = async (url, opt) => {
    const body = JSON.parse(opt.body);
    if (!body.stream) {           // 제목 요청
      const user = body.messages[body.messages.length - 1].content;
      const n = user.split('<transcript>')[1].trim().split('\n').length - 1;
      window.TITLE_REQ.push({ system: body.system || body.messages[0].content, user, model: body.model });
      await new Promise((r) => setTimeout(r, 150));
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '"계약 초안 검토 ' + n + '줄"' }] }) };
    }
    const txt = body.messages[0].content.match(/<translate>([\s\S]*)<\/translate>/)[1];
    const out = '번역[' + txt.trim().split(/\s+/).slice(0, 3).join(' ') + ']'; const enc = new TextEncoder(); let sent = false;
    return { ok: true, status: 200, body: new ReadableStream({ async pull(c) { await new Promise((r) => setTimeout(r, 60)); if (sent) { c.close(); return; } sent = true; c.enqueue(enc.encode('data: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: out } }) + '\n')); } }) };
  };
};
const speak = async (p, text, trans) => { for (const w of text.match(/\s*\S+/g)) { await p.evaluate(([w, trans]) => window.SOCKS[window.SOCKS.length - 1].emit({ tokens: [{ text: w, is_final: true, translation_status: 'original', speaker: '1' }].concat(trans ? [{ text: ' 소', is_final: true, translation_status: 'translation' }] : []) }), [w, trans]); await p.waitForTimeout(12); } };
const meets = (p) => p.evaluate(() => [...document.querySelectorAll('#meetList .mrow')].map((r) => r.querySelector('.mtitle').textContent + ' | ' + r.querySelector('.mmeta').textContent));
const openDlg = async (p) => { await p.click('#openSettings'); await p.waitForTimeout(300); };
const close = (p) => p.click('#cancelSettings');
const session = async (p, text, wait) => { await p.click('#toggle'); await p.waitForTimeout(300); await speak(p, text); await p.waitForTimeout(400); await p.click('#toggle'); await p.waitForTimeout(wait || 4800); };

async function page(b, st) {
  const ctx = await b.newContext({ viewport: { width: 760, height: 900 }, acceptDownloads: true });
  await ctx.route('https://x.test/', (r) => r.fulfill({ body: HTML, contentType: 'text/html' }));
  await ctx.addInitScript(mock, st);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto('https://x.test/'); await p.waitForTimeout(400);
  return p;
}

(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  let p = await page(b, { apiKey: 'k', claudeKey: 'ck', engine: 'claude', target: 'ko', source: 'mic', draft: false, preview: false, ver: 2, brief: 'A사 공급 계약' });
  let answer = null;
  p.on('dialog', (d) => (d.type() === 'prompt' ? d.accept(answer) : d.accept()));

  // 1) 정지하면 제목이 붙는다
  await session(p, "We reviewed the draft agreement over the weekend. The escrow terms look fine to us.");
  console.log('1 상태줄:', await p.textContent('#connState'));
  await openDlg(p); let m = await meets(p); console.log('  목록:', m);
  assert(/^계약 초안 검토 2줄 \| .* 2줄 · 지금 화면의 회의$/.test(m[0]));
  const tr = await p.evaluate(() => window.TITLE_REQ[0]);
  assert(/Meeting series: 기본/.test(tr.user) && /Background: A사 공급 계약/.test(tr.user) && /화자 1: We reviewed/.test(tr.user));
  await close(p);

  // 2) 이어서 진행하면 제목을 다시 짓는다 (같은 기록 한 건)
  await session(p, " Can you confirm the penalty clause by Friday?");
  await openDlg(p); m = await meets(p); console.log('2 목록:', m);
  assert(m.length === 1 && /^계약 초안 검토 3줄/.test(m[0]));

  // 3) 손으로 고친 제목은 유지된다
  answer = '위약금 조항 확인 요청';
  await p.click('#meetList .mrow button:has-text("제목 수정")'); await p.waitForTimeout(300);
  assert(/^위약금 조항 확인 요청 \|/.test((await meets(p))[0]));
  await close(p);
  await session(p, " We will send the revised draft tomorrow.");
  await openDlg(p); m = await meets(p); console.log('3 목록:', m);
  assert(/^위약금 조항 확인 요청 \| .* 4줄/.test(m[0]), '손으로 고친 제목이 덮어써지면 안 됨');

  // 4) 내려받은 파일: 제목·일시·묶음이 맨 위에
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#meetList .mrow button:has-text("내려받기")')]);
  const txt = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '');
  console.log('4 파일명:', dl.suggestedFilename()); console.log(txt.split('\n').slice(0, 6).join('\n'));
  assert(/^위약금 조항 확인 요청\n일시: .* \(1분\)\n묶음: 기본\n\n\[화자 1\] We reviewed/.test(txt));

  // 5) 제목을 비우면 자동으로 다시 짓는다
  answer = '';
  await p.click('#meetList .mrow button:has-text("제목 수정")'); await p.waitForTimeout(700);
  m = await meets(p); console.log('5 목록:', m);
  assert(/^계약 초안 검토 4줄/.test(m[0]));
  await close(p);

  // 6) 지우고 새 회의 → 묶음 안에 두 건이 제목으로 구분된다
  await p.click('#clear'); await p.waitForTimeout(200);
  await session(p, "Let us move on to the delivery schedule.");
  await openDlg(p); m = await meets(p); console.log('6 목록:', m);
  assert(m.length === 2 && /1줄 \|/.test(m[0]) && /4줄 \|/.test(m[1]));
  await close(p);

  // 7) 정지하지 않고 지운 회의에도 제목이 붙는다
  await p.click('#clear'); await p.waitForTimeout(200);
  await p.click('#toggle'); await p.waitForTimeout(300); await speak(p, "One more thing about pricing."); await p.waitForTimeout(400);
  await p.click('#clear'); await p.waitForTimeout(800);
  await p.click('#toggle'); await p.waitForTimeout(300);
  await openDlg(p); m = await meets(p); console.log('7 목록:', m);
  assert(m.length === 3 && m.every((x) => /^계약 초안 검토/.test(x)));
  await p.context().close();

  // 8) AI 키가 없으면(Soniox 내장) 첫 문장으로 임시 제목
  p = await page(b, { apiKey: 'k', engine: 'soniox', target: 'ko', source: 'mic', ver: 2 });
  p.on('dialog', (d) => d.accept());
  await p.click('#toggle'); await p.waitForTimeout(300);
  await speak(p, "We reviewed the draft agreement over the weekend and have a few comments.", true); await p.click('#toggle'); await p.waitForTimeout(4800);
  await openDlg(p); m = await meets(p); console.log('8 목록:', m);
  assert(m.length === 1 && !/제목 없음/.test(m[0]) && (await p.evaluate(() => window.TITLE_REQ.length)) === 0);
  // 9) 나중에 Claude 키를 넣으면 임시 제목을 AI 제목으로 바꾼다 (목록을 다시 열 때 한 번)
  await p.selectOption('#engine', 'claude'); await p.fill('#claudeKey', 'ck'); await p.click('#saveSettings'); await p.waitForTimeout(200);
  await p.reload(); await p.waitForTimeout(500);
  await openDlg(p); await p.waitForTimeout(700); m = await meets(p); console.log('9 목록:', m);
  assert(/^계약 초안 검토 1줄/.test(m[0]));
  await b.close();
  console.log('ALL TITLE TESTS PASSED');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
