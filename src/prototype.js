import {CMT} from './data/feedback-comments.js';
import {KW_AGE,KW_GOAL,KW_PRO,GOAL_TO_KW} from './data/feedback-keywords.js';
import {QUESTION_STEPS,QUESTION_DEFS,qdByPath,qdText,qdRequired,qdOptions,qdMax,qdStepCodes,qdFactors} from './js/00-question-defs-module.js';
import {AREAS,FACTORS} from './js/01-areas.js';
import {AREA_COUNT,ITEMS_PER_AREA,SCALE_MIN,SCALE_MAX,SCORE_MAX,ITEM_COUNT,RAW_MIN,RAW_MAX,AREA_IDX,toScore,GRADE_TICKS,BAL_Y_TICKS,BAL_Y_LEVELS,COMPARE_SETS,ACTIVE_COMPARE,REF_AVG,EVAL_VERSION,GRADE_SETS,ACTIVE_GRADE,GRADE_NAMES,gradeBy,gradeOf,gradeUnsure,gradeTxt,UNSURE_NOTE,SCALE} from './js/02-eval-config.js';
import {COUNSELORS,setCounselors,OPT,LIM,demoD36,demoSat} from './js/03-options.js';
import {esc,today,sum,areaScores,lowestArea} from './js/04-util.js';
import {rawSums,commentArea,ageBand,rint,resKey,computeResult,resolveResult,recomputeResultCore,cmtParts,full,getPath,setPath} from './js/05-engine.js';
import {$,toast,copyText} from './browser/dom.js';
import {S} from './shared/state.js';
import {createUI} from './shared/ui.js';
import {createSurvey} from './roles/participant/survey.js';
import {createProfile} from './shared/profile.js';
import {createCounselorEdit} from './shared/counselor-edit.js';
import {installLegacyGlobals} from './js/06-legacy-globals.js';

/* ---------- 데이터 ---------- */
const KEY='sp-demo-v5';
function emptyP(o){return Object.assign({id:'',pw:'',nick:'',company:'',counselor:null,reg:{careers:[{},{},{}],consent:false},goal:{},pre:Array(ITEM_COUNT).fill(null),post:null,expect:{},done:{reg:false,goal:false,expect:false},preDate:null,postDate:null,created:today()},o||{})}
function seed(){
  const L=[];
  const ex=(i)=>({d32:[OPT['expect.d32'][i%6]],d33:[OPT['expect.d33'][i%7],OPT['expect.d33'][(i+2)%7],OPT['expect.d33'][(i+4)%7]],d34:[OPT['expect.d34'][i%6]],d35:[OPT['expect.d35'][i%5],OPT['expect.d35'][(i+1)%5]],d36:demoD36(i)});
  const gl=(i)=>({b11:[OPT['goal.b11'][i%5]],b12:[OPT['goal.b12'][(i+1)%5]],b13:[OPT['goal.b13'][i%7],OPT['goal.b13'][(i+1)%7]],b14:[OPT['goal.b14'][i%6]],b15:String(40+(i*5)%61),b16:String(2+i)});
  let em=0;
  // 제출 완료 데모 데이터도 현재 필수 항목(생년월일·이메일·직급·업무·업종·기대소득·동의)을 모두 갖추도록 구성
  const rg=(name,g,b,co)=>{const k=(+b||0)+(++em);return {name,gender:g,birth:b,birthDate:b?b+'-06-15':'',phone:'',email:'demo'+em+'@example.com',addr:'',edu:'',major:'',careers:[{co,dept:'',title:['사원','대리','과장','차장','부장'][k%5],task:['영업 지원','생산 관리','인사 총무','재무 회계','연구 개발'][k%5],yrs:''},{},{}],industry:OPT['reg.industry'][k%11],income:OPT['reg.income'][k%4],a1:'동의',consent:true}};
  L.push(emptyP({id:'11112222',pw:'123456',nick:'길동',company:'다이소',counselor:'102',
    reg:{name:'홍길동',gender:'남',birth:'1975',birthDate:'1975-03-15',a1:'동의',phone:'010-1111-2222',email:'hong123@gildong.com',addr:'경기도 부천시',edu:'대학원(석사)',major:'전자공학(학사)',
      careers:[{co:'다이소',dept:'개발지원팀',title:'책임연구원(차장급)',task:'특허/지식재산권(IP) 관리',yrs:'12년 7개월'},{},{}],totalYears:'12년 7개월',salary:'',
      goal1:'동일 업종 동일 직무',goal2:'동일 업종 다른 직무',reason:'일을 쉬고 싶지 않아서',region:'서울, 경기',wage:'4천만 원대',certs:'',computer:'',lang:'',hobby:'',consent:true,industry:'연구/기술(R&D)',income:'기존 임금 80% 수준'},
    goal:{b11:['퇴직 후 3개월 이내'],b12:['몇 가지 안을 고민 중'],b13:['동일 업종 재취업','다른 업종 재취업'],b14:['경력과 연관성이 있음'],b15:'80',b16:'2'},
    pre:[3,4,4,4,4,4,4,4,3,3,4,4,4,4,3],post:[4,4,4,4,5,4,4,4,4,4,4,4,4,5,4],sat:demoSat(0),
    expect:{d32:['잘 될 것이라고 믿는다.'],d33:['수입감소 등 경제적 상황','역할이나 활동영역의 축소','상대적으로 많아진 시간에 대한 활용'],d34:['재취업(채용전략부터 입사까지) 지원'],d35:['진로에 대한 불확실성','목표에 대한 확신의 부족'],d36:['자신의 상황에 맞는 컨설팅 방향설정','성격검사를 활용한 자기분석의 시간']},
    done:{reg:true,goal:true,expect:true},preDate:'2023-01-11',postDate:'2023-03-02'}));
  const more=[
    ['한솔','22223333','다이소','102','이한솔','여','1978',[3,3,2,3,3,2,3,3,2,2,3,3,3,3,3],null,1],
    ['미래','33334444','㈜한빛전자','12','박미래','남','1972',null,null,2],
    ['노을','44445555','㈜한빛전자','12','',' ','',null,null,0],
    ['바다','55556666','대한제약','27','최바다','남','1970',[2,3,3,3,2,3,2,3,3,3,2,3,2,3,3],[3,4,3,4,3,4,3,4,4,4,3,4,3,4,4],3],
    ['초록','66667777','대한제약','27','정초록','여','1976',[4,4,5,4,3,4,4,4,4,4,5,4,5,4,4],null,4],
    ['하늘','77778888','다이소','102','','','',null,null,0],
    ['은하','88889999','㈜한빛전자','102','오은하','여','1974',[3,2,3,2,2,3,3,2,3,2,3,2,3,3,2],null,5]
  ];
  more.forEach(([nick,id,co,cc,name,g,b,pre,post,i])=>{
    const p=emptyP({id,pw:String(100000+i*111111).slice(0,6),nick,company:co,counselor:cc});
    if(name){p.reg=rg(name,g.trim(),b,co);p.reg.phone='010-'+id.slice(0,4)+'-'+id.slice(4);p.done.reg=true}
    if(pre){p.goal=gl(i);p.done.goal=true;p.pre=pre;p.preDate='2026-10-0'+(1+i%8);p.expect=ex(i);p.done.expect=true}
    else if(name){p.goal=gl(i);p.done.goal=true}
    if(post){p.post=post;p.postDate='2026-10-15';p.sat=demoSat(i)}
    L.push(p);
  });
  const cosList={'다이소':['102'],'㈜한빛전자':['12','102'],'대한제약':['27']},cnm=['다이소','㈜한빛전자','대한제약'];
  const sn=['김','이','박','최','정','강','조','윤','장','임'],gn=['민수','서연','지훈','하은','도윤','수빈','예준','지아','현우','소율','준서','유진'],wd=['햇살','바람','구름','노을','파도','단풍','새벽','소나무','별빛','이슬'];
  for(let i=0;i<46;i++){
    const co=cnm[i%3],cs=cosList[co],cc=cs[i%cs.length],id=String(30000000+i*7771),k=i%5;
    const p=emptyP({id,pw:String(100000+i*7919).slice(0,6),nick:wd[i%10]+(i+1),company:co,counselor:cc});
    if(k>0){const name=sn[i%10]+gn[(i*5)%12];p.reg=rg(name,i%2?'남':'여',String(1965+i%15),co);p.reg.phone='010-'+id.slice(0,4)+'-'+id.slice(4);p.done.reg=true;p.goal=gl(i);p.done.goal=true}
    if(k>=2){p.pre=Array.from({length:ITEM_COUNT},(_,j)=>((i*7+j*3)%4)+2);p.expect=ex(i);p.done.expect=true;p.preDate='2026-10-'+String(1+i%19).padStart(2,'0')}
    if(k===3){p.post=p.pre.map(v=>Math.min(5,v+((i+v)%2)));p.postDate='2026-10-20';p.sat=demoSat(i+7)}
    L.push(p);
  }
  return L;
}
function seedEnt(){
  const m=(code,n,mail,tel)=>({code,n,mail,tel});
  // 화면 검증용 가상 상담사 (실제 인물·연락처 아님)
  const a=m('102','가상상담사 A','counselor-a@example.com','010-0000-0102'),b=m('12','가상상담사 B','counselor-b@example.com','010-0000-0012'),c=m('27','가상상담사 C','counselor-c@example.com','010-0000-0027');
  return [
    {id:'e1',name:'다이소',start:'2026-09-01',end:'2026-12-31',logo:'',pm:{n:a.n,mail:a.mail,tel:a.tel},consultants:[a]},
    {id:'e2',name:'㈜한빛전자',start:'2026-09-15',end:'2027-01-31',logo:'',pm:{n:b.n,mail:b.mail,tel:b.tel},consultants:[b,a]},
    {id:'e3',name:'대한제약',start:'2026-10-01',end:'2027-03-31',logo:'',pm:{n:c.n,mail:c.mail,tel:c.tel},consultants:[c]},
    {id:'e4',name:'㈜새봄물산',start:'2026-11-01',end:'2027-02-28',logo:'',pm:{n:a.n,mail:a.mail,tel:a.tel},consultants:[]},
    ...['가온정밀','나래식품','다온물류','라온소프트','마루건설','바른제약','새길산업','아람전자'].map((n,i)=>({id:'e'+(5+i),name:n,start:'2026-12-01',end:'2027-05-31',logo:'',pm:{n:b.n,mail:b.mail,tel:b.tel},consultants:[]}))
  ];
}
let DB,ENT;
try{const r=JSON.parse(localStorage.getItem(KEY));if(r&&Array.isArray(r.db)&&r.db.length&&Array.isArray(r.ent)){DB=r.db;ENT=r.ent}}catch(e){}
if(!DB){ENT=seedEnt();DB=seed()}
const DEFMG={e1:[{id:'cm1001',pw:'246810',n:'한지원',mail:'jiwon@example.com',tel:'010-5555-0101',created:'2026-09-01'}],e2:[{id:'cm1002',pw:'135790',n:'오세훈',mail:'sehun@example.com',tel:'010-5555-0102',created:'2026-09-15'}],e3:[{id:'cm1003',pw:'112233',n:'배수진',mail:'sujin@example.com',tel:'010-5555-0103',created:'2026-10-01'}]};
DB.forEach((p,k)=>{if(full(p.post)&&!p.sat&&(p.id==='11112222'||p.id==='55556666'||/^30[0-3]\d{5}$/.test(p.id)))p.sat=demoSat(k)});
DB.forEach((p,k)=>{if(p.sat&&!p.sat._v2&&(p.id==='11112222'||p.id==='55556666'||/^30[0-3]\d{5}$/.test(p.id))){p.sat.q7txt=demoSat(k).q7txt;p.sat._v2=1}});
DB.forEach((p,k)=>{if(p.expect&&p.expect.d36&&!p.expect._v2&&p.id!=='11112222'&&(p.id==='55556666'||p.id==='22223333'||p.id==='66667777'||p.id==='88889999'||p.id==='33334444'||/^30[0-3]\d{5}$/.test(p.id))){p.expect.d36=demoD36(k);p.expect._v2=1}});
ENT.forEach(e=>{if(!Array.isArray(e.managers))e.managers=(DEFMG[e.id]||[]).map(m=>Object.assign({},m))});
function save(){try{localStorage.setItem(KEY,JSON.stringify({ent:ENT,db:DB}))}catch(e){}}
function resultOf(p){const {result,updated}=resolveResult(p);if(updated){p.result=result;save()}return result}
const byId=id=>DB.find(p=>p.id===id);
const pname=p=>p.reg&&p.reg.name?p.reg.name:p.nick;
function regOK(p){const r=p.reg||{};return !!(r.name&&r.gender&&r.birth&&r.phone&&r.consent)}
function goalOK(p){const g=p.goal||{};return !!(g.b11&&g.b11.length&&g.b12&&g.b12.length&&g.b13&&g.b13.length&&g.b14&&g.b14.length&&g.b15&&g.b16)}
function expOK(p){const e=p.expect||{};return !!(e.d32&&e.d32.length&&e.d33&&e.d33.length===3&&e.d34&&e.d34.length&&e.d35&&e.d35.length===2&&e.d36&&e.d36.length)}
function steps(p){return [p.done.reg&&regOK(p),p.done.goal&&goalOK(p),full(p.pre),p.done.expect&&expOK(p)]}
function status(p){
  const s=steps(p),n=s.filter(Boolean).length;
  if(full(p.post))return {k:'post',t:'사후 완료',n};
  if(n===4)return {k:'pre',t:'사전 완료',n};
  if(n>0)return {k:'prog',t:'진행 중 '+n+'/4',n};
  return {k:'new',t:'미시작',n};
}
const preDone=p=>steps(p).every(Boolean);
const linkOf=p=>location.href.split('#')[0].split('?')[0]+'#join-'+p.id;

/* ---------- 상태 ---------- */
const {render,nav,setMode,goHome}=createUI({vLogin,vHome,vWizard,vResult,vForm,vAdmin,vCns,vClogin,vCdash,abortEdit:(...args)=>abortEdit(...args)});
function chips(path){
  const sel=getPath(S.user,path)||[];const max=LIM[path]||1;
  return '<div class="chips">'+OPT[path].map((o,i)=>{const k=sel.indexOf(o);return `<button type="button" class="chip ${k>=0?'on':''}" aria-pressed="${k>=0}" onclick="toggleChip('${path}',${i})">${max>1&&k>=0?'<b>'+(k+1)+'</b>':''}${esc(qLabel(path,i,o))}</button>`}).join('')+'</div>';
}

/* ---------- 참여자: 로그인 ---------- */
function vLogin(){
  return `<section class="hero"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>${forestSVG('hf',300)}
  <div class="wrap"><div class="hero-grid"><div>
    <div class="pill">Good life, Good Work</div>
    <h1>퇴직 이후, 나는<br><span class="hl">얼마나 준비됐을까요?</span></h1>
    <p class="lead">5가지 영역으로 현재의 퇴직준비도를 진단하고, 상담에서 무엇을 기대하는지 미리 알려 주세요. 결과는 상담 시간에 담당 상담사가 직접 설명해 드립니다. 상담이 끝난 뒤 같은 진단으로 변화도 비교합니다.</p>
    <div class="flow-mini"><span>1. 참여 동의·기본정보</span><span>2. 경력목표</span><span>3. 진단 15문항</span><span>4. 서비스 기대·검토 후 제출</span></div>
    <div class="hint">⊙ 총 36문항 · 소요시간 5~7분 · 결과는 상담에 참여하실 때 상담사가 지면으로 전달합니다</div>
  </div>
  <form class="card" onsubmit="event.preventDefault();doLogin()" autocomplete="off">
    <h2>진단 시작하기</h2><p class="sub">연락처 8자리가 아이디가 됩니다. 예: 010-1111-2222 → 11112222</p>
    <div class="field"><label for="lg-nick">닉네임 <span class="req">*</span></label><input class="in" id="lg-nick" maxlength="12" placeholder="상담에서 부를 이름"></div>
    <div class="field"><label for="lg-id">연락처 8자리 (아이디) <span class="req">*</span></label><input class="in" id="lg-id" inputmode="numeric" maxlength="8" placeholder="11112222" value="${esc(S.prefill)}"></div>
    <div class="field"><label for="lg-co">기업명 <span class="req">*</span></label><input class="in" id="lg-co" maxlength="30" placeholder="최근 근무한 기업"></div>
    <div class="field"><label for="lg-pw">비밀번호 6자리 <span class="req">*</span></label><input class="in" id="lg-pw" type="password" inputmode="numeric" maxlength="6" placeholder="숫자 6자리"></div>
    <div class="err" id="lg-err">${esc(S.err)}</div>
    <button class="btn block" type="submit">진단 시작</button>
    <p class="hintline" style="margin-top:12px">체험해 보려면 닉네임 길동 · 11112222 · 다이소 · 123456 으로 로그인해 보세요. (제출 완료 상태의 샘플 계정입니다)</p>
  </form></div></div></section>`;
}
function doLogin(){
  const nick=$('#lg-nick').value.trim(),id=$('#lg-id').value.trim(),co=$('#lg-co').value.trim(),pw=$('#lg-pw').value.trim();
  const fail=m=>{S.err=m;$('#lg-err').textContent=m};
  if(!nick||!co)return fail('닉네임과 기업명을 입력해 주세요.');
  if(!/^\d{8}$/.test(id))return fail('연락처는 숫자 8자리로 입력해 주세요.');
  if(!/^\d{6}$/.test(pw))return fail('비밀번호는 숫자 6자리로 입력해 주세요.');
  let p=byId(id);
  if(p){ if(p.pw!==pw)return fail('비밀번호가 맞지 않습니다. 상담사에게 받은 번호를 확인해 주세요.'); if(!p.nick)p.nick=nick; if(!p.company)p.company=co; }
  else{ p=emptyP({id,pw,nick,company:co,counselor:null}); DB.push(p); }
  save();S.user=p;S.prefill='';S.step=nextStep(p);S.mode2='pre';S.view=isSubmitted(p)?'home':'wizard';render();window.scrollTo(0,0);
}
function nextStep(p){if(!agreed(p)||!String(p.counselor||'').trim())return 0;if(!(p.done.reg&&regOK(p)))return 1;if(!p.done.goal)return 2;if(!full(p.pre))return 3;if(!expOK(p))return 4;return 5}
function logout(){S.user=null;nav('login')}

/* ---------- 참여자: 홈 ---------- */
function vHome(){
  const p=S.user,sub=isSubmitted(p),c=COUNSELORS[p.counselor];
  const badge=full(p.post)?'<span class="badge-s s-post">사후 진단 완료</span>':sub?'<span class="badge-s s-pre">제출 완료</span>':'<span class="badge-s s-prog">작성 중</span>';
  const cur=sub?WSTEPS.length:nextStep(p);
  let body;
  if(sub){
    body=`<div class="done-box"><b>응답이 제출되었습니다.</b><p>진단 결과는 상담에 참여하실 때 담당 상담사가 직접 설명하고 지면으로 전달해 드립니다. 제출한 응답은 상담사만 수정할 수 있습니다.</p>
      ${c?`<p class="hintline" style="margin-top:8px">담당 상담사 ${esc(c.n)} · ${esc(c.tel)} · ${esc(c.mail)}</p>`:''}</div>`;
  }else{
    body=stepper(cur,false);
  }
  return `<div class="narrow" style="padding-top:34px"><div class="card">
    ${badge}
    <h2 style="margin-top:10px">${esc(p.nick)}님, 안녕하세요</h2>
    <p class="sub">${esc(p.company)} · 아이디 ${esc(p.id)}</p>
    ${body}
    <div class="acts" style="gap:10px;margin-top:16px">
      ${!sub?`<button class="btn" onclick="S.step=nextStep(S.user);S.mode2='pre';nav('wizard')">${cur>0?'이어서 진행하기':'설문 시작하기'}</button>`:''}
      ${sub&&!full(p.post)?`<button class="btn mint" onclick="S.mode2='post';S.step=3;S.pstep=1;nav('wizard')">사후 진단 시작</button>`:''}
      <button class="btn ghost" onclick="logout()">나가기</button>
    </div>
    ${full(p.post)?'<p class="hintline" style="margin-top:14px">사후 진단까지 제출했습니다. 사전·사후 변화는 상담사가 안내해 드립니다.</p>':''}
  </div></div>`;
}

