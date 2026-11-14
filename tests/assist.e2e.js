// 답변 제안: 질문 자동 감지, 한국어 → 영어 표현, 묶음에 쌓인 내용 활용
const assert = require('assert');
const { openApp, speak, toggle, openSettings, saveSettings, reqs, stored, BASE, run } = require('./helper');
const panel = (p) => p.evaluate(() => ({
  shown: getComputedStyle(document.getElementById('assist')).display !== 'none',
  head: (document.querySelector('#asBody .as-q') || {}).innerText || '',
  opts: [...document.querySelectorAll('#asBody .as-opt')].map((o) => o.querySelector('.as-en').textContent + ' / ' + o.querySelector('.as-ko').textContent),
  text: document.getElementById('asBody').innerText, state: document.getElementById('asState').textContent
}));
const assistReqs = async (p) => (await reqs(p)).filter((r) => r.kind.indexOf('assist') === 0);

run('ASSIST TESTS', async (b) => {
  // 1) 키가 없으면 칸이 보이지 않는다
  let p = await openApp(b, { apiKey: 'k', engine: 'soniox', target: 'ko', source: 'mic', ver: 2 });
  assert.strictEqual((await panel(p)).shown, false);
  await p.context().close();

  // 2) 질문이 들리면 자동으로 제안한다. 내 정보와 묶음에 쌓인 내용이 함께 전달된다
  p = await openApp(b, Object.assign({}, BASE, { brief: 'A사 공급 계약', me: '구매팀 과장' }));
  let s = await panel(p);
  assert(s.shown && /상대가 질문하면/.test(s.text));
  await openSettings(p);
  await p.fill('#packFacts', '납기는 발주 후 6주다.'); await p.fill('#packQa', 'Q: lead time?\nA: 6주입니다');
  await saveSettings(p);
  await toggle(p);
  await speak(p, "We reviewed the draft agreement over the weekend.");
  await p.waitForTimeout(400);
  assert.strictEqual((await assistReqs(p)).length, 0, '질문이 아니면 제안하지 않음');
  await speak(p, " Can you confirm the penalty clause by Friday?");
  await p.waitForTimeout(900);
  let ar = await assistReqs(p);
  assert.strictEqual(ar.length, 1);
  assert.strictEqual(ar[0].kind, 'assist-q');
  for (const want of ['<me>\n구매팀 과장', 'Meeting series: 기본\nA사 공급 계약', '<facts>\n납기는 발주 후 6주다.', '<saved_answers>\nQ: lead time?', '<conversation>\n화자 1: We reviewed the draft agreement over the weekend.', '<question>Can you confirm the penalty clause by Friday?</question>']) {
    assert(ar[0].user.includes(want), want + '\n---\n' + ar[0].user);
  }
  assert(!/<conversation>[\s\S]*Can you confirm[\s\S]*<\/conversation>/.test(ar[0].user), '질문 자체는 대화 참고에 넣지 않음');
  assert(/Never invent facts/.test(ar[0].system));
  s = await panel(p);
  console.log(s);
  assert(/들린 말\s*Can you confirm the penalty clause by Friday\?/.test(s.head));
  assert.deepStrictEqual(s.opts, ['Yes, we can confirm by Friday. / 네, 금요일까지 확인드리겠습니다.', 'Let me check with my team and get back to you by Friday. / 팀과 확인한 뒤 금요일까지 답변드리겠습니다.']);
  assert(s.text.includes('번역[Can you confirm]'), '질문의 번역도 함께 보여 줌');
  // 제안을 누르면 영어 문장이 복사된다
  await p.click('#asBody .as-opt >> nth=0');
  assert.strictEqual(await p.evaluate(() => navigator.clipboard.readText()), 'Yes, we can confirm by Friday.');
  // 같은 질문으로 다시 부르지 않는다
  await p.waitForTimeout(600);
  assert.strictEqual((await assistReqs(p)).length, 1);

  // 3) 한국어로 적으면 영어 표현으로 바꿔 준다
  await p.fill('#asInput', '가격을 다시 논의하고 싶습니다'); await p.press('#asInput', 'Enter'); await p.waitForTimeout(700);
  ar = await assistReqs(p);
  assert.strictEqual(ar.length, 2); assert.strictEqual(ar[1].kind, 'assist-ko');
  assert(ar[1].user.includes('<korean>가격을 다시 논의하고 싶습니다</korean>') && ar[1].user.includes('Can you confirm the penalty clause by Friday?'));
  s = await panel(p);
  assert(/내 말\s*가격을 다시 논의하고 싶습니다/.test(s.head) && s.opts.length === 2 && /Could we revisit the price\?/.test(s.opts[0]));

  // 4) 지금 제안: 질문이 아니어도 방금 들린 말에 대해 제안
  await speak(p, " We would like to close this by the end of the month.");
  await p.waitForTimeout(400);
  assert.strictEqual((await assistReqs(p)).length, 2);
  await p.click('#asNow'); await p.waitForTimeout(700);
  ar = await assistReqs(p);
  assert.strictEqual(ar.length, 3);
  assert(ar[2].user.includes('<question>We would like to close this by the end of the month.</question>'));

  // 5) 질문이 연달아 오면 앞의 제안은 그만두고 마지막 것만 보여 준다
  await p.evaluate(() => { window.MOCK.assistDelay = 250; });
  await speak(p, " What is your delivery lead time?"); await p.waitForTimeout(350);
  assert.strictEqual((await panel(p)).state, '작성 중…');
  await speak(p, " Could you also share the unit price?"); await p.waitForTimeout(3500);
  ar = await assistReqs(p);
  assert.strictEqual(ar.length, 5);
  assert.strictEqual(ar[3].aborted, true, '앞의 제안은 중단되어야 함');
  s = await panel(p);
  assert(/Could you also share the unit price\?/.test(s.head) && s.opts.length === 2 && s.state === '');
  await p.evaluate(() => { window.MOCK.assistDelay = 30; });

  // 6) 오류가 나면 칸 안에서 알린다
  await p.evaluate(() => { window.MOCK.assistStatus = 401; });
  await p.fill('#asInput', '확인하겠습니다'); await p.press('#asInput', 'Enter'); await p.waitForTimeout(500);
  assert(/Claude API 키가 올바르지 않습니다/.test((await panel(p)).text));
  await p.evaluate(() => { window.MOCK.assistStatus = 200; });

  // 7) 속도 기록에 호출 수가 나온다
  await openSettings(p);
  assert(/답변 제안 6건/.test(await p.textContent('#statBox')), await p.textContent('#statBox'));

  // 8) 자동 제안을 끄면 질문이 들려도 부르지 않고, 직접 누르면 된다
  await p.uncheck('#assistAuto'); await saveSettings(p);
  const before = (await assistReqs(p)).length;
  await speak(p, " Is that acceptable to you?"); await p.waitForTimeout(600);
  assert.strictEqual((await assistReqs(p)).length, before);
  await p.click('#asNow'); await p.waitForTimeout(500);
  assert.strictEqual((await assistReqs(p)).length, before + 1);

  // 9) 접기는 기억된다. 지우기를 누르면 제안도 비운다
  await p.click('#asHide'); await p.waitForTimeout(100);
  assert.strictEqual(await p.isVisible('#asBody'), false);
  assert.strictEqual((await stored(p)).assistOpen, false);
  await p.click('#asHide'); await p.waitForTimeout(100);
  assert.strictEqual(await p.isVisible('#asBody'), true);
  await p.click('#clear'); await p.waitForTimeout(300);
  assert(/상대가 질문하면/.test((await panel(p)).text));
  await toggle(p);

  // 10) 답변 제안을 끄면 칸이 사라진다
  await openSettings(p); await p.uncheck('#assistOn'); await saveSettings(p);
  assert.strictEqual((await panel(p)).shown, false);
  await p.context().close();

  // 11) 번역은 Soniox 내장이어도 Claude 키가 있으면 제안한다. Groq 방식이면 Groq 이 제안한다
  p = await openApp(b, { apiKey: 'k', claudeKey: 'ck', engine: 'soniox', target: 'ko', source: 'mic', ver: 2 });
  await toggle(p); await speak(p, "Can you send the revised draft tomorrow?"); await p.waitForTimeout(800);
  ar = await assistReqs(p);
  assert(ar.length === 1 && ar[0].p === 'claude' && ar[0].model === 'claude-haiku-5-5');
  assert.strictEqual((await panel(p)).opts.length, 2);
  await p.context().close();
  p = await openApp(b, { apiKey: 'k', groqKey: 'gk', engine: 'groq', target: 'ko', source: 'mic', draft: false, preview: false, ver: 2 });
  await toggle(p); await speak(p, "Can you send the revised draft tomorrow?"); await p.waitForTimeout(800);
  ar = await assistReqs(p);
  assert(ar.length === 1 && ar[0].p === 'groq' && ar[0].model === 'openai/gpt-oss-120b');
  assert.strictEqual((await panel(p)).opts.length, 2);
  assert.deepStrictEqual(p.errors, []);
});
