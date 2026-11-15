// 탭 구성: 홈(처음 시작하기·최근 회의) · 준비(폴더) · 리포트(찾기) · 표현, 아래 탭 막대와 '회의 시작' 단추, 계정 시트
const assert = require('assert');
const { openApp, speak, toggle, BASE, run } = require('./helper');
const PHONE = { context: { viewport: { width: 390, height: 800 } } };

run('TABS TESTS', async (b) => {
  // 1) 폰: 위쪽 막대 대신 큰 제목·계정 단추, 아래쪽 탭 막대와 '회의 시작' 단추
  let p = await openApp(b, Object.assign({}, BASE, { apiKey: '' }), PHONE);
  assert.strictEqual(await p.isVisible('#bar'), false);
  assert.strictEqual(await p.isVisible('#tabbar'), true);
  assert.strictEqual(await p.isVisible('#fab'), true);
  assert.strictEqual(await p.textContent('#pageTitle'), '홈');
  assert.strictEqual(await p.textContent('#acctName'), '로그인');
  // 처음 시작하기: 키가 없으면 0/5, 누르면 사용자 등록의 API 키 단계가 열린다
  assert.strictEqual(await p.textContent('#setupCount'), '0/5');
  const items = await p.$$eval('#setupList li', (n) => n.map((x) => x.className + ':' + x.innerText.replace(/\s+/g, ' ')));
  console.log('1 처음 시작하기:', items);
  await p.click('#setupList li:first-child button'); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => document.getElementById('onboard').open), true);
  assert.strictEqual(await p.isVisible('#obSoniox'), true);
  await p.fill('#obSoniox', 'k'); await p.selectOption('#obEngine', 'claude'); await p.fill('#obClaude', 'ck');
  await p.click('#obNext'); await p.waitForTimeout(200);
  await p.click('#obLater'); await p.waitForTimeout(300);
  assert.strictEqual(await p.textContent('#setupCount'), '1/5', '키를 넣으면 하나 끝남');
  // 접기
  await p.click('#setupToggle'); await p.waitForTimeout(150);
  assert.strictEqual(await p.isVisible('#setupList'), false);
  await p.click('#setupToggle');

  // 2) '회의 시작'(아래 단추) → 회의 화면에서는 탭 막대가 사라지고 위쪽 막대가 보인다
  await p.click('#fab'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => R.running), true);
  assert.strictEqual(await p.isVisible('#tabbar'), false);
  assert.strictEqual(await p.isVisible('#bar'), true);
  await speak(p, "We reviewed the draft agreement.");
  await p.evaluate(() => { core.blocks[0].star = true; core.blocks[0].dirty = true; render(); });
  await toggle(p); await p.waitForTimeout(1500);
  await p.click('#clear'); await p.waitForTimeout(600);
  assert.strictEqual(await p.isVisible('#tabbar'), true, '지우면 다시 탭 화면');
  assert(/계약 초안 검토/.test(await p.textContent('#homeRecent')));
  assert.strictEqual(await p.textContent('#setupCount'), '2/5', '첫 회의를 하면 하나 더');

  // 3) 폴더: 폴더 목록, '고치기'는 그 폴더 창을 연다
  await p.click('#tabbar button[data-tab="prep"]'); await p.waitForTimeout(300);
  assert.strictEqual(await p.textContent('#pageTitle'), '폴더');
  const prow = await p.textContent('#prepList .prow');
  console.log('3 준비:', prow);
  assert(/기본/.test(prow) && /지금 폴더/.test(prow) && /회의 1건/.test(prow));
  await p.click('#prepList .prow button:has-text("고치기")'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => document.getElementById('packDlg').open), true);
  await p.fill('#pdBrief', 'A사와 공급 계약 협상'); await p.fill('#pdTerms', 'escrow = 에스크로'); await p.click('#pdOk'); await p.waitForTimeout(400);
  assert(/A사와 공급 계약 협상/.test(await p.textContent('#prepList')));
  assert(/용어 1개/.test(await p.textContent('#prepList')));

  // 4) 리포트: 달별 목록과 내용으로 찾기
  await p.click('#tabbar button[data-tab="report"]'); await p.waitForTimeout(300);
  assert(/\d{4}년 \d+월/.test(await p.textContent('#reportList')));
  await p.fill('#reportSearch', 'draft agreement'); await p.waitForTimeout(200);
  assert.strictEqual(await p.$$eval('#reportList .rrow', (n) => n.length), 1);
  await p.fill('#reportSearch', 'nothing like this'); await p.waitForTimeout(200);
  assert(/찾는 말이 들어간 회의가 없습니다/.test(await p.textContent('#reportList')));

  // 5) 표현: 용어집과 중요 표시한 발언
  await p.click('#tabbar button[data-tab="words"]'); await p.waitForTimeout(300);
  const words = await p.textContent('#wordsBody');
  assert(/escrow/.test(words) && /에스크로/.test(words) && /We reviewed the draft agreement/.test(words), words.slice(0, 300));

  // 6) 계정 시트: 로그인 안 함, 이번 달 회의, 안드로이드가 아니면 Windows 앱 안내, 설정·로그인으로 이동
  await p.click('#acctChip'); await p.waitForTimeout(300);
  const sheet = await p.textContent('#acctBody');
  console.log('6 계정 시트:', sheet.replace(/\s+/g, ' ').slice(0, 200));
  assert(/로그인하지 않음/.test(sheet) && /이번 달 회의/.test(sheet) && /1건/.test(sheet) && /버전 /.test(sheet));
  await p.click('#acctBody button:has-text("로그인·가입")'); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => document.getElementById('settings').open), true);
  await p.click('#cancelSettings');
  await p.context().close();

  // 7) PC(넓은 화면): 탭 막대는 없고, 왼쪽 메뉴의 준비·리포트·표현으로 같은 화면을 연다
  p = await openApp(b, BASE);
  assert.strictEqual(await p.isVisible('#tabbar'), false);
  assert.strictEqual(await p.isVisible('#bar'), true);
  await p.click('#side .nav[data-tab="report"]'); await p.waitForTimeout(200);
  assert.strictEqual(await p.textContent('#pageTitle'), '리포트');
  assert.strictEqual(await p.isVisible('#tabReport'), true);
  await p.click('#sideNew'); await p.waitForTimeout(200);
  assert.strictEqual(await p.textContent('#pageTitle'), '홈');
  // 회의 중에는 다른 탭으로 가지 않는다
  await toggle(p);
  await p.click('#side .nav[data-tab="words"]'); await p.waitForTimeout(200);
  assert(/회의 중에는 다른 화면으로 갈 수 없습니다/.test(await p.textContent('#banner')));
  await toggle(p);
  console.log('7 OK PC 왼쪽 메뉴 탭');
  await p.context().close();
});