/* ---------- 참여자: 진단 마법사 ---------- */
/* ---------- 참여자: 진단 (구현 지시서 v2.3 기준) ---------- */
// 설문 화면 문구 = 원본 [문항] 시트 원문. 저장값·보고서 문구 = OPT([문항내용] 시트) — 원본 엑셀과 같은 구조
const QT=qdText();
// [문항] 시트 보기 문구 (설문 화면 표시용). 없는 항목은 OPT 문구를 그대로 표시
const QLABEL={
 'goal.b12':qdOptions('goal.b12','screen'),
 'goal.b13':qdOptions('goal.b13','screen'),
 'goal.b14':qdOptions('goal.b14','screen'),
 'expect.d32':qdOptions('expect.d32','screen'),
 'expect.d34':qdOptions('expect.d34','screen'),
 'expect.d35':qdOptions('expect.d35','screen'),
 'reg.industry':qdOptions('reg.industry','screen'),
 'reg.income':qdOptions('reg.income','screen')
};
const qLabel=(path,i,o)=>(QLABEL[path]&&QLABEL[path][i])||o;
// 문항별 필수 여부 — 현재 버전은 전 문항 + 연락처·이메일 필수 (사용자 합의). 추후 false로 바꾸면 검증에서 제외
const REQUIRED=qdRequired();
const QNO=c=>c==='PH'||c==='EM'?'':String(+c.slice(1));
const C_CODES=qdStepCodes(3);
const WSTEPS=[
 {t:QUESTION_STEPS[0],codes:qdStepCodes(0)},
 {t:QUESTION_STEPS[1],codes:qdStepCodes(1)},
 {t:QUESTION_STEPS[2],codes:qdStepCodes(2)},
 {t:QUESTION_STEPS[3],codes:C_CODES},
 {t:QUESTION_STEPS[4],codes:qdStepCodes(4)},
 {t:QUESTION_STEPS[5],codes:qdStepCodes(5)}
];
const stepOf=code=>WSTEPS.findIndex(s=>s.codes.includes(code));

/* 입력 형식 */
function fmtPhone(v){const d=String(v).replace(/\D/g,'').slice(0,11);if(d.length<4)return d;if(d.length<8)return d.slice(0,3)+'-'+d.slice(3);return d.slice(0,3)+'-'+d.slice(3,d.length-4)+'-'+d.slice(-4)}
function fmtDate(v){const d=String(v).replace(/\D/g,'').slice(0,8);return d.length>6?d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6):d.length>4?d.slice(0,4)+'-'+d.slice(4):d}
function parseBirth(v){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||''));if(!m)return null;const y=+m[1],mo=+m[2],d=+m[3],dt=new Date(y,mo-1,d);if(dt.getFullYear()!==y||dt.getMonth()!==mo-1||dt.getDate()!==d)return null;if(y<1900||dt>new Date())return null;return {y,mo,d}}
// 만 나이: 표시 전용. 원본 평가(인생키워드)는 응답연도-출생연도를 사용하며 섞지 않는다
function manAge(b){if(!b)return null;const t=new Date();let a=t.getFullYear()-b.y;if(t.getMonth()+1<b.mo||(t.getMonth()+1===b.mo&&t.getDate()<b.d))a--;return a}
const PHONE_RE=/^01[016789]-\d{3,4}-\d{4}$/,EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const agreed=p=>!!p.reg&&(p.reg.a1==='동의'||(p.reg.a1==null&&p.reg.consent===true));
const isSubmitted=p=>p.status==='submitted'||(p.status==null&&preDone(p));
const {setF,setCareer,toggleChip,answer,missing,goStep,goQ,nextFrom,submitPre,toSat,satOK,setSat,finishPost,setConsent,setBirth}=createSurvey({save,render,nav,toast,getPath,setPath,OPT,LIM,ITEM_COUNT,REQUIRED,stepOf,agreed,parseBirth,PHONE_RE,EMAIL_RE,C_CODES,full,today,computeResult,EVAL_VERSION,ageMsg});

/* 검증: 누락·오류 문항 목록 (단계 순서) */
const TOTAL_Q=Object.keys(QT).length;

/* 공통 입력 컴포넌트 */
function inp(path,label,opt){
  opt=opt||{};const v=getPath(S.user,path)||'';
  return `<div class="field"><label>${label}${opt.req?' <span class="req">*</span>':''}</label><input class="in" ${opt.ph?`placeholder="${esc(opt.ph)}"`:''} ${opt.mode?`inputmode="${opt.mode}"`:''} ${opt.max?`maxlength="${opt.max}"`:''} value="${esc(v)}" oninput="setF('${path}',this.value)"></div>`;
}
const etcOf=(r,k)=>r[k]==='기타'&&r[k+'Etc']?r[k+'Etc']:(r[k]||'');
function selEtc(path,label,opts,req){const v=getPath(S.user,path)||'',ev=getPath(S.user,path+'Etc')||'';return `<div class="field"><label>${label}${req?' <span class="req">*</span>':''}</label><select class="in" onchange="setF('${path}',this.value);render()"><option value="">선택</option>${opts.map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select>${v==='기타'?`<input class="in" style="margin-top:6px" maxlength="40" placeholder="기타 내용을 입력해 주세요" value="${esc(ev)}" oninput="setF('${path}Etc',this.value)">`:''}</div>`}
function sel(path,label,opts,req){
  const v=getPath(S.user,path)||'';
  return `<div class="field"><label>${label}${req?' <span class="req">*</span>':''}</label><select class="in" onchange="setF('${path}',this.value)"><option value="">선택</option>${opts.map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
}
// 단일 선택(문자열 저장) — A4, A9, A10
function rchips(path,vals,labels,etc){
  const v=getPath(S.user,path)||'';
  let h='<div class="chips" role="radiogroup">'+vals.map((o,i)=>`<button type="button" role="radio" class="chip ${v===o?'on':''}" aria-checked="${v===o}" onclick="setF('${path}',${JSON.stringify(o).replace(/"/g,'&quot;')});render()">${esc(labels?labels[i]:o)}</button>`).join('')+'</div>';
  if(etc&&v==='기타')h+=`<input class="in" style="margin-top:10px" maxlength="40" placeholder="기타 내용을 입력해 주세요" value="${esc(getPath(S.user,path+'Etc')||'')}" oninput="setF('${path}Etc',this.value)" aria-label="기타 내용">`;
  return h;
}
// 문항 블록: 원문 질문 + 누락 표시
function qb(code,inner,hint){
  const m=(S.showMiss&&S.showMiss[stepOf(code)])?missing(S.user).find(x=>x.code===code):null;
  return `<div class="q ${m?'miss':''}" id="q-${code}"><div class="qt"><small>${QNO(code)?'문항 '+QNO(code):'추가 항목'}${REQUIRED[code]!==false?' · 필수':''}</small>${esc(QT[code])}</div>${hint?`<div class="hintline" style="margin:-6px 0 10px">${hint}</div>`:''}${inner}${m?`<div class="qerr" role="alert">${esc(m.msg)}</div>`:''}</div>`;
}

/* 단계 표시 */
function stepper(cur,only3){
  if(only3)return '';
  return '<div class="stepper">'+WSTEPS.map((s,i)=>`<div class="st ${cur===i?'on':''} ${cur>i?'done':''}"><i>${cur>i?'✓':i+1}</i>${s.t}</div>`).join('')+'</div>';
}
function wHead(n,title,sub){
  const done=TOTAL_Q-missing(S.user).length;
  return `<div class="whead"><span class="hintline">${n+1} / ${WSTEPS.length} 단계 · 전체 ${done} / ${TOTAL_Q} 응답</span><h2>${title}</h2>${sub?`<p class="sub">${sub}</p>`:''}<div class="progressbar"><span style="width:${done/TOTAL_Q*100}%"></span></div></div>`;
}
function wNav(n,nextLabel){
  return `<div class="acts" style="justify-content:space-between;margin-top:14px">${n>0?`<button class="btn ghost" onclick="goStep(${n-1})">이전</button>`:'<span></span>'}<button class="btn" onclick="nextFrom(${n})">${nextLabel}</button></div>`;
}

function vWizard(){
  const p=S.user,post=S.mode2==='post';
  if(!post&&isSubmitted(p)&&!S.cedit)return `<div class="narrow" style="padding-top:34px"><div class="card"><h2>응답이 제출되어 수정할 수 없습니다</h2><p class="sub" style="margin-top:8px">제출한 응답은 담당 상담사만 수정할 수 있습니다. 고칠 내용이 있으면 상담사에게 요청해 주세요.</p><div class="acts" style="margin-top:16px"><button class="btn" onclick="nav('home')">처음 화면으로</button></div></div></div>`;
  let body='';
  if(post)body=S.pstep===2?wSat():wDiag(true);else body=[wConsent,wReg,wGoal,wDiagPre,wExpect,wReview][S.step]();
  return `<div class="narrow" style="padding-top:20px">${S.cedit?`<div class="editbar">상담사 수정 모드 · ${esc(pname(p))} (데모 전용 전환이며 실제 권한 분리가 아닙니다)</div>`:''}${stepper(S.step,post)}<div class="card">${body}</div></div>`;
}
function wConsent(){
  const p=S.user,r=p.reg,c=COUNSELORS[p.counselor];
  const a2=c?`<div class="ro">${esc(p.counselor)} <span class="hintline">· ${esc(c.n)} 상담사 (초대 링크에서 자동 입력)</span></div>`
    :`<input class="in" maxlength="20" value="${esc(p.counselor||'')}" oninput="setF('counselor',this.value.trim());a2Hint(this.value.trim())" aria-label="상담코드"><div class="hintline" id="a2-hint" style="margin-top:6px">${a2Msg(p.counselor)}</div>`;
  return wHead(0,'참여 동의','세컨플래닝은 첫 상담 전에 응답하는 사전 설문입니다. 응답 결과는 상담 시간에 담당 상담사가 직접 설명해 드립니다.')
  +qb('A1',`<div class="cons" style="margin-bottom:12px"><b>개인정보수집 이용 및 정보제공 동의</b><br>01. 수집 및 이용 목적 : 본인식별정보를 통한 컨설팅 서비스 제공을 위함<br>02. 수집 항목 : 본 서비스 이용을 위한 성명, 주소, 연락처 및 개인이력서 등 개인식별정보<br>03. 보유기간 및 개인정보의 파기 : 신청서 접수일부터 서비스 종료 후 1년 또는 고객사의 즉각적인 파기 요청시 정보를 파기<br>04. 제3자 정보제공 : 취업(또는 창업) 등 다른 기관에 개인정보를 의뢰할 목적일 때, 서비스의 위탁기관에서 수행 결과를 요청<br><span class="hintline">※ 원본 고객등록신청서 문구. 웹 서비스용 법정 고지문은 검토 후 확정 예정</span></div>`
    +`<div class="chips" role="radiogroup">${['동의','미동의'].map(o=>`<button type="button" role="radio" class="chip ${r.a1===o||(o==='동의'&&r.a1==null&&r.consent)?'on':''}" onclick="setConsent('${o}')">${o}</button>`).join('')}</div>`)
  +qb('A2',a2)
  +`<div class="notice-s">입력한 내용은 이 브라우저에만 임시 저장되는 데모입니다. 실제 서비스의 저장 방식과 다릅니다.</div>`
  +wNav(0,'다음 · 기본정보');
}
function a2Msg(v){v=String(v||'').trim();if(!v)return '';const c=COUNSELORS[v];return c?'담당 상담사: '+esc(c.n):'등록된 상담사 코드와 일치하지 않습니다. 코드를 다시 확인해 주세요.'}
function a2Hint(v){const e=document.getElementById('a2-hint');if(e)e.innerHTML=a2Msg(v)}
function wReg(){
  const p=S.user,r=p.reg;r.careers=r.careers||[{},{},{}];r.careers[0]=r.careers[0]||{};
  if(!r.phone&&/^\d{8}$/.test(p.id))r.phone='010-'+p.id.slice(0,4)+'-'+p.id.slice(4);
  if(!r.careers[0].co&&p.company)r.careers[0].co=p.company;
  const age=`<div class="hintline" id="age-a5" style="margin-top:6px">${ageMsg(r.birthDate)}</div>`;
  const ci=(k,ph)=>`<input class="in" maxlength="${k==='task'?60:40}" ${ph?`placeholder="${ph}"`:''} value="${esc(r.careers[0][k]||'')}" oninput="setCareer(0,'${k}',this.value)" aria-label="${k}">`;
  return wHead(1,'기본정보','현재 또는 최근 경력을 기준으로 입력해 주세요.')
  +qb('A3',`<input class="in" maxlength="20" value="${esc(r.name||'')}" oninput="setF('reg.name',this.value)" aria-label="성함">`)
  +qb('A4',rchips('reg.gender',['남','여'],['남성','여성']))
  +qb('A5',`<input class="in" inputmode="numeric" maxlength="10" placeholder="YYYY-MM-DD (예: 1968-03-15)" value="${esc(r.birthDate||'')}" oninput="this.value=fmtDate(this.value);setBirth(this.value)" aria-label="생년월일">${age}`,'생년월일을 입력합니다. (웹 변경 사항)')
  +qb('PH',`<input class="in" inputmode="tel" maxlength="13" placeholder="010-1234-5678" value="${esc(r.phone||'')}" oninput="this.value=fmtPhone(this.value);setF('reg.phone',this.value)" aria-label="휴대전화번호">`,'원본에 없는 웹 추가 항목입니다.')
  +qb('EM',`<input class="in" inputmode="email" maxlength="60" placeholder="name@example.com" value="${esc(r.email||'')}" oninput="setF('reg.email',this.value.trim())" aria-label="이메일">`,'원본에 없는 웹 추가 항목입니다.')
  +qb('A6',ci('co'))+qb('A7',ci('title'))+qb('A8',ci('task','예: 인사팀 채용 업무'))
  +qb('A9',rchips('reg.industry',OPT['reg.industry'],QLABEL['reg.industry'],1))
  +qb('A10',rchips('reg.income',OPT['reg.income'],QLABEL['reg.income'],1))
  +wNav(1,'다음 · 경력목표');
}
function ageMsg(v){const b=parseBirth(v);return b?'만 '+manAge(b)+'세 · 평가용 연령 '+(new Date().getFullYear()-b.y)+'세 (원본 방식: 응답연도-출생연도)':''}
function numIn(path,unit,ph){return `<div class="unit"><input class="in" inputmode="numeric" maxlength="3" placeholder="${ph}" value="${esc(getPath(S.user,path)||'')}" oninput="this.value=this.value.replace(/\\D/g,'');setF('${path}',this.value)" aria-label="${unit}"><span>${unit}</span></div>`}
function wGoal(){
  return wHead(2,'경력목표','퇴직 이후의 계획과 기대를 알려 주세요.')
  +qb('B11',chips('goal.b11'))+qb('B12',chips('goal.b12'))
  +qb('B13',chips('goal.b13'),'1순위부터 차례로 누르세요. 다시 누르면 선택이 취소됩니다.')
  +qb('B14',chips('goal.b14'))
  +qb('B15',numIn('goal.b15','%','0~100'))+qb('B16',numIn('goal.b16','개월','예: 6'))
  +wNav(2,'다음 · 진단 15문항');
}
function wDiagPre(){
  const p=S.user,arr=p.pre,n=arr.filter(v=>v).length,L=['전혀 아니다','아니다','보통','그렇다','매우 그렇다'];
  let h=wHead(3,'커리어플래닝 진단','각 문장이 지금의 나와 얼마나 가까운지 선택해 주세요. 정답은 없습니다.')+`<div class="hintline">${n} / ${ITEM_COUNT} 문항 응답</div>`;
  AREAS.forEach((a,ai)=>{
    h+=`<div class="area-head"><span class="badge">${a.k}</span><span class="hintline">${a.en}</span></div>`;
    [0,1,2].forEach(j=>{const i=ai*3+j,code=C_CODES[i];
      h+=qb(code,`<div class="scale lk" role="radiogroup" aria-label="문항 ${17+i}">${[1,2,3,4,5].map(v=>`<button type="button" role="radio" aria-checked="${arr[i]===v}" class="${arr[i]===v?'on':''}" onclick="answer(${i},${v})"><b>${v}</b><span>${L[v-1]}</span></button>`).join('')}</div>`)});
  });
  return h+wNav(3,'다음 · 서비스 기대');
}
function wExpect(){
  return wHead(4,'서비스 기대','이번 컨설팅에서 기대하는 점을 알려 주세요.')
  +qb('D32',chips('expect.d32'))+qb('D33',chips('expect.d33'),'1순위부터 차례로 누르세요.')+qb('D34',chips('expect.d34'))
  +qb('D35',chips('expect.d35'))+qb('D36',chips('expect.d36'))
  +wNav(4,'다음 · 응답 검토');
}
function ansText(p,code){
  const r=p.reg||{},c0=(r.careers||[])[0]||{},g=p.goal||{},e=p.expect||{};
  const lab=(path,v)=>{const i=OPT[path].indexOf(v);return i>=0?qLabel(path,i,v):v};
  const list=(path,a,rank)=>(a||[]).map((v,i)=>(rank?(i+1)+'순위 ':'')+lab(path,v)).join(', ');
  const tag=(path,v)=>{const i=(OPT[path]||[]).indexOf(v);return v==='기타'?'기타 ('+(r[path.split('.')[1]+'Etc']||'')+')':i>=0?qLabel(path,i,v):v||''};
  if(code[0]==='C'){const v=(p.pre||[])[+code.slice(1)-17];return v?v+' · '+['전혀 아니다','아니다','보통','그렇다','매우 그렇다'][v-1]:''}
  return ({A1:agreed(p)?'동의':r.a1||'',A2:p.counselor||'',A3:r.name,A4:r.gender==='남'?'남성':r.gender==='여'?'여성':'',A5:r.birthDate,PH:r.phone,EM:r.email,A6:c0.co,A7:c0.title,A8:c0.task,
    A9:tag('reg.industry',r.industry),A10:tag('reg.income',r.income),B11:list('goal.b11',g.b11),B12:list('goal.b12',g.b12),B13:list('goal.b13',g.b13,1),B14:list('goal.b14',g.b14),
    B15:g.b15!=null&&g.b15!==''?g.b15+'%':'',B16:g.b16!=null&&g.b16!==''?g.b16+'개월':'',D32:list('expect.d32',e.d32),D33:list('expect.d33',e.d33,1),D34:list('expect.d34',e.d34),D35:list('expect.d35',e.d35),D36:list('expect.d36',e.d36)})[code]||'';
}
function wReview(){
  const p=S.user,m=missing(p);
  let h=wHead(5,'응답 검토','제출 전에 응답을 확인해 주세요. 제출한 뒤에는 직접 수정할 수 없습니다.');
  if(m.length)h+=`<div class="misslist" role="alert"><b>아직 답하지 않았거나 확인이 필요한 항목 ${m.length}개</b>${m.map(x=>`<button type="button" onclick="goQ(${x.step},'${x.code}')">${QNO(x.code)?'문항 '+QNO(x.code):x.code==='PH'?'휴대전화':'이메일'} · ${esc(x.msg)}</button>`).join('')}</div>`;
  WSTEPS.slice(0,5).forEach((s,si)=>{
    h+=`<div class="rv-h"><h3>${si+1}. ${s.t}</h3><button class="btn ghost sm" onclick="goStep(${si})">수정</button></div><dl class="rv">`;
    s.codes.forEach(c=>{const v=ansText(p,c),miss=m.some(x=>x.code===c);h+=`<div class="${miss?'x':''}"><dt>${QNO(c)?QNO(c)+'. ':''}${esc(QT[c])}</dt><dd>${v?esc(v):'<span class="none">미응답</span>'}</dd></div>`});
    h+='</dl>';
  });
  h+=`<div class="notice-s" style="margin-top:16px">제출한 응답과 결과는 담당 상담사에게 전달됩니다. 진단 결과는 상담에 참여하실 때 상담사가 직접 설명하고 지면으로 전달해 드립니다.</div>`;
  return h+`<div class="acts" style="justify-content:space-between;margin-top:14px"><button class="btn ghost" onclick="goStep(4)">이전</button>${S.cedit?`<button class="btn ghost" onclick="cancelEdit()">수정 취소</button><button class="btn" onclick="saveEdit()">수정 저장·재계산</button>`:`<button class="btn" onclick="submitPre()">최종 제출</button>`}</div>`;
}

