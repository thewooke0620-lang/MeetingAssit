// 계정 시트(폰): 열면 맨 위(이름)부터 보이고, 손잡이를 아래로 끌면 닫힌다. 조금만 끌면 제자리로
const assert = require('assert');
const { openApp, BASE, run } = require('./helper');

run('SHEET TESTS', async (b) => {
  const p = await openApp(b, BASE, { context: { viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true } });
  await p.click('#acctChip'); await p.waitForTimeout(400);
  const st = await p.evaluate(() => {
    const sh = document.getElementById('acctSheet'), who = sh.querySelector('.sh-who').getBoundingClientRect(), box = sh.getBoundingClientRect();
    return { scroll: document.getElementById('acctBody').scrollTop, whoTop: who.top, sheetTop: box.top, grab: sh.querySelector('.grab-area').getBoundingClientRect().top >= box.top };
  });
  console.log('열었을 때:', JSON.stringify(st));
  assert.strictEqual(st.scroll, 0, '맨 위부터');
  assert(st.whoTop >= st.sheetTop && st.grab, '이름 줄과 손잡이가 시트 안에 보임');
  // 끌기 (손잡이에서)
  const drag = (dy) => p.evaluate(async (dy) => {
    const g = document.querySelector('#acctSheet .grab-area'), r = g.getBoundingClientRect(), x = r.left + 20, y = r.top + 10;
    const t = (yy) => new Touch({ identifier: 1, target: g, clientX: x, clientY: yy });
    g.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t(y)], changedTouches: [t(y)] }));
    for (let i = 1; i <= 5; i++) g.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t(y + dy * i / 5)], changedTouches: [t(y + dy * i / 5)] }));
    g.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t(y + dy)] }));
  }, dy);
  await drag(40); await p.waitForTimeout(350);
  assert.strictEqual(await p.evaluate(() => document.getElementById('acctSheet').open), true, '조금 끌면 그대로');
  await drag(220); await p.waitForTimeout(450);
  assert.strictEqual(await p.evaluate(() => document.getElementById('acctSheet').open), false, '충분히 끌면 닫힘');
  // 다시 열면 맨 위부터
  await p.click('#acctChip'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => document.getElementById('acctBody').scrollTop), 0);
  assert.strictEqual(await p.evaluate(() => document.getElementById('acctSheet').style.transform), '');
  await p.context().close();
});
