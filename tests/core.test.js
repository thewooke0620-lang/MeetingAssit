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

// 연결 복구: 재시도 간격, 소리 모아 두기 한도, 끊길 때 남은 말 살리기, 남은 번역 세기
const rc = new Function(src + '; return { retryDelay, newQueue, pushChunk, salvageNf, pendingTranslations };')();
assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 9].map(rc.retryDelay), [500, 1000, 2000, 4000, 8000, 10000, 10000]);
const q = rc.newQueue();
let lost = 0;
for (let i = 0; i < 350; i++) lost += rc.pushChunk(q, i, 100, 30000);
assert.strictEqual(q.total, 30000); assert.strictEqual(lost, 5000); assert.strictEqual(q.items[0], 50);
core = api.createCore(); core.mode = 'llm';
feed(core, "We reviewed the draft.");
api.processTokens(core, [{ text: ' The escrow', is_final: false, speaker: '1' }]);
assert.strictEqual(rc.salvageNf(core), true); assert.strictEqual(core.nf.en, '');
assert(core.blocks.map((b) => b.en).join('').includes('The escrow'));
assert.strictEqual(rc.pendingTranslations(core), core.blocks.length);
core.blocks.forEach((b) => { b.trSrc = b.en.trim(); b.trState = 'done'; });
assert.strictEqual(rc.pendingTranslations(core), 0);
core.blocks[0].trState = 'run'; assert.strictEqual(rc.pendingTranslations(core), 1);
core.mode = 'inline'; assert.strictEqual(rc.pendingTranslations(core), 0);

// 나에게 온 질문 알아채기, 강조 표시, 내용 지문
const r2 = new Function(src + '; return { askKind, markSegments, linesSig };')();
const NM = ['David', 'Dave'];
const cases = { 'Can you confirm the price by Friday?': 'q', 'David, what do you think about the timeline.': 'me', 'John, can you send the deck?': 'other',
  'David mentioned it earlier.': 'named', 'So, what is the plan?': 'q', 'Please confirm the numbers by end of week.': 'q', 'Right?': '',
  'We cannot accept a 5% increase.': '', 'Let us know your thoughts.': 'q', 'Dave, over to you.': 'me' };
for (const [t, want] of Object.entries(cases)) assert.strictEqual(r2.askKind(t, NM), want, t);
assert.strictEqual(r2.askKind('David, can you hear me?', []), 'other', '이름을 등록하지 않았으면 남의 이름으로 본다');
const segs = r2.markSegments('We cannot do $1,200 by Friday, David. Delivery in 6.', NM, { marks: true });
assert.deepStrictEqual(segs.filter((x) => x.k).map((x) => x.k + ':' + x.t), ['neg:cannot', 'num:$1,200', 'num:Friday', 'me:David', 'num:6']);
assert.strictEqual(segs.map((x) => x.t).join(''), 'We cannot do $1,200 by Friday, David. Delivery in 6.');
assert.deepStrictEqual(r2.markSegments('plain text', [], { marks: false }), [{ t: 'plain text', k: '' }]);
const L = [{ en: 'a', ko: 'b' }, { en: 'c', ko: 'd' }];
assert.strictEqual(r2.linesSig(L), r2.linesSig(JSON.parse(JSON.stringify(L))));
assert.notStrictEqual(r2.linesSig(L), r2.linesSig([{ en: 'a', ko: 'b' }, { en: 'c', ko: 'e' }]), '줄 수가 같아도 내용이 다르면 다름');

// 자막을 고쳤을 때 용어집 후보
const tc = new Function(src + '; return termCandidate;')();
assert.strictEqual(tc('We opened the a scrow account.', 'We opened the escrow account.'), 'escrow');
assert.strictEqual(tc('Talk to Kim Jung soo.', 'Talk to Kim Jung-soo.'), 'Jung-soo');
assert.strictEqual(tc('It is fine', 'It is fine.'), '', '문장부호만 바뀜');
assert.strictEqual(tc('a b c', 'a b c'), '');
assert.strictEqual(tc('We will ship it.', 'Actually we decided to delay the whole shipment until next quarter.'), '', '너무 길면 후보 아님');

// ---- 참여자, 회의 정보, 내 목소리 ----
const V = new Function(src + '; return { splitPeople, parsePeople, mergePeople, peopleForMeeting, nameTerms, meetingContextText, muEncode, muDecode, resamplePcm, createVoiceMap, mapVoiceTokens, relabelVoice, createCore, processTokens };')();
assert.deepStrictEqual(V.splitPeople('John Smith (Acme, 구매), Sarah Lee\nTom'), ['John Smith (Acme, 구매)', 'Sarah Lee', 'Tom'], '괄호 안 쉼표는 나누지 않음');
assert.deepStrictEqual(V.parsePeople('John Smith (Acme 구매팀장)\nSarah Lee - 법무\njohn smith\n- 김민수'),
  [{ name: 'John Smith', note: 'Acme 구매팀장' }, { name: 'Sarah Lee', note: '법무' }, { name: '김민수', note: '' }], '이름·설명, 같은 이름은 한 번');
