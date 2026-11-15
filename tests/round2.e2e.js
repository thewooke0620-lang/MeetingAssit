// 2차 개선: 기능별 AI 고르기, 나에게 온 질문 알아채기, 강조 표시, 중요 표시, 원문 이동, 내용이 바뀌면 정리 갱신,
// 키 보관 선택, 버전 표시와 새 버전 알림, 백업에서 되살리기. 실제 API 는 부르지 않는다
const assert = require('assert');
const { openApp, speak, toggle, openSettings, saveSettings, closeSettings, reqs, BASE, run } = require('./helper');
const assistReqs = async (p) => (await reqs(p)).filter((r) => r.kind.indexOf('assist') === 0);
const meetings = (p) => p.evaluate(() => Store.all('meetings'));
const S_KEY = 'meeting-interpreter.settings.v1';

run('ROUND2 TESTS', async (b) => {
  // 1) 답변 제안과 회의 정리에 쓸 AI 를 번역 엔진과 따로 고른다
  let p = await openApp(b, Object.assign({}, BASE, { groqKey: 'gk', assistEngine: 'groq', digestEngine: 'claude-sonnet', myNames: 'David, Dave' }));
  await toggle(p);
  await speak(p, "We reviewed the draft agreement.");
  await speak(p, " David, what do you think about the timeline.");          // 물음표 없이 내 이름을 부르며 물음
  await p.waitForTimeout(900);
  let ar = await assistReqs(p);
  assert.strictEqual(ar.length, 1, '내 이름을 부르며 물으면 물음표가 없어도 제안');
  assert.strictEqual(ar[0].p, 'groq', '답변 제안은 고른 Groq 으로');
  assert(await p.isVisible('#transcript .block.tome mark.hl-me'), '내 이름이 불린 줄과 이름을 표시');
  await speak(p, " John, can you send the deck?");                          // 다른 사람에게 한 질문
  await p.waitForTimeout(700);
  assert.strictEqual((await assistReqs(p)).length, 1, '다른 사람에게 한 질문은 자동 제안하지 않음');
  await speak(p, " Please confirm the numbers by Friday.");                 // 물음표 없는 부탁
  await p.waitForTimeout(900);
  assert.strictEqual((await assistReqs(p)).length, 2, '물음표 없는 부탁도 제안');
  await speak(p, " We cannot accept a 5% increase in 6 weeks.");
  await p.waitForTimeout(300);
  const marks = await p.$$eval('#transcript mark', (n) => n.map((x) => x.className + ':' + x.textContent));
  console.log('1 강조:', marks.join(' | '));
  for (const want of ['hl-neg:cannot', 'hl-num:5%', 'hl-num:6 weeks', 'hl-num:Friday', 'hl-me:David']) assert(marks.includes(want), want);

  // 2) 중요 표시: ☆ 를 누르거나 B 키로 방금 끝난 줄에 표시. 저장된 기록과 회의 보기에 남는다
  await p.click('#transcript .block:nth-child(1) .star');
  await p.keyboard.press('b');
  const starred = await p.$$eval('#transcript .block.starred .en', (n) => n.map((x) => x.textContent));
  console.log('2 중요 표시:', starred);
  assert.strictEqual(starred.length, 2); assert(/cannot accept/.test(starred[1]));
  // 정리: AI 가 결정 사항이 나온 줄을 짚어 준다
  await p.evaluate(() => { window.MOCK.digest = { title: '일정 협의', summary: ['일정을 논의했다.'], decisions: [{ text: '금요일까지 숫자를 확정한다.', line: 4 }],
    todos: [{ text: '덱을 보낸다. (담당자 미정)', line: 3 }, '예전 형식 할 일'], terms: [], facts: [], questions: [] }; });
  await toggle(p); await p.waitForTimeout(1500);
  let ms = await meetings(p);
  assert.deepStrictEqual(ms[0].lines.filter((l) => l.star).length, 2);
  assert(ms[0].lines.every((l) => l.at > 0), '줄마다 말한 시각');
  assert.deepStrictEqual(ms[0].digest.refs, { decisions: [3], todos: [2, -1], changes: [] });
  assert(/Sonnet|sonnet/.test((await reqs(p, 'digest'))[0].model), '회의 정리는 고른 Sonnet 으로');
  assert(/\[1\] 화자 1: We reviewed/.test((await reqs(p, 'digest'))[0].user), '정리 요청에 줄 번호');

  // 3) 회의 보기: 중요 표시 목록, '원문' 단추로 그 줄로 이동
  await p.click('#digestBtn'); await p.waitForTimeout(500);
  const view = await p.textContent('#mvBody');
  assert(/중요 표시한 발언 \(2\)/.test(view));
  assert.strictEqual(await p.$$eval('#mvBody .mvlist li .srcbtn', (n) => n.length), 4, '결정 1 + 할 일 1 + 중요 표시 2');
  await p.click('#mvBody h4:has-text("결정 사항") + ul .srcbtn');
  await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => document.querySelector('#mvBody details.mvlog').open), true);
  assert(/Please confirm the numbers/.test(await p.textContent('#mvBody .mvline.flash')));
  console.log('3 OK 원문 이동');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#mvDownload')]);
  const txt = require('fs').readFileSync(await dl.path(), 'utf8');
  assert(/\[중요 표시\]/.test(txt) && /금요일까지 숫자를 확정한다\. \(\d\d?:\d\d.*발언\)/.test(txt), txt.slice(0, 400));
  await p.click('#mvClose');

  // 4) 줄 수는 같은데 내용이 바뀌면 정리를 새로 만들어야 한다고 알린다
  await p.evaluate(async () => {
    const m = (await Store.all('meetings'))[0];
    m.lines[0].en = 'We rejected the draft agreement.'; m.sig = linesSig(m.lines);
    await Store.put('meetings', m);
  });
  assert.strictEqual(await p.evaluate(async () => digestStale((await Store.all('meetings'))[0])), true);
  await p.evaluate(() => { window.MOCK.digestDelay = 3000; });
  await p.click('#openSettings'); await p.waitForTimeout(300);
  await p.click('#meetList .mrow button:has-text("열기")'); await p.waitForTimeout(200);
  assert(/정리하는 중/.test(await p.textContent('#mvBody')), '바뀐 내용으로 다시 정리');
  await p.context().close();

  // 5) 키를 기억하지 않기: localStorage 에는 키가 없고, 같은 창에서 새로고침하면 남고, 새 창에서는 사라진다
  p = await openApp(b, Object.assign({}, BASE));
  await openSettings(p);
  await p.uncheck('#keepKeys'); await saveSettings(p);
  let ls = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), S_KEY);
  assert.strictEqual(ls.apiKey, ''); assert.strictEqual(ls.claudeKey, ''); assert.strictEqual(ls.keepKeys, false);
  await p.reload(); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => settings.apiKey), 'k', '같은 창에서는 남음');
  const p2 = await p.context().newPage(); await p2.goto('https://x.test/'); await p2.waitForTimeout(400);
  assert.strictEqual(await p2.evaluate(() => settings.apiKey), '', '새 창에서는 없음');
  await p2.close();
  // 키 모두 지우기
  await openSettings(p);
  await p.click('#clearKeys'); await p.waitForTimeout(200);
  assert.strictEqual(await p.inputValue('#apiKey'), '');
  assert.strictEqual(await p.evaluate(() => settings.claudeKey), '');
  console.log('5 OK 키 보관 선택, 키 지우기');
  // 6) 버전 표시와 새 버전 알림
  assert(/^버전 \d{4}\./.test(await p.textContent('#appVer')));
  await closeSettings(p);
  await p.evaluate(async () => {
    const real = window.fetch;
    window.fetch = async (url, opt) => (opt && opt.body ? real(url, opt) : { ok: true, text: async () => 'const APP_VERSION = "2099.01.01-1";' });
    await checkNewVersion();
  });
  assert(/새 버전\(2099\.01\.01-1\)/.test(await p.textContent('#banner')));
  // 7) 첫 화면의 '백업 파일에서 되살리기'
  await p.evaluate(() => hideBanner());
  await p.click('#empty details.howto summary');   // '처음 쓰는 방법'을 펼친다
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#restoreBtn')]);
  assert(fc && await p.isVisible('#settings'));
  console.log('7 OK 되살리기 단추');
  await p.context().close();
});
