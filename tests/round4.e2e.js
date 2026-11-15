// 새 화면: 시작 화면(묶음·소리 고르기, 최근 회의), 정지하면 정리 화면, 데스크톱 앱의 작은 창. 실제 API 는 부르지 않는다
const assert = require('assert');
const { openApp, speak, toggle, BASE, run } = require('./helper');

run('ROUND4 TESTS', async (b) => {
  // 1) 시작 화면: 회의 중에만 쓰는 도구는 숨기고, 큰 '회의 시작' 단추로 시작한다
  let p = await openApp(b, Object.assign({}, BASE, { openAfterStop: true }));
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('idle')), true);
  for (const id of ['#toggle', '#digestBtn', '#clear', '#save', '#assist']) assert.strictEqual(await p.isVisible(id), false, id + ' 숨김');
  assert.strictEqual(await p.isVisible('#homeKey'), false, '키가 있으면 키 안내 없음');
  assert.deepStrictEqual(await p.$$eval('#homeSource option', (n) => n.map((o) => o.value)), ['system', 'mic']);
  assert.strictEqual(await p.inputValue('#homeSource'), 'mic');
  assert.strictEqual(await p.isVisible('#homeRecentBox'), false, '아직 회의가 없으면 최근 회의 없음');
  await p.click('#homeStart'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => R.running), true);
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('live')), true);
  assert.strictEqual(await p.isVisible('#toggle'), true);
  await speak(p, "We reviewed the draft agreement.");
  // 2) 정지하면 정리 화면이 열린다
  await toggle(p); await p.waitForTimeout(1200);
  assert.strictEqual(await p.evaluate(() => document.getElementById('meetDlg').open), true, '정지하면 정리 화면');
  await p.click('#mvClose');
  // 3) 지우면 시작 화면으로 돌아가고, 최근 회의에 보인다. 누르면 그 회의가 열린다
  await p.click('#clear'); await p.waitForTimeout(600);
  assert.strictEqual(await p.isVisible('#homeRecentBox'), true);
  const row = await p.textContent('#homeRecent .rrow');
  console.log('3 최근 회의:', row);
  assert(/계약 초안 검토/.test(row) && /1분/.test(row));
  await p.click('#homeRecent .rrow'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => document.getElementById('meetDlg').open), true);
  await p.click('#mvClose');
  await p.context().close();

  // 4) 키가 없으면 안내하고, '회의 시작'은 설정을 연다. 묶음을 바꾸면 그 묶음으로 저장된다
  p = await openApp(b, Object.assign({}, BASE, { apiKey: '' }));
  assert.strictEqual(await p.isVisible('#homeKey'), true);
  await p.click('#homeStart'); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => document.getElementById('settings').open), true);
  await p.fill('#apiKey', 'k'); await p.click('#saveSettings'); await p.waitForTimeout(300);
  assert.strictEqual(await p.isVisible('#homeKey'), false, '키를 넣으면 안내가 사라짐');
  await p.evaluate(async () => { const x = { id: 'pB', name: 'B사', brief: '', terms: 'widget', facts: '', qa: '', createdAt: Date.now() + 1, updatedAt: Date.now() }; await Store.put('packs', x); packs.push(x); renderHome(); });
  await p.waitForTimeout(200);
  await p.selectOption('#homePack', 'pB');
  assert.deepStrictEqual(await p.evaluate(() => [settings.packId, settings.terms]), ['pB', 'widget']);
  assert(/B사/.test(await p.textContent('#packPill')));
  await p.context().close();

  // 5) 데스크톱 앱: 작은 창 단추가 앱 창을 줄이고(항상 위), Esc 로 돌아온다
  p = await openApp(b, Object.assign({}, BASE));
  await p.addInitScript(() => { window.DCALLS = []; window.desktop = { compact: async (on) => { window.DCALLS.push(on); return true; }, opacity: async () => true, info: async () => ({}) }; });
  await p.reload(); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('desktop')), true);
  assert(/컴퓨터 소리/.test(await p.textContent('#homeSource')));
  assert.strictEqual(await p.isVisible('#howtoList .desk-only'), false, '안내는 접혀 있음');
  await toggle(p);
  for (const t of ["First line.", "Second line.", "Third line."]) { await speak(p, t); await p.evaluate(() => { core.breakNext = true; }); }
  await p.click('#pip'); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('compact')), true);
  assert.strictEqual(await p.textContent('#pip'), '크게');
  const shown = await p.$$eval('#transcript > .block', (n) => n.filter((x) => getComputedStyle(x).display !== 'none').length);
  assert.strictEqual(shown, 2, '작은 창에는 마지막 두 줄만');
  assert.strictEqual(await p.isVisible('#openSettings'), false);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('compact')), false);
  assert.deepStrictEqual(await p.evaluate(() => window.DCALLS), [true, false]);
  console.log('5 OK 작은 창');
  await toggle(p);
  await p.context().close();
});
