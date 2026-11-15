// 뒤로가기: 열린 창 → 왼쪽 메뉴 → 이전 탭 순서로 하나씩 되돌린다 (폰의 뒤로 단추, 브라우저 뒤로와 같음)
const assert = require('assert');
const { devices } = require('playwright');
const { openApp, toggle, BASE, run } = require('./helper');

const back = async (p) => { await p.evaluate(() => history.back()); await p.waitForTimeout(250); };
const tab = (p) => p.evaluate(() => curTab);
const openDlgs = (p) => p.evaluate(() => [...document.querySelectorAll('dialog[open]')].map((d) => d.id));

run('NAV TESTS', async (b) => {
  const p = await openApp(b, BASE, { context: devices['Pixel 7'] });
  // 1) 탭: 홈 → 준비 → 리포트, 뒤로 두 번이면 홈
  await p.click('#tabbar button[data-tab="prep"]'); await p.waitForTimeout(200);
  await p.click('#tabbar button[data-tab="report"]'); await p.waitForTimeout(200);
  assert.strictEqual(await tab(p), 'report');
  await back(p); assert.strictEqual(await tab(p), 'prep', '뒤로 → 이전 탭');
  await back(p); assert.strictEqual(await tab(p), 'home');

  // 2) 창: 준비 탭에서 폴더 창을 열고 뒤로 → 창만 닫히고 탭은 그대로
  await p.click('#tabbar button[data-tab="prep"]'); await p.waitForTimeout(200);
  await p.click('#prepList .prow button:has-text("고치기")'); await p.waitForTimeout(250);
  assert.deepStrictEqual(await openDlgs(p), ['packDlg']);
  await back(p);
  assert.deepStrictEqual(await openDlgs(p), [], '뒤로 → 창 닫힘');
  assert.strictEqual(await tab(p), 'prep', '탭은 그대로');
  // 단추로 닫은 창은 기록에 남지 않는다: 열고 '취소'로 닫은 뒤 뒤로 → 이전 탭
  await p.click('#prepList .prow button:has-text("고치기")'); await p.waitForTimeout(250);
  await p.click('#pdCancel'); await p.waitForTimeout(300);
  await back(p);
  assert.strictEqual(await tab(p), 'home', '닫은 창을 건너뛰고 이전 탭');

  // 3) 계정 → 개인화 관리하기 → 표현 탭. 뒤로 → 계정을 열기 전 탭(홈)
  await p.click('#acctChip'); await p.waitForTimeout(300);
  await p.click('#acctBody button.btn.wide'); await p.waitForTimeout(400);
  assert.strictEqual(await tab(p), 'words');
  await back(p); await p.waitForTimeout(200);
  assert.deepStrictEqual(await openDlgs(p), []);
  assert.strictEqual(await tab(p), 'home');

  // 4) 창 위의 창: 설정 → 사용자 등록 다시 하기(설정은 닫히고 등록 창) → 뒤로 → 등록 창 닫힘
  await p.evaluate(() => openSettingsDialog()); await p.waitForTimeout(200);
  await p.click('#meEdit'); await p.waitForTimeout(300);
  assert.deepStrictEqual(await openDlgs(p), ['onboard']);
  await back(p);
  assert.deepStrictEqual(await openDlgs(p), []);
  assert.strictEqual(await tab(p), 'home');

  // 5) 왼쪽 메뉴(폰): 열고 뒤로 → 메뉴만 닫힘
  await p.evaluate(() => document.getElementById('sideBtn').click()); await p.waitForTimeout(200);   // 폰 시작 화면에서는 숨어 있어 직접 누른다
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('side-closed')), false);
  await back(p);
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('side-closed')), true, '뒤로 → 메뉴 닫힘');
  assert.strictEqual(await tab(p), 'home');

  // 6) 회의 중에는 뒤로를 눌러도 회의 화면에 머문다
  await toggle(p); await p.waitForTimeout(300);
  await back(p);
  assert.strictEqual(await p.evaluate(() => R.running), true);
  assert(/회의 중입니다/.test(await p.textContent('#banner')));
  await toggle(p); await p.waitForTimeout(800);
  assert.deepStrictEqual(p.errors, []);
  await p.context().close();
});
