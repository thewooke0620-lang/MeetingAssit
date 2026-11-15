// 계정 화면(개인화 수준, 목소리, 다시 듣기, 앱을 나가도 계속 기록), 내 지식(고유 용어·가져오기·배우기·초기화),
// 회의 소리 저장과 다시 듣기, 안드로이드 앱 연결, 가입 확인 메일 링크로 로그인
// 실제 Claude·Supabase 는 부르지 않는다 (가짜 응답)
const assert = require('assert');
const { openApp, speak, toggle, BASE, run, fakeSupabase, SB, reqs } = require('./helper');

run('KNOWLEDGE TESTS', async (b) => {
  const p = await openApp(b, Object.assign({}, BASE, { keepAudio: false }));
  await p.evaluate(() => saveProfile({ name: '김민수', myNames: 'Minsu' }));

  // 1) 계정 화면: 개인화 수준과 관리하기, 목소리, 다시 듣기, 앱을 나가도 계속 기록
  await p.click('#acctChip'); await p.waitForTimeout(300);
  const sheet = await p.textContent('#acctBody');
  console.log('1 계정 화면:', sheet.replace(/\s+/g, ' ').slice(0, 260));
  assert(/개인화 수준/.test(sheet) && /레벨 1 \/ 6/.test(sheet) && /개인화 관리하기/.test(sheet));
  assert(/내 목소리 등록/.test(sheet) && /미등록/.test(sheet));
  assert(/회의 기록에서 다시 듣기/.test(sheet) && /앱을 나가도 계속 기록하기/.test(sheet));
  assert.strictEqual(await p.$eval('#acctBody .sh-who b', (n) => n.textContent), '김민수');
  assert.strictEqual(await p.$$eval('#acctBody .lvbar i.on', (n) => n.length), 1);
  // 다시 듣기 켜기
  await p.click('#acctBody input[aria-label="회의 기록에서 다시 듣기"]'); await p.waitForTimeout(100);
  assert.strictEqual(await p.evaluate(() => settings.keepAudio), true);
  await p.click('#acctBody button.btn.wide'); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => document.getElementById('knowDlg').open), true, '개인화 관리하기 → 내 지식');

  // 2) 내 지식: 고유 용어 등록 → 받아 적기·번역에 쓰임
  const kn = await p.textContent('#knBody');
  assert(/회의 후 자동으로 배우기/.test(kn) && /고유 용어/.test(kn) && /다른 AI에서 가져오기/.test(kn) && /저장된 지식/.test(kn));
  assert(/기본 정보/.test(kn) && /김민수 · Minsu/.test(kn) && /지금 하는 일/.test(kn) && /내 관점·말투/.test(kn));
  await p.waitForTimeout(100);
  await p.evaluate(() => { KN.open = 'terms'; renderKnow(); });
  await p.waitForTimeout(200);
  await p.fill('#knBody .kn-edit textarea', 'Employee Central\nPMGM = 성과 목표 관리');
  await p.click('#knBody .kn-edit .btn.primary'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => profile.terms), 'Employee Central\nPMGM = 성과 목표 관리');
  assert(/2개 등록됨/.test(await p.textContent('#knBody')));
  // 하는 일·말투 고치기
  await p.evaluate(() => { KN.open = 'style'; renderKnow(); }); await p.waitForTimeout(150);
  await p.fill('#knBody .kn-edit textarea', '결론부터 짧게 말함.');
  await p.click('#knBody .kn-edit .btn.primary'); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => profile.style), '결론부터 짧게 말함.');
  assert(/업데이트/.test(await p.textContent('#knBody')), '고친 날짜 표시');

  // 3) 다른 AI에서 가져오기: 칸 제목이 있는 글은 그대로 나눈다
  await p.evaluate(() => { KN.open = 'import'; renderKnow(); }); await p.waitForTimeout(150);
  assert(/\[고유 용어\]/.test(await p.textContent('#knBody .kn-prompt')), '보낼 글 보여 줌');
  await p.fill('#knBody .kn-edit textarea', '[기본 정보]\n김민수, PwC\n\n[지금 하는 일]\n현대차 SuccessFactors 구축 PM\n\n[관점·말투]\n공손하고 간결함\n\n[고유 용어]\n- Position Management - 직위 관리\n- PMGM = 성과 목표 관리');
  await p.click('#knBody .kn-edit .btn.primary'); await p.waitForTimeout(400);
  const imp = await p.evaluate(() => ({ me: settings.me, style: profile.style, terms: profile.terms }));
  console.log('3 가져오기:', JSON.stringify(imp));
  assert.deepStrictEqual(imp, { me: '현대차 SuccessFactors 구축 PM', style: '공손하고 간결함', terms: 'Employee Central\nPMGM = 성과 목표 관리\nPosition Management = 직위 관리' });
  // 칸 제목이 없으면 AI로 정리한다
  await p.evaluate(() => { KN.open = 'import'; renderKnow(); }); await p.waitForTimeout(150);
  await p.fill('#knBody .kn-edit textarea', 'He is an HR tech consultant working on SAP rollouts.');
  await p.click('#knBody .kn-edit .btn.primary'); await p.waitForTimeout(600);
  const lr = await reqs(p, 'learn');
  assert.strictEqual(lr.length, 1); assert(/another AI/.test(lr[0].user) && /<current>/.test(lr[0].user));
  assert.strictEqual(await p.evaluate(() => settings.me), 'HR 시스템 구축 컨설턴트. SuccessFactors EC 설계 중.');
  assert(/role mapping = 역할 매핑/.test(await p.evaluate(() => profile.terms)));

  // 4) 번역 지시와 Soniox 용어에 내 고유 용어가 들어간다
  await p.click('#knBack'); await p.waitForTimeout(200);
  await toggle(p); await p.waitForTimeout(300);
  const cfg = await p.evaluate(() => window.CFG[window.CFG.length - 1]);
  assert(cfg.context.terms.includes('Position Management') && cfg.context.terms.includes('Employee Central'));
  await speak(p, 'We need to update the position management setup for next week.');
  await p.waitForTimeout(1500);
  const tr = (await reqs(p, 'translate')).pop();
  assert(/Position Management = 직위 관리/.test(tr.system), '번역 용어집에 고유 용어');
  // 답변 제안에 내 말투가 들어간다
  await speak(p, ' Could you share the timeline with us?');
  await p.waitForTimeout(1500);
  const as = (await reqs(p, 'assist-q')).pop();
  assert(as && /<my_style>/.test(as.user) && /Name: 김민수/.test(as.user), '답변 제안에 내 이름·말투');

  // 5) 회의 소리를 이 기기에 저장 → 회의 기록에서 다시 듣기
  await p.waitForTimeout(10500);   // 녹음기는 10초마다 조각을 넘긴다
  await toggle(p); await p.waitForTimeout(3500);
  const m = await p.evaluate(async () => (await Store.all('meetings'))[0]);
  assert(m.audio && m.audio.length === 1 && m.audio[0].start > 0, '회의 기록에 소리 구간');
  const chunks = await p.evaluate(async () => (await Store.run('audio', 'readonly', (s) => s.getAll())).map((r) => [r.seg, r.blob.size]));
  console.log('5 저장한 소리 조각:', JSON.stringify(chunks));
  assert(chunks.length >= 1 && chunks.every((c) => c[0] === m.audio[0].key && c[1] > 0));
  // 회의 정리가 끝나면 저절로 배운다
  await p.waitForTimeout(800);
  assert(await p.evaluate((id) => (profile.learned || []).includes(id), m.id), '회의 후 자동으로 배움');
  // 회의 기록 화면: 플레이어와 줄마다 ▶ 듣기
  await p.evaluate(async (id) => openMeeting(await Store.get('meetings', id)), m.id); await p.waitForTimeout(400);
  assert.strictEqual(await p.$$eval('#mvBody audio', (n) => n.length), 1);
  const btns = await p.$$('#mvBody .play-at');
  assert(btns.length >= 1, '줄마다 듣기 단추');
  await p.evaluate(() => { const d = document.querySelector('#mvBody details.mvlog'); if (d) d.open = true; });
  await btns[0].click(); await p.waitForTimeout(1500);
  const src = await p.evaluate(() => Player.el.src);
  assert(/^blob:/.test(src), '저장한 소리를 불러옴');
  await p.evaluate(() => document.getElementById('meetDlg').close());
  // 회의를 지우면 소리도 지운다
  await p.evaluate(async (id) => { const mm = await Store.get('meetings', id); await Store.del('meetings', id); await AudioKeep.remove(mm.audio); }, m.id);
  assert.strictEqual(await p.evaluate(async () => (await Store.run('audio', 'readonly', (s) => s.getAll())).length), 0);

  // 6) 개인화 수준이 올라간다 (배운 회의 1, 용어 4, 지식 3칸)
  const lv = await p.evaluate(() => knowledgeLevel(knowStats()));
  console.log('6 개인화 수준:', JSON.stringify(lv));
  assert(lv.level >= 3);
  // 초기화: 이름은 남김

  await p.evaluate(() => openKnow()); await p.waitForTimeout(300);
  await p.click('#knBody .btn.danger'); await p.waitForTimeout(300);
  assert.deepStrictEqual(await p.evaluate(() => [profile.name, settings.me, profile.style, profile.terms, (profile.learned || []).length]), ['김민수', '', '', '', 0]);
  await p.click('#knBack');

  // 7) 안드로이드 앱 연결: 회의 중에는 '앱을 나가도 계속 듣기'를 켜고, 정지하면 끈다
  await p.evaluate(() => { window.NCALLS = []; window.MeetingNative = { keepRecording: (on) => window.NCALLS.push(on) }; });
  await toggle(p); await p.waitForTimeout(300); await toggle(p); await p.waitForTimeout(500);
  assert.deepStrictEqual(await p.evaluate(() => window.NCALLS), [true, false]);
  // 끄면: 앱을 떠날 때 멈추고, 돌아오면 알려 준다
  await p.evaluate(() => { settings.bgKeep = false; saveSettings(settings); window.NCALLS = []; });
  await toggle(p); await p.waitForTimeout(300);
  assert.deepStrictEqual(await p.evaluate(() => window.NCALLS), [], '끄면 서비스를 켜지 않음');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => R.running), false, '앱을 떠나면 멈춤');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(200);
  assert(/앱을 떠나서 회의를 멈췄습니다/.test(await p.textContent('#banner')));
  await p.waitForTimeout(1500);
  await p.context().close();

  // 8) 가입 확인 메일: 돌아올 주소를 앱 주소로 보내고, 링크로 돌아오면 바로 로그인한다
  const sb = fakeSupabase(); sb.db.confirm = true;
  const q = await openApp(b, Object.assign({}, BASE, { sbUrl: SB, sbKey: 'anon-key' }));
  await q.context().route(SB + '/**', sb.handle); await q.reload(); await q.waitForTimeout(500);
  await q.evaluate(() => openOnboard(2)); await q.waitForTimeout(200);
  await q.fill('#obEmail', 'new@test.com'); await q.fill('#obPw', 'secret12');
  await q.click('#obSignUp'); await q.waitForTimeout(800);
  assert(/확인 메일을 보냈습니다/.test(await q.textContent('#obAcctMsg')));
  assert.strictEqual(await q.isVisible('#obResend'), true, '확인 메일 다시 보내기');
  const back = sb.db.redirects[0];
  console.log('8 돌아올 주소:', back);
  assert(back && !/localhost/.test(back) && /^http/.test(back));
  // 확인하기 전 로그인: 안내 + 다시 보내기
  await q.click('#obSignIn'); await q.waitForTimeout(800);
  assert(/확인 메일의 링크를 먼저/.test(await q.textContent('#obAcctMsg')));
  await q.click('#obResend'); await q.waitForTimeout(500);
  assert(/다시 보냈습니다/.test(await q.textContent('#obAcctMsg'))); assert.strictEqual(sb.db.redirects.length, 2);
  await q.evaluate(() => $('onboard').close());
  // 링크를 누르면 Supabase 가 앱 주소 뒤에 로그인 정보를 붙여 돌려보낸다
  sb.db.users['new@test.com'].ok = true;
  const tok = sb.tokenFor(sb.db.users['new@test.com']);
  const url = q.url().split('#')[0] + '#access_token=' + tok.access_token + '&refresh_token=' + tok.refresh_token + '&expires_in=3600&token_type=bearer&type=signup';
  await q.goto('about:blank'); await q.goto(url); await q.waitForTimeout(1200);   // 메일의 링크는 새 페이지로 열린다
  const got = await q.evaluate(() => ({ email: Cloud.session && Cloud.session.user.email, hash: location.hash, banner: document.getElementById('banner').textContent }));
  console.log('8 링크로 로그인:', JSON.stringify(got));
  assert.strictEqual(got.email, 'new@test.com'); assert.strictEqual(got.hash, '', '주소의 로그인 정보는 지움');
  assert(/가입 확인이 끝나 로그인했습니다/.test(got.banner));
  // 만료된 링크
  await q.evaluate(() => Cloud.keep(null));
  await q.goto('about:blank'); await q.goto(url.split('#')[0] + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'); await q.waitForTimeout(800);
  assert(/만료됐거나 이미 쓴 링크/.test(await q.textContent('#banner')));
  await q.context().close();
});
