// 안정 모드: 한 줄의 번역이 한 번만 바뀐다 (미리 번역과 긴 문장 다듬기를 쓰지 않음)
const assert = require('assert');
const { openApp, speak, toggle, openSettings, reqs, BASE, run } = require('./helper');
const S1 = "So what we are proposing here is a three year supply agreement with a fixed price for the first year, and then an annual adjustment that is tied to the consumer price index, with a cap of five percent per year so that neither side takes on too much risk.";
const S2 = " That is our position on pricing today.";
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('#transcript .block .ko')].map((k) => k.innerText));

run('STABLE MODE TESTS', async (b) => {
  // 보통 모드: 미리 번역을 여러 번 부르고, 긴 문장은 끝난 뒤 한 줄로 합친다
  let p = await openApp(b, Object.assign({}, BASE, { draft: true, assist: false }));
  await toggle(p); await speak(p, S1 + S2, 30); await p.waitForTimeout(2500);
  const normal = (await reqs(p, 'translate')).length;
  assert.strictEqual((await rows(p)).length, 2);
  await p.context().close();

  // 안정 모드: 줄마다 확정 번역 한 번씩만 부른다. 줄을 합치지 않는다
  p = await openApp(b, Object.assign({}, BASE, { draft: true, stable: true, assist: false }));
  await p.evaluate(() => { window.SEEN = {}; setInterval(() => { document.querySelectorAll('#transcript .block').forEach((bk, i) => { const t = bk.querySelector('.ko').innerText.trim(); const a = window.SEEN[i] || (window.SEEN[i] = []); if (t && t !== '…' && !a.some((x) => t.startsWith(x) || x.startsWith(t))) a.push(t); }); }, 40); });
  await toggle(p); await speak(p, S1 + S2, 30); await p.waitForTimeout(2500);
  const r = await rows(p);
  const tr = await reqs(p, 'translate');
  console.log('보통 모드 번역 요청', normal, '건 / 안정 모드', tr.length - 1, '건 (연결 예열 1건 제외), 줄 수', r.length);
  assert.strictEqual(r.length, 3, '긴 문장은 예전 기준(140자)으로만 끊기고 합쳐지지 않음');
  assert.strictEqual(tr.length - 1, 3, '줄마다 한 번씩만 번역');
  assert(normal - 1 > 3, '보통 모드는 미리 번역 때문에 더 많이 부름');
  const seen = await p.evaluate(() => window.SEEN);
  for (const k of Object.keys(seen)) assert(seen[k].length <= 1, '안정 모드에서는 한 줄의 번역이 서로 다른 글로 여러 번 바뀌면 안 됨: ' + JSON.stringify(seen[k]));
  // 설정 창: 안정 모드를 켜면 함께 꺼지는 선택지가 흐려지고, 속도 기록에 표시된다
  await openSettings(p);
  assert.strictEqual(await p.isDisabled('#draft'), true); assert.strictEqual(await p.isDisabled('#refine'), true);
  assert(/미리 번역 끔 · 다듬기 끔 .* 안정 모드 켬/.test(await p.textContent('#statBox')));
  await p.uncheck('#stable');
  assert.strictEqual(await p.isDisabled('#draft'), false);
  assert.deepStrictEqual(p.errors, []);
});
