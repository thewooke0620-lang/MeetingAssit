// 3차 개선: 자주 쓰는 업무 답변 단추, 지난 회의 대비 변경점, 자막 고치기와 용어집 반영. 실제 API 는 부르지 않는다
const assert = require('assert');
const { openApp, speak, toggle, reqs, BASE, run } = require('./helper');
const meetings = (p) => p.evaluate(() => Store.all('meetings'));
// 브라우저의 입력 창(prompt)·확인 창(confirm)에 차례로 넣을 값
const answers = (p, list, ok) => p.evaluate(([list, ok]) => {
  window.PROMPTS = list.slice();
  window.prompt = () => window.PROMPTS.shift();
  window.confirm = () => ok;
}, [list, ok]);

run('ROUND3 TESTS', async (b) => {
  // 1) 빠른 답변 단추: 지금 대화에 맞춘 영어 문장을 만든다
  let p = await openApp(b, Object.assign({}, BASE));
  await toggle(p);
  await speak(p, "We need the final pricing for the escrow service.");
  await p.waitForTimeout(300);
  const labels = await p.$$eval('#asActs button', (n) => n.map((x) => x.textContent));
  assert.deepStrictEqual(labels, ['다시 설명 요청', '내 이해 확인', '확인 후 회신', '일정 조율', '잠시 생각', '동의', '정중한 반대']);
  await p.click('#asActs button:has-text("확인 후 회신")');
  await p.waitForTimeout(800);
  const act = (await reqs(p, 'assist-act'))[0];
  assert(act, '빠른 답변 요청');
  assert(/<action>Say you need to check internally/.test(act.user) && /<conversation>[\s\S]*final pricing for the escrow/.test(act.user), act.user);
  assert(/빠른 답변/.test(await p.textContent('#asBody .as-q')));
  assert.strictEqual(await p.$$eval('#asBody .as-opt', (n) => n.length), 2);
  console.log('1 OK 빠른 답변');

  // 2) 자막 고치기: 고친 문장으로 다시 번역하고, 바뀐 낱말을 용어집에 넣는다
  await speak(p, " We opened the a scrow account yesterday.");
  await p.waitForTimeout(500);
  await answers(p, ['We opened the escrow account yesterday.', '에스크로'], true);
  await p.click('#transcript .block:nth-child(2) .edit');
  await p.waitForTimeout(600);
  const blk = await p.evaluate(() => ({ en: core.blocks[1].en.trim(), ko: core.blocks[1].ko.trim(), edited: core.blocks[1].edited }));
  console.log('2 고친 줄:', blk);
  assert.strictEqual(blk.en, 'We opened the escrow account yesterday.');
  assert.strictEqual(blk.ko, '번역[We opened the]', '고친 문장으로 다시 번역');
  assert(/escrow = 에스크로/.test(await p.evaluate(() => settings.terms)), '용어집(설정)에 들어감');
  assert(/escrow = 에스크로/.test(await p.evaluate(async () => (await Store.all('packs'))[0].terms)), '묶음 용어집에 들어감');
  assert(/용어집에 'escrow = 에스크로'/.test(await p.textContent('#banner')));
  // 이미 용어집에 있는 말이면 다시 묻지 않는다
  await answers(p, ['We opened the escrow account today.'], true);
  await p.evaluate(() => { window.CONFIRMS = 0; window.confirm = () => { window.CONFIRMS++; return true; }; });
  await p.click('#transcript .block:nth-child(2) .edit'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => window.CONFIRMS), 1, "'today' 는 새 후보라 한 번 묻는다");

  // 3) 첫 회의 정리 → 둘째 회의 정리에서 지난 회의와 비교한다
  await p.evaluate(() => { window.MOCK.digest = { title: '가격 협의', summary: ['가격을 논의했다.'], decisions: [], todos: [], terms: [], facts: ['납기는 6주'], questions: [],
    changes: [{ text: '납기: 6주 → 8주', line: 1 }] }; });
  await toggle(p); await p.waitForTimeout(1500);
  let ms = await meetings(p);
  assert.strictEqual(ms[0].lines[1].edited, true, '고친 줄 표시가 저장됨');
  assert.deepStrictEqual(ms[0].digest.changes, [], '앞 회의가 없으면 변경점 없음');
  assert(!/<previous_meeting>/.test((await reqs(p, 'digest'))[0].user));
  await p.click('#clear'); await p.waitForTimeout(300);
  await toggle(p);
  await speak(p, "Delivery will now take 8 weeks.");
  await toggle(p); await p.waitForTimeout(1500);
  const dg = await reqs(p, 'digest');
  const u = dg[dg.length - 1].user;
  assert(/<previous_meeting>\nTitle: 가격 협의\n[\s\S]*Facts:\n- 납기는 6주/.test(u), u.slice(0, 500));
  ms = (await meetings(p)).sort((a, b) => a.startedAt - b.startedAt);
  assert.deepStrictEqual(ms[1].digest.changes, ['납기: 6주 → 8주']);
  assert(/^가격 협의 \(/.test(ms[1].digest.prevTitle));
  await p.click('#digestBtn'); await p.waitForTimeout(500);
  const view = await p.textContent('#mvBody');
  assert(/지난 회의 대비 변경점/.test(view) && /납기: 6주 → 8주/.test(view) && /비교한 회의: 가격 협의/.test(view), view.slice(0, 300));
  assert.strictEqual(await p.$$eval('#mvBody h4:has-text("지난 회의 대비") + ul .srcbtn', (n) => n.length), 1);
  console.log('3 OK 지난 회의 대비 변경점');

  // 4) 저장된 기록의 줄 고치기: 고치면 정리를 다시 만들어야 한다고 표시된다
  await p.evaluate(() => { window.MOCK.digestDelay = 5000; });
  await answers(p, ['Delivery will now take 9 weeks.', '이제 납기는 9주가 걸립니다.'], false);
  await p.click('#mvBody details.mvlog summary');
  await p.click('#mvBody .mvline[data-line="0"] .mvedit'); await p.waitForTimeout(400);
  const m2 = (await meetings(p)).sort((a, b) => a.startedAt - b.startedAt)[1];
  assert.deepStrictEqual([m2.lines[0].en, m2.lines[0].ko, m2.lines[0].edited], ['Delivery will now take 9 weeks.', '이제 납기는 9주가 걸립니다.', true]);
  assert.strictEqual(await p.evaluate(async (id) => digestStale(await Store.get('meetings', id)), m2.id), true);
  assert(/9 weeks/.test(await p.evaluate(() => core.blocks.map((x) => x.en).join(''))), '화면의 같은 회의 줄도 고쳐짐');
  console.log('4 OK 저장된 줄 고치기');
  await p.context().close();
});
