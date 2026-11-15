// 새 화면: 시작 화면(폴더·소리 고르기), 왼쪽 메뉴(트리), 정지하면 정리 화면, 데스크톱 앱의 반투명 자막 팝업. 실제 API 는 부르지 않는다
const assert = require('assert');
const { openApp, speak, toggle, BASE, run, newPack } = require('./helper');

run('ROUND4 TESTS', async (b) => {
  // 1) 시작 화면: 회의 중에만 쓰는 도구는 숨기고, 큰 '회의 시작' 단추로 시작한다
  let p = await openApp(b, Object.assign({}, BASE, { openAfterStop: true }));
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('idle')), true);
  for (const id of ['#toggle', '#digestBtn', '#clear', '#save', '#assist']) assert.strictEqual(await p.isVisible(id), false, id + ' 숨김');
  assert.strictEqual(await p.isVisible('#homeKey'), false, '키가 있으면 키 안내 없음');
  assert.deepStrictEqual(await p.$$eval('#homeSource option', (n) => n.map((o) => o.value)), ['system', 'both', 'mic']);
  assert.strictEqual(await p.inputValue('#homeSource'), 'mic');
  assert(/아직 회의가 없습니다/.test(await p.textContent('#sideTree')), '왼쪽 메뉴: 아직 회의 없음');
  await p.click('#homeStart'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => R.running), true);
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('live')), true);
  assert.strictEqual(await p.isVisible('#toggle'), true);
  await speak(p, "We reviewed the draft agreement.");
  // 2) 정지하면 정리 화면이 열린다
  await toggle(p); await p.waitForTimeout(1200);
  assert.strictEqual(await p.evaluate(() => document.getElementById('meetDlg').open), true, '정지하면 정리 화면');
  await p.click('#mvClose');
  // 3) 왼쪽 메뉴(트리): 폴더 아래에 회의가 보이고, 누르면 그 회의가 열린다. '새 회의'는 시작 화면으로 돌아간다
  const item = await p.textContent('#sideTree li[aria-expanded="true"] .tmeet');
  console.log('3 메뉴의 회의:', item);
  assert(/계약 초안 검토/.test(item) && /1분/.test(item));
  assert.strictEqual(await p.textContent('#sideTree .tcount'), '1');
  await p.click('#sideNew'); await p.waitForTimeout(600);
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('idle')), true, '새 회의 → 시작 화면');
  await p.click('#sideTree .tmeet'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => document.getElementById('meetDlg').open), true);
  await p.click('#mvClose');
  // 폴더 접기·펴기
  await p.click('#sideTree .twisty'); await p.waitForTimeout(200);
  assert.strictEqual(await p.getAttribute('#sideTree > li', 'aria-expanded'), 'false');
  assert.strictEqual(await p.isVisible('#sideTree .tmeet'), false);
  // 메뉴 닫기·열기 (넓은 화면에서는 기억한다)
  await p.click('#sideBtn'); await p.waitForTimeout(100);
  assert.strictEqual(await p.isVisible('#side'), false);
  assert.strictEqual(await p.evaluate(() => settings.sideOpen), false);
  await p.click('#sideBtn');
  // 메뉴에서 새 폴더 만들기 → 그 폴더로 바뀐다
  await newPack(p, 'C사 협상', '단가 협상', 'Tom Baker (C사 구매)');
  assert.deepStrictEqual(await p.evaluate(() => [currentPack().topic, currentPack().people]), ['단가 협상', 'Tom Baker (C사 구매)']);
  assert(/C사 협상/.test(await p.textContent('#packPill')));
  assert.strictEqual(await p.textContent('#sideTree li.cur .tname'), 'C사 협상');
  await p.context().close();

  // 4) 키가 없으면 안내하고, '회의 시작'은 설정을 연다. 폴더를 바꾸면 그 폴더로 저장된다
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

  // 5) 데스크톱 앱: '작은 창'은 따로 떠 있는 반투명 자막 팝업을 연다. 팝업은 본 창의 마지막 두 줄을 받아 보여 주고, 정지·중요 표시를 보낸다
  const stub = () => { window.DCALLS = []; window.desktop = { popup: async (on) => { window.DCALLS.push(['popup', on]); return true; }, popupBlur: async (on) => { window.DCALLS.push(['blur', on]); return true; },
    popupOpacity: async (v) => { window.DCALLS.push(['opacity', v]); return true; }, focusMain: async () => { window.DCALLS.push(['main']); return true; }, onPopupClosed: () => {}, info: async () => ({}) }; };
  p = await openApp(b, Object.assign({}, BASE, { myNames: 'David' }));
  await p.addInitScript(stub);
  await p.reload(); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('desktop')), true);
  assert(/컴퓨터 소리/.test(await p.textContent('#homeSource')));
  await toggle(p);
  for (const t of ["First line.", "David, can you confirm the 6 weeks?", "Third line."]) { await speak(p, t); await p.evaluate(() => { core.breakNext = true; }); }
  await p.click('#pip'); await p.waitForTimeout(200);
  assert.deepStrictEqual(await p.evaluate(() => window.DCALLS[0]), ['popup', true]);
  assert.strictEqual(await p.textContent('#pip'), '팝업 닫기');
  // 팝업 창 (같은 앱을 #popup 으로 연다)
  const pop = await p.context().newPage();
  await pop.addInitScript(stub);
  await pop.goto('https://x.test/#popup'); await pop.waitForTimeout(600);
  assert.strictEqual(await pop.evaluate(() => document.body.classList.contains('popup')), true);
  assert.strictEqual(await pop.isVisible('#bar'), false, '팝업에는 본 화면 막대가 없음');
  let lines = await pop.$$eval('#pvLines .pv-line', (n) => n.map((x) => x.innerText));
  console.log('5 팝업 자막:', lines);
  assert.strictEqual(lines.length, 2, '마지막 두 줄');
  assert(/David, can you confirm/.test(lines[0]) && /Third line/.test(lines[1]));
  assert(await pop.isVisible('#pvLines .pv-line.tome mark.hl-me'), '내 이름 강조도 함께');
  assert.strictEqual(await pop.textContent('#pvStatus'), '듣는 중');
  await speak(p, " Fourth line."); await p.waitForTimeout(300);
  lines = await pop.$$eval('#pvLines .pv-line', (n) => n.map((x) => x.innerText));
  assert(/Fourth line/.test(lines[1]), '새 말이 바로 따라옴');
  // 흐림 끄기·투명도 → 데스크톱에 전달하고 기억한다
  await pop.uncheck('#pvBlur');
  assert.strictEqual(await pop.evaluate(() => document.body.classList.contains('solid')), true);
  await pop.fill('#pvOpacity', '60'); await pop.dispatchEvent('#pvOpacity', 'input');
  const calls = await pop.evaluate(() => window.DCALLS);
  assert(calls.some((c) => c[0] === 'blur' && c[1] === false) && calls.some((c) => c[0] === 'opacity' && c[1] === 0.6), JSON.stringify(calls));
  assert.deepStrictEqual(await pop.evaluate(() => JSON.parse(localStorage.getItem('meetingassit.popup'))), { blur: false, opacity: 60 });
  // 팝업에서 중요 표시와 정지
  await pop.click('#pvStar'); await p.waitForTimeout(200);
  assert.strictEqual(await p.$$eval('#transcript .block.starred', (n) => n.length), 1);
  await pop.click('#pvToggle'); await p.waitForTimeout(600);
  assert.strictEqual(await p.evaluate(() => R.running), false, '팝업의 정지로 회의가 멈춤');
  await pop.waitForTimeout(200);
  assert.strictEqual(await pop.isVisible('#pvToggle'), false, '멈추면 팝업의 정지 단추는 숨김');
  await pop.click('#pvMain');
  assert(await pop.evaluate(() => window.DCALLS.some((c) => c[0] === 'main')));
  console.log('5 OK 자막 팝업');
  await p.context().close();
});
