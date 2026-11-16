// PC 웹의 떠 있는 회의 창(문서 PiP): 시작 전 열기 → ▶ 로 시작 → 자막·추천·입력칸이 창 안에 → 닫으면 제자리로
const assert = require('assert');
const { openApp, speak, BASE, run } = require('./helper');

run('PIP TESTS', async (b) => {
  const p = await openApp(b, BASE, { context: { viewport: { width: 1280, height: 800 } } });
  if (!(await p.evaluate(() => 'documentPictureInPicture' in window))) { console.log('이 브라우저는 문서 PiP 없음 — 건너뜀'); await p.context().close(); return; }
  assert.strictEqual(await p.isVisible('#barPip'), true, '시작 화면 위쪽에 떠 있는 창 단추');
  const pop = p.context().waitForEvent('page', { timeout: 5000 });
  await p.click('#barPip');
  const w = await pop; await p.waitForTimeout(500);
  const inPip = (sel) => p.evaluate((sel) => !!window.__pipDoc.querySelector(sel), sel);
  assert(await inPip('#lvTop') && await inPip('#pipStage #transcript') && await inPip('#lvBottom') && await inPip('#assist'));
  assert.strictEqual(await p.evaluate(() => document.getElementById('transcript')), null, '본 창에서는 빠짐');
  assert.strictEqual(await w.textContent('#lvEmptyH'), '아직 시작하지 않았어요');
  assert.strictEqual(await w.textContent('#lvState'), '시작 전');
  assert(/시작/.test(await w.textContent('#lvPause')));
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('idle')), true, '본 창은 아직 홈');
  // ▶ 로 바로 시작 (배경 정보 묻는 창 없이)
  await w.click('#lvPause'); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => R.running), true);
  await speak(p, "Can you confirm the delivery date by Friday? "); await p.waitForTimeout(800);
  assert(/delivery date/.test(await w.textContent('#pipStage')));
  assert.strictEqual(await w.isVisible('#lvEmpty'), false);
  assert(/Friday/.test(await w.textContent('#asBody')), '추천 카드에 답변 제안');
  assert.strictEqual(await p.isVisible('#pipNote'), true, '본 창에는 떠 있는 창에서 보는 중 안내');
  // 떠 있는 창에서 질문
  await w.fill('#lvInput', '방금 무슨 이야기였어?'); await w.click('#lvSend'); await p.waitForTimeout(500);
  assert(/가격과 납기를 이야기했습니다/.test(await w.textContent('#lvQA')));
  // 본 창으로 가져오기 → 제자리
  await p.click('#pipBackBtn'); await p.waitForTimeout(500);
  assert.strictEqual(await p.evaluate(() => !!window.__pipDoc), false);
  assert(await p.evaluate(() => document.getElementById('stage').contains(document.getElementById('transcript'))), '자막이 본 창으로 돌아옴');
  assert(await p.evaluate(() => document.getElementById('work').contains(document.getElementById('assist'))));
  assert(/delivery date/.test(await p.textContent('#transcript')));
  await p.click('#toggle'); await p.waitForTimeout(800);
  assert.strictEqual(await p.evaluate(() => R.running), false);
  await p.context().close();
});
