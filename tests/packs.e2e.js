const { clickSettings } = require('./helper');   // 설정 열기 (폰 화면이면 계정 단추로)
const { clickToggle } = require('./helper');   // 시작 화면이면 '회의 시작', 아니면 위쪽 시작·정지 단추
const { chromium } = require('playwright');
const fs = require('fs'), assert = require('assert');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const mock = () => {
  if (location.protocol !== 'https:') return;
  if (!localStorage.getItem('meeting-interpreter.settings.v1')) localStorage.setItem('meeting-interpreter.settings.v1', JSON.stringify({ apiKey: 'soniox-SECRETKEY', claudeKey: 'sk-ant-SECRETKEY', engine: 'claude', target: 'ko', source: 'mic', draft: false, preview: false, ver: 2, openAfterStop: false, brief: '예전 배경', terms: 'Acme Corp' }));
  window.REQ = []; window.SOCKS = []; window.CFG = [];
  window.WebSocket = class { constructor() { this.readyState = 0; window.SOCKS.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20); }
    send(d) { if (typeof d === 'string' && d) window.CFG.push(JSON.parse(d)); if (d === '') setTimeout(() => this.onmessage && this.onmessage({ data: '{"finished":true}' }), 40); } close() { this.readyState = 3; setTimeout(() => this.onclose && this.onclose(), 5); }
    emit(o) { this.onmessage({ data: JSON.stringify(o) }); } };
  window.fetch = async (url, opt) => {
    const body = JSON.parse(opt.body); const txt = body.messages[0].content.match(/<translate>([\s\S]*)<\/translate>/)[1];
    window.REQ.push({ system: body.system, txt });
    const out = '번역[' + txt.trim().split(/\s+/).slice(0, 3).join(' ') + ']'; const enc = new TextEncoder(); let sent = false;
    return { ok: true, status: 200, body: new ReadableStream({ async pull(c) { await new Promise((r) => setTimeout(r, 80)); if (sent) { c.close(); return; } sent = true; c.enqueue(enc.encode('data: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: out } }) + '\n')); } }) };
  };
};
const speak = async (p, text) => { for (const w of text.match(/\s*\S+/g)) { await p.evaluate((w) => window.SOCKS[window.SOCKS.length - 1].emit({ tokens: [{ text: w, is_final: true, translation_status: 'original', speaker: '1' }] }), w); await p.waitForTimeout(15); } };
const packsOf = (p) => p.evaluate(() => packs.map((x) => x.name));
const meets = (p) => p.evaluate(() => [...document.querySelectorAll('#meetList .mrow .minfo, #meetList .none')].map((x) => x.textContent));
const pill = (p) => p.evaluate(() => document.getElementById('packPill').textContent);
const openDlg = async (p) => { await clickSettings(p); await p.waitForTimeout(250); };
const save = async (p) => { await p.click('#saveSettings'); await p.waitForTimeout(250); };
// 폴더 창 열기 (이름으로), 닫기, 저장
const openFolder = async (p, name) => { await p.evaluate((n) => openPackEditor(packs.find((x) => x.name === n).id), name); await p.waitForTimeout(350); };
const closeFolder = async (p) => { await p.click('#pdCancel'); await p.waitForTimeout(150); };

(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 760, height: 1100 }, acceptDownloads: true });
  await ctx.route('https://x.test/', (r) => r.fulfill({ body: HTML, contentType: 'text/html' }));
  await ctx.addInitScript(mock);
  let p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto('https://x.test/'); await p.waitForTimeout(400);

  // 1) 처음: 기존 배경·용어집이 "기본" 폴더로
  assert.strictEqual(await pill(p), '폴더: 기본');
  assert.deepStrictEqual(await packsOf(p), ['기본']);
  await openFolder(p, '기본');
  assert.strictEqual(await p.inputValue('#pdBrief'), '예전 배경'); assert.strictEqual(await p.inputValue('#pdTerms'), 'Acme Corp');
  assert.deepStrictEqual(await meets(p), ['아직 저장된 회의가 없습니다.']);
  await closeFolder(p);
  // 설정에는 폴더 내용이 없다
  await openDlg(p);
  assert.strictEqual(await p.$('#settings #packSel, #settings #brief, #settings #terms'), null, '설정에 폴더 칸 없음');
  await p.click('#cancelSettings');
  console.log('1 OK 기본 폴더 생성, 기존 배경·용어집 이관, 설정에는 폴더 칸 없음');

  // 2) 새 폴더 만들고 이름·배경·용어집 입력
  await p.evaluate(() => openPackDlg(null)); await p.waitForTimeout(150);
  assert.strictEqual(await p.isVisible('#pdFacts'), false, '새로 만들 때는 쌓인 내용 칸 없음');
  await p.fill('#pdName', 'A사 계약'); await p.fill('#pdBrief', 'A사와 공급 계약 협의'); await p.fill('#pdTerms', 'escrow = 에스크로');
  await p.click('#pdOk'); await p.waitForTimeout(300);
  assert.strictEqual(await pill(p), '폴더: A사 계약');
  console.log('2 OK 새 폴더 저장');

  // 3) 회의 → 정지 → 자동 저장
  await clickToggle(p); await p.waitForTimeout(300);
  await speak(p, "We reviewed the draft agreement over the weekend. The escrow terms look fine to us.");
  await p.waitForTimeout(600);
  await clickToggle(p); await p.waitForTimeout(4600);
  const state = await p.evaluate(() => document.getElementById('connState').textContent);
  const req = await p.evaluate(() => window.REQ);
  assert(req.some((r) => /A사와 공급 계약 협의/.test(r.system) && /escrow = 에스크로/.test(r.system)), '폴더의 배경·용어집이 번역 지시문에 들어가야 함');
  assert.deepStrictEqual(await p.evaluate(() => window.CFG[0].context.terms), ['escrow']);
  await openFolder(p, 'A사 계약');
  assert.strictEqual(await p.isVisible('#pdFacts'), true, '고칠 때는 쌓인 내용 칸');
  let m = await meets(p);
  console.log('3 상태줄:', state, '| 목록:', m);
  assert(m.length === 1 && /2줄/.test(m[0]) && /지금 화면의 회의/.test(m[0]));

  // 4) 내려받기 내용
  await p.click('#meetList .mrow button:has-text("열기")'); await p.waitForTimeout(300);
  let [dl] = await Promise.all([p.waitForEvent('download'), p.click('#mvDownload')]);
  await p.click('#mvClose');
  const txt = fs.readFileSync(await dl.path(), 'utf8');
  console.log('4 파일명:', dl.suggestedFilename(), '\n' + txt.replace(/^\uFEFF/, ''));
  assert(/\[화자 1\] We reviewed the draft agreement over the weekend\.\n번역\[We reviewed the\]/.test(txt));
  await closeFolder(p);

  // 5) 전체 내보내기 (설정의 백업)
  await openDlg(p);
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('#packExport')]);
  const backupPath = require('path').join(require('os').tmpdir(), 'meeting-backup-test-' + process.pid + '.json');
  await dl.saveAs(backupPath);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert.strictEqual(backup.packs.length, 2); assert.strictEqual(backup.meetings.length, 1);
  assert(!JSON.stringify(backup).includes('SECRETKEY'), 'API 키가 백업에 들어가면 안 됨');
  console.log('5 OK 내보내기:', dl.suggestedFilename(), '| 폴더', backup.packs.length, '회의', backup.meetings.length);
  await p.click('#cancelSettings');

  // 6) 지우기 → 새 회의 → 두 번째 기록
  await p.click('#clear'); await p.waitForTimeout(200);
  await clickToggle(p); await p.waitForTimeout(300);
  await speak(p, "Can you confirm the penalty clause by Friday?"); await p.waitForTimeout(500);
  await clickToggle(p); await p.waitForTimeout(4600);
  await openFolder(p, 'A사 계약');
  m = await meets(p); console.log('6 목록:', m);
  assert.strictEqual(m.length, 2); assert(/1줄/.test(m[0]) && /2줄/.test(m[1]));

  // 7) 지금 화면의 회의를 삭제하면 다시 저장되지 않는다
  await p.click('#meetList .mrow:first-child button:has-text("삭제")'); await p.waitForTimeout(300);
  assert.strictEqual((await meets(p)).length, 1);
  await closeFolder(p);
  await clickToggle(p); await p.waitForTimeout(300); await speak(p, " We will get back to you soon."); await clickToggle(p); await p.waitForTimeout(4600);
  await openFolder(p, 'A사 계약');
  assert.strictEqual((await meets(p)).length, 1, '삭제한 회의는 다시 저장되면 안 됨');
  console.log('7 OK 삭제한 현재 회의는 다시 저장하지 않음');
  await closeFolder(p);

  // 8) 새로고침 후에도 유지
  await p.reload(); await p.waitForTimeout(500);
  assert.strictEqual(await pill(p), '폴더: A사 계약');
  assert.deepStrictEqual(await packsOf(p), ['기본', 'A사 계약']);
  await openFolder(p, 'A사 계약');
  assert.strictEqual(await p.inputValue('#pdTerms'), 'escrow = 에스크로');
  assert.strictEqual((await meets(p)).length, 1);
  console.log('8 OK 새로고침 후 폴더·기록 유지');

  // 9) 폴더 삭제 → 가져오기로 복구
  await p.click('#pdDel'); await p.waitForTimeout(400);
  assert.deepStrictEqual(await packsOf(p), ['기본']);
  assert.strictEqual(await pill(p), '폴더: 기본');
  await openDlg(p);
  await p.setInputFiles('#packFile', backupPath); await p.waitForTimeout(500);
  console.log('9 가져오기 안내:', await p.textContent('#packMsg'));
  assert.deepStrictEqual(await packsOf(p), ['기본', 'A사 계약']);
  // 잘못된 파일
  fs.writeFileSync(backupPath + '.bad', '{"hello":1}');
  await p.setInputFiles('#packFile', backupPath + '.bad'); await p.waitForTimeout(300);
  console.log('  잘못된 파일 안내:', await p.textContent('#packMsg'));
  await p.click('#cancelSettings');
  await openFolder(p, 'A사 계약');
  assert.strictEqual((await meets(p)).length, 1);
  // 마지막 폴더는 삭제 단추가 없다
  await p.click('#pdDel'); await p.waitForTimeout(400);
  assert.strictEqual((await packsOf(p)).length, 1);
  await openFolder(p, '기본');
  assert.strictEqual(await p.isVisible('#pdDel'), false, '마지막 폴더는 삭제 불가');
  await closeFolder(p);

  // 10) 자동 저장 끔
  await openDlg(p); await p.uncheck('#autoSave'); await save(p);
  if (await p.isVisible('#clear')) { await p.click('#clear'); await p.waitForTimeout(100); }   // 시작 화면이면 지울 것이 없다
  await clickToggle(p); await p.waitForTimeout(300); await speak(p, "This one is confidential."); await clickToggle(p); await p.waitForTimeout(4600);
  await openFolder(p, '기본');
  assert.deepStrictEqual(await meets(p), ['아직 저장된 회의가 없습니다.']);
  console.log('10 OK 자동 저장을 끄면 기록이 남지 않음');
  await b.close();
  console.log('ALL PACK TESTS PASSED');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
