// 회의 기록(리포트) 화면: 넓은 화면에서는 왼쪽 메뉴를 두고 내용 자리를 덮는 페이지, 탭(요약·대화록·표현 배우기), 이 회의에 대해 묻기
const assert = require('assert');
const { openApp, BASE, run, reqs } = require('./helper');

run('REPORT TESTS', async (b) => {
  const p = await openApp(b, BASE, { context: { viewport: { width: 1400, height: 860 } } });
  await p.evaluate(async () => {
    const m = { id: 'mx', title: '타임오프 1차', packId: settings.packId, startedAt: Date.now() - 5400e3, endedAt: Date.now() - 600e3, secs: 4800, dev: 'pc',
      lines: [{ en: 'Let us walk through the scope.', ko: '범위를 같이 보시죠.', who: '화자 1' }, { en: 'Can we circle back on the go-live date?', ko: '오픈 날짜는 다시 얘기할까요?', who: '화자 2' }, { en: 'Go-live is February.', ko: '오픈은 2월입니다.', who: '화자 2' }],
      digest: { summary: ['타임오프 범위를 정했다.'], decisions: ['2월 오픈.'], todos: [], terms: [], facts: [], questions: [], lines: 3, at: Date.now() } };
    m.digest.sig = sigOf(m);
    await Store.put('meetings', m); renderHome();
  });
  await p.waitForTimeout(300);
  await p.click('#homeRecent .rrow'); await p.waitForTimeout(400);
  const st = await p.evaluate(() => { const d = document.getElementById('meetDlg'); return { open: d.open, modal: d.matches(':modal'), page: d.classList.contains('page'), left: d.getBoundingClientRect().left }; });
  console.log('열림:', JSON.stringify(st));
  assert(st.open && !st.modal && st.page && st.left > 200, '왼쪽 메뉴 옆의 페이지');
  assert.strictEqual(await p.textContent('#mvTitle'), '타임오프 1차');
  const meta = await p.textContent('#mvMeta');
  assert(/기본/.test(meta) && /\d{4}년 \d+월 \d+일 \(.\)/.test(meta) && /1시간 20분 진행/.test(meta), meta);
  // 탭: 대화록은 요약을 숨기고 전체 기록만
  assert.strictEqual(await p.isVisible('#mvBody .mv-sum'), true);
  await p.click('#meetDlg .mv-tabs button[data-mv="log"]'); await p.waitForTimeout(200);
  assert.strictEqual(await p.isVisible('#mvBody .mv-sum'), false);
  assert.strictEqual(await p.isVisible('#mvBody .mvline[data-line="2"]'), true);
  // 표현 배우기: 이 회의에서 고른 표현 → 바로 학습
  await p.click('#meetDlg .mv-tabs button[data-mv="learn"]'); await p.waitForTimeout(500);
  assert(/circle back/.test(await p.textContent('#mvBody')));
  assert.strictEqual((await reqs(p, 'phrases')).length, 1);
  await p.click('#mvBody button:has-text("이 표현들 바로 학습")'); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => document.getElementById('studyDlg').open), true);
  await p.click('#stClose'); await p.waitForTimeout(150);
  // 이 회의에 대해 묻기
  await p.fill('#mvAskIn', '오픈 날짜가 언제야?'); await p.press('#mvAskIn', 'Enter'); await p.waitForTimeout(400);
  assert(/물어본 것/.test(await p.textContent('#mvBody')) && /가격과 납기를 이야기했습니다/.test(await p.textContent('#mvBody')));
  const ask = await reqs(p, 'ask');
  assert(/Go-live is February/.test(ask[0].user) && /오픈 날짜가 언제야/.test(ask[0].user));
  // 왼쪽 메뉴를 누르면 페이지가 닫히고 그 화면으로
  await p.click('#side .nav[data-tab="report"]'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => document.getElementById('meetDlg').open), false);
  assert.strictEqual(await p.textContent('#pageTitle'), '리포트');
  // Esc 로 닫기
  await p.click('#reportList .rrow'); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => document.getElementById('meetDlg').open), false);
  await p.context().close();
});
