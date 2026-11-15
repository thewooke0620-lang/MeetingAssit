// 백업: 가져오기·내보내기에서 쌓인 내용과 회의 정리가 유지되는지, 백업 알림이 뜨는지
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const { openApp, openSettings, closeSettings, meets, stored, BASE, run, openFolder, closeFolder } = require('./helper');

run('BACKUP TESTS', async (b) => {
  const now = Date.now();
  const digest = { summary: ['가격 조정안을 협의했다.'], decisions: ['다음 주에 다시 논의한다.'], todos: [], terms: [{ en: 'CPI', ko: '소비자물가지수' }], facts: ['인상 상한은 연 5%다.'], questions: [], lines: 1, at: now };
  const file = path.join(os.tmpdir(), 'meeting-backup-seed-' + process.pid + '.json');
  fs.writeFileSync(file, JSON.stringify({ app: 'meeting-interpreter', version: 1, exportedAt: now,
    packs: [{ id: 'p1', name: 'A사 계약', brief: '공급 계약', terms: 'escrow = 에스크로', facts: '납기는 발주 후 6주다.', qa: 'Q: lead time?\nA: 6주', createdAt: now - 5000, updatedAt: now, evil: '<img src=x onerror=alert(1)>' }],
    meetings: [1, 2, 3, 4, 5].map((i) => ({ id: 'm' + i, packId: 'p1', startedAt: now - i * 3600000, endedAt: now - i * 3600000 + 600000, secs: 600,
      lines: [{ who: '화자 1', en: 'Meeting number ' + i + '.', ko: i + '번째 회의.' }], title: i + '차 가격 협의', titleManual: false, titleLines: 1, digest: i === 1 ? digest : undefined }))
      .concat([{ id: 'orphan', packId: 'nope', startedAt: now, lines: [{ en: 'x' }] }]) }));

  let p = await openApp(b, BASE);
  assert.strictEqual(await p.textContent('#banner'), '');
  await openSettings(p);
  assert(/아직 백업한 적이 없습니다 · 그 뒤 쌓인 회의 0건/.test(await p.textContent('#backupInfo')));

  // 1) 가져오기: 쌓인 내용, 제목, 정리가 그대로 들어온다. 없는 폴더의 회의는 버린다
  await p.setInputFiles('#packFile', file); await p.waitForTimeout(600);
  assert(/폴더 1개와 회의 5건을 가져왔습니다/.test(await p.textContent('#packMsg')), await p.textContent('#packMsg'));
  assert(/그 뒤 쌓인 회의 5건/.test(await p.textContent('#backupInfo')));
  await closeSettings(p);
  await openFolder(p, 'A사 계약');
  assert.strictEqual(await p.inputValue('#pdFacts'), '납기는 발주 후 6주다.');
  assert.strictEqual(await p.inputValue('#pdQa'), 'Q: lead time?\nA: 6주');
  let m = await meets(p);
  assert.strictEqual(m.length, 5);
  assert(/^1차 가격 협의 \| .* 10분 · 1줄 · 정리 있음$/.test(m[0]), m[0]);
  await p.click('#meetList .mrow button:has-text("열기")'); await p.waitForTimeout(300);
  const v = await p.evaluate(() => document.getElementById('mvBody').innerText);
  assert(v.includes('가격 조정안을 협의했다.') && v.includes('CPI = 소비자물가지수') && v.includes('인상 상한은 연 5%다.'));
  await p.click('#mvClose');
  await closeFolder(p);

  // 2) 다시 열면 백업 알림이 뜬다 (하루에 한 번)
  await p.reload(); await p.waitForTimeout(700);
  assert(/백업한 뒤로 회의 기록 5건이 쌓였습니다/.test(await p.textContent('#banner')), await p.textContent('#banner'));
  await p.reload(); await p.waitForTimeout(700);
  assert.strictEqual(await p.textContent('#banner'), '', '같은 날 다시 알리지 않음');
  await p.evaluate(() => { const k = 'meeting-interpreter.settings.v1'; const s = JSON.parse(localStorage.getItem(k)); s.backupNagAt = 0; localStorage.setItem(k, JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(700);
  assert(/백업한 뒤로 회의 기록 5건/.test(await p.textContent('#banner')));

  // 3) 내보내면 알림이 사라지고, 파일에 쌓인 내용과 정리가 들어 있다
  await openSettings(p);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#packExport')]);
  const out = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  await p.waitForTimeout(300);
  assert(/마지막 백업: .* · 그 뒤 쌓인 회의 0건/.test(await p.textContent('#backupInfo')), await p.textContent('#backupInfo'));
  assert.strictEqual(await p.isVisible('#banner'), false);
  const pk = out.packs.find((x) => x.id === 'p1');
  assert(pk.facts === '납기는 발주 후 6주다.' && pk.qa === 'Q: lead time?\nA: 6주' && pk.evil === undefined);
  assert.strictEqual(out.meetings.length, 5);
  assert.deepStrictEqual(out.meetings.find((x) => x.id === 'm1').digest.summary, ['가격 조정안을 협의했다.']);
  assert((await stored(p)).lastBackupAt > now - 1000);
  await closeSettings(p);
  await p.evaluate(() => { const k = 'meeting-interpreter.settings.v1'; const s = JSON.parse(localStorage.getItem(k)); s.backupNagAt = 0; localStorage.setItem(k, JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(700);
  assert.strictEqual(await p.textContent('#banner'), '', '백업한 뒤에는 알리지 않음');
  assert.deepStrictEqual(p.errors, []);
});
