// 안정성: 연결 복구, 끊긴 구간 표시, 정지 후 마지막 번역까지 저장, 저장 실패 표시, 회의 정리 시간 제한, 연결 시험
// 실제 Soniox·Claude·Groq 는 부르지 않는다. 가짜 응답으로 동작만 확인한다
const assert = require('assert');
const { openApp, speak, toggle, openSettings, closeSettings, BASE, run, clickToggle } = require('./helper');
const socks = (p) => p.evaluate(() => window.SOCKS.length);
const status = (p) => p.textContent('#status');
const lastSock = (p) => p.evaluate(() => window.SOCKS[window.SOCKS.length - 1]);
const killSock = (p) => p.evaluate(() => { const s = window.SOCKS[window.SOCKS.length - 1]; s.readyState = 3; s.onclose && s.onclose(); });
const meetings = (p) => p.evaluate(() => Store.all('meetings'));

run('STABILITY TESTS', async (b) => {
  // 1) 연결이 여러 번 연속으로 끊겨도 멈추지 않고 다시 연결한다. 이어지면 끊긴 구간을 기록에 표시한다
  let p = await openApp(b, Object.assign({}, BASE, { assist: false }));
  await toggle(p);
  await speak(p, "We reviewed the draft agreement.");
  // 확정되지 않은 말이 남은 채 끊긴다
  await p.evaluate(() => window.SOCKS[window.SOCKS.length - 1].emit({ tokens: [{ text: ' The escrow', is_final: false, speaker: '1' }] }));
  // 새 연결이 생기자마자 바로 끊기는 상황을 4번 만든다 (예전에는 3번 실패하면 회의가 멈췄다)
  await p.evaluate(() => {
    window.KILLS = 4;
    const W = window.WebSocket;
    window.WebSocket = class extends W {
      constructor(...a) { super(...a); if (window.KILLS > 0) { window.KILLS--; setTimeout(() => { this.readyState = 3; this.onclose && this.onclose(); }, 10); } }
    };
  });
  const before = await socks(p);
  await killSock(p);
  await p.waitForTimeout(400);
  const text = await p.evaluate(() => [...document.querySelectorAll('#transcript .block .en')].map((x) => x.textContent).join('|'));
  assert(/The escrow/.test(text), '끊기기 전 확정되지 않은 말도 남아야 함: ' + text);
  assert.strictEqual(await p.evaluate(() => R.running), true, '연결이 끊겨도 회의는 계속');
  // 처음 끊김 + 4번 실패 뒤 5번째에 이어진다: 0.5+1+2+4+8 초 대기
  await p.waitForTimeout(16500);
  const after = await socks(p);
  console.log('1 재연결 시도', after - before, '번, 상태:', await status(p));
  assert.strictEqual(after - before, 5, '5번째 시도에서 이어져야 함');
  assert.strictEqual(await status(p), '듣는 중');
  const mark = await p.textContent('#transcript .gapmark');
  console.log('  끊김 표시:', mark);
  assert(/연결이 \d+초 동안 끊겼다가/.test(mark));
  assert.strictEqual(await p.isVisible('#banner'), false, '다시 이어지면 재연결 안내는 사라짐');

  // 2) 30초 넘게 끊기면 오래된 소리부터 버리고, 빠진 길이를 표시한다
  await p.evaluate(() => { window.KILLS = 0; });
  await speak(p, " The escrow terms look fine.");   // 글자가 들어오면 재시도 횟수를 처음부터 다시 센다
  await killSock(p);
  await p.evaluate(() => { R.open = false; const n = Math.round(R.sampleRate / 10) * 2; for (let i = 0; i < 400; i++) onChunk(new ArrayBuffer(n)); });   // 0.1초 × 400 = 40초
  assert(await p.evaluate(() => R.queue.total <= 30000 && R.lostMs >= 9000), '모아 두는 소리는 30초까지');
  await p.waitForTimeout(1500);
  const marks = await p.$$eval('#transcript .gapmark', (n) => n.map((x) => x.textContent));
  console.log('2 끊김 표시:', marks[marks.length - 1]);
  assert(/약 1[01]초의 소리는/.test(marks[marks.length - 1]));

  // 3) 정지하면 저장된 기록에도 끊긴 구간이 남는다
  await speak(p, " We will send the revised draft.");
  await toggle(p); await p.waitForTimeout(1500);
  let ms = await meetings(p);
  assert.strictEqual(ms.length, 1); assert.strictEqual(ms[0].gaps.length, 2); assert(ms[0].gaps[1].lostSecs >= 10 && ms[0].gaps[1].lostSecs <= 11);
  console.log('3 OK 저장된 끊김', ms[0].gaps.length, '건');
  await p.context().close();

  // 4) 번역이 4초보다 늦게 와도 정지 뒤 저장에 마지막 번역이 들어간다
  p = await openApp(b, Object.assign({}, BASE, { assist: false }));
  await toggle(p);
  await speak(p, "Can you confirm the penalty clause by Friday?");
  await p.evaluate(() => { window.MOCK.trDelay = 6000; });
  await speak(p, " We need the final numbers.");
  await toggle(p);
  await p.waitForTimeout(400);
  assert.strictEqual(await p.textContent('#saveState').then((t) => /저장/.test(t)), true);
  await p.waitForTimeout(7500);
  ms = await meetings(p);
  const last = ms[0].lines[ms[0].lines.length - 1];
  console.log('4 마지막 줄:', JSON.stringify(last), 'pending', ms[0].pending);
  assert(/번역\[We need the\]/.test(last.ko), '늦게 온 마지막 번역도 저장');
  assert.strictEqual(ms[0].pending, 0);

  // 5) 15초 안에 번역이 안 오면 원문을 먼저 저장하고, 번역이 덜 된 줄 수를 남긴다
  await p.evaluate(() => { window.MOCK.trDelay = 60000; });
  await toggle(p);
  await speak(p, " This sentence will never be translated.");
  await toggle(p);
  await p.waitForTimeout(16500);
  ms = await meetings(p);
  console.log('5 pending', ms[0].pending, '| 상태줄:', await p.textContent('#connState'));
  assert.strictEqual(ms[0].pending, 1);
  assert(/마지막 1줄은 번역이 끝나기 전에 저장했습니다/.test(await p.textContent('#connState')));
  assert(/This sentence will never be translated/.test(ms[0].lines[ms[0].lines.length - 1].en));
  await p.context().close();

  // 6) 정지 직후 다시 시작하면, 이전 연결이 마지막 글자를 다 받은 뒤에 새로 연결한다
  p = await openApp(b, Object.assign({}, BASE, { assist: false }));
  await p.evaluate(() => { window.MOCK.noFinish = true; });
  await toggle(p); await speak(p, "First part.");
  const n0 = await socks(p);
  await clickToggle(p); await p.waitForTimeout(100); await clickToggle(p); await p.waitForTimeout(800);
  assert.strictEqual(await socks(p), n0, '이전 연결이 끝나기 전에는 새로 연결하지 않음');
  assert.strictEqual(await status(p), '이전 연결 마무리 중');
  await p.evaluate(() => window.SOCKS[window.SOCKS.length - 1].emit({ tokens: [{ text: ' Last words.', is_final: true, speaker: '1' }] }));
  await p.waitForTimeout(6000);
  assert.strictEqual(await socks(p), n0 + 1); assert.strictEqual(await status(p), '듣는 중');
  const en = await p.evaluate(() => core.blocks.map((x) => x.en).join(''));
  assert(/Last words\./.test(en), '이전 연결의 마지막 글자도 남음');
  console.log('6 OK 이전 연결 마무리 뒤 새 연결');
  await toggle(p);
  await p.context().close();

  // 7) 자동 저장이 실패하면 위쪽에 '저장 실패'가 보이고, 누르면 파일로 받는다
  p = await openApp(b, Object.assign({}, BASE, { assist: false }));
  await toggle(p); await speak(p, "We reviewed the draft agreement.");
  await p.evaluate(() => { Store.update = () => Promise.reject(new Error('disk full')); });
  await toggle(p); await p.waitForTimeout(1200);
  const sv = await p.textContent('#saveState');
  console.log('7 저장 표시:', sv, '| 안내:', await p.textContent('#banner'));
  assert(/저장 실패/.test(sv)); assert(/자동 저장하지 못했습니다/.test(await p.textContent('#banner')));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#saveState')]);
  assert(/회의기록_|download/.test(dl.suggestedFilename()));   // 한글 파일 이름은 LANG 설정에 따라 다르게 보인다
  await p.context().close();

  // 8) 회의 정리: 서버가 잠시 혼잡하면 한 번 더 시도하고, 시간 제한을 넘으면 그만두고 까닭을 알린다
  p = await openApp(b, Object.assign({}, BASE, { assist: false }));
  await p.evaluate(() => { window.MOCK.digestFailOnce = 1; });
  await toggle(p); await speak(p, "We reviewed the draft agreement."); await p.waitForTimeout(300); await toggle(p);
  await p.waitForTimeout(3500);
  ms = await meetings(p);
  assert(ms[0].digest && ms[0].digest.summary.length, '혼잡(529) 뒤 다시 시도해 정리를 만듦');
  console.log('8 OK 다시 시도로 정리 생성');
  await p.context().close();
  p = await openApp(b, Object.assign({}, BASE, { assist: false }));
  await p.addInitScript(() => { window.TEST_ASK_TIMEOUT = 300; });
  await p.reload(); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => LLM_ASK_TIMEOUT_MS), 300);
  await p.evaluate(() => { window.MOCK.digestDelay = 2000; });
  await toggle(p); await speak(p, "We reviewed the draft agreement."); await p.waitForTimeout(300); await toggle(p);
  await p.waitForTimeout(500);
  await p.click('#digestBtn'); await p.waitForTimeout(3500);
  const note = await p.textContent('#mvBody');
  console.log('8 시간 초과 안내:', note.slice(0, 120));
  assert(/너무 오래 걸려 그만두었습니다/.test(note));
  await p.context().close();

  // 9) 연결 시험: Soniox 와 Claude 는 정상, Groq 키는 없음. Claude 키가 틀리면 그렇게 알린다
  p = await openApp(b, Object.assign({}, BASE, { assist: false }));
  await openSettings(p);
  await p.click('#testKeys'); await p.waitForTimeout(1500);
  let out = await p.textContent('#testOut');
  console.log('9 시험 결과:\n' + out);
  assert(/Soniox: 정상/.test(out) && /Claude \(Haiku\): 정상/.test(out) && /Groq: 키 없음/.test(out));
  await p.evaluate(() => { window.MOCK.trStatus = 401; });
  await p.click('#testKeys'); await p.waitForTimeout(1500);
  out = await p.textContent('#testOut');
  assert(/Claude \(Haiku\): 문제 있음 — Claude API 키가 올바르지 않습니다/.test(out), out);
  await closeSettings(p);
  await p.context().close();
});