assert.strictEqual(V.mergePeople('John Smith (Acme)', 'john smith, Tom Baker'), 'John Smith (Acme)\nTom Baker', '새 사람만 더함');
assert.strictEqual(V.mergePeople('John Smith', 'John Smith'), 'John Smith', '바뀐 것 없으면 그대로');
const info = { topic: '납기 조정', packTopic: '공급 계약', people: 'Tom Baker, John Smith', packPeople: 'John Smith (Acme 구매)\n박지훈 (우리 팀)', brief: '작년 계약 갱신', facts: '납기 6주\n상한 5%', myName: '김민수', myNames: 'Minsu, Mr. Kim' };
const pm = V.peopleForMeeting(info);
assert.deepStrictEqual(pm.now.map((x) => x.name + '/' + x.note), ['Tom Baker/', 'John Smith/Acme 구매'], '이번 회의 참여자 + 폴더의 설명');
assert.deepStrictEqual(pm.all.map((x) => x.name), ['Tom Baker', 'John Smith', '박지훈']);
assert.deepStrictEqual(V.nameTerms(info), ['Tom Baker', 'John Smith', 'Minsu', 'Mr. Kim'], '로마자 이름만 받아 적기 용어로');
const ctxText = V.meetingContextText(info, 1500);
console.log('회의 정보:\n' + ctxText);
assert(/^Meeting topic: 납기 조정\nSeries topic: 공급 계약\nParticipants: Tom Baker; John Smith \(Acme 구매\); 박지훈 \(우리 팀\)\nListener \(me\): 김민수/.test(ctxText));
assert(/Background: 작년 계약 갱신\nKnown facts: 납기 6주; 상한 5%$/.test(ctxText));
assert.strictEqual(V.meetingContextText({}, 100), '', '아무것도 없으면 빈 글');
assert(V.meetingContextText(info, 40).length <= 40);
// μ-law: 되돌렸을 때 오차가 작다
const pcm = new Int16Array(1600).map((_, i) => Math.round(Math.sin(i / 10) * 12000));
const back = V.muDecode(V.muEncode(pcm));
let maxErr = 0; for (let i = 0; i < pcm.length; i++) maxErr = Math.max(maxErr, Math.abs(back[i] - pcm[i]));
assert(maxErr < 600, 'μ-law 오차 ' + maxErr);
assert.strictEqual(V.resamplePcm(pcm, 16000, 48000).length, 4800);
assert.strictEqual(V.resamplePcm(pcm, 16000, 16000), pcm);
// 내 목소리 구간(앞 3초): 글자·번역은 빼고, 그 화자(2)를 나로 정한다
let vm = V.createVoiceMap(3000, true), vc = V.createCore();
vc.diar = true;
const T = (text, sp, s, extra) => Object.assign({ text, is_final: true, translation_status: 'original', speaker: sp, start_ms: s, end_ms: s + 300 }, extra || {});
const TR = (text, fin) => ({ text, is_final: fin !== false, translation_status: 'translation' });
const feedV = (toks) => { V.processTokens(vc, V.mapVoiceTokens(vm, toks)); for (const b of vc.blocks) if (b.sock === undefined) b.sock = 1; V.relabelVoice(vc, 1, vm); };
feedV([T('Hello', '2', 100), T(' everyone.', '2', 600), T(' Thanks', '2', 1500), T(' for joining.', '2', 2000)]);
assert.strictEqual(vm.me, '2', '내 목소리의 화자'); assert.strictEqual(vc.blocks.length, 0, '내 목소리 구간은 화면에 없음');
feedV([TR('안녕', false)]);
assert.strictEqual(vc.nf.ko, '', '내 목소리 번역(미확정)도 숨김');
feedV([T(' So', '1', 4200), TR('안녕하세요 여러분.'), T(' the', '1', 4500), TR(' 참여해 주셔서'), TR(' 감사합니다.'), T(' price is fixed.', '1', 4800), TR('그래서 가격은 고정입니다.')]);
console.log('voice blocks:', vc.blocks.map((b) => [b.speaker, b.en, b.ko]));
assert.deepStrictEqual(vc.blocks.map((b) => [b.speaker, b.en.trim(), b.ko.trim()]), [['1', 'So the price is fixed.', '그래서 가격은 고정입니다.']], '상대 말과 그 번역만 남음');
feedV([T(' Yes,', '2', 7000), T(' we agree.', '2', 7300)]);
assert.strictEqual(vc.blocks[vc.blocks.length - 1].speaker, 'me', '내 목소리와 같은 화자 = 나');
// 마이크 쪽 소리가 큰 구간의 화자를 나로 (목소리 등록 없이, 'PC 소리 + 내 마이크')
vm = V.createVoiceMap(0, false); vc = V.createCore(); vc.diar = true;
for (let i = 0; i < 100; i++) vm.log.push(i < 50 ? -1 : 1);   // 앞 5초는 컴퓨터 소리, 뒤 5초는 마이크
feedV([T(' Hi', '1', 100), T(' there.', '1', 400), T(' I', '3', 5200)]);
assert.strictEqual(vm.me, null, '아직 모름');
feedV([T(' think', '3', 5600), T(' so.', '3', 6000)]);
assert.strictEqual(vm.me, '3', '마이크가 큰 구간에서 세 번 → 나');
assert.deepStrictEqual(vc.blocks.map((b) => [b.speaker, b.en]), [['1', ' Hi there.'], ['me', ' I think so.']], '앞서 나온 줄도 나로 고치고, 끊긴 문장은 다시 붙임');
feedV([T(' Okay.', '1', 2000)]);
assert.strictEqual(vc.blocks[vc.blocks.length - 1].speaker, '1');
// 토큰에 시각이 없으면(예전 방식) 손대지 않는다
vm = V.createVoiceMap(3000, true);
assert.deepStrictEqual(V.mapVoiceTokens(vm, [{ text: 'a', is_final: true, speaker: '1' }]), [{ text: 'a', is_final: true, speaker: '1' }]);
console.log('CORE TESTS PASSED');
