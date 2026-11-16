// 시작할 때 '배경 정보를 등록할까요?' (그냥 진행하기 / 등록하기), 폴더 탭(폴더를 누르면 그 폴더의 리포트, 찾기),
// 리포트 이름(날짜_제목)과 AI 태그(5개까지, 고치기, 찾기에 쓰임). 실제 AI 는 부르지 않는다
const assert = require('assert');
const { openApp, speak, BASE, run, reqs } = require('./helper');

const DIG = { title: '납기 일정 협의', summary: ['납기를 협의했다.'], decisions: [], todos: [], terms: [], facts: [], questions: [],
  tags: ['납기', 'Acme', '#위약금', '납기', '계약 갱신', '단가', '여섯번째'] };

run('FOLDERS TESTS', async (b) => {
  const p = await openApp(b, Object.assign({}, BASE, { askBg: true }));
  await p.evaluate((d) => { window.MOCK.digest = d; }, DIG);
  // 1) 시작 → 묻는 창 → 그냥 진행하기
  assert.strictEqual(await p.isVisible('#meetTopic'), false, '홈에는 새 회의 칸이 없음');
  await p.click('#homeStart'); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => document.getElementById('startDlg').open), true);
  assert(/저장할 폴더/.test(await p.textContent('#sdAsk')) && /기본/.test(await p.textContent('#sdCur')));
  await p.click('#sdSkip'); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => R.running), true, '그냥 진행하기 → 바로 시작');
  await speak(p, 'We need to agree on the delivery schedule.'); await p.waitForTimeout(300);
  await p.click('#toggle'); await p.waitForTimeout(4500);
  await p.click('#clear'); await p.waitForTimeout(400);

  // 2) 시작 → 등록하기 → 새 폴더를 만들고 주제를 적어 시작
  await p.click('#homeStart'); await p.waitForTimeout(200);
  await p.click('#sdReg'); await p.waitForTimeout(200);
  assert.strictEqual(await p.isVisible('#meetTopic'), true);
  await p.click('#sdNewPack'); await p.waitForTimeout(200);
  await p.fill('#pdName', 'B사 물류'); await p.fill('#pdPeople', 'Tom Baker'); await p.click('#pdOk'); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => document.getElementById('startDlg').open), true, '폴더를 만든 뒤 시작 창으로 돌아옴');
  assert.strictEqual(await p.evaluate(() => packs.find((x) => x.id === document.getElementById('homePack').value).name), 'B사 물류');
  assert.deepStrictEqual(await p.$$eval('#peopleChips .chip', (n) => n.map((x) => x.textContent)), ['Tom Baker']);
  await p.fill('#meetTopic', '창고 이전 일정');
  await p.click('#sdGo'); await p.waitForTimeout(400);
  const cfg = await p.evaluate(() => window.CFG[window.CFG.length - 1]);
  assert(/Meeting topic: 창고 이전 일정/.test(cfg.context.text));
  await speak(p, 'The warehouse move will slip by two weeks.'); await p.waitForTimeout(300);
  await p.click('#toggle'); await p.waitForTimeout(4500);
  await p.click('#clear'); await p.waitForTimeout(400);

  // 3) 리포트: 날짜_제목, 태그 5개까지 (같은 것·# 빼고)
  const ms = await p.evaluate(async () => (await Store.all('meetings')).sort((a, b) => a.startedAt - b.startedAt).map((m) => ({ title: m.title, tags: m.tags, pack: packs.find((x) => x.id === m.packId).name })));
  console.log('3 회의:', JSON.stringify(ms));
  assert.deepStrictEqual(ms.map((m) => m.pack), ['기본', 'B사 물류']);
  assert.deepStrictEqual(ms[1].tags, ['납기', 'Acme', '위약금', '계약 갱신', '단가']);
  assert(/Return JSON|tags: array of up to 5/.test((await reqs(p, 'digest'))[0].system), '정리 지시에 태그');
  await p.evaluate(() => showTab('report')); await p.waitForTimeout(300);
  const rows = await p.$$eval('#reportList .rrow .rt', (n) => n.map((x) => x.textContent));
  console.log('3 리포트:', rows);
  assert(/^\d{4}\.\d{2}\.\d{2}_납기 일정 협의/.test(rows[0]) && /#Acme/.test(rows[0]));
  await p.fill('#reportSearch', '계약 갱신'); await p.waitForTimeout(200);
  assert.strictEqual(await p.$$eval('#reportList .rrow', (n) => n.length), 2, '태그로 찾기');

  // 4) 폴더 탭: 폴더를 누르면 그 폴더의 리포트, 찾기, 뒤로가기로 목록
  await p.evaluate(() => showTab('prep')); await p.waitForTimeout(300);
  assert.strictEqual(await p.textContent('#pageTitle'), '폴더');
  await p.click('#prepList .prow:has-text("B사 물류")'); await p.waitForTimeout(300);
  assert.strictEqual(await p.isVisible('#folderView'), true);
  assert.strictEqual(await p.textContent('#fvName'), 'B사 물류');
  assert.strictEqual(await p.$$eval('#fvList .rrow', (n) => n.length), 1, '그 폴더의 회의만');
  await p.fill('#fvSearch', 'warehouse'); await p.waitForTimeout(200);
  assert.strictEqual(await p.$$eval('#fvList .rrow', (n) => n.length), 1, '내용으로 찾기');
  await p.fill('#fvSearch', 'nothing'); await p.waitForTimeout(200);
  assert(/찾는 말이 들어간 회의가 없습니다/.test(await p.textContent('#fvList')));
  await p.evaluate(() => history.back()); await p.waitForTimeout(300);
  assert.strictEqual(await p.isVisible('#folderList'), true, '뒤로 → 폴더 목록');
  // '이 폴더에서 새 회의' → 묻지 않고 등록 화면, 폴더가 골라져 있음
  await p.click('#prepList .prow:has-text("B사 물류")'); await p.waitForTimeout(300);
  await p.click('#fvNew'); await p.waitForTimeout(200);
  assert.strictEqual(await p.isVisible('#sdForm'), true);
  assert.strictEqual(await p.evaluate(() => packs.find((x) => x.id === document.getElementById('homePack').value).name), 'B사 물류');
  await p.click('#sdCancel'); await p.waitForTimeout(200);

  // 5) 태그 고치기 (회의 기록 화면)
  await p.click('#fvList .rrow'); await p.waitForTimeout(400);
  assert(/리포트: \d{4}\.\d{2}\.\d{2}_/.test(await p.textContent('#mvBody')));
  p.answer = 'alpha, beta, gamma, delta, epsilon, zeta';
  await p.click('#mvTags'); await p.waitForTimeout(400);
  const t = await p.evaluate(async () => { const m = (await Store.all('meetings')).find((x) => x.tags && x.tags[0] === 'alpha'); return m && [m.tags, m.tagsManual]; });
  assert.deepStrictEqual(t, [['alpha', 'beta', 'gamma', 'delta', 'epsilon'], true]);
  await p.click('#mvClose'); await p.waitForTimeout(200);

  // 6) 다음부터 묻지 않기 → 바로 시작
  await p.evaluate(() => showTab('home')); await p.waitForTimeout(200);
  await p.click('#homeStart'); await p.waitForTimeout(200);
  await p.check('#sdNoAsk'); await p.click('#sdSkip'); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => settings.askBg), false);
  await p.click('#toggle'); await p.waitForTimeout(1500);
  if (await p.isVisible('#clear')) { await p.click('#clear'); await p.waitForTimeout(400); }
  await p.click('#homeStart'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => [R.running, document.getElementById('startDlg').open].join()), 'true,false');
  await p.click('#toggle'); await p.waitForTimeout(1000);
  assert.deepStrictEqual(p.errors, []);
  await p.context().close();
});