// 사후 진단 화면 (본부장님 원본 유지)
function wDiag(post){
  const p=S.user;const arr=post?(p.post||Array(ITEM_COUNT).fill(null)):p.pre;const n=arr.filter(v=>v).length;
  const head=post?`<h2>사후 진단</h2><p class="sub">상담을 마친 지금의 생각으로 같은 15문항에 다시 답해 주세요. 사전 결과와 비교됩니다.</p>`:`<h2>3. 퇴직준비도 진단</h2><p class="sub">지금의 나에게 가장 가까운 정도를 골라 주세요. (1 전혀 아니다 ~ 5 매우 그렇다)</p>`;
  let h=head+`<div class="stick"><div class="progressbar"><span style="width:${n/ITEM_COUNT*100}%"></span></div><div class="hintline">${n} / ${ITEM_COUNT} 문항 응답</div></div>`;
  AREAS.forEach((a,ai)=>{
    h+=`<div class="area-head"><span class="badge">${a.k}</span><span class="hintline">${a.en}</span></div>`;
    [0,1,2].forEach(j=>{const i=ai*3+j;h+=`<div class="q"><div class="qt"><small>${i+1} · ${FACTORS[i][0]}</small>${esc(FACTORS[i][1])}</div><div class="scale" role="radiogroup" aria-label="문항 ${i+1}">${[1,2,3,4,5].map(v=>`<button type="button" role="radio" aria-checked="${arr[i]===v}" class="${arr[i]===v?'on':''}" onclick="answer(${i},${v})">${v}</button>`).join('')}</div><div class="scale-legend"><span>${SCALE[0]}</span><span>${SCALE[2]}</span><span>${SCALE[4]}</span></div></div>`});
  });
  h+=`<div class="err" id="w-err">${esc(S.err)}</div><div class="acts" style="justify-content:space-between;margin-top:10px">`;
  if(post)h+=`<button class="btn ghost" onclick="S.mode2='pre';nav('home')">나중에 하기</button><button class="btn mint" onclick="toSat()">다음 · 사후 만족도</button>`;
  else h+=`<button class="btn ghost" onclick="S.step=2;render();window.scrollTo(0,0)">이전</button><button class="btn" onclick="nextFrom(3)">다음 · 컨설팅 기대</button>`;
  return h+'</div>';
}
function wDiag_pre_unused(){}
function scl(key,low,high){const v=(S.user.sat||{})[key];return `<div class="scale" role="radiogroup">${[1,2,3,4,5].map(n=>`<button type="button" role="radio" aria-checked="${v===n}" class="${v===n?'on':''}" onclick="setSat('${key}',${n})">${n}</button>`).join('')}</div><div class="scale-legend"><span>${low}</span><span></span><span>${high}</span></div>`}
function wSat(){
  const t=S.user.sat||{};
  return `<h2>사후 만족도 설문</h2><p class="sub">상담을 마친 지금의 생각을 알려 주세요. 서비스 개선과 보고서에 집계로만 사용됩니다.</p>
  <div class="q"><div class="qt"><small>Q1</small>세컨플래닝 서비스에 대한 전반적인 만족도</div>${scl('q1','매우 불만족','매우 만족')}</div>
  <div class="q"><div class="qt"><small>Q2</small>새로운 경력을 만들어 가는 데 유익했습니까?</div>${scl('q2','전혀 아니다','매우 그렇다')}</div>
  <div class="q"><div class="qt"><small>Q3-1</small>상담 이후 막연한 불안이 줄었다</div>${scl('q3a','전혀 아니다','매우 그렇다')}</div>
  <div class="q"><div class="qt"><small>Q3-2</small>미래에 대한 자신감이 높아졌다</div>${scl('q3b','전혀 아니다','매우 그렇다')}</div>
  <div class="q"><div class="qt"><small>Q3-3</small>마음이 이전보다 안정되었다</div>${scl('q3c','전혀 아니다','매우 그렇다')}</div>
  <div class="q"><div class="qt"><small>Q3-4</small>서비스 이후 현재의 마음 상태는 어떠하십니까?</div>${chips('sat.d32')}</div>
  <div class="q"><div class="qt"><small>Q4</small>서비스 이후 가장 고민되는 부분 3가지를 순서대로 선택해 주세요.</div>${chips('sat.d33')}</div>
  <div class="q"><div class="qt"><small>Q5-1</small>컨설팅에서 가장 도움이 된 부분 한 가지를 선택해 주세요.</div>${chips('sat.d34')}</div>
  <div class="q"><div class="qt"><small>Q5-2</small>컨설팅 전에 기대했던 부분이 충족되었습니까?</div>${scl('q5fit','전혀 아니다','매우 그렇다')}</div>
  <div class="q"><div class="qt"><small>Q6</small>가장 크게 극복된 경력준비 장애요인 (최대 2가지)</div>${chips('sat.d35')}</div>
  <div class="q"><div class="qt"><small>Q7</small>서비스에서 개선이 필요하다고 느낀 점 (최대 2가지)</div>${chips('sat.q7')}<div class="field" style="margin-top:12px"><label for="q7t">더 나은 서비스를 위한 의견·담당 컨설턴트에게 보내는 메시지 (선택)</label><textarea class="in" id="q7t" maxlength="200" oninput="S.user.sat=S.user.sat||{};S.user.sat.q7txt=this.value;save()">${esc(t.q7txt||'')}</textarea></div></div>
  <div class="err">${esc(S.err)}</div>
  <div class="acts" style="justify-content:space-between;margin-top:10px"><button class="btn ghost" onclick="S.pstep=1;S.err='';render();window.scrollTo(0,0)">이전</button><button class="btn mint" onclick="finishPost()">사후 진단 제출</button></div>`;
}

