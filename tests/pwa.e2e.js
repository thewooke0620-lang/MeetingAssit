// 폰 앱(설치형 웹 앱, PWA): 설치 정보(manifest), 아이콘, 서비스 워커 파일, 설치 단추, 아이폰 안내, 폰 화면 안내
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { openApp, BASE, run } = require('./helper');
const root = path.join(__dirname, '..');

run('PWA TESTS', async (b) => {
  // 1) 설치 정보와 아이콘 파일
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert(/<link rel="manifest" href="manifest.webmanifest">/.test(html));
  const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.strictEqual(man.display, 'standalone'); assert.strictEqual(man.start_url, './');
  for (const ic of man.icons) assert(fs.existsSync(path.join(root, ic.src)), ic.src);
  assert(man.icons.some((i) => i.purpose === 'maskable'));
  assert(fs.existsSync(path.join(root, 'icons/apple-touch-icon.png')));
  new Function(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'));   // 문법 확인
  // 2) 안드로이드·PC 크롬: 브라우저가 설치를 허락하면 '앱으로 설치' 단추
  let p = await openApp(b, BASE);
  assert.strictEqual(await p.isVisible('#sideInstall'), false);
  await p.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.PROMPTED = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  assert.strictEqual(await p.isVisible('#sideInstall'), true);
  assert.strictEqual(await p.isVisible('#installTip button'), true);
  await p.click('#installTip button'); await p.waitForTimeout(100);
  assert.strictEqual(await p.evaluate(() => window.PROMPTED), true);
  assert.strictEqual(await p.isVisible('#sideInstall'), false);
  await p.context().close();
  // 3) 아이폰 사파리: 홈 화면에 추가하는 방법 안내, 소리는 마이크만, 폰 안내 문구
  p = await openApp(b, BASE, { context: { viewport: { width: 390, height: 780 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } });
  const tip = await p.textContent('#installTip');
  console.log('3 아이폰 안내:', tip);
  assert(/홈 화면에 추가/.test(tip));
  assert.deepStrictEqual(await p.$$eval('#homeSource option', (n) => n.map((o) => o.value)), ['mic']);
  assert.strictEqual(await p.locator('#tabHome details.howto').count(), 0);
  await p.context().close();
});
