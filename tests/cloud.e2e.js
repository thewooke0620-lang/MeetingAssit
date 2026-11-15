// Supabase 동기화: 가입·로그인, 회의를 올리고 다른 기기(다른 브라우저)에서 받기, 지우기 전달, 끊겼을 때 나중에 올리기
// 실제 Supabase 는 부르지 않는다. 이 테스트 안의 가짜 서버(인증 + 표 두 개)가 대신 응답한다
const assert = require('assert');
const { openApp, speak, toggle, openSettings, closeSettings, BASE, run } = require('./helper');

const SB = 'https://sb.test';
function fakeSupabase() {
  const db = { users: {}, rows: { packs: new Map(), meetings: new Map() }, clock: 0, down: false, calls: [] };
  const ts = () => new Date(Date.UTC(2026, 0, 1) + (++db.clock) * 1000).toISOString();
  const tokenFor = (u) => ({ access_token: 'at-' + u.id + '-' + db.clock, refresh_token: 'rt-' + u.id, expires_in: 3600, user: { id: u.id, email: u.email } });
  const userOf = (req) => { const m = /Bearer at-(u\d+)-/.exec(req.headers()['authorization'] || ''); return m && m[1]; };
  async function handle(route) {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: body === undefined ? '' : JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (db.down) return route.abort('internetdisconnected');
    if (req.headers()['apikey'] !== 'anon-key') return json(401, { message: 'Invalid API key' });
    db.calls.push(req.method() + ' ' + path);
    if (path === '/auth/v1/signup') {
      const b = JSON.parse(req.postData());
      if (db.users[b.email]) return json(422, { msg: 'User already registered' });
      const u = db.users[b.email] = { id: 'u' + (Object.keys(db.users).length + 1), email: b.email, pw: b.password };
      return json(200, tokenFor(u));
    }
    if (path === '/auth/v1/token') {
      const b = JSON.parse(req.postData());
      const u = url.searchParams.get('grant_type') === 'password' ? db.users[b.email] : Object.values(db.users).find((x) => 'rt-' + x.id === b.refresh_token);
      if (!u || (b.email && u.pw !== b.password)) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      return json(200, tokenFor(u));
    }
    if (path === '/auth/v1/logout') return json(204);
    const m = /^\/rest\/v1\/(packs|meetings)$/.exec(path);
    if (m) {
      const uid = userOf(req);
      if (!uid) return json(401, { message: 'JWT expired' });
      const table = db.rows[m[1]];
      if (req.method() === 'POST') {
        for (const r of JSON.parse(req.postData())) table.set(uid + '|' + r.id, { id: r.id, user_id: uid, data: r.data, deleted: !!r.deleted, updated_at: ts() });
        return json(201);
      }
      let list = [...table.values()].filter((r) => r.user_id === uid);
      const gt = url.searchParams.get('updated_at');
      if (gt) list = list.filter((r) => r.updated_at > gt.replace(/^gt\./, ''));
      if (url.searchParams.get('deleted') === 'eq.false') list = list.filter((r) => !r.deleted);
      list.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
      return json(200, list.slice(0, Number(url.searchParams.get('limit') || 1000)).map((r) => ({ id: r.id, data: r.data, deleted: r.deleted, updated_at: r.updated_at })));
    }
    return json(404, { message: 'not found' });
  }
  return { db, handle };
}

run('CLOUD TESTS', async (b) => {
  const sb = fakeSupabase();
  const S = Object.assign({}, BASE, { sbUrl: SB, sbKey: 'anon-key' });
  const device = async () => { const p = await openApp(b, S); await p.context().route(SB + '/**', sb.handle); await p.reload(); await p.waitForTimeout(500); return p; };
  const login = async (p, email, kind) => {
    await openSettings(p);
    await p.fill('#sbEmail', email); await p.fill('#sbPw', 'secret12');
    await p.click(kind === 'up' ? '#sbSignUp' : '#sbSignIn'); await p.waitForTimeout(1200);
  };

  // 1) 기기 A: 회의 하나를 한 뒤 가입하면, 이 기기에 있던 묶음과 회의가 올라간다
  const A = await device();
  await toggle(A); await speak(A, "We reviewed the draft agreement."); await toggle(A); await A.waitForTimeout(1500);
  await login(A, 'me@x.com', 'up');
  let st = await A.textContent('#cloudState');
  console.log('1 A 상태:', st);
  assert(/me@x\.com 로그인됨/.test(st) && /마지막 동기화/.test(st), st);
  assert.strictEqual(sb.db.rows.meetings.size, 1); assert.strictEqual(sb.db.rows.packs.size, 1);
  assert(/me@x\.com/.test(await A.textContent('#sideCloud')));
  await A.click('#cancelSettings');

  // 2) 기기 B: 같은 계정으로 로그인하면 A 의 회의가 보이고, B 의 빈 '기본' 묶음은 겹치지 않게 버린다
  const B = await device();
  await login(B, 'me@x.com', 'in');
  await B.click('#cancelSettings'); await B.waitForTimeout(300);
  let tree = await B.textContent('#sideTree');
  console.log('2 B 메뉴:', tree);
  assert(/계약 초안 검토/.test(tree));
  assert.strictEqual(await B.$$eval('#sideTree > li', (n) => n.length), 1, '기본 묶음이 하나뿐');
  assert.strictEqual(sb.db.rows.packs.size, 1, '서버에도 묶음 하나');

  // 3) B 에서 새 묶음과 회의 → A 가 동기화하면 받는다
  B.answer = 'A사 계약';
  await B.click('#sidePackNew'); await B.waitForTimeout(400);
  await toggle(B); await speak(B, "Delivery will take 8 weeks."); await toggle(B); await B.waitForTimeout(5000);
  assert.strictEqual(sb.db.rows.packs.size, 2); assert.strictEqual(sb.db.rows.meetings.size, 2);
  await A.evaluate(() => Cloud.sync()); await A.waitForTimeout(800);
  tree = await A.textContent('#sideTree');
  console.log('3 A 메뉴:', tree);
  assert(/A사 계약1/.test(tree), 'B 에서 만든 묶음과 그 회의 1건');
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
  for (const p of [A, B, C]) await p.context().close();
});