/* ---------- 결과 리포트 ---------- */
function openRes(id,role,from){S.res={id,role};S.from=from||null;S.prevEnt=null;nav('result')}
function chartLegend(items){return '<div class="legend">'+items.map(([c,t])=>`<span><i style="background:var(--${c})"></i>${t}</span>`).join('')+'</div>'}
function barsSVG(series,labels,label){
  const W=640,H=270,pl=34,pb=44,pt=18,pr=10,iw=W-pl-pr,ih=H-pt-pb,gw=iw/labels.length,bw=Math.min(34,(gw-26)/series.length);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
  GRADE_TICKS.forEach(v=>{const y=pt+ih-v/100*ih;s+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" class="grid ${v>0&&v<100?'dash':''}"/><text x="${pl-6}" y="${y+4}" class="axis" text-anchor="end">${Math.round(v)}</text>`});
  labels.forEach((lb,i)=>{const cx=pl+gw*i+gw/2;series.forEach((se,j)=>{const v=se.vals[i];if(v==null)return;const h=v/100*ih,x=cx-(series.length*bw+(series.length-1)*6)/2+j*(bw+6);s+=`<rect x="${x}" y="${pt+ih-h}" width="${bw}" height="${h}" rx="6" class="${se.cls}"/><text x="${x+bw/2}" y="${pt+ih-h-5}" class="val" text-anchor="middle">${v}</text>`});s+=`<text x="${cx}" y="${H-18}" class="lab" text-anchor="middle">${esc(lb)}</text>`});
  return s+'</svg>';
}
const sheetHead=(t)=>`<div class="sh-head"><span>일을통한행복한삶 (The better life, The Better Career)</span><span>${t||'Second Planning Leading Guide'}</span></div>`;
const sheetFoot=(n,m)=>`<div class="sh-foot"><span class="ft-l">${hdcLogo()}</span><span>Copyright © 2026 JMCAREER All rights reserved. / www.humandc.co.kr</span><span>${n} / ${m}</span></div>`;
const jmLogo=()=>`<span class="logo-jm"><svg viewBox="0 0 30 34" width="22" height="26" aria-hidden="true"><path d="M3 3h6v20c0 4 2.5 6 6 6s6-2 6-6V3h6v21c0 8-5 11-12 11S3 32 3 24z" fill="#17488F"/><path d="M11 9h4v18h-4z" fill="#2F7C82"/></svg>제이엠커리어</span>`;
const hdcLogo=()=>`<span class="logo-hdc"><svg viewBox="0 0 28 22" width="26" height="20" aria-hidden="true"><path d="M2 4h24M2 11h24M2 18h24" stroke="#2F7C82" stroke-width="4" stroke-linecap="round"/><path d="M6 4h6M12 11h8M8 18h10" stroke="#9FC4C7" stroke-width="4" stroke-linecap="round"/></svg>The Human<br>Data Center</span>`;
const leafSVG=(c)=>`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z" fill="${c||'#6FB39A'}"/><path d="M5 19L14 10" stroke="#fff" stroke-width="1.5" fill="none"/></svg>`;
function forestSVG(cls,H){
  H=H||300;const k=H/300;
  const pine=(x,y0,h,w,fill,op)=>{const t=y0-h;return `<path d="M${x} ${t} L${x+w*.34} ${t+h*.42} L${x+w*.17} ${t+h*.42} L${x+w*.5} ${y0} L${x-w*.5} ${y0} L${x-w*.17} ${t+h*.42} L${x-w*.34} ${t+h*.42}Z" fill="${fill}" opacity="${op}"/>`};
  const layer=(n,y0,hmin,hmax,w,fill,op,seed)=>{let o='';for(let i=0;i<n;i++){const x=(i+.5)*(800/n)+((i*37+seed*17)%23-11),h=(hmin+((i*53+seed*29)%(hmax-hmin)))*k,ww=(w+((i*19+seed*7)%9))*(k>1?1.05:1);o+=pine(x,y0*k,h,ww,fill,op)}return o};
  return `<svg class="forest ${cls||''}" viewBox="0 0 800 ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><path d="M0 ${200*k} L120 ${130*k} L230 ${190*k} L360 ${110*k} L520 ${200*k} L650 ${140*k} L800 ${190*k} L800 ${H} L0 ${H}Z" fill="#B9D9DC" opacity=".75"/><path d="M0 ${232*k} L160 ${170*k} L300 ${225*k} L470 ${150*k} L640 ${225*k} L800 ${175*k} L800 ${H} L0 ${H}Z" fill="#9CC9C9" opacity=".8"/>${layer(24,262,70,120,40,'#6FAE9D',.8,1)}${layer(18,286,90,150,56,'#3F8A8E',.9,2)}${layer(13,H-2,120,190,74,'#1F5F8B',.95,3)}</svg>`;
}

function vResult(pp,role){return profile.vResult(pp,role)}
function vForm(){
  return `<div class="narrow" style="padding-top:34px"><div class="card"><h2>고객등록신청서는 제공하지 않습니다</h2><p class="sub">구현 지시서 §1에 따라 고객등록신청서 페이지는 구현·출력 범위에서 제외했습니다.</p><div class="acts" style="margin-top:14px"><button class="btn" onclick="goHome()">돌아가기</button></div></div></div>`;
}
function vForm_disabled(){
  const p=byId(S.res.id),r=p.reg||{},cr=r.careers||[],cn=pmOf(p)||{n:''},cs=COUNSELORS[p.counselor]||{n:''};
  const c0=cr[0]||{};
  const cell=(l,v,span)=>`<th>${l}</th><td ${span?`colspan="${span}"`:''}>${esc(v)}</td>`;
  return `<div class="narrow"><div class="toolbar"><button class="btn ghost sm" onclick="${S.formBack==='admin'?`nav('${backV()}')`:"nav('result')"}">← ${S.formBack==='admin'?backLbl():'결과로'}</button><button class="btn sm" onclick="window.print()">PDF로 저장(인쇄)</button></div>
  <section class="sheet"><div class="formbar">고객 등록 신청서<small>제이엠커리어</small></div><div class="hintline" style="margin-bottom:8px">No. ${esc(p.id)}</div>
  <h3 class="st">01. 참여자 인적사항</h3><div class="scroll"><table class="t"><tr>${cell('이름 및 성별',(r.name||'')+' / '+(r.gender||''))}${cell('출생년도',r.birth)}</tr><tr>${cell('휴대폰번호',r.phone)}${cell('이메일',r.email)}</tr><tr>${cell('자택주소',r.addr,3)}</tr><tr>${cell('최종학력(학교명)',r.edu)}${cell('전공',r.major)}</tr></table></div>
  <h3 class="st">02. 경력사항</h3><div class="scroll"><table class="t c"><tr><th>회사명</th><th>부서</th><th>직급</th><th>담당업무</th><th>근무기간(년)</th></tr>${[0,1,2].map(i=>{const c=cr[i]||{};return `<tr><td>${esc(c.co)}</td><td>${esc(c.dept)}</td><td>${esc(c.title)}</td><td>${esc(c.task)}</td><td>${esc(c.yrs)}</td></tr>`}).join('')}<tr><th>총 경력기간</th><td colspan="2">${esc(r.totalYears)}</td><th>재직당시 연봉</th><td>${esc(r.salary)}${r.salary?' 만원':''}</td></tr></table></div>
  <h3 class="st">03. 경력목표</h3><div class="scroll"><table class="t c"><tr><th>구분</th><th>희망분야 1순위</th><th>희망분야 2순위</th></tr><tr><th>재취업</th><td>${esc(r.goal1)}</td><td>${esc(r.goal2)}</td></tr><tr><th>재취업 희망사유</th><td colspan="2">${esc(r.reason)}</td></tr><tr><th>희망근무지역</th><td>${esc(r.region)}</td><td>희망연봉 ${esc(r.wage)}</td></tr></table></div>
  <h3 class="st">04. 특기 및 기타</h3><div class="scroll"><table class="t"><tr>${cell('자격증',r.certs,3)}</tr><tr>${cell('컴퓨터 활용능력',r.computer,3)}</tr><tr>${cell('외국어능력',r.lang)}${cell('취미/특기',r.hobby)}</tr></table></div>
  <div class="cons"><b>개인정보 수집·이용 및 정보제공 동의</b><br>1. 수집·이용 목적: 본인식별을 통한 컨설팅 서비스 제공 · 2. 수집 항목: 성명, 주소, 연락처 등 개인식별정보 · 3. 보유기간: 서비스 종료 후 1년 또는 요청 시 파기 · 4. 제3자 제공: 연계기관 의뢰 시 수행결과 제공.<br>※ 동의를 거부할 수 있으나 동의가 없을 경우 서비스 참여가 제한됩니다.</div>
  <p style="margin-top:16px;font-size:14px">위와 같은 내용으로 서비스 참여를 신청합니다. · ${esc(p.preDate||p.created)}</p>
  <div class="row2" style="margin-top:14px;font-size:14px"><div>담당 PM : ${esc(cn.n)}<br>담당 컨설턴트 : ${esc(cs.n)}</div><div>신청인 : ${esc(r.name)} (서명)</div></div>
  <div class="sh-foot"><span>Copyright © 2026 JMCAREER All rights reserved.</span><span>1 / 1</span></div></section></div>`;
}

/* ---------- 상담사·관리자 ---------- */
const PAGE=20;
const entOf=p=>ENT.find(e=>e.name===p.company)||null;
const pmOf=(p,ent)=>{ent=ent||entOf(p);if(ent&&ent.pm&&ent.pm.n)return ent.pm;return COUNSELORS[p.counselor]||null};
const curEnt=()=>ENT.find(e=>e.id===S.ent)||ENT[0];
function rebuildC(){setCounselors({});ENT.forEach(e=>e.consultants.forEach(c=>{COUNSELORS[c.code]=c}))}
rebuildC();
function entStats(e){const L=DB.filter(p=>p.company===e.name),pre=L.filter(preDone).length;return {n:L.length,pre,miss:L.length-pre,post:L.filter(p=>full(p.post)).length}}
const logoThumb=x=>x.logo?`<img class="lthumb" src="${x.logo}" alt="">`:`<span class="lthumb">${esc(x.name.replace(/[㈜()\s]/g,'').slice(0,1))}</span>`;


/* ---------- 상담사 수정 (지시서 §2-11·§9) ---------- */
// status: 'draft' | 'submitted' | 'reopened'(향후: 상담사 승인 후 내담자 수정 — 이번 범위에서는 실행하지 않음)
function bandCells(ai){const c=GRADE_SETS[ACTIVE_GRADE].cut[ai],cv=r=>toScore(r).toFixed(1),b=[[RAW_MIN,c[0]],[c[0]+1,c[1]],[c[1]+1,c[2]],[c[2]+1,RAW_MAX]];return b.map(([x,y])=>`<td>${cv(x)}~${cv(y)}<br><span class="hintline">원점수 ${x}~${y}</span></td>`).join('')}
const qName=c=>QNO(c)?'문항 '+QNO(c):c==='PH'?'휴대전화':c==='EM'?'이메일':c;
const {recomputeResult,applyCounselorEdit,startEdit,abortEdit,cancelEdit,saveEdit,editPanel}=createCounselorEdit({byId,getDB:()=>DB,save,nav,render,toast,missing,ansText,getWSTEPS:()=>WSTEPS,toAssessment,qName,getCounselors:()=>COUNSELORS,recomputeResultCore});

/* ---------- 연동 인터페이스 (지시서 §3·§8) : 관리자페이지 ↔ 통합본 ---------- */
// inviteContext → counselorId. 링크 정책은 미결정이므로 두 형태를 모두 받는다.
//  {type:'participant', participantId}  현행: 내담자별 링크(#join-아이디)
//  {type:'counselor', counselorCode}    상담사 고정 링크(검토 중)
function resolveInvite(ctx){
  if(!ctx)return {counselorId:null};
  if(ctx.type==='participant'){const p=byId(ctx.participantId);return {counselorId:p?p.counselor:null,participantId:ctx.participantId}}
  if(ctx.type==='counselor')return {counselorId:COUNSELORS[ctx.counselorCode]?ctx.counselorCode:null};
  return {counselorId:null};
}
const SCHEMA_VERSION='sp-assessment-1';
function toAssessment(p){
  const r=p.reg||{},c0=(r.careers||[])[0]||{},g=p.goal||{},e=p.expect||{},R=full(p.pre)?resultOf(p):null,cs=COUNSELORS[p.counselor];
  const ans={A1:agreed(p)?'동의':(r.a1||''),A2:p.counselor||'',A3:r.name||'',A4:r.gender==='남'?'남성':r.gender==='여'?'여성':(r.gender||''),A5:r.birthDate||r.birth||'',A6:c0.co||'',A7:c0.title||'',A8:c0.task||'',
    A9:etcOf(r,'industry'),A10:etcOf(r,'income'),B11:(g.b11||[])[0]||'',B12:(g.b12||[])[0]||'',B13:g.b13||[],B14:(g.b14||[])[0]||'',B15:g.b15==null?'':+g.b15,B16:g.b16==null?'':+g.b16,
    D32:(e.d32||[])[0]||'',D33:e.d33||[],D34:(e.d34||[])[0]||'',D35:e.d35||[],D36:e.d36||[]};
  C_CODES.forEach((c,i)=>ans[c]=(p.pre||[])[i]||null);
  const cmt=R?cmtParts(R.comment):null;
  return {schemaVersion:SCHEMA_VERSION,id:p.id,counselorId:p.counselor||null,counselingCode:p.counselor||'',company:p.company||'',
    status:isSubmitted(p)?'submitted':'draft',submittedAt:p.submittedAt||null,dateOfAssessment:p.preDate||null,
    contactPhone:r.phone||'',contactEmail:r.email||'',birthDate:r.birthDate||'',answers:ans,
    result:R?{areas:rawSums(p.pre).map((raw,i)=>({code:'ABCDE'[i],raw,converted:areaScores(p.pre)[i],grade:gradeOf(i,raw),gradeNeedsReview:gradeUnsure(i,raw)})),
      selectedFeedbackArea:'Code_'+'ABCDE'[R.area],feedbackCode:R.comment,feedbackText:cmt?cmt.join('\n\n'):'',
      keywords:[R.kw.age,R.kw.goal,R.kw.pro].filter(Boolean).map(k=>k.text),keywordCodes:[R.kw.age,R.kw.goal,R.kw.pro].filter(Boolean).map(k=>k.code),
      evaluationVersion:R.evaluationVersion||EVAL_VERSION,compareSet:ACTIVE_COMPARE,gradeSet:ACTIVE_GRADE}:null,
    reportSnapshot:R?{counselor:(R.snapshot&&R.snapshot.counselor)||(cs?Object.assign({code:p.counselor},cs):null),selectedFeedback:R.comment,selectedKeywords:[R.kw.age,R.kw.goal,R.kw.pro].filter(Boolean).map(k=>k.code),generatedAt:(R.snapshot&&R.snapshot.generatedAt)||R.at}:null,
    history:p.history||[]};
}
// 인쇄: 보고서 한 장(.sheet)이 A4 세로 1쪽에 들어가도록 인쇄 직전에 축소 (A4 194×281mm 인쇄영역 ≈ 733×1062px)
function fitSheets(on){document.querySelectorAll('.sheet').forEach(el=>{el.style.zoom='';el.style.width='';el.style.maxWidth='';if(!on||el.classList.contains('noprintpage'))return;
  const W=733,H=1000;el.style.maxWidth='none';el.style.width=W+'px';let z=Math.min(1,H/el.scrollHeight);
  for(let k=0;k<3&&z<1;k++){el.style.width=(W/z)+'px';z=Math.min(1,H/el.scrollHeight)}
  if(z<1){el.style.width=(W/z)+'px';z=Math.min(z,H/el.scrollHeight);el.style.zoom=String(z)}else el.style.width=''})}
window.addEventListener('beforeprint',()=>fitSheets(true));window.addEventListener('afterprint',()=>fitSheets(false));
try{const mq=matchMedia('print');mq.addEventListener&&mq.addEventListener('change',e=>fitSheets(e.matches))}catch(e){}
window.SecondPlanning={schemaVersion:SCHEMA_VERSION,toAssessment,resolveInvite,listAssessments:code=>DB.filter(p=>!code||p.counselor===code).map(toAssessment)};
function selfTests(){
  const T=[],add=(c,it,ex,got)=>T.push({c,it,ex:String(ex),got:String(got),ok:String(ex)===String(got)});
  const A=['자기인식','직업탐색','의사결정','커리어플랜','목표실행'];
  const x1=[2,2,1,4,3,4,2,1,3,1,2,3,1,4,3],s1=areaScores(x1),e1=[[16.7,'다소 낮음'],[66.7,'다소 높음'],[25,'다소 낮음'],[25,'다소 낮음'],[41.7,'보통']];
  e1.forEach((e,i)=>add('엑셀 Result 5행',A[i]+' 환산/판정',e[0]+' / '+e[1],s1[i]+' / '+gradeOf(i,rawSums(x1)[i])));
  add('엑셀 Result 5행','코멘트 대상 영역',A[0],A[commentArea(x1)]);
  const x2=[3,4,4,4,4,4,4,4,3,3,4,4,4,4,3],s2=areaScores(x2),e2=[66.7,75,66.7,66.7,66.7];
  e2.forEach((e,i)=>add('샘플 PDF(홍길동)',A[i]+' 환산',e,s2[i]));
  add('샘플 PDF(홍길동)','동점 4개 영역 → 우선순위',A[0],A[commentArea(x2)]);
  add('경계 사례','직업탐색·커리어플랜 동점',A[1],A[commentArea([5,5,5,2,2,2,5,5,5,2,2,2,5,5,5])]);
  // 평가기준 C22:E34 (엑셀 표를 옮긴 고정 값): 원점수 → 판정
  const C22E34={3:'다소 낮음',4:'다소 낮음',5:'다소 낮음',6:'다소 낮음',7:'다소 낮음',8:'보통',9:'보통',10:'보통',11:'다소 높음',12:'다소 높음',13:'다소 높음',14:'매우 높음',15:'매우 높음'};
  [3,4,5,6,7,8,9,10,11,12,13,14,15].forEach(r=>{const v=toScore(r);add('평가기준 C22:E34','원점수 '+r+' ('+v+'점)',C22E34[r],gradeOf(0,r))});
  const tp=emptyP({pre:x1,preDate:'2026-10-22',reg:{birth:'1966'},goal:{b13:['창업','다른 업종 재취업']}}),R=computeResult(tp,()=>0);
  add('인생키워드','1966년생 · 2026 응답 → 연령대','60대',R.kw.age.band);
  add('인생키워드','13번 1순위 창업 → 분류','창업',R.kw.goal.group);
  add('결과코멘트','최저 영역 자기인식 → 코드','Code_A_01',R.comment);
  // 지시서 §10 기능 테스트 (계산·검증 함수로 재현 가능한 항목)
  const rawT=a=>rawSums(a).join(',')+' / '+areaScores(a).join(',');
  add('지시서 T01','전부 1점 → 원점수/환산','3,3,3,3,3 / 0,0,0,0,0',rawT(Array(ITEM_COUNT).fill(1)));
  add('지시서 T02','전부 5점 → 원점수/환산','15,15,15,15,15 / 100,100,100,100,100',rawT(Array(ITEM_COUNT).fill(5)));
  add('지시서 T03','영역마다 3,4,4 → 원점수/환산','11,11,11,11,11 / 66.7,66.7,66.7,66.7,66.7',rawT([3,4,4,3,4,4,3,4,4,3,4,4,3,4,4]));
  add('지시서 T04','A·C 동률 최저 → 코멘트 영역',A[0],A[commentArea([2,2,2,4,4,4,2,2,2,4,4,4,4,4,4])]);
  add('지시서 T05','B·E 동률 최저 → 코멘트 영역',A[1],A[commentArea([4,4,4,2,2,2,4,4,4,4,4,4,2,2,2])]);
  add('지시서 T06','5개 영역 동률 → 코멘트 영역',A[0],A[commentArea(Array(ITEM_COUNT).fill(3))]);
  const ok=()=>emptyP({counselor:'102',reg:{a1:'동의',consent:true,name:'테스트',gender:'남',birthDate:'1968-03-15',birth:'1968',phone:'010-1234-5678',email:'t@example.com',industry:'금융',income:'기타',incomeEtc:'협의',careers:[{co:'가',title:'나',task:'다'},{},{}]},
    goal:{b11:[OPT['goal.b11'][0]],b12:[OPT['goal.b12'][0]],b13:[OPT['goal.b13'][0],OPT['goal.b13'][1]],b14:[OPT['goal.b14'][0]],b15:'70',b16:'6'},pre:Array(ITEM_COUNT).fill(3),
    expect:{d32:[OPT['expect.d32'][0]],d33:OPT['expect.d33'].slice(0,3),d34:[OPT['expect.d34'][0]],d35:OPT['expect.d35'].slice(0,2),d36:[OPT['expect.d36'][0]]}});
  const mc=p=>missing(p).map(x=>x.code).join(',')||'없음';
  add('검증 기준선','모든 필수 응답 완료','없음',mc(ok()));
  let t=ok();t.goal.b13=[OPT['goal.b13'][0],OPT['goal.b13'][0]];add('지시서 T07','B13 1·2순위 중복 → 제출 불가','B13',mc(t));
  t=ok();t.expect.d33=OPT['expect.d33'].slice(0,2);add('지시서 T08','D33 2개만 선택 → 제출 불가','D33',mc(t));
  t=ok();t.expect.d35=OPT['expect.d35'].slice(0,1);add('지시서 T09','D35 1개만 선택 → 제출 불가','D35',mc(t));
  t=ok();t.expect.d36=OPT['expect.d36'].slice(0,3);add('지시서 T10','D36 3개 → 제출 불가 (화면에서는 3번째 선택 차단)','D36',mc(t));
  t=ok();t.reg.email='';t.reg.phone='';t.pre[4]=null;add('지시서 T11','연락처·이메일·C21 누락 → 제출 불가','PH,EM,C21',mc(t));
  t=ok();t.reg.birthDate='1968-02-30';add('웹 합의','생년월일 실제 날짜 검증','A5',mc(t));
  t=ok();t.reg.a1='미동의';t.reg.consent=false;add('웹 합의','A1 미동의 → 진행 불가','A1',mc(t));
  t=ok();t.goal.b15='150';add('웹 합의','B15 0~100 범위','B15',mc(t));
  const sv={u:S.user,ce:S.cedit,m2:S.mode2,st:S.step};
  t=ok();t.status='submitted';S.user=t;S.cedit=null;S.mode2='pre';S.step=0;const h12=vWizard();S.user=sv.u;S.cedit=sv.ce;S.mode2=sv.m2;S.step=sv.st;
  add('지시서 T12','제출 후 내담자 수정 시도 → 잠금 안내','잠금',h12.includes('수정할 수 없습니다')?'잠금':'열림');
  t=ok();t.preDate='2026-10-22';t.status='submitted';t.result=computeResult(t,()=>0);const b13=JSON.parse(JSON.stringify(t));t.pre[0]=1;t.pre[1]=1;applyCounselorEdit(t,b13,'테스트');
  add('지시서 T13','상담사 수정 → 재계산·변경 이력','1건 · 변경 2문항 · 자기인식 원점수 5',(t.history||[]).length+'건 · 변경 '+((t.history||[])[0]||{changes:[]}).changes.length+'문항 · 자기인식 원점수 '+t.result.raw[0]);
  t=ok();t.id='__t14';t.preDate='2026-10-22';t.result=computeResult(t);
  const secs=h=>h.split('<section class="sheet').slice(1).filter(x=>!x.startsWith(' noprintpage')&&!x.includes('noprintpage"')).map(x=>x.slice(0,x.indexOf('</section>'))),strip=x=>x.replace(/<span>\d+ \/ \d+<\/span>/g,'');
  const hp=secs(vResult(t,'p')),hc=secs(vResult(t,'c')),same=hp.every((x,i)=>strip(x)===strip(hc[i]));
  add('지시서 T14','인쇄 쪽수(내담자/상담사) · 공통 1~3쪽','3 / 5 · 동일',hp.length+' / '+hc.length+' · '+(same?'동일':'다름'));
  const r1=JSON.stringify(resultOf(t)),v1=vResult(t,'p'),r2=JSON.stringify(resultOf(t)),v2=vResult(t,'p');
  add('지시서 T15','같은 제출 결과 재조회 → 코멘트·키워드 고정','동일',r1===r2&&v1===v2?'동일':'다름');
  const ca=ok();ca.counselor='12';ca.preDate='2026-10-22';ca.result=computeResult(ca);const cb=ok();cb.counselor='27';cb.preDate='2026-10-22';cb.result=computeResult(cb);
  const ha=vResult(ca,'p'),hb=vResult(cb,'p'),A12=COUNSELORS['12'],A27=COUNSELORS['27'];
  const okA=A12&&ha.includes(A12.mail)&&!ha.includes(A27.mail),okB=A27&&hb.includes(A27.mail)&&!hb.includes(A12.mail);
  add('지시서 T16','상담사 초대 맥락별 보고서 담당자',(A12?A12.n:'?')+' / '+(A27?A27.n:'?'),(okA?A12.n:'불일치')+' / '+(okB?A27.n:'불일치'));
  add('연동','초대 맥락(상담사 링크) → 상담사 식별','27',resolveInvite({type:'counselor',counselorCode:'27'}).counselorId);
  add('평가 설정','기본 비교군 = 1차(N6:N10)','66.7,58.3,58.3,41.7,66.7',REF_AVG.join(','));
  add('평가 설정','원점수 7(자기인식) → 버전별 판정 상이','검증 필요 표시',gradeUnsure(0,7)?'검증 필요 표시':'확정');
  add('평가 설정','2차 의사결정 원점수 10 중복 표기','검증 필요 표시',gradeUnsure(2,10)?'검증 필요 표시':'확정');
  add('평가 설정','원점수 8(전 영역) → 판정 일치','보통 · 확정',gradeOf(0,8)+' · '+(gradeUnsure(0,8)?'검증 필요':'확정'));
  add('보고서 차트','보기 수 = 차트 라벨 수 (32~36번)','일치,일치,일치,일치,일치',['d32','d33','d34','d35','d36'].map(k=>OPT['expect.'+k].length===SH[k].length?'일치':'불일치').join(','));
  add('보고서 차트','33번 7번째 보기와 차트 라벨 동일','인생의 공허함 / 인생의 공허함',OPT['expect.d33'][6]+' / '+SH.d33[6].replace('|',' '));
  add('보고서 차트','34번 7번째 보기와 차트 라벨 동일','일치',OPT['expect.d34'][6].startsWith(SH.d34[6].replace('|','').slice(0,6))?'일치':'불일치');
  return T;
}
function vVerify(){
  const T=selfTests(),n=T.filter(t=>t.ok).length;
  return `<section class="card"><h2 style="margin:0 0 6px">원본 엑셀 대조 검증 <span class="badge-s ${n===T.length?'s-post':'s-prog'}">${n} / ${T.length} 일치</span></h2>
  <p class="sub">원본 엑셀(Result 시트 샘플·평가기준표)·샘플 PDF와 구현 지시서 §10 기능 테스트(T01~T16)를 이 화면에서 재현합니다. 엑셀 매크로를 직접 실행한 대조는 아닙니다.</p>
  <div class="scroll"><table class="t zebra"><tr><th>기준</th><th>항목</th><th>기대값</th><th>계산값</th><th>결과</th></tr>${T.map(t=>`<tr><td>${esc(t.c)}</td><td>${esc(t.it)}</td><td>${esc(t.ex)}</td><td>${esc(t.got)}</td><td><b style="color:${t.ok?'var(--mint-deep)':'var(--coral-deep)'}">${t.ok?'일치':'불일치'}</b></td></tr>`).join('')}</table></div></section>`;
}
function vAdmin(){
  const tabs=[['p1','PART 01 · 기업·계정 관리'],['p2','PART 02 · 진단 현황'],['rep','사전사후 보고서'],['ver','원본 대조 검증']];
  return `<div class="wrap" style="padding-top:26px"><h2 style="font-size:24px">관리자 페이지</h2><div class="hintline">기업별 세컨플래닝을 만들고 컨설턴트·내담자를 등록한 뒤, 진행 현황과 결과 리포트를 확인합니다.</div><div class="perm"><b>관리자 권한</b> 기업·컨설턴트·고객사 담당자·내담자 등록/삭제 · 기업 로고와 결과보고서 설정 · 전체 기업의 현황과 보고서 조회</div>
  <div class="tabs">${tabs.map(([k,t])=>`<button class="${S.tab===k?'on':''}" onclick="S.tab='${k}';render();window.scrollTo(0,0)">${t}</button>`).join('')}</div>
  ${S.tab==='p1'?part1():S.tab==='p2'?part2():S.tab==='ver'?vVerify():aReport()}</div>`;
}
function selEnt(id){S.ent=id;S.created=[];S.bulk='';S.berr='';render();setTimeout(()=>{const el=$('#ent-detail');if(el)el.scrollIntoView({behavior:'smooth'})},50)}
function part1(){
  const e=curEnt(),cs=e.consultants,es=entStats(e);
  const EP=10,all=ENT.map((x,i)=>({x,no:i+1})).reverse(),ePages=Math.max(1,Math.ceil(all.length/EP));if(S.ep>ePages)S.ep=ePages;if(S.ep<1)S.ep=1;
  const entRows=all.slice((S.ep-1)*EP,S.ep*EP);
  const entPager=`<div class="hintline" style="text-align:center;margin-top:12px">${(S.ep-1)*EP+1}–${Math.min(S.ep*EP,all.length)} / 총 ${all.length}개 기업 (페이지당 ${EP}개 · 최신 등록순)</div>`+(ePages>1?`<div class="pager" role="navigation" aria-label="기업 페이지"><button ${S.ep===1?'disabled':''} onclick="goEp(${S.ep-1})" aria-label="이전 페이지">‹</button>${Array.from({length:ePages},(_,i)=>`<button class="${i+1===S.ep?'on':''}" ${i+1===S.ep?'aria-current="page"':''} onclick="goEp(${i+1})">${i+1}</button>`).join('')}<button ${S.ep===ePages?'disabled':''} onclick="goEp(${S.ep+1})" aria-label="다음 페이지">›</button></div>`:'');
  return `<div class="part"><span class="pt">PART 01</span><h2>기업별 세컨플래닝 운영</h2></div>
  <section class="card sec"><div class="filters" style="justify-content:space-between;margin-bottom:4px"><h2 style="margin:0">1. 기업별 진단 현황 · 완료 현황</h2><button class="btn sm" onclick="goReg()">+ 기업 등록</button></div><p class="sub">기업을 선택하면 아래에서 컨설턴트·내담자 등록과 결과보고서 미리보기를 이어서 할 수 있습니다.</p>
  <div class="scroll"><table class="t zebra"><tr><th>NO</th><th>기업</th><th>진행 기간</th><th>PM</th><th>대상자</th><th>진단완료</th><th>미완료</th><th>사후완료</th><th>완료율</th><th>관리</th></tr>
  ${entRows.map(({x,no})=>{const s=entStats(x),r=s.n?Math.round(s.pre/s.n*100):0;return `<tr><td><b>${no}</b></td><td style="white-space:nowrap">${logoThumb(x)}<b>${esc(x.name)}</b></td><td style="white-space:nowrap">${esc(x.start)} ~ ${esc(x.end)}</td><td>${esc(x.pm.n)}</td><td>${s.n}</td><td>${s.pre}</td><td>${s.miss}</td><td>${s.post}</td><td style="min-width:110px"><div class="progressbar"><span style="width:${r}%"></span></div><span class="hintline">${r}%</span></td><td><div class="acts"><button class="btn ${x.id===e.id?'':'ghost'} sm" onclick="selEnt('${x.id}')">${x.id===e.id?'선택됨':'선택'}</button>${S.delC===x.id?`<span class="hintline" style="align-self:center">대상자 ${s.n}명 데이터도 삭제됩니다</span><button class="btn sm" style="background:var(--coral-deep)" onclick="delEnt('${x.id}')">삭제 확인</button><button class="btn ghost sm" onclick="S.delC=null;render()">취소</button>`:`<button class="btn ghost sm" onclick="S.delC='${x.id}';render()">삭제</button>`}</div></td></tr>`}).join('')}</table></div>${entPager}</section>

  <section class="card sec" id="ent-reg"><h2>2. 세컨플래닝 기업 등록</h2><p class="sub">기업명, 진행 기간, PM 기본정보를 입력하면 새 세컨플래닝이 만들어집니다.</p>
  <div class="row3"><div class="field"><label for="en-name">기업명 <span class="req">*</span></label><input class="in" id="en-name" maxlength="30"></div><div class="field"><label for="en-start">시작일 <span class="req">*</span></label><input class="in" id="en-start" type="date"></div><div class="field"><label for="en-end">종료일 <span class="req">*</span></label><input class="in" id="en-end" type="date"></div></div>
  <div class="row3"><div class="field"><label for="en-pm">PM 이름 <span class="req">*</span></label><input class="in" id="en-pm" maxlength="20"></div><div class="field"><label for="en-mail">PM 이메일 <span class="req">*</span></label><input class="in" id="en-mail" type="email"></div><div class="field"><label for="en-tel">PM 연락처 <span class="req">*</span></label><input class="in" id="en-tel" inputmode="tel" placeholder="010-0000-0000"></div></div>
  <div class="err" id="en-err"></div><button class="btn" onclick="addEnt()">기업 등록</button></section>

  <section class="card sec" id="ent-detail"><div class="filters" style="justify-content:space-between"><h2 style="margin:0">3. 등록된 세컨플래닝 · ${esc(e.name)}</h2><select class="in" aria-label="기업 선택" onchange="selEnt(this.value)">${ENT.map(x=>`<option value="${x.id}" ${x.id===e.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
  <p class="sub">${esc(e.start)} ~ ${esc(e.end)} · PM ${esc(e.pm.n)} (${esc(e.pm.mail)}, ${esc(e.pm.tel)}) · 대상자 ${es.n}명</p>
  <h3 style="font-size:16px;margin-bottom:10px">컨설턴트 등록</h3>
  <div class="row3"><div class="field"><label for="cs-name">이름</label><input class="in" id="cs-name"></div><div class="field"><label for="cs-mail">이메일</label><input class="in" id="cs-mail" type="email"></div><div class="field"><label for="cs-tel">연락처</label><input class="in" id="cs-tel" inputmode="tel"></div></div>
  <div class="err" id="cs-err"></div><button class="btn mint sm" onclick="addCons()">컨설턴트 추가</button>
  <div class="scroll acct">${cs.length?`<table class="t zebra"><tr><th>코드</th><th>이름</th><th>이메일</th><th>연락처</th><th>담당 내담자</th><th></th></tr>${cs.map(c=>`<tr><td>${esc(c.code)}</td><td>${esc(c.n)}</td><td>${esc(c.mail)}</td><td>${esc(c.tel)}</td><td>${DB.filter(p=>p.company===e.name&&p.counselor===c.code).length}명</td><td><button class="btn ghost sm" onclick="delCons('${c.code}')">삭제</button></td></tr>`).join('')}</table>`:'<div class="empty">등록된 컨설턴트가 없습니다. 먼저 컨설턴트를 추가해 주세요.</div>'}</div>
  <h3 style="font-size:16px;margin:26px 0 6px">내담자 등록 (엑셀 리스트)</h3>
  <p class="hintline" style="margin-bottom:10px">엑셀에서 복사해 붙여넣거나 CSV 파일을 불러오세요. 열 순서: 닉네임, 연락처, 담당컨설턴트(코드 또는 이름, 비우면 자동 배정), 비밀번호(비우면 6자리 자동 부여). 아이디는 연락처 끝 8자리입니다.</p>
  <div class="field"><textarea class="in" id="bulk" placeholder="길벗, 010-3456-7890, 가상상담사 A&#10;달님, 01045678901, , 482913">${esc(S.bulk)}</textarea></div>
  <div class="acts"><button class="btn" onclick="addClients()">내담자 등록하고 계정 부여</button><label class="btn ghost" style="cursor:pointer">CSV 불러오기<input type="file" accept=".csv,.txt" style="display:none" onchange="readCsv(this)"></label></div>
  <div class="err" style="margin-top:8px">${esc(S.berr)}</div>
  ${S.created.length?`<div class="acct"><h3 style="font-size:15px;margin-bottom:8px">이번에 부여한 계정</h3><div class="scroll"><table class="t zebra"><tr><th>닉네임</th><th>아이디</th><th>비밀번호</th><th>담당</th><th>안내</th></tr>${S.created.map(id=>{const p=byId(id);return p?`<tr><td>${esc(p.nick)}</td><td>${p.id}</td><td>${p.pw}</td><td>${esc((COUNSELORS[p.counselor]||{n:'-'}).n)}</td><td><button class="btn ghost sm" onclick="copyText(msgOf(byId('${p.id}'))+'\\n비밀번호: ${p.pw}','문자 문구를 복사했습니다')">문자 문구 복사</button></td></tr>`:''}).join('')}</table></div></div>`:''}</section>

  ${mgrSection(e)}<section class="card sec"><h2>5. 결과보고서 미리보기 · 기업 로고</h2><p class="sub">${esc(e.name)} 로고를 올리면 내담자용·상담사용 결과보고서 표지에 표시됩니다. (이미지 300KB 이하)</p>
  <div class="logo-box"><div class="lbox">${e.logo?`<img src="${e.logo}" alt="${esc(e.name)} 로고">`:'<span class="hintline">로고 없음</span>'}</div>
  <div class="acts"><label class="btn mint sm" style="cursor:pointer">로고 변경<input type="file" accept="image/*" style="display:none" onchange="setLogo(this)"></label>${e.logo?`<button class="btn ghost sm" onclick="clearLogo()">로고 삭제</button>`:''}</div></div>
  <div class="acts"><button class="btn" onclick="previewReport('p')">내담자용 3p 미리보기</button><button class="btn ghost" onclick="previewReport('c')">상담사용 5p 미리보기</button></div>
  <p class="hintline" style="margin-top:8px">${es.pre?'이 기업에서 진단을 완료한 내담자의 결과로 보여드립니다.':'이 기업에는 완료된 진단이 없어 샘플 결과(홍길동)에 로고를 적용해 보여드립니다.'}</p></section>`;
}
function goEp(n){S.ep=n;render()}
function goReg(){const el=$('#ent-reg');if(el)el.scrollIntoView({behavior:'smooth'});setTimeout(()=>{const i=$('#en-name');if(i)i.focus({preventScroll:true})},400)}
function delEnt(id){
  const e=ENT.find(x=>x.id===id);if(!e)return;
  if(ENT.length<=1){S.delC=null;render();toast('기업은 최소 1개가 남아 있어야 합니다');return}
  DB=DB.filter(p=>p.company!==e.name);ENT=ENT.filter(x=>x.id!==id);S.delC=null;
  if(S.ent===id)S.ent=ENT[0].id;if(S.f.company===e.name)S.f.company='전체';if(S.rep.company===e.name)S.rep.company='전체';
  S.created=[];rebuildC();save();render();toast('「'+e.name+'」을(를) 삭제했습니다');
}
function addEnt(){
  const v=id=>$('#'+id).value.trim(),name=v('en-name'),st=v('en-start'),en=v('en-end'),pn=v('en-pm'),pm=v('en-mail'),pt=v('en-tel'),er=$('#en-err');
  if(!name||!st||!en||!pn||!pm||!pt){er.textContent='모든 항목을 입력해 주세요.';return}
  if(en<st){er.textContent='종료일이 시작일보다 빠릅니다.';return}
  if(!/^\S+@\S+\.\S+$/.test(pm)){er.textContent='이메일 형식을 확인해 주세요.';return}
  if(ENT.some(x=>x.name===name)){er.textContent='이미 등록된 기업명입니다.';return}
  const e={id:'e'+Date.now(),name,start:st,end:en,logo:'',pm:{n:pn,mail:pm,tel:pt},consultants:[],managers:[]};
  ENT.push(e);S.ep=1;save();toast('기업을 등록했습니다. 컨설턴트와 내담자를 이어서 등록하세요');selEnt(e.id);
}
function addCons(){
  const e=curEnt(),n=$('#cs-name').value.trim(),mail=$('#cs-mail').value.trim(),tel=$('#cs-tel').value.trim(),er=$('#cs-err');
  if(!n||!mail||!tel){er.textContent='이름, 이메일, 연락처를 모두 입력해 주세요.';return}
  if(!/^\S+@\S+\.\S+$/.test(mail)){er.textContent='이메일 형식을 확인해 주세요.';return}
  const codes=ENT.flatMap(x=>x.consultants.map(c=>+c.code)).filter(x=>!isNaN(x)),code=String(Math.max(0,...codes)+1);
  e.consultants.push({code,n,mail,tel});rebuildC();save();render();toast('컨설턴트를 등록했습니다 (코드 '+code+')');
}
function delCons(code){
  const e=curEnt();e.consultants=e.consultants.filter(c=>c.code!==code);DB.forEach(p=>{if(p.company===e.name&&p.counselor===code)p.counselor=null});rebuildC();save();render();toast('컨설턴트를 삭제했습니다');
}
function readCsv(inp){const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{S.bulk=String(r.result).replace(/^\uFEFF/,'');S.berr='';render();toast('파일을 불러왔습니다. 내용을 확인하고 등록하세요')};r.readAsText(f,'utf-8')}
function addClients(opt){
  opt=opt||{};const e=opt.ent||curEnt(),cs=e.consultants,lines=$('#bulk').value.split(/\n/).map(x=>x.trim()).filter(Boolean),err=[],ok=[],failed=[];let rr=0;
  lines.forEach((line,i)=>{
    const c=line.split(/\t|,/).map(x=>x.trim());
    if(i===0&&/^(닉네임|이름)$/.test(c[0]))return;
    const digits=(c[1]||'').replace(/\D/g,''),id=digits.slice(-8),bad=m=>{err.push((i+1)+'번째 줄: '+m);failed.push(line)};
    if(!c[0]||digits.length<8)return bad('닉네임과 연락처(8자리 이상)가 필요합니다.');
    if(byId(id))return bad('이미 등록된 아이디입니다 ('+id+').');
    let cc=null;
    if(opt.cc)cc=opt.cc;
    else if(c[2]){const m=cs.find(x=>x.code===c[2]||x.n===c[2]);if(!m)return bad('등록되지 않은 컨설턴트입니다 ('+c[2]+').');cc=m.code}
    else if(cs.length){cc=cs[rr%cs.length].code;rr++}
    const pwc=opt.cc?c[2]:c[3],pw=/^\d{6}$/.test(pwc||'')?pwc:String(Math.floor(100000+Math.random()*900000));
    DB.push(emptyP({id,pw,nick:c[0],company:e.name,counselor:cc}));ok.push(id);
  });
  if(ok.length){S.created=ok;save()}
  S.bulk=failed.join('\n');S.berr=err.join(' ');
  if(!ok.length&&!err.length)S.berr='붙여넣은 내용이 없습니다.';
  render();
  if(ok.length)toast(ok.length+'명을 등록했습니다');
}
function setLogo(inp){
  const e=curEnt(),f=inp.files[0];if(!f)return;
  if(!/^image\//.test(f.type)){toast('이미지 파일을 선택해 주세요');return}
  if(f.size>300*1024){toast('300KB 이하 이미지를 사용해 주세요');return}
  const r=new FileReader();r.onload=()=>{e.logo=r.result;save();render();toast('로고를 변경했습니다')};r.readAsDataURL(f);
}
function clearLogo(){curEnt().logo='';save();render();toast('로고를 삭제했습니다')}
function previewReport(role){
  const e=curEnt();let p=DB.find(x=>x.company===e.name&&preDone(x));
  if(!p)p=DB.find(x=>x.id==='11112222');
  if(!p){toast('미리보기할 결과가 없습니다');return}
  S.res={id:p.id,role};S.from='admin';S.prevEnt=e.id;nav('result');
}
function msgOf(p,kind){
  const head=kind==='post'?'상담 종료 후 사후 진단 안내':'퇴직준비도 진단 안내';
  return `[세컨플래닝] ${p.nick||'참여자'}님, ${head}입니다.\n접속 링크: ${linkOf(p)}\n아이디: ${p.id} (비밀번호는 별도로 안내드립니다)`;
}
function copyLink(id,kind){copyText(msgOf(byId(id),kind),'안내 문구를 복사했습니다. 문자에 붙여넣어 보내세요')}
function dl(id,type){
  S.from='admin';S.prevEnt=null;
  if(type==='f'){toast('고객등록신청서는 제공하지 않습니다');return}else{S.res={id,role:type};S.view='result'}
  render();window.scrollTo(0,0);
  setTimeout(()=>{try{window.print()}catch(e){toast('인쇄 창을 열 수 없습니다. 브라우저 메뉴에서 인쇄해 주세요')}},400);
}
function setFc(v){S.f.company=v;S.f.page=1;render()}
function setFs(v){S.f.st=v;S.f.page=1;render()}
function setFq(v){S.f.q=v;S.f.page=1;render()}
function goPage(n){S.f.page=n;render();const el=$('#plist');if(el)el.scrollIntoView({behavior:'smooth'})}
function part2(own){
  const mineP=p=>!own||p.counselor===S.cc;
  const base=DB.filter(p=>mineP(p)&&(S.f.company==='전체'||p.company===S.f.company)),done=base.filter(preDone).length,post=base.filter(p=>full(p.post)).length;
  const L=base.filter(p=>(S.f.st==='전체'||status(p).t.startsWith(S.f.st))&&(!S.f.q||(p.nick+pname(p)+p.id).includes(S.f.q)));
  const pages=Math.max(1,Math.ceil(L.length/PAGE));if(S.f.page>pages)S.f.page=pages;
  const cur=S.f.page,from=(cur-1)*PAGE,rows=L.slice(from,from+PAGE);
  let nums=[];for(let i=Math.max(1,cur-3);i<=Math.min(pages,cur+3);i++)nums.push(i);
  const badge=(ok,d)=>`<span class="badge-s ${ok?'s-post':'s-new'}">${ok?'완료':'미완료'}</span>${d?`<br><span class="hintline">${esc(d)}</span>`:''}`;
  return `<div class="part">${own?'':'<span class="pt">PART 02</span>'}<h2>${own?'내 내담자 현황':'진단 현황'}</h2></div>
  <section class="sec"><div class="filters"><label class="hintline" style="display:flex;gap:8px;align-items:center">기업 <select class="in" onchange="setFc(this.value)"><option>전체</option>${ENT.filter(x=>!own||DB.some(p=>p.company===x.name&&p.counselor===S.cc)).map(x=>`<option ${x.name===S.f.company?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label></div>
  <div class="tiles"><div class="tile"><span>대상자</span><b>${base.length}</b></div><div class="tile c2"><span>진단 완료</span><b>${done}</b></div><div class="tile c3"><span>미완료 인원</span><b>${base.length-done}</b></div><div class="tile c1"><span>사후 완료 인원</span><b>${post}</b></div></div></section>
  <section class="card sec" id="plist" style="padding:20px 18px"><h2 style="padding:0 6px">참여자 리스트 및 진행사항</h2>
  <div class="filters" style="padding:10px 6px 0"><select class="in" aria-label="상태" onchange="setFs(this.value)">${['전체','미시작','진행 중','사전 완료','사후 완료'].map(c=>`<option ${c===S.f.st?'selected':''}>${c}</option>`).join('')}</select><input class="in" placeholder="이름·아이디 검색" value="${esc(S.f.q)}" onchange="setFq(this.value)"><span class="hintline">리포트 ↓ 는 결과 화면을 열고 인쇄창(PDF로 저장)을 띄웁니다.</span></div>
  <div class="scroll"><table class="t zebra"><tr><th>참여자</th><th>기업</th><th>아이디</th><th>담당 컨설턴트</th><th>진행여부</th><th>상태</th><th>사전</th><th>사후</th><th>생성된 리포트</th></tr>
  ${rows.length?rows.map(p=>{const st=status(p),s=steps(p),pd=preDone(p);return `<tr><td><b>${esc(p.nick||'-')}</b>${p.reg&&p.reg.name?`<br><span class="hintline">${esc(p.reg.name)}</span>`:''}</td><td>${esc(p.company)}</td><td>${esc(p.id)}</td><td>${esc((COUNSELORS[p.counselor]||{n:'-'}).n)}</td>
  <td><span class="dots" title="등록·목표·진단·기대">${s.map(x=>`<i class="${x?'on':''}"></i>`).join('')}</span> <span class="hintline">${st.n}/4</span>${!pd?`<br><button class="btn ghost sm" style="margin-top:6px" onclick="copyLink('${p.id}')">링크 복사</button>`:(!full(p.post)?`<br><button class="btn ghost sm" style="margin-top:6px" onclick="copyLink('${p.id}','post')">사후 안내 복사</button>`:'')}</td>
  <td><span class="badge-s s-${st.k}">${st.t}</span></td><td>${badge(pd,p.preDate)}</td><td>${badge(full(p.post),p.postDate)}</td>
  <td><div class="acts">${pd?`<button class="btn sm" onclick="dl('${p.id}','p')">내담자용 3p ↓</button><button class="btn sm" onclick="dl('${p.id}','c')">상담사용 5p ↓</button>`:'<span class="hintline">진단 완료 후 생성</span>'}</div></td></tr>`}).join(''):`<tr><td colspan="9" class="empty">조건에 맞는 참여자가 없습니다.</td></tr>`}</table></div>
  <div class="hintline" style="text-align:center;margin-top:12px">${L.length?`${from+1}–${Math.min(from+PAGE,L.length)} / 총 ${L.length}명 (페이지당 ${PAGE}명)`:'총 0명'}</div>
  <div class="pager" role="navigation" aria-label="페이지"><button ${cur===1?'disabled':''} onclick="goPage(${cur-1})" aria-label="이전 페이지">‹</button>${nums[0]>1?`<button onclick="goPage(1)">1</button>${nums[0]>2?'<span>…</span>':''}`:''}${nums.map(n=>`<button class="${n===cur?'on':''}" ${n===cur?'aria-current="page"':''} onclick="goPage(${n})">${n}</button>`).join('')}${nums[nums.length-1]<pages?`${nums[nums.length-1]<pages-1?'<span>…</span>':''}<button onclick="goPage(${pages})">${pages}</button>`:''}<button ${cur===pages?'disabled':''} onclick="goPage(${cur+1})" aria-label="다음 페이지">›</button></div></section>`;
}

/* ---------- 사전사후 보고서 (7개 화면) ---------- */
const RTABS=[['r1','1. 사전사후 결과'],['r2','2. 사전사후 상세'],['r3','3. 만족도'],['r4','4. 만족도_심리적 안정감'],['r5','5. 만족도_호소문제의 변화'],['r6','6. 만족도_컨설팅 기대 및 효과'],['r7','7. 만족도_전반적인 만족도(개선요인)'],['r8','8. 첫회기 컨설팅에 대한 기대'],['r9','9. 만족도_기타의견']];
const SH={
  d32:qdOptions('expect.d32','chart'),
  d33:qdOptions('expect.d33','chart'),
  d34:qdOptions('expect.d34','chart'),
  d36:qdOptions('expect.d36','chart'),
  d35:qdOptions('expect.d35','chart')
};
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const r1f=x=>Math.round(x*10)/10;
const rawA=(arr,i)=>sum(arr.slice(i*ITEMS_PER_AREA,(i+1)*ITEMS_PER_AREA));
const arrow=v=>v>0?'▲':v<0?'▼':'';
const sgn=v=>(v>0?'+':'')+v;
const mx=a=>{const m=Math.max(1,...a),st=m<=6?1:m<=12?2:5;return {max:Math.ceil((m+.5)/st)*st,step:st}};
function gbars(o){
  const W=o.w||720,H=o.h||320,pl=34,pb=o.pb||56,pt=o.pt||34,pr=10,iw=W-pl-pr,ih=H-pt-pb,n=o.labels.length,gw=iw/n,ns=o.series.length,bw=Math.min(o.bw||36,(gw-18)/ns);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label||'')}">`;
  for(let v=0;v<=o.max;v+=o.step){const y=pt+ih-v/o.max*ih;s+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" class="grid"/><text x="${pl-6}" y="${y+4}" class="axis" text-anchor="end">${v}</text>`}
  o.labels.forEach((lb,i)=>{
    const cx=pl+gw*i+gw/2,tw=ns*bw+(ns-1)*5;
    o.series.forEach((se,j)=>{const v=se.vals[i],h=v/o.max*ih,x=cx-tw/2+j*(bw+5),c=typeof se.cls==='function'?se.cls(i):se.cls;s+=`<rect x="${x}" y="${pt+ih-h}" width="${bw}" height="${h}" rx="4" class="${c}"/><text x="${x+bw/2}" y="${pt+ih-h-5}" class="val" text-anchor="middle">${v}</text>`});
    String(lb).split('|').forEach((t,k)=>{s+=`<text x="${cx}" y="${pt+ih+20+k*15}" class="lab" text-anchor="middle">${esc(t)}</text>`});
    const tp=o.top&&o.top[i];if(tp){if(tp.t)s+=`<text x="${cx}" y="16" class="top ${tp.c||''}" text-anchor="middle">${tp.t}</text>`;if(tp.r)s+=`<text x="${cx}" y="${pt-8}" class="rank" text-anchor="middle">${tp.r}</text>`}
    if(o.box&&o.box.includes(i))s+=`<rect x="${cx-gw/2+3}" y="${pt-4}" width="${gw-6}" height="${ih+pb-10}" class="dbox"/>`;
  });
  return s+'</svg>';
}
const legend2=(a,b)=>`<div class="legend"><span><i class="sw" style="background:var(--pre)"></i>${a}</span><span><i class="sw" style="background:var(--post)"></i>${b}</span></div>`;
const hbrow=(l,pct,v,cls)=>`<div class="hbrow ${cls||''}"><div class="hl">${l}</div><div class="hb"><span style="width:${Math.max(0,Math.min(100,pct))}%"></span></div><div class="hv">${v}</div></div>`;
function repData(own){
  const base=own?DB.filter(p=>p.counselor===S.cc):DB;
  const L=base.filter(p=>S.rep.company==='전체'||p.company===S.rep.company);
  const pp=L.filter(p=>preDone(p)&&full(p.post));
  return {base,L,pp,pe:L.filter(preDone),sv:pp.filter(p=>p.sat),N:pp.length};
}
function aReport(own){
  const d=repData(own),cos=['전체',...(own?[...new Set(d.base.map(p=>p.company))]:ENT.map(e=>e.name))];
  if(!RTABS.some(t=>t[0]===S.rtab))S.rtab='r1';
  const idx=RTABS.findIndex(t=>t[0]===S.rtab)+1,tot=RTABS.length,is8=S.rtab==='r8';
  let body;
  if(is8)body=d.pe.length?rp8(d):'<div class="empty">사전 진단을 완료한 참여자가 아직 없습니다.</div>';
  else if(!d.N)body='<div class="empty">사전·사후를 모두 완료한 참여자가 아직 없습니다.</div>';
  else if(idx>=3&&!d.sv.length)body='<div class="empty">사후 만족도 설문에 응답한 참여자가 아직 없습니다.</div>';
  else body=({r1:rp1,r2:rp2,r3:rp3,r4:rp4,r5:rp5,r6:rp6,r7:rp7,r9:rp9})[S.rtab](d);
  const dir=S.rdir||0;S.rdir=0;
  return `<div class="toolbar" style="margin-top:0"><div class="filters"><select class="in" aria-label="기업" onchange="S.rep.company=this.value;render()">${cos.map(c=>`<option ${c===S.rep.company?'selected':''}>${esc(c)}</option>`).join('')}</select></div><div class="acts"><button class="btn mint sm" onclick="exportPptx(${own?'true':'false'})">PPT 다운받기</button><button class="btn ghost sm" onclick="window.print()">현재 화면 PDF로 저장(인쇄)</button></div></div>
  <div class="rnav noprint"><button class="rarrow" ${idx===1?'disabled':''} onclick="rmove(-1)" aria-label="이전 화면">‹</button><div class="rtitle"><b>${idx} / ${tot}</b>${esc(RTABS[idx-1][1].replace(/^\d+\.\s*/,''))}</div><button class="rarrow" ${idx===tot?'disabled':''} onclick="rmove(1)" aria-label="다음 화면">›</button></div>
  <div class="rdots noprint">${RTABS.map(([k],i)=>`<button class="${k===S.rtab?'on':''}" onclick="rgo('${k}')" aria-label="${i+1}번 화면" ${k===S.rtab?'aria-current="true"':''}>${i+1}</button>`).join('')}</div>
  <div id="rslide" class="${dir>0?'slide-r':dir<0?'slide-l':''}"><section class="sheet">${sheetHead('사전사후 참여결과 보고서')}<div class="rbase">[Base: ${S.rep.company==='전체'?'전체 기업':esc(S.rep.company)} ${is8?`사전 응답자(n=${d.pe.length})`:`사전·사후 참여자(n=${d.N})`}${idx>=3&&!is8&&d.N?`, 만족도 응답 n=${d.sv.length}`:''}, 단위: 명]</div>${body}${sheetFoot(idx,tot)}</section></div>
  <p class="hintline noprint" style="text-align:center">좌우 화살표, 키보드 ← → 또는 화면을 옆으로 밀어서 다음 화면을 볼 수 있어요.</p>`;
}
function rgo(k){const a=RTABS.findIndex(t=>t[0]===S.rtab),b=RTABS.findIndex(t=>t[0]===k);S.rdir=b>a?1:-1;S.rtab=k;render()}
function rmove(dx){const a=RTABS.findIndex(t=>t[0]===S.rtab),b=Math.max(0,Math.min(RTABS.length-1,a+dx));if(b!==a)rgo(RTABS[b][0])}
const reportOn=()=>(S.view==='admin'&&S.tab==='rep')||(S.view==='cns'&&S.ctab==='rep');
(function(){
  let ts=null;
  document.addEventListener('touchstart',e=>{const t=e.target;ts=(t.closest&&t.closest('#rslide')&&!t.closest('.scroll'))?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null},{passive:true});
  document.addEventListener('touchend',e=>{if(!ts)return;const c=e.changedTouches[0],dx=c.clientX-ts.x,dy=c.clientY-ts.y;ts=null;if(Math.abs(dx)>60&&Math.abs(dy)<50)rmove(dx<0?1:-1)},{passive:true});
  document.addEventListener('keydown',e=>{if(!reportOn())return;if(/INPUT|SELECT|TEXTAREA/.test(e.target&&e.target.tagName))return;if(e.key==='ArrowRight')rmove(1);if(e.key==='ArrowLeft')rmove(-1)});
})();
function rp1(d){
  const A=k=>AREAS.map((a,i)=>r1f(mean(d.pp.map(p=>rawA(p[k],i)))));
  const pre=A('pre'),post=A('post'),rate=pre.map((v,i)=>v?r1f((post[i]-v)/v*100):0);
  const order=rate.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]).map(x=>x[1]),ord=['1st','2nd','3rd'];
  const top=rate.map((v,i)=>({t:`${v}% ${arrow(v)}`,c:v<0?'dn':'',r:order.indexOf(i)<3?ord[order.indexOf(i)]:''}));
  const tp=r1f(sum(pre)),tq=r1f(sum(post)),tr=tp?r1f((tq-tp)/tp*100):0;
  return `<div class="tiles"><div class="tile"><span>사전·사후 참여자</span><b>${d.N}명</b></div><div class="tile c3"><span>사전 평균 합계 (${AREA_COUNT*RAW_MAX}점)</span><b>${tp}</b></div><div class="tile c2"><span>사후 평균 합계 (${AREA_COUNT*RAW_MAX}점)</span><b>${tq}</b></div><div class="tile c1"><span>전체 변화율</span><b>${tr}% ${arrow(tr)}</b></div></div>
  <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">${legend2('사전_평균','사후_평균')}<span class="hintline">영역별 원점수(${RAW_MAX}점 만점 기준) · 변화율 순위 TOP3 표시</span></div>
  ${gbars({series:[{vals:pre,cls:'rpre'},{vals:post,cls:'rpost'}],labels:AREAS.map(a=>a.k),max:RAW_MAX,step:1,top,pt:50,h:350,label:'영역별 사전 사후 평균 원점수'})}
  <div class="scroll"><table class="t c"><tr><th>구분</th>${AREAS.map(a=>`<th>${a.k}</th>`).join('')}</tr><tr><th>사전_평균</th>${pre.map(v=>`<td>${v}</td>`).join('')}</tr><tr><th>사후_평균</th>${post.map(v=>`<td>${v}</td>`).join('')}</tr><tr><th>변화율(%)</th>${rate.map(v=>`<td>${v}% ${arrow(v)}</td>`).join('')}</tr></table></div>`;
}
function rp2(d){
  const F=k=>FACTORS.map((f,i)=>r1f(mean(d.pp.map(p=>p[k][i])))),A=k=>AREAS.map((a,i)=>r1f(mean(d.pp.map(p=>rawA(p[k],i)))));
  const fp=F('pre'),fo=F('post'),ap=A('pre'),ao=A('post');
  const fd=fp.map((v,i)=>r1f(fo[i]-v)),fr=fp.map((v,i)=>v?r1f((fo[i]-v)/v*100):0),ad=ap.map((v,i)=>r1f(ao[i]-v)),ar=ap.map((v,i)=>ap[i]?r1f((ao[i]-v)/v*100):0);
  const ftop=fr.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]).slice(0,5).map(x=>x[1]),arank=ar.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]).map(x=>x[1]),ord=['1st','2nd','3rd','4th','5th'];
  const row=(lab,fv,av,fmt,hl)=>`<tr><th>${lab}</th>${AREAS.map((a,i)=>[0,1,2].map(j=>{const k=i*3+j;return `<td class="${hl&&ftop.includes(k)?'hl1':''}">${fmt(fv[k])}</td>`}).join('')+`<td class="${hl&&arank.indexOf(i)<3?'hl2':''}" style="font-weight:800">${hl&&arank.indexOf(i)<3?'▲':''}${fmt(av[i])}</td>`).join('')}</tr>`;
  const top=FACTORS.map((f,i)=>ftop.includes(i)?{t:`${fr[i]} ▲`}:null);
  return `<div class="axisnote"><span>cognition</span><i></i><span>behavior</span></div>
  <div class="scroll"><table class="t c" style="min-width:900px"><tr><th rowspan="2">사전<br>사후<br>모두응답</th>${AREAS.map((a,i)=>`<th colspan="4">요인${i+1}_${a.k}</th>`).join('')}</tr>
  <tr>${AREAS.map((a,i)=>[0,1,2].map(j=>`<th>${FACTORS[i*3+j][0]}</th>`).join('')+`<th>종합 <sup>${ord[arank.indexOf(i)]}</sup></th>`).join('')}</tr>
  ${row('사전_평균점수',fp,ap,v=>v.toFixed(1),false)}${row('사후_평균점수',fo,ao,v=>v.toFixed(1),false)}${row('변화 스코어(Point)',fd,ad,sgn,false)}${row('변화율(%)',fr,ar,sgn,true)}</table></div>
  <p class="fnote">요인은 ${SCALE_MAX}점 평균, 종합은 영역별 원점수(${RAW_MAX}점 만점) 기준 · 노란색: 요인별 변화율 TOP5, 주황색: 영역 종합 변화율 TOP3</p>
  <div class="legend" style="margin-top:12px"><span><i class="sw" style="background:var(--ink-soft);opacity:.4"></i>사전_평균</span><span><i class="sw" style="background:linear-gradient(90deg,var(--a1),var(--a3),var(--a5))"></i>사후_평균 (영역별 색 구분)</span></div>
  <div class="scroll"><div style="min-width:880px">${gbars({series:[{vals:fp,cls:'rgray'},{vals:fo,cls:i=>'ra'+(Math.floor(i/3)+1)}],labels:FACTORS.map(f=>f[0]),max:5,step:1,top,box:ftop,w:1000,h:340,pt:40,bw:24,label:'요인별 사전 사후 평균'})}</div></div>`;
}
function satCard(title,vals,lab5){
  const n=vals.length,avg=r1f(mean(vals)),c=[5,4,3,2,1].map(v=>vals.filter(x=>x===v).length),pc=x=>n?r1f(x/n*100):0,C=2*Math.PI*30,f=Math.min(1,avg/5);
  return `<div><div class="qbar">${title}</div>
  <div class="pie"><svg viewBox="0 0 100 100" role="img" aria-label="종합평균 ${avg}점"><circle cx="50" cy="50" r="30" fill="none" style="stroke:var(--line);stroke-width:60"/><circle cx="50" cy="50" r="30" fill="none" style="stroke:var(--coral);stroke-width:60" stroke-dasharray="${C*f} ${C}" transform="rotate(-90 50 50)"/></svg></div><div class="pie-lab">종합평균 ${avg}점</div>
  ${hbrow('Total , 전체 긍정 만족도',pc(c[0]+c[1]),`<b>${pc(c[0]+c[1])}%</b>${c[0]+c[1]}명`,'tot')}${lab5.map((l,i)=>hbrow(`Q${i+1}. ${l}`,pc(c[i]),`<b>${pc(c[i])}%</b>${c[i]}명`)).join('')}</div>`;
}
function rp3(d){
  const v=k=>d.sv.map(p=>p.sat[k]);
  return `<div class="sat2" style="margin-top:6px">${satCard('Q 1.0 서비스에 대한 전반적인 만족도',v('q1'),['매우 만족','만족','보통','불만족','매우 불만족'])}${satCard('Q 2.0 새로운 경력을 만들어가는데 유익했는지 여부',v('q2'),['매우 그렇다','그렇다','보통','아니다','매우 아니다'])}</div>`;
}
function rp4(d){
  const O=OPT['expect.d32'],n=d.sv.length,pre=O.map(o=>d.sv.filter(p=>(p.expect.d32||[])[0]===o).length),post=O.map(o=>d.sv.filter(p=>(p.sat.d32||[])[0]===o).length);
  const pos=a=>n?r1f((a[0]+a[1])/n*100):0,p0=pos(pre),p1=pos(post),m=mx([...pre,...post]);
  const st=[['q3a','상담 이후 막연한 불안이 줄었다'],['q3b','미래에 대한 자신감이 높아졌다'],['q3c','마음이 이전보다 안정되었다']];
  return `<div class="qbar">Q 3.0 서비스 이후 심리적 안정감</div>
  <div class="tiles" style="grid-template-columns:repeat(3,1fr);margin-top:14px"><div class="tile"><span>사전 긍정적 마음 상태</span><b>${p0}%</b></div><div class="tile c2"><span>사후 긍정적 마음 상태</span><b>${p1}%</b></div><div class="tile c1"><span>변화</span><b>${sgn(r1f(p1-p0))}%p</b></div></div>
  <p class="hintline">긍정적 마음 상태 = ‘잘 될 것이라고 믿는다’ + ‘구체적으로 준비하고 있어 안심이다’ 선택 비율</p>
  <h3 class="st">Q 3.1 마음 상태 사전·사후 분포 (명)</h3>${legend2('사전응답','사후응답')}
  ${gbars({series:[{vals:pre,cls:'rpre'},{vals:post,cls:'rpost'}],labels:SH.d32,max:m.max,step:m.step,label:'마음 상태 사전 사후 분포',h:310})}
  <h3 class="st">Q 3.2 심리적 안정감 문항 (5점 척도)</h3>
  ${st.map(([k,l])=>{const a=r1f(mean(d.sv.map(p=>p.sat[k])));return hbrow(l,a/5*100,`<b>${a}점</b>`)}).join('')}`;
}
function sideList(O,idxs,vals,total,unit,label){
  return `<div>${idxs.map((i,k)=>`<div class="topitem t${k+1}"><b>${String(k+1).padStart(2,'0')}</b><span>${esc(O[i])}${label?label:''} (${total?r1f(vals[i]/total*100):0}%, ${vals[i]}${unit})</span></div>`).join('')}</div>`;
}
function rp5(d){
  const O=OPT['expect.d33'],pre=O.map(o=>d.sv.filter(p=>(p.expect.d33||[]).includes(o)).length),post=O.map(o=>d.sv.filter(p=>(p.sat.d33||[]).includes(o)).length);
  const order=pre.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]).slice(0,3).map(x=>x[1]),chg=i=>pre[i]?r1f((post[i]-pre[i])/pre[i]*100):0,m=mx([...pre,...post]);
  const top=O.map((o,i)=>order.includes(i)?{t:`${chg(i)}% ${arrow(chg(i))}`,c:chg(i)<0?'dn':'',r:`TOP ${order.indexOf(i)+1}`}:null);
  return `<div class="qbar">Q 4.0 사전사후 변화 TOP3 · 사전(퇴직을 맞이하며 고민되는 부분), 사후(서비스 이후 가장 고민되는 부분)</div>
  <div class="sidechart"><div style="padding-top:34px">${sideList(O,order,pre,sum(pre),'명')}</div><div>${legend2('사전응답','사후응답')}${gbars({series:[{vals:pre,cls:'rpre'},{vals:post,cls:'rpost'}],labels:SH.d33,max:m.max,step:m.step,top,pt:46,h:330,label:'호소문제 사전 사후 변화'})}</div></div>
  <p class="fnote">3가지 우선순위를 모두 집계한 중복선택 문항입니다 (사전 ${sum(pre)}건, 사후 ${sum(post)}건). 상단 수치는 사전 대비 사후 응답 변화율입니다.</p>`;
}
function rp6(d){
  const O5=OPT['expect.d34'],e0=O5.map(o=>d.sv.filter(p=>(p.expect.d34||[])[0]===o).length),e1=O5.map(o=>d.sv.filter(p=>(p.sat.d34||[])[0]===o).length);
  const o5=e0.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]).slice(0,3).map(x=>x[1]),m5=mx([...e0,...e1]);
  const t5=O5.map((o,i)=>o5.includes(i)?{t:'',r:`TOP ${o5.indexOf(i)+1}`}:null);
  const O6=OPT['expect.d35'],b0=O6.map(o=>d.sv.filter(p=>(p.expect.d35||[]).includes(o)).length),b1=O6.map(o=>d.sv.filter(p=>(p.sat.d35||[]).includes(o)).length);
  const o6=b1.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]).slice(0,3).map(x=>x[1]),m6=mx([...b0,...b1]);
  const t6=O6.map((o,i)=>o6.includes(i)?{t:'',r:`TOP ${o6.indexOf(i)+1}`}:null);
  return `<div class="qbar">Q 5.0 사전(컨설팅 기대), 사후(가장 도움이 된 부분)</div>
  <div class="sidechart"><div style="padding-top:34px">${sideList(O5,o5,e0,sum(e0),'명')}</div><div>${legend2('사전응답(기대)','사후응답(도움이 된 부분)')}${gbars({series:[{vals:e0,cls:'rpre'},{vals:e1,cls:'rpost'}],labels:SH.d34,max:m5.max,step:m5.step,top:t5,pt:46,h:320,label:'컨설팅 기대와 도움이 된 부분'})}</div></div>
  <div class="sat2" style="margin-top:22px">${satCard('Q 5.2 컨설팅 전 기대했던 부분의 충족도',d.sv.map(p=>p.sat.q5fit),['매우 그렇다','그렇다','보통','아니다','매우 아니다'])}<div></div></div>
  <div class="qbar" style="margin-top:26px">Q 6.0 사전(경력준비에 장애가 되는 요인), 사후(가장 크게 극복된 장애요인)</div>
  <div class="sidechart"><div style="padding-top:34px">${sideList(O6,o6,b1,sum(b1),'건',' 극복')}</div><div>${legend2('사전응답','사후응답')}${gbars({series:[{vals:b0,cls:'rpre'},{vals:b1,cls:'rpost'}],labels:SH.d35,max:m6.max,step:m6.step,top:t6,box:o6,pt:46,h:320,label:'경력준비 장애요인 사전 사후'})}</div></div>
  <p class="fnote">중복선택 문항으로 사전과 사후의 응답 건수가 다를 수 있습니다 (사전 ${sum(b0)}건, 사후 ${sum(b1)}건)</p>`;
}
function rp7(d){
  const O=OPT['sat.q7'],n=d.sv.length,c=O.map(o=>d.sv.filter(p=>(p.sat.q7||[]).includes(o)).length),idx=c.map((v,i)=>i).sort((a,b)=>c[b]-c[a]||a-b);
  const ops=d.sv.map(p=>(p.sat.q7txt||'').trim()).filter(Boolean);
  return `<div class="qbar">Q 7.0 전반적인 만족도 · 개선이 필요한 부분 (최대 2가지 선택)</div>
  <div class="tiles" style="grid-template-columns:repeat(3,1fr);margin-top:14px"><div class="tile c1"><span>전반적 만족도 (5점)</span><b>${r1f(mean(d.sv.map(p=>p.sat.q1)))}</b></div><div class="tile c2"><span>경력 설계 유익도 (5점)</span><b>${r1f(mean(d.sv.map(p=>p.sat.q2)))}</b></div><div class="tile"><span>자유 의견</span><b>${ops.length}건</b></div></div>
  ${idx.map(i=>hbrow(esc(O[i]),n?c[i]/n*100:0,`<b>${n?r1f(c[i]/n*100):0}%</b>${c[i]}명`)).join('')}
  <p class="fnote">자유 의견은 9번 화면에서 확인할 수 있습니다.</p>`;
}

