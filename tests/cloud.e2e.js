// Supabase 동기화: 가입·로그인, 회의를 올리고 다른 기기(다른 브라우저)에서 받기, 지우기 전달, 끊겼을 때 나중에 올리기
// 실제 Supabase 는 부르지 않는다. 이 테스트 안의 가짜 서버(인증 + 표 두 개)가 대신 응답한다
const assert = require('assert');
const { openApp, speak, toggle, openSettings, closeSettings, BASE, run, newPack, fakeSupabase, SB } = require('./helper');

// 서버의 폴더 수 (프로필 줄 __profile__, 설정 줄 __settings__ 은 빼고 센다)
const packCount = (sb) => [...sb.db.rows.packs.keys()].filter((k) => !/__profile__|__settings__/.test(k)).length;

run('CLOUD TESTS', async (b) => {
  const sb = fakeSupabase();
  const S = Object.assign({}, BASE, { sbUrl: SB, sbKey: 'anon-key' });
  const device = async () => { const p = await openApp(b, S); await p.context().route(SB + '/**', sb.handle); await p.reload(); await p.waitForTimeout(500); return p; };
  const login = async (p, email, kind) => {
    await openSettings(p);
    await p.fill('#sbEmail', email); await p.fill('#sbPw', 'secret12');
    await p.click(kind === 'up' ? '#sbSignUp' : '#sbSignIn'); await p.waitForTimeout(1200);
  };

  // 1) 기기 A: 회의 하나를 한 뒤 가입하면, 이 기기에 있던 폴더와 회의가 올라간다
  const A = await device();
  await toggle(A); await speak(A, "We reviewed the draft agreement."); await toggle(A); await A.waitForTimeout(1500);
  await login(A, 'me@x.com', 'up');
  let st = await A.textContent('#cloudState');
  console.log('1 A 상태:', st);
  assert(/me@x\.com 로그인됨/.test(st) && /마지막 동기화/.test(st), st);
  assert.strictEqual(sb.db.rows.meetings.size, 1); assert.strictEqual(packCount(sb), 1);
  assert(/me@x\.com/.test(await A.textContent('#sideCloud')));
  await A.click('#cancelSettings');

  // 2) 기기 B: 같은 계정으로 로그인하면 A 의 회의가 보이고, B 의 빈 '기본' 폴더는 겹치지 않게 버린다
  const B = await device();
  await login(B, 'me@x.com', 'in');
  await B.click('#cancelSettings'); await B.waitForTimeout(300);
  let tree = await B.textContent('#sideTree');
  console.log('2 B 메뉴:', tree);
  assert(/계약 초안 검토/.test(tree));
  assert.strictEqual(await B.$$eval('#sideTree > li', (n) => n.length), 1, '기본 폴더가 하나뿐');
  assert.strictEqual(packCount(sb), 1, '서버에도 폴더 하나');

  // 3) B 에서 새 폴더와 회의 → A 가 동기화하면 받는다
  await newPack(B, 'A사 계약');
  await toggle(B); await speak(B, "Delivery will take 8 weeks."); await toggle(B); await B.waitForTimeout(5000);
  assert.strictEqual(packCount(sb), 2); assert.strictEqual(sb.db.rows.meetings.size, 2);
  await A.evaluate(() => Cloud.sync()); await A.waitForTimeout(800);
  tree = await A.textContent('#sideTree');
  console.log('3 A 메뉴:', tree);
  assert(/A사 계약1/.test(tree), 'B 에서 만든 폴더와 그 회의 1건');
  assert.strictEqual(await A.evaluate(async () => (await Store.all('meetings')).length), 2);

  // 4) A 에서 회의를 지우면 B 에서도 사라진다
  await A.evaluate(async () => { const m = (await Store.all('meetings')).find((x) => /draft agreement/.test(x.lines[0].en)); await Store.del('meetings', m.id); });
  await A.evaluate(() => Cloud.sync()); await A.waitForTimeout(600);
  await B.evaluate(() => Cloud.sync()); await B.waitForTimeout(600);
  assert.strictEqual(await B.evaluate(async () => (await Store.all('meetings')).length), 1, '지운 것도 전달');

  // 5) 인터넷이 끊긴 동안 한 회의는 기억해 두었다가 이어지면 올린다
  sb.db.down = true;
  await B.evaluate(() => { if (!document.body.classList.contains('idle')) document.getElementById('clear').click(); });
  await B.waitForTimeout(300);
  await toggle(B); await speak(B, "Offline meeting line."); await toggle(B); await B.waitForTimeout(4500);
  await openSettings(B);
  st = await B.textContent('#cloudState');
  console.log('5 끊김 상태:', st, '|', await B.textContent('#cloudMsg'));
  assert(/올릴 것 \d+건/.test(st) && /인터넷 연결이 없어/.test(await B.textContent('#cloudMsg')));
  sb.db.down = false;
  await B.click('#sbSync'); await B.waitForTimeout(800);
  assert(!/올릴 것/.test(await B.textContent('#cloudState')));
  assert.strictEqual([...sb.db.rows.meetings.values()].filter((r) => !r.deleted).length, 2);

  // 6) 다른 계정의 기록은 보이지 않는다 (서버 보안 규칙을 흉내 낸 가짜 서버 기준)
  await B.click('#sbSignOut'); await B.waitForTimeout(300);
  assert.strictEqual(await B.isVisible('#cloudLogin'), true);
  const C = await device();
  await login(C, 'other@x.com', 'up');
  await C.click('#cancelSettings'); await C.waitForTimeout(300);
  assert.strictEqual(await C.evaluate(async () => (await Store.all('meetings')).length), 0);
  // 틀린 비밀번호
  await openSettings(C); await C.click('#sbSignOut'); await C.waitForTimeout(200);
  await C.fill('#sbEmail', 'me@x.com'); await C.fill('#sbPw', 'wrongpw1'); await C.click('#sbSignIn'); await C.waitForTimeout(500);
  assert(/비밀번호가 맞지 않습니다/.test(await C.textContent('#cloudMsg')));
  // 같은 기기(B)에서 다른 계정으로 로그인하면, 그 기기의 기존 기록은 새 계정에 올리지 않는다
  await B.click('#cancelSettings');
  await login(B, 'other@x.com', 'in');
  assert(/다른 계정의 것이라/.test(await B.textContent('#cloudMsg')));
  assert.strictEqual([...sb.db.rows.meetings.values()].filter((r) => r.user_id === 'u2').length, 0);
  console.log('6 OK 계정 분리, 틀린 비밀번호, 같은 기기 다른 계정');
  for (const p of [B, C]) await p.context().close();

  // 7) 설정과 API 키도 계정에 올라가고, 다시 설치한 기기(키 없음)는 처음 화면에서 로그인만 하면 그대로 불러온다
  const setRow = () => [...sb.db.rows.packs.values()].find((r) => r.id === '__settings__' && r.user_id === 'u1');
  let row = setRow();
  assert(row && row.data.s.apiKey === 'k' && row.data.s.claudeKey === 'ck' && row.data.s.engine === 'claude', '설정 줄: ' + JSON.stringify(row && row.data));
  assert(!('source' in row.data.s) && !('packId' in row.data.s) && !('onboarded' in row.data.s), '기기마다 다른 값은 올리지 않음');
  // A 에서 설정을 바꾸면 다시 올라간다
  await A.evaluate(() => { settings.groqKey = 'gk'; settings.fontSize = '24'; saveSettings(settings); });
  await A.evaluate(() => Cloud.sync()); await A.waitForTimeout(600);
  row = setRow();
  assert(row.data.s.groqKey === 'gk' && row.data.s.fontSize === '24');
  // 새로 설치한 기기: 키도 등록도 없음 → 처음 화면은 로그인
  const D = await openApp(b, { sbUrl: SB, sbKey: 'anon-key', openAfterStop: false });
  await D.context().route(SB + '/**', sb.handle); await D.reload(); await D.waitForTimeout(800);
  assert.strictEqual(await D.evaluate(() => document.getElementById('onboard').open), true);
  assert.strictEqual(await D.isVisible('#obEmail'), true, '처음 화면은 로그인 칸');
  assert(/저장해 둔 API 키와 설정/.test(await D.textContent('#obAcctFirst')));
  await D.fill('#obEmail', 'me@x.com'); await D.fill('#obPw', 'secret12'); await D.click('#obSignIn'); await D.waitForTimeout(1500);
  const got = await D.evaluate(() => ({ open: document.getElementById('onboard').open, apiKey: settings.apiKey, claudeKey: settings.claudeKey, groqKey: settings.groqKey, engine: settings.engine, fontSize: settings.fontSize, onboarded: settings.onboarded }));
  console.log('7 다시 설치한 기기:', JSON.stringify(got));
  assert.deepStrictEqual(got, { open: false, apiKey: 'k', claudeKey: 'ck', groqKey: 'gk', engine: 'claude', fontSize: '24', onboarded: true });
  assert(/계정에서 설정과 API 키/.test(await D.textContent('#banner')));
  assert.strictEqual(await D.isVisible('#homeKey'), false, '키 경고가 사라짐');
  // 계정이 없는 사람은 '건너뛰기'로 이름부터 등록
  const E = await openApp(b, { sbUrl: SB, sbKey: 'anon-key', openAfterStop: false });
  await E.context().route(SB + '/**', sb.handle); await E.reload(); await E.waitForTimeout(800);
  await E.click('#obSkip'); await E.waitForTimeout(200);
  assert.strictEqual(await E.isVisible('#obName'), true);
  // 키가 없는 기기는 계정의 키를 지우지 않는다
  await D.evaluate(async () => { settings.claudeKey = ''; settings.fontSize = '20'; saveSettings(settings); await Cloud.sync(); }); await D.waitForTimeout(300);
  row = setRow();
  assert.strictEqual(row.data.s.claudeKey, 'ck', '이 기기에 없는 키도 계정에는 남음'); assert.strictEqual(row.data.s.fontSize, '20');
  assert.strictEqual(row.data.s.apiKey, 'k', 'Soniox 키는 그대로');
  // 이미 로그인돼 있던 기기(새 버전 전부터): 처음 동기화 때 서버에 설정이 없으면 이 기기의 키를 올린다
  sb.db.rows.packs.delete('u1|__settings__');
  await A.evaluate(async () => { Cloud.setChecked = false; await Cloud.sync(); }); await A.waitForTimeout(400);
  row = setRow();
  assert(row && row.data.s.apiKey === 'k' && row.data.s.groqKey === 'gk', '기존 기기의 키가 계정에 올라감');
  console.log('7 OK 설정·API 키 계정 저장, 다시 설치 후 로그인으로 복원');
  for (const p of [A, D, E]) await p.context().close();
});
