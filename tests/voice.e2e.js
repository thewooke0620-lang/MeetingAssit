// 사용자 등록(이름·API 키·계정·목소리·첫 폴더), 이번 회의 주제·참여자, 번역에 넘기는 회의 정보, 내 목소리로 '나' 구분, 프로필 동기화
// 실제 Soniox·Claude·Supabase 는 부르지 않는다 (가짜 응답). 녹음은 크로미움의 가짜 마이크(삐 소리)로 한다
// 그래서 실제 목소리로 화자를 잘 가리는지는 이 테스트로 알 수 없다
const assert = require('assert');
const { devices } = require('playwright');
const { openApp, toggle, BASE, run, fakeSupabase, SB, reqs } = require('./helper');

// 시각(start_ms)이 붙은 토큰을 보낸다. Soniox 처럼 연결 맨 앞부터 잰 시각이다
const emit = (p, toks) => p.evaluate((toks) => window.SOCKS[window.SOCKS.length - 1].emit({ tokens: toks }), toks);
const words = (text, sp, start, step) => text.match(/\s*\S+/g).map((w, i) => ({ text: w, is_final: true, translation_status: 'original', speaker: sp, start_ms: start + i * (step || 250), end_ms: start + i * (step || 250) + 200 }));

run('VOICE TESTS', async (b) => {
  const sb = fakeSupabase();
  const S = Object.assign({}, BASE, { apiKey: '', claudeKey: '', engine: 'soniox', onboarded: false, sbUrl: SB, sbKey: 'anon-key' });
  let p = await openApp(b, S);
  await p.context().route(SB + '/**', sb.handle); await p.reload(); await p.waitForTimeout(800);

  // 1) 처음 열면 사용자 등록이 뜬다. 이름이 없으면 넘어가지 않는다
  assert.strictEqual(await p.evaluate(() => document.getElementById('onboard').open), true, '처음 열면 사용자 등록');
  // 처음 화면은 로그인 (계정이 있으면 설정을 불러온다). 계정이 없으면 건너뛰고 이름부터
  assert.strictEqual(await p.textContent('#obCount'), '3 / 5');
  assert.strictEqual(await p.isVisible('#obAcctFirst'), true);
  await p.click('#obSkip'); await p.waitForTimeout(100);
  assert.strictEqual(await p.textContent('#obCount'), '1 / 5');
  await p.click('#obNext'); await p.waitForTimeout(100);
  assert.strictEqual(await p.textContent('#obCount'), '1 / 5', '이름 없으면 머무름');
  await p.fill('#obName', '김민수'); await p.fill('#obNames', 'Minsu, Mr. Kim'); await p.fill('#obMe', 'HR 컨설턴트');
  await p.click('#obNext'); await p.waitForTimeout(150);
  // 2) API 키: Claude 로 고르고 키가 없으면 머무름, 연결 시험
  await p.fill('#obSoniox', 'k'); await p.selectOption('#obEngine', 'claude');
  await p.click('#obNext'); await p.waitForTimeout(100);
  assert(/Claude 키가 필요/.test(await p.textContent('#obKeyMsg')));
  await p.fill('#obClaude', 'ck');
  await p.click('#obTest'); await p.waitForTimeout(1500);
  const testMsg = await p.textContent('#obKeyMsg');
  console.log('2 연결 시험:', testMsg.replace(/\n/g, ' / '));
  assert(/Soniox: 정상/.test(testMsg) && /Claude: 정상/.test(testMsg));
  await p.click('#obNext'); await p.waitForTimeout(150);
  // 3) 계정: 가입하면 바로 로그인
  assert.strictEqual(await p.textContent('#obCount'), '3 / 5');
  await p.fill('#obEmail', 'minsu@test.com'); await p.fill('#obPw', 'secret12');
  await p.click('#obSignUp'); await p.waitForTimeout(1500);
  assert(/로그인돼 있습니다/.test(await p.textContent('#obAcctMsg')));
  await p.click('#obNext'); await p.waitForTimeout(150);
  // 4) 목소리: 가짜 마이크로 녹음 → 들어 보기 → 저장
  assert(/Hello everyone, this is Minsu/.test(await p.textContent('#obScript')), '읽을 글에 내 영어 이름');
  await p.click('#obRec'); await p.waitForTimeout(10000);   // 가짜 마이크는 삐 소리가 띄엄띄엄 나서 길게 녹음한다
  await p.click('#obRec'); await p.waitForTimeout(300);
  const vmsg = await p.textContent('#obVoiceMsg');
  console.log('4 녹음:', vmsg);
  const rec = await p.evaluate(() => OB.voice && { ms: OB.voice.ms, voiced: OB.voice.voicedMs });
  assert(rec && rec.ms >= 3000, '녹음됨 ' + JSON.stringify(rec));
  assert.strictEqual(await p.isEnabled('#obPlay'), true);
  await p.click('#obNext'); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => hasVoice()), true, '목소리 저장');
  // 5) 첫 폴더: 비어 있던 '기본' 폴더를 이 내용으로 채운다
  await p.fill('#obPackName', '현대차 HR'); await p.fill('#obPackTopic', 'EC 설계'); await p.fill('#obPackPeople', 'John Smith (SAP 아키텍트)\nEmily Park (고객사 HR)');
  await p.click('#obNext'); await p.waitForTimeout(500);
  assert.strictEqual(await p.evaluate(() => document.getElementById('onboard').open), false);
  const st = await p.evaluate(() => ({ onboarded: settings.onboarded, apiKey: settings.apiKey, engine: settings.engine, myNames: settings.myNames, me: settings.me,
    name: profile.name, packs: packs.map((x) => [x.name, x.topic, x.people]) }));
  console.log('5 등록 결과:', JSON.stringify(st));
  assert.deepStrictEqual(st, { onboarded: true, apiKey: 'k', engine: 'claude', myNames: 'Minsu, Mr. Kim', me: 'HR 컨설턴트', name: '김민수',
    packs: [['현대차 HR', 'EC 설계', 'John Smith (SAP 아키텍트)\nEmily Park (고객사 HR)']] });
  assert(/나: 김민수/.test(await p.textContent('#homeMe')));
  // 프로필(이름·목소리)은 서버에도 올라간다. API 키는 올리지 않는다
  await p.evaluate(() => Cloud.sync()); await p.waitForTimeout(800);
  const prow = [...sb.db.rows.packs.values()].find((r) => r.id === '__profile__');
  assert(prow && prow.data.name === '김민수' && prow.data.voice && prow.data.voice.mu.length > 1000, '프로필이 서버에');
  assert(!/"k"|ck/.test(JSON.stringify(prow.data).replace(/"mu":"[^"]*"/, '')), '키는 올리지 않음');
  // 처음 시작하기: 키, 이름·목소리, 계정, 폴더 = 4/5
  assert.strictEqual(await p.textContent('#setupCount'), '4/5');

  // 6) 이번 회의 주제·참여자: 시작할 때 '등록하기' 화면에서 적는다 (폴더의 참여자는 눌러서 고름)
  await p.evaluate(() => startFlow(true)); await p.waitForTimeout(200);
  await p.fill('#meetTopic', '역할 매핑 검토');
  const chips = await p.$$eval('#peopleChips .chip', (n) => n.map((x) => x.textContent));
  assert.deepStrictEqual(chips, ['John Smith', 'Emily Park']);
  await p.click('#peopleChips .chip:first-child'); await p.waitForTimeout(100);
  assert.strictEqual(await p.inputValue('#meetPeople'), 'John Smith');
  await p.fill('#meetPeople', 'John Smith, Tom Baker (SAP PM)'); await p.dispatchEvent('#meetPeople', 'change');
  await p.click('#sdGo'); await p.waitForTimeout(500);
  const cfg = await p.evaluate(() => window.CFG[window.CFG.length - 1]);   // 앞의 것은 연결 시험
  console.log('6 Soniox 설정:', JSON.stringify(cfg.context));
  assert.strictEqual(cfg.enable_speaker_diarization, true);
  assert.deepStrictEqual(cfg.context.terms, ['John Smith', 'Tom Baker', 'Emily Park', 'Minsu', 'Mr. Kim'], '참여자·내 이름을 정확하게 받아 적도록');
  assert(/^Meeting topic: 역할 매핑 검토\nSeries topic: EC 설계\nParticipants: John Smith \(SAP 아키텍트\); Tom Baker \(SAP PM\); Emily Park \(고객사 HR\)\nListener \(me\): 김민수/.test(cfg.context.text));
  const vinfo = await p.evaluate(() => ({ prefixMs: R.vcur.prefixMs, logged: R.vcur.log.length }));
  console.log('6 앞에 보낸 내 목소리:', JSON.stringify(vinfo));
  assert(vinfo.prefixMs >= 3500 && vinfo.prefixMs <= 7300, '내 목소리(6초까지 + 쉼)를 연결 맨 앞에');

  // 7) 내 목소리 구간은 화면에 내지 않고, 같은 화자(2)를 '나'로 표시한다
  const P = vinfo.prefixMs;
  await emit(p, words('Hello everyone, this is Minsu. Thanks for joining today.', '2', 200, 300));
  await emit(p, words(' So the role mapping is not final yet.', '1', P + 300));
  await p.waitForTimeout(400);
  await emit(p, words(' Can you send me the list?', '2', P + 3000));
  await p.waitForTimeout(400);
  await emit(p, words(' Could you confirm the timeline by Friday?', '3', P + 6000));
  await p.waitForTimeout(1500);
  const view = await p.$$eval('#transcript .block', (n) => n.map((x) => [x.classList.contains('mine'), x.querySelector('.spk').textContent, x.querySelector('.en').textContent.trim()]));
  console.log('7 화면:', JSON.stringify(view));
  assert(!/Hello everyone/.test(await p.textContent('#transcript')), '내 목소리 구간은 화면에 없음');
  assert.deepStrictEqual(view.map((x) => x[0]), [false, true, false]);
  assert.strictEqual(view[1][1], '김민수 (나)');
  assert.strictEqual(view[0][1], '화자 1');
  // 번역 요청에 회의 정보가 들어간다
  const tr = await reqs(p, 'translate');
  const last = tr[tr.length - 1];   // 앞의 것은 연결 시험
  assert(last && /Meeting topic: 역할 매핑 검토/.test(last.system) && /Listener \(me\): 김민수/.test(last.system), '번역 지시에 회의 정보');
  // 답변 제안: 내가 한 질문에는 하지 않고, 상대 질문에만 한다
  const asks = (await reqs(p, 'assist-q')).map((r) => r.user.match(/<question>([\s\S]*?)<\/question>/) ? RegExp.$1.trim() : r.user.slice(-80));
  console.log('7 답변 제안 요청:', asks);
  assert(!asks.some((q) => /send me the list/.test(q)), '내 질문에는 답변 제안 안 함');
  assert(asks.some((q) => /timeline by Friday/.test(q)), '상대 질문에는 답변 제안');
  // 화자 이름에 '나'라고 적으면 그 화자를 나로 고친다
  p.answer = '나';
  await p.click('#transcript .block:nth-child(3) .spk'); await p.waitForTimeout(300);
  assert.deepStrictEqual(await p.$$eval('#transcript .block', (n) => n.map((x) => x.classList.contains('mine'))), [false, true, true]);
  await emit(p, words(' Sure.', '3', P + 9000)); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => core.blocks[core.blocks.length - 1].speaker), 'me', '고친 뒤 같은 화자는 계속 나');
  assert.strictEqual(await p.evaluate(() => R.vcur.me + '|' + R.vcur.extra.join()), '2|3', '내 화자가 둘 (자동 2, 직접 고친 3)');
  // 나로 표시된 줄에 다른 이름을 적으면 이 연결에서 나를 모두 뺀다
  p.answer = 'Tom';
  await p.click('#transcript .block:nth-child(2) .spk'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => core.blocks.filter((x) => x.speaker === 'me').length), 0);
  assert(/Tom/.test(await p.textContent('#transcript .block:nth-child(2) .spk')));
  // 다시 '나'로 되돌려 둔다 (아래 기록 확인용)
  p.answer = '나';
  await p.click('#transcript .block:nth-child(2) .spk'); await p.waitForTimeout(300);
  await toggle(p); await p.waitForTimeout(2500);
  // 8) 회의 기록에 주제·참여자·내 말 표시, 새 참여자는 폴더에 쌓인다
  const m = await p.evaluate(async () => (await Store.all('meetings'))[0]);
  assert.strictEqual(m.topic, '역할 매핑 검토'); assert.strictEqual(m.people, 'John Smith, Tom Baker (SAP PM)');
  assert.deepStrictEqual(m.lines.map((l) => !!l.me), [false, true, true, true]);
  assert.strictEqual(m.lines[1].who, '김민수 (나)');
  assert.strictEqual(await p.evaluate(() => currentPack().people), 'John Smith (SAP 아키텍트)\nEmily Park (고객사 HR)\nTom Baker (SAP PM)');
  const dg = (await reqs(p, 'digest'))[0];
  assert(dg && /\[2\] Me \(김민수\): Can you send me the list\?/.test(dg.user) && /This meeting's topic: 역할 매핑 검토/.test(dg.user), '회의 정리에도 나와 주제');
  // 다음 회의를 위해 지우면 주제·참여자는 비워진다
  await p.click('#clear'); await p.waitForTimeout(500);
  assert.deepStrictEqual(await p.evaluate(() => [settings.meetTopic, settings.meetPeople]), ['', '']);
  await p.evaluate(() => startFlow(true)); await p.waitForTimeout(150);
  assert.strictEqual(await p.inputValue('#meetTopic'), '', '다음 회의 등록 화면은 비어 있음');
  await p.click('#sdCancel'); await p.waitForTimeout(150);

  // 9) 목소리 구분을 끄면 앞에 보내지 않는다
  await p.evaluate(() => { settings.voiceMe = false; saveSettings(settings); });
  await toggle(p); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => R.vcur.prefixMs), 0);
  await toggle(p); await p.waitForTimeout(1500);
  // 설정도 계정으로 맞춰지므로 다시 켜 두고 올린다 (10 에서 폰이 받는다)
  await p.evaluate(async () => { settings.voiceMe = true; saveSettings(settings); await Cloud.sync(); }); await p.waitForTimeout(300);
  await p.context().close();

  // 10) 다른 기기(폰)에서 같은 계정으로 로그인하면 이름·목소리와 설정을 받는다
  const q = await openApp(b, Object.assign({}, BASE, { sbUrl: SB, sbKey: 'anon-key' }), { context: devices['Pixel 7'] });
  await q.context().route(SB + '/**', sb.handle); await q.reload(); await q.waitForTimeout(600);
  assert.strictEqual(await q.evaluate(() => [profile.name, hasVoice()].join()), ',false');
  await q.evaluate(() => Cloud.signIn('minsu@test.com', 'secret12')); await q.waitForTimeout(1200);
  const got = await q.evaluate(() => ({ name: profile.name, voice: hasVoice(), myNames: settings.myNames, packs: packs.map((x) => x.name) }));
  console.log('10 폰에서 받은 것:', JSON.stringify(got));
  assert.deepStrictEqual(got, { name: '김민수', voice: true, myNames: 'Minsu, Mr. Kim', packs: ['현대차 HR'] });
  assert.strictEqual(await q.$$eval('#homeSource option', (n) => n.map((o) => o.value).join()), 'mic', '폰은 마이크만');
  await toggle(q); await q.waitForTimeout(200);
  assert(await q.evaluate(() => R.vcur.prefixMs > 0), '폰에서도 받은 목소리로 나를 찾는다');
  await toggle(q); await q.waitForTimeout(800);
  await q.context().close();

  // 11) 새 폴더 만들기 창, 폴더 고치기 창의 주제·참여자
  const r = await openApp(b, BASE);
  await r.click('#sidePackNew'); await r.waitForTimeout(150);
  await r.click('#pdOk'); await r.waitForTimeout(100);
  assert(/이름을 적어/.test(await r.textContent('#pdMsg')), '이름 없으면 안내');
  await r.fill('#pdName', 'B사'); await r.fill('#pdTopic', '물류 계약'); await r.click('#pdOk'); await r.waitForTimeout(400);
  await r.click('#packPill'); await r.waitForTimeout(300);   // 위쪽 '폴더: B사' → 그 폴더 고치기
  assert.strictEqual(await r.inputValue('#pdTopic'), '물류 계약');
  await r.fill('#pdPeople', 'Anna Kim'); await r.click('#pdOk'); await r.waitForTimeout(300);
  assert.strictEqual(await r.evaluate(() => currentPack().people), 'Anna Kim');
  // 키가 이미 있으면 사용자 등록이 저절로 뜨지 않는다. 설정의 '사용자 등록 다시 하기'로 연다
  assert.strictEqual(await r.evaluate(() => document.getElementById('onboard').open), false);
  await r.click('#openSettings'); await r.waitForTimeout(300);
  assert(/아직 등록하지 않았습니다/.test(await r.textContent('#meWho')));
  await r.click('#meVoiceBtn'); await r.waitForTimeout(200);
  assert.strictEqual(await r.textContent('#obCount'), '4 / 5', '목소리 단계로 바로');
  await r.click('#obLater'); await r.waitForTimeout(200);
  await r.context().close();

  // 12) 'PC 소리 + 내 마이크': 두 소리를 섞어 보내고, 조각마다 어느 쪽이 컸는지 기록한다
  //     (테스트에서는 컴퓨터 소리 대신 가짜 마이크 소리를 쓴다. 실제 Windows 소리 받기는 Windows에서만 확인할 수 있다)
  const w = await openApp(b, Object.assign({}, BASE, { source: 'both' }));
  await w.evaluate(() => { navigator.mediaDevices.getDisplayMedia = () => navigator.mediaDevices.getUserMedia({ audio: true }); });
  assert.strictEqual(await w.inputValue('#homeSource'), 'both');
  await toggle(w); await w.waitForTimeout(1500);
  const mix = await w.evaluate(() => ({ two: !!A.src2, log: R.vcur.log.length, err: document.getElementById('banner').textContent }));
  console.log('12 함께 듣기:', JSON.stringify(mix));
  assert(mix.two && mix.log >= 5, '마이크를 두 번째 입력으로 섞고 조각을 기록');
  await toggle(w); await w.waitForTimeout(800);
  assert.strictEqual(await w.evaluate(() => A.stream), null, '정지하면 둘 다 닫음');
  await w.context().close();
});