function rp8(d){
  const O=OPT['expect.d36'],n=d.pe.length,c=O.map(o=>d.pe.filter(p=>(p.expect.d36||[]).includes(o)).length);
  const order=c.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]).slice(0,3).map(x=>x[1]),m=mx(c);
  const top=O.map((o,i)=>order.includes(i)?{t:'',r:`TOP ${order.indexOf(i)+1}`}:null);
  return `<div class="sidechart" style="margin-top:0"><div><div class="qbar">Q 7.0 첫 회기 컨설팅 기대, TOP3</div><div style="padding-top:58px">${sideList(O,order,c,n,'건')}</div></div>
  <div><div class="qbar">Q 7.1 첫 회기 컨설팅은 어떤 형식으로 진행하기를 바라나요? (중복 : 최대 2개 선택)</div><div class="legend" style="margin-top:10px"><span><i class="sw" style="background:var(--pre)"></i>사전응답</span></div>
  ${gbars({series:[{vals:c,cls:'rpre'}],labels:SH.d36,max:m.max,step:m.step,top,pt:46,pb:66,h:350,bw:42,label:'첫 회기 컨설팅 진행 형식 기대'})}</div></div>
  <p class="fnote">중복선택 문항입니다 (총 ${sum(c)}건, 응답자 ${n}명). 비율은 응답자 대비입니다.</p>`;
}
function rp9(d){
  const ops=d.sv.map(p=>(p.sat.q7txt||'').trim()).filter(Boolean);
  const kw=[['감사','감사 표현'],['도움','도움이 되었다'],['정보','정보 제공'],['자신감','자신감·용기'],['시간','시간·진행 관련'],['추가','추가 상담 요청']];
  return `<div class="qbar">Q 8.0 더 나은 서비스를 위한 개인적인 의견, 담당 컨설턴트에게 보내는 메시지, 개선할 사항 등을 주시면 소중하게 경청하겠습니다.</div>
  <div class="scroll" style="margin-top:12px">${ops.length?`<table class="t ops"><tr><th></th><th>Code</th><th>의견</th></tr>${ops.map((t,i)=>`<tr><td>${i+1}</td><td>Code_${String(i+1).padStart(3,'0')}</td><td>${esc(t)}</td></tr>`).join('')}</table>`:'<div class="empty">작성된 의견이 없습니다.</div>'}</div>
  <p class="fnote">총 ${ops.length}건 · 개인 식별 정보 없이 코드로만 표시됩니다.</p>
  <h3 class="st">의견 키워드 (문구 포함 여부 기준 자동 집계)</h3>${kw.map(([k,l])=>{const c=ops.filter(t=>t.includes(k)).length,p=ops.length?r1f(c/ops.length*100):0;return hbrow(l,p,`<b>${p}%</b>${c}건`)}).join('')}`;
}

