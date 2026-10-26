// 화면 목록. 각 화면은 앱 전역(S, setMode, nav, openRes, render …)으로 상태를 만든 뒤 렌더한다.
// setup 은 브라우저 안에서 실행되는 함수다(arg 를 받는다).
const A11 = '11112222';   // 홍길동: 제출 + 사후 완료(시드)
const DRAFT = '33334444'; // 작성 중(시드)
const PREONLY = '22223333'; // 사전 제출, 사후 전(시드)

// ---- 참여자 ----
const participant = [
  { id: 'p-login', run: () => { setMode('participant'); } },
  { id: 'p-home-draft', run: id => { setMode('participant'); S.user = byId(id); S.view = 'home'; render(); }, arg: DRAFT },
  ...[0, 1, 2, 3, 4, 5].map(n => ({ id: 'p-wizard-' + (n + 1), run: ({ id, n }) => { setMode('participant'); S.user = byId(id); S.mode2 = 'pre'; S.step = n; S.showMiss = {}; S.view = 'wizard'; render(); }, arg: { id: DRAFT, n } })),
  { id: 'p-wizard-3-missing', run: id => { setMode('participant'); S.user = byId(id); S.mode2 = 'pre'; S.step = 3; S.showMiss = { 3: 1 }; S.view = 'wizard'; render(); }, arg: DRAFT },
  { id: 'p-home-submitted', run: id => { setMode('participant'); S.user = byId(id); S.view = 'home'; render(); }, arg: PREONLY },
  { id: 'p-home-post-done', run: id => { setMode('participant'); S.user = byId(id); S.view = 'home'; render(); }, arg: A11 },
  { id: 'p-locked-wizard', run: id => { setMode('participant'); S.user = byId(id); S.mode2 = 'pre'; S.step = 0; S.view = 'wizard'; render(); }, arg: PREONLY },
  { id: 'p-post-diag', run: id => { setMode('participant'); S.user = byId(id); S.mode2 = 'post'; S.step = 3; S.pstep = 1; S.err = ''; S.view = 'wizard'; render(); }, arg: PREONLY },
  { id: 'p-post-sat', run: id => { setMode('participant'); S.user = byId(id); S.mode2 = 'post'; S.step = 3; S.pstep = 2; S.err = ''; S.view = 'wizard'; render(); }, arg: PREONLY },
];

// ---- 상담사 ----
const counselor = [
  ...['list', 'reg', 'rep'].map(t => ({ id: 'c-tab-' + t, run: t => { setMode('counselor'); S.cc = '102'; S.ctab = t; S.rtab = 'r1'; S.rep.company = '전체'; render(); }, arg: t })),
  { id: 'c-tab-list-han', run: () => { setMode('counselor'); S.cc = '12'; S.ctab = 'list'; render(); } },
  { id: 'c-edit-review', run: id => { setMode('counselor'); S.cc = '102'; openRes(id, 'c', 'cns'); startEdit(id); S.step = 5; render(); }, arg: '90000012' },
];

// ---- 관리자 ----
const admin = [
  ...['p1', 'p2', 'rep', 'ver'].map(t => ({ id: 'a-tab-' + t, run: t => { setMode('admin'); S.tab = t; S.rtab = 'r1'; S.rep.company = '전체'; render(); }, arg: t })),
];

// ---- 고객사 ----
const client = [
  { id: 'm-login', run: () => { setMode('client'); } },
  ...[['e1', 'cm1001', '한지원'], ['e2', 'cm1002', '오세훈'], ['e4', 'cm9999', '빈 기업']].map(([e, id, n]) => ({ id: 'm-dash-' + e, run: a => { S.mgr = { ent: a[0], id: a[1], n: a[2] }; setMode('client'); }, arg: [e, id, n] })),
];

// ---- 사전사후 보고서 9화면(관리자 전체 기업) + 상담사 1화면 ----
const reports = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ id: 'rep-r' + n, run: n => { setMode('admin'); S.tab = 'rep'; S.rep.company = '전체'; S.rtab = 'r' + n; S.rdir = 0; render(); }, arg: n })),
  { id: 'rep-r1-han', run: () => { setMode('admin'); S.tab = 'rep'; S.rep.company = '㈜한빛전자'; S.rtab = 'r1'; S.rdir = 0; render(); } },
  { id: 'rep-c-r1', run: () => { setMode('counselor'); S.cc = '102'; S.ctab = 'rep'; S.rep.company = '전체'; S.rtab = 'r1'; S.rdir = 0; render(); } },
];

// ---- 결과 보고서(3쪽 내담자용 · 5쪽 상담사용) ----
// png: 캡처 이미지까지 보관하는 대표 사례. 나머지는 HTML·JSON·인쇄 쪽수만 보관한다.
const RES = [
  ['hong', A11, true], ['area-a', '90000001'], ['area-b', '90000002'], ['area-c', '90000003'], ['area-d', '90000004'], ['area-e', '90000005'],
  ['tie-ab', '90000006'], ['tie-ce', '90000007'], ['star', '90000008', true], ['min', '90000009'], ['etc', '90000010'], ['post', '90000011'],
  ['history', '90000012', true], ['alltie', '90000013'], ['max', '90000014'], ['hanbit', '90000015'], ['seed-bada', '55556666'],
];
const results = RES.flatMap(([k, id, png]) => ['p', 'c'].map(role => ({
  id: `res-${role}-${k}`, print: true, png: !!png && (k === 'hong' || (k === 'star' && role === 'p') || (k === 'history' && role === 'c')),
  run: ({ id, role }) => {
    if (role === 'c') { setMode('counselor'); S.cc = (byId(id).counselor) || '102'; openRes(id, 'c', 'cns'); }
    else { setMode('admin'); S.from = 'admin'; S.res = { id, role: 'p' }; S.prevEnt = null; nav('result'); }
  }, arg: { id, role },
})));

export const SCENES = [...participant, ...counselor, ...admin, ...client, ...reports, ...results].map(s => ({ png: s.png !== undefined ? s.png : true, ...s }));
