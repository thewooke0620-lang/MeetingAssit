// 회의 후 정리: 제목·요약 자동 작성, 회의 보기 창, 묶음에 쌓기, 내려받기
const assert = require('assert'), fs = require('fs');
const { openApp, speak, toggle, meeting, openSettings, closeSettings, saveSettings, meets, reqs, stored, BASE, run } = require('./helper');
const S1 = "We reviewed the draft agreement over the weekend. The escrow terms look fine to us.";
const viewText = (p) => p.evaluate(() => document.getElementById('mvBody').innerText);
const picks = (p) => p.evaluate(() => [...document.querySelectorAll('#mvBody .mvpick')].map((r) => (r.querySelector('input').disabled ? '[-] ' : r.querySelector('input').checked ? '[v] ' : '[ ] ') + r.innerText.replace(/\n+/g, ' / ')));

run('DIGEST TESTS', async (b) => {
  let p = await openApp(b, Object.assign({}, BASE, { brief: 'A사 공급 계약', terms: 'escrow = 에스크로' }));

  // 1) 정지하면 제목과 정리가 붙는다 (AI 호출 한 번)
  await meeting(p, S1);
  let state = await p.textContent('#connState');
  assert(/저장했습니다: 계약 초안 검토 2줄 \(2줄\)/.test(state), state);
  let dq = await reqs(p, 'digest');
  assert.strictEqual(dq.length, 1);
  assert(/Meeting series: 기본/.test(dq[0].user) && /Background: A사 공급 계약/.test(dq[0].user) && /Existing glossary: escrow/.test(dq[0].user) && /화자 1: We reviewed/.test(dq[0].user));
  await openSettings(p);
  let m = await meets(p);
  assert(/^계약 초안 검토 2줄 \| .* 2줄 · 정리 있음 · 지금 화면의 회의$/.test(m[0]), m[0]);
  await closeSettings(p);

  // 2) 이어서 진행하면 같은 기록의 제목과 정리를 다시 만든다
  await meeting(p, " Can you confirm the penalty clause by Friday?");
  await openSettings(p); m = await meets(p);
  assert(m.length === 1 && /^계약 초안 검토 3줄/.test(m[0]), m[0]);

  // 3) 열기: 요약·결정·할 일, 묶음에 쌓을 내용 (이미 있는 용어는 빠져 있음)
  await p.click('#meetList .mrow button:has-text("열기")'); await p.waitForTimeout(300);
  let v = await viewText(p);
  for (const want of ['요약', '계약 초안을 검토했다.', '결정 사항', '금요일까지 위약금 조항을 확인한다.', '할 일', '수정 초안을 보낸다.', '묶음에 쌓을 내용', '전체 기록 (3줄)']) assert(v.includes(want), want);
  let pk = await picks(p);
  console.log(pk);
  assert.deepStrictEqual(pk.map((x) => x.slice(0, 3)), ['[-]', '[v]', '[v]', '[v]', '[v]']);
  assert(/escrow = 에스크로 · 이미 있음/.test(pk[0]));
  assert.strictEqual((await reqs(p, 'digest')).length, 2, '이미 있는 정리는 열 때 다시 만들지 않음');

  // 4) 하나는 빼고 묶음에 추가 → 설정 창의 묶음 칸에도 바로 반영
  await p.click('#mvBody .mvpick:has-text("Acme Corp") input');
  await p.click('#mvAdd'); await p.waitForTimeout(300);
  assert(/용어 1개, 내용 1개, 질문 1개를 추가했습니다/.test(await viewText(p)));
  pk = await picks(p);
  assert.deepStrictEqual(pk.map((x) => x.slice(0, 3)), ['[-]', '[v]', '[-]', '[-]', '[-]']);
  await p.click('#mvClose');
  assert.strictEqual(await p.inputValue('#terms'), 'escrow = 에스크로\npenalty clause = 위약금 조항');
  assert.strictEqual(await p.inputValue('#packFacts'), '납기는 발주 후 6주다.');
  assert.strictEqual(await p.inputValue('#packQa'), 'Q: Can you confirm the penalty clause by Friday? (금요일까지 위약금 조항을 확인해 줄 수 있나요?)\nA: ');
  assert.strictEqual((await stored(p)).terms, 'escrow = 에스크로\npenalty clause = 위약금 조항', '번역에 쓰는 용어집에도 바로 반영');
  // 설정 창에서 답을 채워 넣고 저장해도 추가한 내용이 사라지지 않는다
  await p.fill('#packQa', 'Q: Can you confirm the penalty clause by Friday?\nA: 금요일까지 확인 가능');
  await saveSettings(p);
  await p.reload(); await p.waitForTimeout(500);
  await openSettings(p);
  assert.strictEqual(await p.inputValue('#packFacts'), '납기는 발주 후 6주다.');
  assert(/금요일까지 확인 가능/.test(await p.inputValue('#packQa')));
  assert.strictEqual(await p.inputValue('#terms'), 'escrow = 에스크로\npenalty clause = 위약금 조항');

  // 5) 제목 수정: 손으로 고친 제목은 유지, 비우면 다시 자동
  await p.click('#meetList .mrow button:has-text("열기")'); await p.waitForTimeout(300);
  p.answer = '위약금 조항 확인 요청';
  await p.click('#mvRename'); await p.waitForTimeout(300);
  assert.strictEqual(await p.textContent('#mvTitle'), '위약금 조항 확인 요청');
  assert(/^위약금 조항 확인 요청 \|/.test((await meets(p))[0]));
  // 6) 내려받기: 제목·일시·묶음·요약이 위에, 전체 기록이 아래에
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#mvDownload')]);
  const txt = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '');
  console.log(dl.suggestedFilename() + '\n' + txt.split('\n').slice(0, 14).join('\n'));
  assert(/^위약금 조항 확인 요청\n일시: .*\n묶음: 기본\n\n\[요약\]\n- 계약 초안을 검토했다\.\n- 위약금 조항을 논의했다\.\n\n\[결정 사항\]\n- 금요일까지 위약금 조항을 확인한다\.\n\n\[할 일\]\n- 수정 초안을 보낸다\.\n\n\[전체 기록\]\n\[화자 1\] We reviewed/.test(txt));
  assert(/위약금 조항 확인 요청\.txt$/.test(dl.suggestedFilename()));
  // 다시 정리해도 손으로 고친 제목은 그대로
  await p.click('#mvRedo'); await p.waitForTimeout(500);
  assert.strictEqual(await p.textContent('#mvTitle'), '위약금 조항 확인 요청');
  p.answer = '';
  await p.click('#mvRename'); await p.waitForTimeout(600);
  assert.strictEqual(await p.textContent('#mvTitle'), '계약 초안 검토 3줄');
  await p.click('#mvClose'); await closeSettings(p);
  await p.context().close();

  // 7) 위쪽 "회의 정리" 버튼: 회의 중에도 지금까지의 내용을 정리해 연다
  p = await openApp(b, BASE);
  await p.click('#digestBtn'); await p.waitForTimeout(200);
  assert(/정리할 회의 내용이 아직 없습니다/.test(await p.textContent('#banner')));
  await toggle(p); await speak(p, S1); await p.waitForTimeout(300);
  await p.click('#digestBtn'); await p.waitForTimeout(600);
  assert.strictEqual(await p.evaluate(() => document.getElementById('meetDlg').open), true);
  assert.strictEqual(await p.textContent('#mvTitle'), '계약 초안 검토 2줄');
  assert((await viewText(p)).includes('계약 초안을 검토했다.'));
  await p.click('#mvClose'); await p.click('#toggle'); await p.waitForTimeout(300);
  await p.context().close();

  // 8) 자동 저장을 끈 회의: 화면에서만 정리하고 기록은 남기지 않는다
  p = await openApp(b, Object.assign({}, BASE, { autoSave: false }));
  await meeting(p, S1, 600);
  await p.click('#digestBtn'); await p.waitForTimeout(600);
  v = await viewText(p);
  assert(v.includes('저장하지 않는 회의') && v.includes('계약 초안을 검토했다.'));
  assert.strictEqual(await p.isVisible('#mvRename'), false);
  await p.click('#mvClose');
  await openSettings(p);
  assert.strictEqual((await meets(p)).length, 0);
  await p.context().close();

  // 9) 자동 정리를 끄면 정지할 때 AI 를 부르지 않고, 열 때 만든다
  p = await openApp(b, Object.assign({}, BASE, { autoDigest: false }));
  await meeting(p, S1);
  assert.strictEqual((await reqs(p, 'digest')).length, 0);
  await openSettings(p); m = await meets(p);
  assert(/^번역\[We reviewed the\] \| .* 2줄 · 지금 화면의 회의$/.test(m[0]), m[0]);
  await p.click('#meetList .mrow button:has-text("열기")'); await p.waitForTimeout(600);
  assert.strictEqual((await reqs(p, 'digest')).length, 1);
  assert.strictEqual(await p.textContent('#mvTitle'), '계약 초안 검토 2줄');
  await p.context().close();

  // 10) AI 키가 없으면 임시 제목만 붙고 안내가 나온다
  p = await openApp(b, { apiKey: 'k', engine: 'soniox', target: 'ko', source: 'mic', ver: 2 });
  await meeting(p, S1);
  assert.strictEqual((await reqs(p)).length, 0);
  await openSettings(p); m = await meets(p);
  assert(m.length === 1 && /^We reviewed the draft ag… \|/.test(m[0]), m[0]);
  await p.click('#meetList .mrow button:has-text("열기")'); await p.waitForTimeout(300);
  assert((await viewText(p)).includes('Claude나 Groq API 키를 설정에 넣으면'));
  assert.strictEqual(await p.isDisabled('#mvRedo'), true);
  await p.context().close();

  // 11) AI 가 실패하거나 엉뚱한 형식으로 답하면: 임시 제목, 안내, 다시 정리로 복구
  p = await openApp(b, BASE);
  await p.evaluate(() => { window.MOCK.digestStatus = 500; });
  await meeting(p, S1);
  await openSettings(p); m = await meets(p);
  assert(/^번역\[We reviewed the\] \|/.test(m[0]) && !/정리 있음/.test(m[0]), m[0]);
  await p.evaluate(() => { window.MOCK.digestStatus = 200; window.MOCK.digest = 'Sorry, I cannot do that.'; });
  await p.click('#meetList .mrow button:has-text("열기")'); await p.waitForTimeout(600);
  assert((await viewText(p)).includes("정리를 만들지 못했습니다"));
  await p.evaluate(() => { window.MOCK.digest = '```json\n{"title":"가격 조정안 협의","summary":["가격 조정안을 협의했다."],"decisions":[],"todos":[],"terms":[],"facts":[],"questions":[]}\n```'; });
  await p.click('#mvRedo'); await p.waitForTimeout(600);
  v = await viewText(p);
  assert.strictEqual(await p.textContent('#mvTitle'), '가격 조정안 협의');
  assert(v.includes('가격 조정안을 협의했다.') && v.includes('결정 사항') && !v.includes('묶음에 쌓을 내용'));
  assert.deepStrictEqual(p.errors, []);
});