/* ---------- PPT 다운받기 ---------- */
let PPTX_LOAD=null;
function loadPptx(){
  if(window.PptxGenJS)return Promise.resolve();
  if(PPTX_LOAD)return PPTX_LOAD;
  PPTX_LOAD=new Promise((res,rej)=>{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js';sc.onload=res;sc.onerror=()=>{PPTX_LOAD=null;rej(new Error('load'))};document.head.appendChild(sc)});
  return PPTX_LOAD;
}
async function exportPptx(own){
  const d=repData(own);
  if(!d.N&&!d.pe.length){toast('내보낼 데이터가 없습니다. 사전·사후를 완료한 참여자가 필요합니다');return}
  let dl=null;
  try{dl=window.claude&&claude.use?await claude.use('downloads'):null}catch(e){}
  if(!dl){toast('이 화면에서는 파일 저장을 지원하지 않습니다');return}
  toast('PPT를 만드는 중입니다…');
  try{await loadPptx()}catch(e){toast('PPT 도구를 불러오지 못했습니다. 네트워크를 확인해 주세요');return}
  let blob;
  try{blob=await buildPptx(d)}catch(e){console.error(e);toast('PPT를 만들지 못했습니다');return}
  const scope=(S.rep.company==='전체'?'전체':S.rep.company).replace(/[\\/:*?"<>|㈜]/g,'');
  try{await dl.save({filename:`세컨플래닝_사전사후_보고서_${scope}_${today()}.pptx`,data:blob});toast('PPT를 저장했습니다')}
  catch(e){toast(e&&e.code==='declined'?'저장을 취소했습니다':'저장하지 못했습니다')}
}
async function buildPptx(d){
  const P=new PptxGenJS();P.layout='LAYOUT_WIDE';P.title='세컨플래닝 사전사후 참여결과 보고서';P.company='JMCAREER';
  const FONT='Malgun Gothic',INK='2B3A3D',SOFT='5D7074',CORAL='4D9FA5',MINT='2F7C82',PRE='82BDC2',GRAY='555B69',LINE='D5E5E2',PGRAY='BFC9C9';
  const scope=S.rep.company==='전체'?'전체 기업':S.rep.company,pp=d.pp,sv=d.sv,pe=d.pe;
  const nl=a=>a.map(x=>String(x).replace(/\|/g,' '));
  const L=[];
  const add=(title,note,draw)=>L.push({title,note,draw});
  const qbar=(s,t,x,y,w)=>s.addText(t,{x,y,w,h:0.42,fontFace:FONT,fontSize:12,bold:true,color:'FFFFFF',fill:{color:GRAY},margin:[0,10,0,10],valign:'middle'});
  const col=(s,labels,series,o)=>s.addChart(P.charts.BAR,series.map(x=>({name:x.name,labels,values:x.values})),Object.assign({x:0.5,y:1.2,w:12.3,h:4,barDir:'col',barGrouping:'clustered',chartColors:series.map(x=>x.color),showLegend:series.length>1,legendPos:'b',legendFontFace:FONT,legendFontSize:11,showValue:true,dataLabelFontSize:10,dataLabelFontFace:FONT,dataLabelColor:INK,dataLabelFormatCode:'0',catAxisLabelFontFace:FONT,catAxisLabelFontSize:11,valAxisLabelFontSize:10,valAxisLabelFontFace:FONT,valGridLine:{color:LINE,size:0.5},catGridLine:{style:'none'},barGapWidthPct:60},o||{}));
  const hbar=(s,labels,values,color,o)=>s.addChart(P.charts.BAR,[{name:'비율(%)',labels,values}],Object.assign({x:0.5,y:1.7,w:6,h:3.6,barDir:'bar',barGrouping:'clustered',chartColors:[color],showLegend:false,showValue:true,dataLabelFontSize:10,dataLabelFontFace:FONT,dataLabelColor:INK,dataLabelFormatCode:'0.0',catAxisLabelFontFace:FONT,catAxisLabelFontSize:11,catAxisOrientation:'maxMin',valAxisMinVal:0,valAxisMaxVal:100,valAxisLabelFontSize:10,valGridLine:{color:LINE,size:0.5},catGridLine:{style:'none'},barGapWidthPct:50},o||{}));
  const pills=(s,items,x,y,w)=>items.forEach((t,k)=>s.addText(`${String(k+1).padStart(2,'0')}  ${t}`,{shape:P.ShapeType.roundRect,rectRadius:0.25,x,y:y+k*0.85,w,h:0.68,fill:{color:['256A70','2F7766','4B5FB5'][k]},color:'FFFFFF',fontFace:FONT,fontSize:12,bold:true,valign:'middle',margin:[0,12,0,12]}));
  const txt=(s,t,o)=>s.addText(t,Object.assign({fontFace:FONT,fontSize:12,color:INK,valign:'top'},o));
  const top3=(vals)=>vals.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]).slice(0,3).map(x=>x[1]);
  const cnt=(arr,sel,O)=>O.map(o=>arr.filter(p=>sel(p).includes(o)).length);
  const hdr=t=>({text:t,options:{bold:true,fill:{color:'D7EBEC'},color:INK,align:'center',fontFace:FONT}});
  const cell=(t,o)=>({text:String(t),options:Object.assign({align:'center',fontFace:FONT,color:INK},o||{})});

  if(pp.length){
    const A=k=>AREAS.map((a,i)=>r1f(mean(pp.map(p=>rawA(p[k],i)))));
    const pre=A('pre'),post=A('post'),rate=pre.map((v,i)=>v?r1f((post[i]-v)/v*100):0),ord=top3(rate);
    add('1. 사전사후 결과',`영역별 원점수(15점 만점) · n=${pp.length}`,s=>{
      col(s,AREAS.map(a=>a.k),[{name:'사전_평균',values:pre,color:PRE},{name:'사후_평균',values:post,color:MINT}],{y:1.1,h:3.9,valAxisMaxVal:15,valAxisMajorUnit:1,dataLabelFormatCode:'0.0'});
      s.addTable([[hdr('구분'),...AREAS.map(a=>hdr(a.k))],[cell('사전_평균',{bold:true}),...pre.map(v=>cell(v.toFixed(1)))],[cell('사후_평균',{bold:true}),...post.map(v=>cell(v.toFixed(1)))],[cell('변화율(%)',{bold:true}),...rate.map((v,i)=>cell(`${v}% ${arrow(v)}${ord.indexOf(i)>=0?`  (${['1st','2nd','3rd'][ord.indexOf(i)]})`:''}`,{bold:ord.indexOf(i)>=0,color:ord.indexOf(i)>=0?'256A70':INK}))]],{x:0.5,y:5.15,w:12.3,colW:[1.8,2.1,2.1,2.1,2.1,2.1],rowH:0.4,fontSize:12,border:{type:'solid',pt:0.5,color:LINE}});
    });
    const fp=FACTORS.map((f,i)=>r1f(mean(pp.map(p=>p.pre[i])))),fo=FACTORS.map((f,i)=>r1f(mean(pp.map(p=>p.post[i])))),fr=fp.map((v,i)=>v?r1f((fo[i]-v)/v*100):0),ftop=fr.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]).slice(0,5).map(x=>x[1]);
    add('2. 사전사후 상세 (요인별)',`요인별 5점 평균 · n=${pp.length}`,s=>{
      col(s,FACTORS.map(f=>f[0]),[{name:'사전_평균',values:fp,color:PGRAY},{name:'사후_평균',values:fo,color:CORAL}],{y:1.1,h:4.2,valAxisMaxVal:5,valAxisMajorUnit:1,dataLabelFormatCode:'0.0',dataLabelFontSize:8,catAxisLabelFontSize:9});
      txt(s,'변화율 TOP5  '+ftop.map(i=>`${FACTORS[i][0]} ${fr[i]}% ▲`).join('   '),{x:0.5,y:5.5,w:12.3,h:0.6,fontSize:13,bold:true,color:'256A70'});
      txt(s,'cognition  ←  자기인식 · 직업탐색 · 의사결정 · 커리어플랜 · 목표실행  →  behavior',{x:0.5,y:6.2,w:12.3,h:0.4,fontSize:11,color:SOFT});
    });
    const ap=A('pre'),ao=A('post'),ad=ap.map((v,i)=>r1f(ao[i]-v)),ar=ap.map((v,i)=>v?r1f((ao[i]-v)/v*100):0),arank=ar.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]).map(x=>x[1]);
    add('2. 사전사후 상세 (표)','노란색: 요인별 변화율 TOP5',s=>{
      const rows=[[hdr('요인'),hdr('영역'),hdr('사전'),hdr('사후'),hdr('변화'),hdr('변화율(%)')]];
      FACTORS.forEach((f,i)=>{const hl=ftop.includes(i)?{fill:{color:'FFC000'},bold:true}:{};rows.push([cell(f[0],{align:'left'}),cell(AREAS[Math.floor(i/3)].k),cell(fp[i].toFixed(1)),cell(fo[i].toFixed(1)),cell(sgn(r1f(fo[i]-fp[i]))),cell(sgn(fr[i]),hl)])});
      s.addTable(rows,{x:0.5,y:1.1,w:8.2,colW:[2,1.5,1.1,1.1,1.1,1.4],rowH:0.3,fontSize:10,border:{type:'solid',pt:0.5,color:LINE}});
      const r2=[[hdr('영역 종합(15점)'),hdr('사전'),hdr('사후'),hdr('변화율'),hdr('순위')]];
      AREAS.forEach((a,i)=>r2.push([cell(a.k,{align:'left',bold:true}),cell(ap[i].toFixed(1)),cell(ao[i].toFixed(1)),cell(sgn(ar[i])+'%',arank.indexOf(i)<3?{fill:{color:'F4A261'},bold:true}:{}),cell(['1st','2nd','3rd','4th','5th'][arank.indexOf(i)])]));
      s.addTable(r2,{x:9,y:1.1,w:3.9,colW:[1.3,0.6,0.6,0.8,0.6],rowH:0.4,fontSize:10,border:{type:'solid',pt:0.5,color:LINE}});
    });
  }
  if(sv.length){
    const q=(k)=>[5,4,3,2,1].map(v=>r1f(sv.filter(p=>p.sat[k]===v).length/sv.length*100));
    const avg=k=>r1f(mean(sv.map(p=>p.sat[k])));
    add('3. 만족도',`만족도 응답 n=${sv.length} · 단위: %`,s=>{
      qbar(s,'Q 1.0 서비스에 대한 전반적인 만족도',0.5,1.1,6);qbar(s,'Q 2.0 새로운 경력을 만들어가는데 유익했는지 여부',6.9,1.1,5.9);
      txt(s,`종합평균 ${avg('q1')}점 · 전체 긍정 만족도 ${r1f(q('q1')[0]+q('q1')[1])}%`,{x:0.5,y:1.6,w:6,h:0.4,bold:true,fontSize:13,color:'256A70'});
      txt(s,`종합평균 ${avg('q2')}점 · 전체 긍정 ${r1f(q('q2')[0]+q('q2')[1])}%`,{x:6.9,y:1.6,w:5.9,h:0.4,bold:true,fontSize:13,color:'256A70'});
      hbar(s,['매우 만족','만족','보통','불만족','매우 불만족'],q('q1'),CORAL,{x:0.5,y:2.1,w:6,h:4});
      hbar(s,['매우 그렇다','그렇다','보통','아니다','매우 아니다'],q('q2'),CORAL,{x:6.9,y:2.1,w:5.9,h:4});
    });
    const O32=OPT['expect.d32'],m0=O32.map(o=>sv.filter(p=>(p.expect.d32||[])[0]===o).length),m1=O32.map(o=>sv.filter(p=>(p.sat.d32||[])[0]===o).length),pos=a=>r1f((a[0]+a[1])/sv.length*100);
    add('4. 만족도_심리적 안정감',`n=${sv.length}`,s=>{
      qbar(s,'Q 3.0 서비스 이후 심리적 안정감',0.5,1.1,12.3);
      txt(s,`긍정적 마음 상태  사전 ${pos(m0)}%  →  사후 ${pos(m1)}%  (${sgn(r1f(pos(m1)-pos(m0)))}%p)`,{x:0.5,y:1.65,w:12.3,h:0.4,bold:true,fontSize:14,color:'256A70'});
      col(s,nl(SH.d32),[{name:'사전응답',values:m0,color:PRE},{name:'사후응답',values:m1,color:MINT}],{x:0.5,y:2.1,w:8,h:4.6,catAxisLabelFontSize:9});
      s.addChart(P.charts.BAR,[{name:'평균',labels:['불안이 줄었다','자신감이 높아졌다','마음이 안정되었다'],values:['q3a','q3b','q3c'].map(avg)}],{x:8.7,y:2.1,w:4.1,h:4.6,barDir:'bar',chartColors:[MINT],showLegend:false,showValue:true,dataLabelFormatCode:'0.0',dataLabelFontSize:11,dataLabelFontFace:FONT,catAxisLabelFontFace:FONT,catAxisLabelFontSize:10,catAxisOrientation:'maxMin',valAxisMinVal:0,valAxisMaxVal:5,valAxisMajorUnit:1,valGridLine:{color:LINE,size:0.5},showTitle:true,title:'심리적 안정감 문항 (5점)',titleFontFace:FONT,titleFontSize:11,titleColor:INK});
    });
    const O33=OPT['expect.d33'],c0=cnt(sv,p=>p.expect.d33||[],O33),c1=cnt(sv,p=>p.sat.d33||[],O33),t5=top3(c0);
    add('5. 만족도_호소문제의 변화',`n=${sv.length} · 단위: 명(중복선택)`,s=>{
      qbar(s,'Q 4.0 사전(퇴직을 맞이하며 고민되는 부분) → 사후(서비스 이후 가장 고민되는 부분)',0.5,1.1,12.3);
      pills(s,t5.map(i=>`${O33[i]} (${r1f(c0[i]/(sum(c0)||1)*100)}%, ${c0[i]}명)`),0.5,1.9,4.2);
      txt(s,t5.map((i,k)=>{const c=c0[i]?r1f((c1[i]-c0[i])/c0[i]*100):0;return `TOP ${k+1} 변화율 ${c}% ${arrow(c)}`}).join('\n'),{x:0.5,y:4.6,w:4.2,h:1,fontSize:12,color:'256A70',bold:true});
      col(s,nl(SH.d33),[{name:'사전응답',values:c0,color:PRE},{name:'사후응답',values:c1,color:MINT}],{x:4.9,y:1.7,w:7.9,h:4.9,catAxisLabelFontSize:9});
    });
    const O34=OPT['expect.d34'],e0=O34.map(o=>sv.filter(p=>(p.expect.d34||[])[0]===o).length),e1=O34.map(o=>sv.filter(p=>(p.sat.d34||[])[0]===o).length),O35=OPT['expect.d35'],b0=cnt(sv,p=>p.expect.d35||[],O35),b1=cnt(sv,p=>p.sat.d35||[],O35),t34=top3(e0),t35=top3(b1);
    add('6. 만족도_컨설팅 기대 및 효과',`n=${sv.length} · 기대 충족도 평균 ${r1f(mean(sv.map(p=>p.sat.q5fit)))}점`,s=>{
      qbar(s,'Q 5.0 사전(컨설팅 기대) → 사후(도움이 된 부분)',0.5,1.1,6.1);qbar(s,'Q 6.0 사전(경력준비 장애요인) → 사후(극복된 장애요인)',6.8,1.1,6);
      col(s,nl(SH.d34),[{name:'사전응답',values:e0,color:PRE},{name:'사후응답',values:e1,color:MINT}],{x:0.5,y:1.6,w:6.1,h:4,catAxisLabelFontSize:8});
      col(s,nl(SH.d35),[{name:'사전응답',values:b0,color:PRE},{name:'사후응답',values:b1,color:MINT}],{x:6.8,y:1.6,w:6,h:4,catAxisLabelFontSize:9});
      txt(s,'기대 TOP3  '+t34.map((i,k)=>`${k+1}. ${nl([SH.d34[i]])[0]} (${e0[i]}명)`).join('   '),{x:0.5,y:5.8,w:6.1,h:0.8,fontSize:10,color:INK});
      txt(s,'극복 TOP3  '+t35.map((i,k)=>`${k+1}. ${nl([SH.d35[i]])[0]} (${b1[i]}건)`).join('   '),{x:6.8,y:5.8,w:6,h:0.8,fontSize:10,color:INK});
    });
    const O7=OPT['sat.q7'],c7=O7.map(o=>sv.filter(p=>(p.sat.q7||[]).includes(o)).length),i7=c7.map((v,i)=>i).sort((a,b)=>c7[b]-c7[a]||a-b);
    add('7. 만족도_전반적인 만족도(개선요인)',`n=${sv.length} · 최대 2개 선택`,s=>{
      qbar(s,'Q 7.0 개선이 필요한 부분',0.5,1.1,12.3);
      hbar(s,i7.map(i=>O7[i]),i7.map(i=>r1f(c7[i]/sv.length*100)),CORAL,{x:0.5,y:1.7,w:8.6,h:4.9});
      txt(s,`전반적 만족도  ${avg('q1')}점\n\n경력 설계 유익도  ${avg('q2')}점\n\n자유 의견  ${sv.filter(p=>(p.sat.q7txt||'').trim()).length}건`,{x:9.4,y:2.2,w:3.4,h:2.6,fontSize:16,bold:true,color:'256A70'});
    });
  }
  if(pe.length){
    const O36=OPT['expect.d36'],c36=cnt(pe,p=>p.expect.d36||[],O36),t36=top3(c36);
    add('8. 첫회기 컨설팅에 대한 기대',`사전 응답자 n=${pe.length} · 단위: 건(중복 최대 2개)`,s=>{
      qbar(s,'Q 7.0 첫 회기 컨설팅 기대, TOP3',0.5,1.1,4.2);qbar(s,'Q 7.1 첫 회기 컨설팅은 어떤 형식으로 진행하기를 바라나요?',4.9,1.1,7.9);
      pills(s,t36.map(i=>`${O36[i]} (${c36[i]}건, ${r1f(c36[i]/pe.length*100)}%)`),0.5,1.9,4.2);
      col(s,nl(SH.d36),[{name:'사전응답',values:c36,color:PRE}],{x:4.9,y:1.7,w:7.9,h:4.9,catAxisLabelFontSize:9});
    });
  }
  if(sv.length){
    const ops=sv.map(p=>(p.sat.q7txt||'').trim()).filter(Boolean);
    for(let k=0;k<Math.max(1,Math.ceil(ops.length/10));k++){
      add('9. 만족도_기타의견'+(ops.length>10?` (${k+1})`:''),`총 ${ops.length}건 · 코드로만 표시`,s=>{
        qbar(s,'더 나은 서비스를 위한 개인적인 의견, 담당 컨설턴트에게 보내는 메시지, 개선할 사항 등',0.5,1.1,12.3);
        const rows=[[hdr('No.'),hdr('Code'),hdr('의견')]];
        ops.slice(k*10,k*10+10).forEach((t,j)=>{const n=k*10+j+1;rows.push([cell(n,{fill:{color:'D7EBEC'},bold:true}),cell('Code_'+String(n).padStart(3,'0'),{color:SOFT}),cell(t,{align:'left'})])});
        if(!ops.length)rows.push([cell('-'),cell('-'),cell('작성된 의견이 없습니다.',{align:'left'})]);
        s.addTable(rows,{x:0.5,y:1.7,w:12.3,colW:[0.7,1.6,10],rowH:0.44,fontSize:12,border:{type:'solid',pt:0.5,color:LINE}});
      });
    }
    if(ops.length){
      const kw=[['감사','감사 표현'],['도움','도움이 되었다'],['정보','정보 제공'],['자신감','자신감·용기'],['시간','시간·진행 관련'],['추가','추가 상담 요청']];
      add('9. 만족도_기타의견 (키워드)','문구 포함 여부 기준 자동 집계',s=>{
        qbar(s,'의견 키워드 비율 (%)',0.5,1.1,12.3);
        hbar(s,kw.map(x=>x[1]),kw.map(([k])=>r1f(ops.filter(t=>t.includes(k)).length/ops.length*100)),CORAL,{x:0.5,y:1.7,w:12.3,h:4.8});
      });
    }
  }
  const tot=L.length+1;
  const c=P.addSlide();c.background={color:'F1F8F5'};
  c.addShape(P.ShapeType.rect,{x:0,y:0,w:13.33,h:2.6,fill:{color:'AFD6D9'},line:{color:'AFD6D9'}});
  const ent=ENT.find(e=>e.name===S.rep.company);
  if(ent&&ent.logo){try{c.addImage({data:ent.logo,x:0.7,y:0.5,w:2.2,h:0.9,sizing:{type:'contain',w:2.2,h:0.9}})}catch(e){}}
  c.addText('세컨플래닝 사전사후 참여결과 보고서',{x:0.7,y:2.9,w:12,h:1,fontFace:FONT,fontSize:36,bold:true,color:'256A70'});
  c.addText('The better life, The better career',{x:0.7,y:3.9,w:12,h:0.5,fontFace:FONT,fontSize:16,color:SOFT});
  c.addText(`${scope}\n사전·사후 참여자 ${d.N}명 · 사전 응답자 ${pe.length}명\n작성일 ${today()}`,{x:0.7,y:4.8,w:12,h:1.4,fontFace:FONT,fontSize:16,color:INK});
  c.addText('© 2026 JMCAREER · The Human Data Center',{x:0.7,y:6.9,w:8,h:0.3,fontFace:FONT,fontSize:10,color:SOFT});
  L.forEach((it,i)=>{
    const s=P.addSlide();s.background={color:'F1F8F5'};
    s.addShape(P.ShapeType.rect,{x:0,y:0,w:0.18,h:7.5,fill:{color:CORAL},line:{color:CORAL}});
    s.addText(it.title,{x:0.5,y:0.25,w:8.2,h:0.6,fontFace:FONT,fontSize:22,bold:true,color:INK});
    s.addText(`${scope} · ${it.note}`,{x:6.8,y:0.3,w:6,h:0.5,fontFace:FONT,fontSize:10,color:SOFT,align:'right'});
    s.addText('© 2026 JMCAREER · The Human Data Center',{x:0.5,y:7.08,w:8,h:0.3,fontFace:FONT,fontSize:9,color:SOFT});
    s.addText(`${i+2} / ${tot}`,{x:11.8,y:7.08,w:1.1,h:0.3,fontFace:FONT,fontSize:9,color:SOFT,align:'right'});
    it.draw(s);
  });
  return await P.write({outputType:'blob'});
}

