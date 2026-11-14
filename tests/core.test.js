const fs = require('fs'), assert = require('assert');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const src = html.split('/*CORE-START*/')[1].split('/*CORE-END*/')[0];
const api = new Function(src + '; return { createCore, processTokens, mergeChains, blocksToTranslate, parseTerms, exportText, shouldBreak, breakKind, currentPartial };')();
const tok = (text) => text.match(/\s*\S+/g).map((t) => ({ text: t, is_final: true, translation_status: 'original', speaker: '1' }));
const feed = (core, text) => { for (const t of tok(text)) api.processTokens(core, [t]); };

// 1) 긴 문장: 쉼표에서 끊기고, 문장이 끝나면 합쳐진다
let core = api.createCore(); core.mode = 'llm'; core.diar = true;
const S1 = "So what we are proposing here is a three year supply agreement with a fixed price for the first year, and then an annual adjustment that is tied to the consumer price index, with a cap of five percent per year so that neither side takes on too much risk.";
feed(core, S1);
console.log('fragments:', core.blocks.map((b) => [b.cont, b.en.length]));
assert(core.blocks.length >= 2, 'should split into fragments');
assert(core.blocks.slice(1).every((b) => b.cont) && !core.blocks[0].cont);
// 조각 번역이 달려 있다고 가정
core.blocks.forEach((b, i) => { b.ko = '조각' + i; b.trState = 'done'; b.trSrc = b.en.trim(); });
let ready = api.blocksToTranslate(core, Date.now());
let res = api.mergeChains(core, Date.now());
assert.strictEqual(core.blocks.length, 1); assert.strictEqual(res.removed.length >= 1, true);
assert.strictEqual(core.blocks[0].en, S1); assert(core.blocks[0].swap); assert.strictEqual(core.blocks[0].trSrc, '');
assert.strictEqual(core.blocks[0].ko, '조각0 조각1');
assert.deepStrictEqual(api.blocksToTranslate(core, Date.now()), [0], 'merged line must be re-translated');
// 다음 문장은 새 줄(cont 아님)
feed(core, " That is our position on pricing today.");
assert.strictEqual(core.blocks.length, 2); assert.strictEqual(core.blocks[1].cont, false);
assert.strictEqual(api.mergeChains(core, Date.now()).removed.length, 0);

// 2) 문장이 아직 안 끝났으면 합치지 않는다
core = api.createCore(); core.mode = 'llm';
feed(core, "So what we are proposing here is a three year supply agreement with a fixed price for the first year, and then an annual adjustment that is tied to");
assert(core.blocks.length === 2 && core.blocks[1].cont);
assert.strictEqual(api.mergeChains(core, Date.now()).removed.length, 0, 'open sentence must not merge');
// 화자가 바뀌면(새 줄 시작) 앞 문장은 합쳐진다
core.diar = true;
api.processTokens(core, [{ text: ' Sorry', is_final: true, speaker: '2' }]);
res = api.mergeChains(core, Date.now());
assert.strictEqual(res.removed.length, 1); assert.strictEqual(core.blocks.length, 2); assert.strictEqual(core.blocks[1].en, ' Sorry');

// 3) 너무 긴 문장은 합치지 않는다
core = api.createCore(); core.mode = 'llm';
feed(core, Array(9).fill("and then we will look at the numbers for the following quarter in a lot more detail,").join(' ') + " and that is it.");
const before = core.blocks.length;
assert(before > 3);
assert.strictEqual(api.mergeChains(core, Date.now()).removed.length, 0);
assert(core.blocks.every((b) => !b.cont), 'too-long chain is released');
assert.strictEqual(core.blocks.length, before);

// 4) 다듬기 끔: 예전 기준(140자), 합치지 않음
core = api.createCore(); core.mode = 'llm'; core.refine = false;
feed(core, S1);
console.log('refine off:', core.blocks.map((b) => [b.cont, b.en.length]));
assert(core.blocks.every((b) => !b.cont)); assert.strictEqual(api.mergeChains(core, Date.now()).removed.length, 0);
assert(core.blocks[0].en.length > 140);

// 5) Soniox 내장 모드는 영향 없음
core = api.createCore();
feed(core, S1);
assert.strictEqual(core.blocks.length, 1);

// 6) 용어집
assert.deepStrictEqual(api.parseTerms("Acme Corp\nescrow = 에스크로, term sheet → 주요 조건서\n  \nSLA->서비스 수준 협약\nfoo=>바"), [
  { src: 'Acme Corp', dst: '' }, { src: 'escrow', dst: '에스크로' }, { src: 'term sheet', dst: '주요 조건서' },
  { src: 'SLA', dst: '서비스 수준 협약' }, { src: 'foo', dst: '바' }]);
assert.deepStrictEqual(api.parseTerms(''), []);

// 7) 내보내기 (비교 줄 포함)
core = api.createCore(); core.mode = 'llm';
feed(core, "We agree with that."); Object.assign(core.blocks[0], { ko: '동의합니다.', mt: '우리는 동의한다.', alt: '그 점에 동의합니다.', altLabel: 'Sonnet' });
assert.strictEqual(api.exportText(core, {}), "[화자 1] We agree with that.\n동의합니다.");
assert.strictEqual(api.exportText(core, {}, true), "[화자 1] We agree with that.\n동의합니다.\n  [Soniox] 우리는 동의한다.\n  [Sonnet] 그 점에 동의합니다.");
console.log('CORE TESTS PASSED');
