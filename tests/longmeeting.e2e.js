// 장시간 회의(3000줄) 성능 측정: 말하는 중 화면 갱신 시간, 기록 저장 시간, 메모리
const { openApp, toggle, BASE } = require('./helper');
const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--enable-precise-memory-info'] });
  const p = await openApp(b, Object.assign({}, BASE, { engine: 'soniox', assist: false }));
  await toggle(p);
  const r = await p.evaluate(async (N) => {
    const S = "We reviewed the draft agreement over the weekend and the escrow terms look fine to us, but we need 6 weeks for delivery.";
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      processTokens(core, [{ text: (i ? ' ' : '') + S, is_final: true, translation_status: 'original', speaker: String(1 + (i % 3)) }]);
      processTokens(core, [{ text: '초안을 검토했고 6주가 필요합니다.', is_final: true, translation_status: 'translation' }]);
      core.breakNext = true;
      if (i % 50 === 0) render();
    }
    render();
    const fill = performance.now() - t0;
    // 말하는 중: 토큰 한 개 들어올 때마다 render 한 번
    const times = [];
    for (let k = 0; k < 50; k++) {
      const a = performance.now();
      processTokens(core, [{ text: ' word' + k, is_final: false, speaker: '1' }]);
      render();
      times.push(performance.now() - a);
    }
    times.sort((x, y) => x - y);
    const a2 = performance.now(); const lines = meetingLines(); const ml = performance.now() - a2;
    const a3 = performance.now(); await saveMeeting(); const sv = performance.now() - a3;
    return { blocks: core.blocks.length, fillMs: Math.round(fill), renderMedianMs: times[25].toFixed(2), renderP90Ms: times[45].toFixed(2),
      meetingLinesMs: ml.toFixed(1), saveMs: sv.toFixed(1), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
      domNodes: document.getElementsByTagName('*').length };
  }, 3000);
  console.log('3000줄 회의:', JSON.stringify(r));
  // 아주 느슨한 기준: 이보다 느리면 장시간 회의에서 화면이 끊길 수 있다 (실제 PC 성능에 따라 다르다)
  assert(Number(r.renderMedianMs) < 20, '말하는 중 화면 갱신이 너무 느림');
  assert(Number(r.saveMs) < 2000, '저장이 너무 느림');
  console.log('LONG MEETING TESTS PASSED');
  await b.close();
})();