/* ---------- 상담사 ---------- */
const backV=()=>S.mode==='counselor'?'cns':'admin';
const backLbl=()=>S.mode==='counselor'?'내 내담자로':'관리자로';
function allCons(){const m={};ENT.forEach(e=>e.consultants.forEach(c=>{if(!m[c.code])m[c.code]=c}));return Object.values(m)}
const myEnts=()=>ENT.filter(e=>e.consultants.some(c=>c.code===S.cc));
function vCns(){
  const cl=allCons();
  if(!cl.length)return `<div class="wrap" style="padding-top:26px"><div class="card empty">등록된 컨설턴트가 없습니다. 관리자가 컨설턴트를 먼저 등록해야 합니다.</div></div>`;
  if(!cl.some(c=>c.code===S.cc))S.cc=cl[0].code;
  const tabs=[['list','내 내담자 현황'],['reg','내담자 등록'],['rep','사전사후 보고서']];
  return `<div class="wrap" style="padding-top:26px"><div class="filters" style="justify-content:space-between"><div><h2 style="font-size:24px">상담사 페이지</h2><div class="hintline">담당 내담자의 진행 현황과 결과 리포트를 확인합니다.</div></div>
  <label class="hintline" style="display:flex;gap:8px;align-items:center">상담사 선택(데모) <select class="in" onchange="S.cc=this.value;S.f.company='전체';S.f.page=1;S.cent=null;S.created=[];render()">${cl.map(c=>`<option value="${esc(c.code)}" ${c.code===S.cc?'selected':''}>${esc(c.n)} (${esc(c.code)})</option>`).join('')}</select></label></div>
  <div class="perm"><b>상담사 권한</b> 담당 내담자 조회 · 결과 리포트 열람 · 응답 수정(재계산·이력) · 내담자 등록(본인 담당으로 자동 배정) · 담당 내담자 사전사후 보고서<span class="no">기업·컨설턴트·고객사 담당자 등록/삭제, 로고 변경, 다른 상담사의 내담자 조회는 관리자 권한입니다.</span></div>
  <div class="tabs">${tabs.map(([k,t])=>`<button class="${S.ctab===k?'on':''}" onclick="S.ctab='${k}';S.created=[];S.bulk='';S.berr='';render();window.scrollTo(0,0)">${t}</button>`).join('')}</div>
  ${S.ctab==='list'?part2(true):S.ctab==='reg'?cnsReg():aReport(true)}</div>`;
}
function cnsReg(){
  const es=myEnts();
  if(!es.length)return '<div class="card empty">배정된 기업이 없습니다. 관리자에게 기업 배정을 요청해 주세요.</div>';
  if(!S.cent||!es.some(e=>e.id===S.cent))S.cent=es[0].id;
  const e=es.find(x=>x.id===S.cent),me=COUNSELORS[S.cc]||{n:''};
  return `<section class="card"><div class="filters" style="justify-content:space-between"><h2 style="margin:0">내담자 등록 (엑셀 리스트)</h2><label class="hintline" style="display:flex;gap:8px;align-items:center">기업 <select class="in" onchange="S.cent=this.value;render()">${es.map(x=>`<option value="${x.id}" ${x.id===S.cent?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label></div>
  <p class="sub">붙여넣은 내담자는 ${esc(me.n)} 상담사 담당으로 배정되고, 연락처 끝 8자리가 아이디가 됩니다. 열 순서: 닉네임, 연락처, 비밀번호(비우면 6자리 자동 부여)</p>
  <div class="field"><textarea class="in" id="bulk" placeholder="길벗, 010-3456-7890&#10;달님, 01045678901, 482913">${esc(S.bulk)}</textarea></div>
  <div class="acts"><button class="btn" onclick="addClients({ent:ENT.find(x=>x.id===S.cent),cc:S.cc})">내담자 등록하고 계정 부여</button><label class="btn ghost" style="cursor:pointer">CSV 불러오기<input type="file" accept=".csv,.txt" style="display:none" onchange="readCsv(this)"></label></div>
  <div class="err" style="margin-top:8px">${esc(S.berr)}</div>
  ${S.created.length?`<div class="acct"><h3 style="font-size:15px;margin-bottom:8px">이번에 부여한 계정</h3><div class="scroll"><table class="t zebra"><tr><th>닉네임</th><th>아이디</th><th>비밀번호</th><th>안내</th></tr>${S.created.map(id=>{const p=byId(id);return p?`<tr><td>${esc(p.nick)}</td><td>${p.id}</td><td>${p.pw}</td><td><button class="btn ghost sm" onclick="copyText(msgOf(byId('${p.id}'))+'\\n비밀번호: ${p.pw}','문자 문구를 복사했습니다')">문자 문구 복사</button></td></tr>`:''}).join('')}</table></div></div>`:''}</section>`;
}

/* ---------- 고객사 담당자 ---------- */
const rndPw=()=>String(Math.floor(100000+Math.random()*900000));
function newMgrId(){const nums=ENT.flatMap(e=>e.managers.map(m=>+String(m.id).replace(/\D/g,''))).filter(x=>!isNaN(x));return 'cm'+(Math.max(1000,...nums)+1)}
function mgrMsg(e,id,pw){return `[세컨플래닝] ${e.name} 담당자님, 진단 현황 확인 계정을 안내드립니다.\n접속 링크: ${location.href.split('#')[0].split('?')[0]}#client\n아이디: ${id}\n비밀번호: ${pw}`}
function mgrSection(e){
  const nw=S.mgrNew&&S.mgrNew.ent===e.id?S.mgrNew:null;
  return `<section class="card sec" id="mgr-reg"><h2>4. 고객사 담당자 등록 · ${esc(e.name)}</h2><p class="sub">고객사 담당자는 자사 인원의 사전·사후 완료율 차트만 볼 수 있습니다. 등록하면 아이디와 비밀번호(6자리)가 자동으로 만들어집니다.</p>
  <div class="row3"><div class="field"><label for="mg-name">담당자 이름</label><input class="in" id="mg-name" maxlength="20"></div><div class="field"><label for="mg-mail">이메일</label><input class="in" id="mg-mail" type="email"></div><div class="field"><label for="mg-tel">연락처</label><input class="in" id="mg-tel" inputmode="tel"></div></div>
  <div class="err" id="mg-err"></div><button class="btn mint sm" onclick="addMgr()">담당자 등록하고 계정 부여</button>
  ${nw?`<div class="quote" style="margin-top:16px"><strong>부여된 계정 · 비밀번호는 이 화면에서만 확인할 수 있어요</strong>아이디 <b>${esc(nw.id)}</b> · 비밀번호 <b>${esc(nw.pw)}</b><div style="margin-top:10px"><button class="btn ghost sm" onclick="copyText(mgrMsg(curEnt(),'${nw.id}','${nw.pw}'),'안내 문구를 복사했습니다')">안내 문구 복사</button></div></div>`:''}
  <div class="scroll acct">${e.managers.length?`<table class="t zebra"><tr><th>이름</th><th>이메일</th><th>연락처</th><th>아이디</th><th>등록일</th><th></th></tr>${e.managers.map(m=>`<tr><td>${esc(m.n)}</td><td>${esc(m.mail)}</td><td>${esc(m.tel)}</td><td>${esc(m.id)}</td><td>${esc(m.created||'-')}</td><td><div class="acts"><button class="btn ghost sm" onclick="reissueMgr('${m.id}')">비밀번호 재발급</button><button class="btn ghost sm" onclick="delMgr('${m.id}')">삭제</button></div></td></tr>`).join('')}</table>`:'<div class="empty">등록된 고객사 담당자가 없습니다.</div>'}</div></section>`;
}
function addMgr(){
  const e=curEnt(),n=$('#mg-name').value.trim(),mail=$('#mg-mail').value.trim(),tel=$('#mg-tel').value.trim(),er=$('#mg-err');
  if(!n||!mail||!tel){er.textContent='이름, 이메일, 연락처를 모두 입력해 주세요.';return}
  if(!/^\S+@\S+\.\S+$/.test(mail)){er.textContent='이메일 형식을 확인해 주세요.';return}
  const id=newMgrId(),pw=rndPw();e.managers.push({id,pw,n,mail,tel,created:today()});S.mgrNew={ent:e.id,id,pw};save();render();toast('담당자 계정을 부여했습니다');
}
function reissueMgr(id){const e=curEnt(),m=e.managers.find(x=>x.id===id);if(!m)return;m.pw=rndPw();S.mgrNew={ent:e.id,id,pw:m.pw};save();render();toast('비밀번호를 재발급했습니다')}
function delMgr(id){const e=curEnt();e.managers=e.managers.filter(x=>x.id!==id);if(S.mgrNew&&S.mgrNew.id===id)S.mgrNew=null;if(S.mgr&&S.mgr.id===id)S.mgr=null;save();render();toast('담당자 계정을 삭제했습니다')}
function vClogin(){
  return `<section class="hero" style="padding:48px 0 120px"><div class="blob b1"></div><div class="blob b3"></div>${forestSVG('hf',300)}<div class="wrap"><div class="hero-grid">
  <div><div class="pill">고객사 담당자</div><h1>우리 회사 참여 현황을<br><span class="hl">한눈에 확인하세요</span></h1><p class="lead">전체 인원 대비 사전 진단 완료율과 사후 진단 완료율을 차트로 볼 수 있습니다. 개인별 응답과 결과는 공개되지 않고 인원 집계만 제공됩니다.</p><div class="hint">⊙ 아이디와 비밀번호는 세컨플래닝 운영팀에서 부여해 드립니다</div></div>
  <form class="card" onsubmit="event.preventDefault();doMgrLogin()" autocomplete="off"><h2>담당자 로그인</h2><p class="sub">부여받은 아이디와 비밀번호를 입력해 주세요.</p>
  <div class="field"><label for="mg-id">아이디</label><input class="in" id="mg-id" maxlength="20" autocapitalize="off"></div>
  <div class="field"><label for="mg-pw">비밀번호</label><input class="in" id="mg-pw" type="password" inputmode="numeric" maxlength="6"></div>
  <div class="err" id="mgl-err"></div><button class="btn block" type="submit">로그인</button>
  <p class="hintline" style="margin-top:12px">체험용: 아이디 cm1001 · 비밀번호 246810 (다이소 담당자)</p></form></div></div></section>`;
}
function doMgrLogin(){
  const id=$('#mg-id').value.trim(),pw=$('#mg-pw').value.trim();let hit=null;
  ENT.forEach(e=>e.managers.forEach(m=>{if(m.id===id&&m.pw===pw)hit={e,m}}));
  if(!hit){$('#mgl-err').textContent='아이디 또는 비밀번호가 맞지 않습니다.';return}
  S.mgr={ent:hit.e.id,id:hit.m.id,n:hit.m.n};nav('cdash');
}
function logoutMgr(){S.mgr=null;nav('clogin')}
function donut(n,total,cls,label){
  const pct=total?Math.round(n/total*100):0,R=54,C=2*Math.PI*R,d=C*pct/100;
  return `<div class="donut"><svg viewBox="0 0 140 140" role="img" aria-label="${label} ${pct}%, ${total}명 중 ${n}명"><circle class="dn-bg" cx="70" cy="70" r="${R}"/><circle class="dn-fg ${cls}" cx="70" cy="70" r="${R}" stroke-dasharray="${d} ${C-d}" transform="rotate(-90 70 70)"/><text x="70" y="70" text-anchor="middle" class="dn-pct">${pct}%</text><text x="70" y="92" text-anchor="middle" class="dn-sub">${n} / ${total}명</text></svg><div class="dn-lab">${label}</div></div>`;
}
function vCdash(){
  const ent=S.mgr&&ENT.find(e=>e.id===S.mgr.ent);
  if(!ent){S.mgr=null;return vClogin()}
  const L=DB.filter(p=>p.company===ent.name),total=L.length,pre=L.filter(preDone).length,post=L.filter(p=>full(p.post)).length;
  const k=x=>L.filter(p=>status(p).k===x).length,seg=[['new','미시작','var(--line)'],['prog','진행 중','var(--gold)'],['pre','사전 완료','var(--pre)'],['post','사후 완료','var(--post)']];
  const pc=n=>total?Math.round(n/total*100):0;
  const groups=ent.consultants.map(c=>({n:c.n,L:L.filter(p=>p.counselor===c.code)})).filter(g=>g.L.length);
  const un=L.filter(p=>!ent.consultants.some(c=>c.code===p.counselor));if(un.length)groups.push({n:'미배정',L:un});
  const rate=(g,f)=>Math.round(g.L.filter(f).length/g.L.length*100);
  return `<div class="wrap"><div class="cl-head"><div class="who">${ent.logo?`<img class="logo" src="${ent.logo}" alt="${esc(ent.name)} 로고">`:''}<div><h2 style="font-size:24px">${esc(ent.name)} 진단 현황</h2><div class="hintline">${esc(ent.start)} ~ ${esc(ent.end)} · ${esc(S.mgr.n)} 담당자님</div></div></div>
  <div class="acts noprint"><button class="btn ghost sm" onclick="window.print()">PDF로 저장(인쇄)</button><button class="btn ghost sm" onclick="logoutMgr()">로그아웃</button></div></div>
  ${total?`<div class="tiles"><div class="tile"><span>전체 인원</span><b>${total}</b></div><div class="tile c2"><span>사전 완료</span><b>${pre}</b></div><div class="tile c1"><span>사후 완료</span><b>${post}</b></div><div class="tile c3"><span>사전 미완료</span><b>${total-pre}</b></div></div>
  <section class="card sec"><h2>전체 인원 대비 완료율</h2><p class="sub">전체 ${total}명 기준입니다.</p><div class="row2" style="align-items:center">${donut(pre,total,'dpre','사전 진단 완료율')}${donut(post,total,'dpost','사후 진단 완료율')}</div>
  <p class="hintline" style="text-align:center;margin-top:12px">${pre?`사전 진단을 마친 ${pre}명 중 ${Math.round(post/pre*100)}%가 사후 진단까지 완료했습니다.`:'아직 사전 진단을 완료한 인원이 없습니다.'}</p></section>
  <section class="card sec"><h2>진행 단계별 인원</h2><div class="stk" role="img" aria-label="진행 단계별 인원 비율">${seg.map(([x,t,c])=>`<span style="width:${pc(k(x))}%;background:${c}" title="${t} ${k(x)}명"></span>`).join('')}</div>
  <div class="legend">${seg.map(([x,t,c])=>`<span><i class="sw" style="background:${c}"></i>${t} ${k(x)}명 (${pc(k(x))}%)</span>`).join('')}</div></section>
  ${groups.length?`<section class="card sec"><h2>담당 컨설턴트별 완료율</h2><p class="sub">각 컨설턴트가 맡은 인원 대비 비율입니다.</p><div class="legend"><span><i class="sw" style="background:var(--pre)"></i>사전 완료율</span><span><i class="sw" style="background:var(--post)"></i>사후 완료율</span></div>${barsSVG([{vals:groups.map(g=>rate(g,preDone)),cls:'rpre'},{vals:groups.map(g=>rate(g,p=>full(p.post))),cls:'rpost'}],groups.map(g=>g.n+' ('+g.L.length+'명)'),'컨설턴트별 사전 사후 완료율')}</section>`:''}`
  :`<div class="card empty">아직 등록된 참여 인원이 없습니다. 운영팀에서 참여자를 등록하면 이곳에 완료율이 표시됩니다.</div>`}
  <p class="hintline" style="margin:6px 0 0">개인별 응답과 결과는 공개되지 않으며, 인원 집계만 제공됩니다.</p></div>`;
}

const profile=createProfile({byId,pname,getEntities:()=>ENT,entOf,pmOf,resultOf,backV,backLbl,editPanel,jmLogo,hdcLogo,leafSVG,sheetHead,sheetFoot,etcOf,agreed,bandCells,chartLegend,barsSVG});

const legacyGlobalValues={
  a2Msg,ageMsg,ansText,applyCounselorEdit,areaScores,cmtParts,commentArea,computeResult,demoD36,demoSat,emptyP,fitSheets,fmtDate,fmtPhone,gradeBy,gradeOf,gradeUnsure,missing,nav,openRes,recomputeResult,render,resultOf,save,seed,seedEnt,selfTests,setMode,setPath,startEdit,status,steps,toAssessment,toSat,vVerify,
  ACTIVE_COMPARE,ACTIVE_GRADE,ageBand,AREA_COUNT,AREAS,byId,C_CODES,CMT,COMPARE_SETS,EVAL_VERSION,FACTORS,full,GOAL_TO_KW,GRADE_NAMES,GRADE_SETS,gradeTxt,ITEMS_PER_AREA,KW_AGE,KW_GOAL,KW_PRO,LIM,OPT,qdByPath,qdFactors,qdMax,qdOptions,qdRequired,qdStepCodes,qdText,qLabel,QLABEL,qName,QNO,QT,QUESTION_DEFS,QUESTION_STEPS,REF_AVG,REQUIRED,S,SCALE,SH,stepOf,TOTAL_Q,WSTEPS,
  setF,goPage,copyText,goEp,goStep,addClients,answer,copyLink,dl,goHome,msgOf,nextFrom,previewReport,readCsv,rmove,selEnt,a2Hint,addCons,addEnt,addMgr,cancelEdit,clearLogo,curEnt,delCons,delEnt,delMgr,doLogin,doMgrLogin,exportPptx,finishPost,goQ,goReg,logout,logoutMgr,mgrMsg,nextStep,reissueMgr,rgo,saveEdit,setBirth,setCareer,setConsent,setFc,setFq,setFs,setLogo,setSat,submitPre,toggleChip,$
};
installLegacyGlobals(legacyGlobalValues,{
  DB:{get:()=>DB,set:value=>{DB=value}},
  ENT:{get:()=>ENT,set:value=>{ENT=value}},
  COUNSELORS:{get:()=>COUNSELORS,set:value=>{setCounselors(value)}}
});

/* ---------- 시작 ---------- */
(function(){
  const h=location.hash||'';
  if(h==='#client'){S.mode='client';S.view='clogin'}
  if(h.indexOf('#join=')===0||h.indexOf('#join-')===0){S.prefill=h.slice(6).replace(/\D/g,'').slice(0,8)}
  render();
})();
