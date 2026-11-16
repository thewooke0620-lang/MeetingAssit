// 폰: 대화 듣기 화면(라이브·요약·질문, 추천, 아래 입력칸, 일시정지), 학습 탭(최근 회의 표현·자주 쓰는 표현·바로 학습),
// 학습 내용 가져오기, 안드로이드 앱의 폰 소리 듣기·떠 있는 자막 창 연결 (가짜 MeetingNative)
const assert = require('assert');
const { openApp, speak, toggle, BASE, run, reqs } = require('./helper');
const PHONE = { context: { viewport: { width: 390, height: 820 } } };

run('PHONE LIVE TESTS', async (b) => {
  // 1) 대화 듣기 화면
  let p = await openApp(b, Object.assign({}, BASE, { openAfterStop: true }), PHONE);
  await p.click('#fab'); await p.waitForTimeout(300);
  assert.strictEqual(await p.isVisible('#lvTop'), true);
  assert.strictEqual(await p.textContent('#lvEmptyH'), '듣고 있어요');
  assert.strictEqual(await p.getAttribute('#lvPause', 'aria-label'), '일시정지');
  await speak(p, "So the unit price stays at twelve dollars. ");
  await speak(p, "Can you confirm the delivery date by Friday? ");
  await p.waitForTimeout(500);
  assert.strictEqual(await p.isVisible('#lvEmpty'), false);
  assert(/unit price/.test(await p.textContent('#transcript')));

  // 요약 탭: 열면 지금까지를 요약한다
  await p.click('#lvTop .lv-tabs button[data-lv="sum"]'); await p.waitForTimeout(400);
  assert.strictEqual(await p.isVisible('#transcript'), false, '요약 탭에서는 자막을 가린다');
  const sum = await p.textContent('#lvSum');
  console.log('1 요약:', sum.replace(/\s+/g, ' ').slice(0, 120));
  assert(/핵심 내용/.test(sum) && /가격 조건/.test(sum) && /정해진 것/.test(sum) && /아직 열린 질문/.test(sum));
  const ls = await reqs(p, 'livesum');
  assert.strictEqual(ls.length, 1); assert(/unit price/.test(ls[0].user));

  // 질문: 아래 칸에 적고 보내면 질문 탭에 답이 나온다
  await p.fill('#lvInput', '가격이 얼마라고 했어?'); await p.click('#lvSend'); await p.waitForTimeout(400);
  assert.strictEqual(await p.isVisible('#lvQA'), true);
  const qa = await p.textContent('#lvQA');
  assert(/가격이 얼마라고 했어\?/.test(qa) && /가격과 납기를 이야기했습니다/.test(qa), qa);
  const ask = await reqs(p, 'ask');
  assert.strictEqual(ask.length, 1); assert(/<transcript>[\s\S]*delivery date/.test(ask[0].user) && /<question>가격이 얼마라고 했어\?<\/question>/.test(ask[0].user));

  // '영어로': 한국어를 영어 표현으로 → 추천 판이 열린다
  await p.click('#lvMode');
  assert.strictEqual(await p.textContent('#lvModeT'), '영어로');
  await p.fill('#lvInput', '금요일까지 확인해 드릴게요'); await p.press('#lvInput', 'Enter'); await p.waitForTimeout(700);
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('lv-rec-open')), true);
  assert.strictEqual(await p.isVisible('#assist'), true);
  assert(/revisit the price/.test(await p.textContent('#asBody')));
  await p.click('#lvRec'); await p.waitForTimeout(150);
  assert.strictEqual(await p.isVisible('#assist'), false, '추천을 다시 누르면 닫힘');
  await p.click('#lvTop .lv-tabs button[data-lv="live"]'); await p.waitForTimeout(150);
  assert.strictEqual(await p.isVisible('#transcript'), true);
  console.log('1 OK 라이브·요약·질문·영어로');

  // 2) 일시정지: 회의를 끝내지 않는다 (정리 화면이 열리지 않음) → ▶ 로 이어서 → ■ 로 끝내면 정리 화면
  await p.click('#lvPause'); await p.waitForTimeout(1500);
  assert.strictEqual(await p.evaluate(() => R.running), false);
  assert.strictEqual(await p.textContent('#lvState'), '일시정지');
  assert.strictEqual(await p.getAttribute('#lvPause', 'aria-label'), '이어서 듣기');
  assert.strictEqual(await p.evaluate(() => document.getElementById('meetDlg').open), false, '일시정지에는 정리 화면이 안 열림');
  const id1 = await p.evaluate(() => R.meetingId);
  await p.click('#lvPause'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => R.running), true);
  assert.strictEqual(await p.evaluate(() => R.meetingId), id1, '같은 회의로 이어짐');
  await speak(p, "Let me check with the team and get back to you. ");
  await p.waitForTimeout(300);
  await p.click('#lvStop'); await p.waitForTimeout(2500);
  assert.strictEqual(await p.evaluate(() => R.running), false);
  assert.strictEqual(await p.evaluate(() => document.getElementById('meetDlg').open), true, '끝내면 정리 화면');
  await p.click('#mvClose'); await p.waitForTimeout(200);
  assert.strictEqual(await p.getAttribute('#lvStop', 'aria-label'), '닫고 홈으로');
  await p.click('#lvStop'); await p.waitForTimeout(600);
  assert.strictEqual(await p.evaluate(() => document.body.classList.contains('idle')), true);
  assert.strictEqual(await p.isVisible('#tabbar'), true);
  console.log('2 OK 일시정지·끝내기·닫기');

  // 3) 학습 탭: 최근 회의 표현 (회의마다 AI 가 한 번 고르고 저장)
  await p.evaluate(async () => {
    const mk = (id, t, lines) => Store.put('meetings', { id, title: t, packId: settings.packId, startedAt: Date.now() - (id === 'm1' ? 9e6 : 8e6), endedAt: Date.now(), secs: 60, lines: lines.map((en) => ({ en, ko: '' })) });
    await mk('m1', '1차 협의', ["Let me check with the team first.", "We are on the same page.", "Can we circle back on the pricing next week?"]);
    await mk('m2', '2차 협의', ["Sure, let me check with the legal side.", "Good, so we are on the same page now.", "Let me check with the boss tomorrow."]);
  });
  await p.click('#tabbar button[data-tab="learn"]'); await p.waitForTimeout(900);
  let list = await p.textContent('#lnList');
  console.log('3 최근:', list.replace(/\s+/g, ' ').slice(0, 160));
  assert(/circle back/.test(list) && /나중에 다시 논의하다/.test(list));
  const ph = await reqs(p, 'phrases');
  assert(ph.length >= 2, '최근 회의마다 한 번씩');
  const saved = await p.evaluate(async () => (await Store.get('meetings', 'm1')).phrases.length);
  assert.strictEqual(saved, 2, '고른 표현은 회의 기록에 저장');
  await p.click('#tabbar button[data-tab="home"]'); await p.waitForTimeout(200);
  await p.click('#tabbar button[data-tab="learn"]'); await p.waitForTimeout(500);
  assert.strictEqual((await reqs(p, 'phrases')).length, ph.length, '다시 열어도 또 묻지 않음');
  assert(/바로 학습/.test(await p.textContent('#lnHead')));

  // 바로 학습: 한국어 뜻 → 정답 보기 → 알았어요 / 다시 볼게요
  await p.click('#lnHead button'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => document.getElementById('studyDlg').open), true);
  assert(/영어로 어떻게 말할까요/.test(await p.textContent('#stCard')));
  const total = await p.evaluate(() => ST.items.length);
  for (let i = 0; i < total; i++) {
    await p.click('#stFoot button:has-text("정답 보기")'); await p.waitForTimeout(80);
    await p.click(i === 0 ? '#stFoot button:has-text("다시 볼게요")' : '#stFoot button:has-text("알았어요")'); await p.waitForTimeout(80);
  }
  const end = await p.textContent('#stCard');
  assert(new RegExp(total + '개 중 ' + (total - 1) + '개 알았어요').test(end), end);
  const prog = await p.evaluate(() => JSON.parse(localStorage.getItem('meetingassit.study.v1')));
  assert.strictEqual(Object.keys(prog).length, total);
  assert(Object.values(prog).some((x) => x.box === 0) && Object.values(prog).some((x) => x.box === 1));
  await p.click('#stFoot button:has-text("닫기")'); await p.waitForTimeout(300);
  assert(/익힘 1\/5/.test(await p.textContent('#lnList')));
  console.log('3 OK 최근 회의 표현·바로 학습');

  // 자주 쓰는 표현: 여러 회의에 나온 표현을 세고, 뜻은 AI 에 한 번 물어 저장
  await p.click('#lnFreqT'); await p.waitForTimeout(700);
  list = await p.textContent('#lnList');
  console.log('3 자주:', list.replace(/\s+/g, ' ').slice(0, 160));
  assert(/let me check/.test(list) && /same page/.test(list) && /뜻:let me check/.test(list) && /회의 2건/.test(list));
  assert.strictEqual((await reqs(p, 'meanings')).length, 1);
  console.log('3 OK 자주 쓰는 표현');

  // 4) 학습 내용 가져오기: 계정 → 개인화 → 학습 내용 가져오기
  await p.click('#tabbar button[data-tab="home"]'); await p.waitForTimeout(200);
  await p.click('#acctChip'); await p.waitForTimeout(300);
  await p.click('#acctBody button:has-text("학습 내용 가져오기")'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => document.getElementById('importDlg').open), true);
  assert.strictEqual(await p.isDisabled('#imOk'), true);
  await p.click('#imCopy'); await p.waitForTimeout(150);
  assert(/복사했어요/.test(await p.textContent('#imCopy')));
  assert(/\[고유 용어\]/.test(await p.evaluate(() => navigator.clipboard.readText())));
  assert.strictEqual(await p.getAttribute('#imClaude', 'href'), 'https://claude.ai/new');
  const learn0 = (await reqs(p, 'learn')).length;   // 회의 후 자동으로 배우기로 이미 보냈을 수 있다
  await p.fill('#imText', '나는 HR 컨설턴트이고 SuccessFactors 를 구축한다. 번역할 때 position 은 포지션으로 그대로 둬 줘.');
  assert.strictEqual(await p.textContent('#imCount'), String((await p.inputValue('#imText')).length));
  await p.click('#imOk'); await p.waitForTimeout(500);
  assert(/반영했습니다/.test(await p.textContent('#imMsg')));
  assert.strictEqual((await reqs(p, 'learn')).length, learn0 + 1);
  await p.click('#imBack'); await p.waitForTimeout(150);
  console.log('4 OK 학습 내용 가져오기');
  await p.context().close();

  // 5) 안드로이드 앱: 폰 소리(실험)와 떠 있는 자막 창 (가짜 MeetingNative)
  p = await openApp(b, Object.assign({}, BASE, { source: 'phone' }), { context: { viewport: { width: 390, height: 820 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36' } });
  await p.context().addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true };
    window.NATIVELOG = [];
    window.MeetingNative = {
      keepRecording: (on) => NATIVELOG.push('keep:' + on), canCapture: () => true, canOverlay: () => true,
      requestOverlay: () => NATIVELOG.push('reqOverlay'), setFloat: (on) => NATIVELOG.push('float:' + on),
      floatLines: (j) => { window.FLOAT = JSON.parse(j); },
      startCapture: () => { NATIVELOG.push('capture'); setTimeout(() => window.__phoneState('ok'), 50); },
      stopCapture: () => NATIVELOG.push('stopCapture')
    };
  });
  await p.reload(); await p.waitForTimeout(500);
  assert.deepStrictEqual(await p.$$eval('#source option', (o) => o.map((x) => x.value)), ['mic', 'phone']);
  await p.evaluate(() => { el.source.value = 'phone'; el.source.dispatchEvent(new Event('change')); });   // 첫 열기(가짜 앱 연결 전)에 마이크로 돌아갔으므로 다시 고른다 (폰에서는 계정 시트에서 고른다)
  await p.click('#acctChip'); await p.waitForTimeout(300);
  const acct = await p.textContent('#acctBody');
  assert(/앱 밖에서 자막 창 띄우기/.test(acct) && /들을 소리/.test(acct));
  await p.click('#acctSheet .grab', { force: true }).catch(() => {});
  await p.evaluate(() => document.getElementById('acctSheet').close()); await p.waitForTimeout(150);
  await p.click('#fab'); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => R.running && A.phone), true);
  assert.deepStrictEqual(await p.evaluate(() => NATIVELOG), ['capture', 'float:true', 'keep:true']);
  // 앱이 넘겨 주는 소리(0.1초, 16비트) → 소리 연결로 보낸다
  await p.evaluate(() => {
    window.SENT = 0;
    const ws = window.SOCKS[window.SOCKS.length - 1], orig = ws.send.bind(ws);
    ws.send = (d) => { if (typeof d !== 'string') window.SENT += d.byteLength; orig(d); };
    const pcm = new Int16Array(1600); for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(Math.sin(i / 5) * 3000);
    const u8 = new Uint8Array(pcm.buffer); let s = ''; for (const x of u8) s += String.fromCharCode(x);
    window.__phonePcm(btoa(s)); window.__phonePcm(btoa(s));
  });
  assert.strictEqual(await p.evaluate(() => window.SENT), 6400);
  assert(await p.evaluate(() => PHONE.peak > 2000));
  await speak(p, "Could you share the updated forecast? "); await p.waitForTimeout(400);
  const fl = await p.evaluate(() => window.FLOAT);
  console.log('5 떠 있는 창에 보낸 것:', JSON.stringify(fl).slice(0, 160));
  assert.strictEqual(fl.s, '듣는 중'); assert(fl.lines.length >= 1 && /updated forecast/.test(fl.lines[fl.lines.length - 1].en));
  // 떠 있는 창의 '정지'
  await p.evaluate(() => window.__nativeCmd('stop')); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => R.running), false);
  assert(await p.evaluate(() => NATIVELOG.includes('stopCapture') && NATIVELOG.includes('keep:false')));
  // 허용을 거부하면 알려 주고 시작하지 않는다
  await p.evaluate(() => { window.MeetingNative.startCapture = () => setTimeout(() => window.__phoneState('error:소리 캡처를 허용하지 않아 시작하지 못했습니다.'), 30); });
  await p.click('#lvPause'); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => R.running), false);
  assert(/허용하지 않아/.test(await p.textContent('#banner')));
  console.log('5 OK 폰 소리·떠 있는 자막 창');
  await p.context().close();
});
