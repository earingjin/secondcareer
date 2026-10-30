import {S} from '../shared/state.js';
import {COUNSELORS,OPT,LIM} from '../js/03-options.js';
import {AREAS} from '../js/01-areas.js';
import {ITEM_COUNT,ITEMS_PER_AREA} from '../js/02-eval-config.js';
import {QUESTION_STEPS,qdText,qdOptions,qdRequired,qdStepCodes} from '../js/00-question-defs-module.js';
import {esc,getPath} from './fields.js';
export function createSurveyView({missing,pname}){
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

const TOTAL_Q=Object.keys(QT).length;
function chips(path){
  const sel=getPath(S.user,path)||[];const max=LIM[path]||1;
  return '<div class="chips">'+OPT[path].map((o,i)=>{const k=sel.indexOf(o);return `<button type="button" class="chip ${k>=0?'on':''}" aria-pressed="${k>=0}" onclick="toggleChip('${path}',${i})">${max>1&&k>=0?'<b>'+(k+1)+'</b>':''}${esc(qLabel(path,i,o))}</button>`}).join('')+'</div>';
}

/* ---------- 참여자: 로그인 ---------- */
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
  if(post)body='';else body=[wConsent,wReg,wGoal,wDiagPre,wExpect,wReview][S.step]();
  return `<div class="narrow${S.cedit?'':' mobile-survey'}" style="padding-top:20px">${S.cedit?`<div class="editbar">상담사 수정 모드 · ${esc(pname(p))}</div>`:''}${stepper(S.step,post)}<div class="card">${body}</div></div>`;
}
function wConsent(){
  const p=S.user,r=p.reg,c=COUNSELORS[p.counselor];
  const a2=c?`<div class="ro">${esc(p.counselor)} <span class="hintline">· ${esc(c.n)} 상담사 (초대 링크에서 자동 입력)</span></div>`
    :`<input class="in" maxlength="20" value="${esc(p.counselor||'')}" oninput="setF('counselor',this.value.trim());a2Hint(this.value.trim())" aria-label="상담코드"><div class="hintline" id="a2-hint" style="margin-top:6px">${a2Msg(p.counselor)}</div>`;
  return wHead(0,'참여 동의','세컨플래닝은 첫 상담 전에 응답하는 사전 설문입니다. 응답 결과는 상담 시간에 담당 상담사가 직접 설명해 드립니다.')
  +qb('A1',`<div class="cons" style="margin-bottom:12px"><b>개인정보수집 이용 및 정보제공 동의</b><br>01. 수집 및 이용 목적 : 본인식별정보를 통한 컨설팅 서비스 제공을 위함<br>02. 수집 항목 : 본 서비스 이용을 위한 성명, 주소, 연락처 및 개인이력서 등 개인식별정보<br>03. 보유기간 및 개인정보의 파기 : 신청서 접수일부터 서비스 종료 후 1년 또는 고객사의 즉각적인 파기 요청시 정보를 파기<br>04. 제3자 정보제공 : 취업(또는 창업) 등 다른 기관에 개인정보를 의뢰할 목적일 때, 서비스의 위탁기관에서 수행 결과를 요청<br><span class="hintline">※ 원본 고객등록신청서 문구. 웹 서비스용 법정 고지문은 검토 후 확정 예정</span></div>`
    +`<div class="chips" role="radiogroup">${['동의','미동의'].map(o=>`<button type="button" role="radio" class="chip ${r.a1===o||(o==='동의'&&r.a1==null&&r.consent)?'on':''}" onclick="setConsent('${o}')">${o}</button>`).join('')}</div>`)
  +qb('A2',a2)
  +`<div class="notice-s">응답은 서버 임시저장 후 다시 이어서 작성할 수 있습니다. 저장 상태를 확인해 주세요.</div>`
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
    Array.from({length:ITEMS_PER_AREA},(_,j)=>j).forEach(j=>{const i=ai*ITEMS_PER_AREA+j,code=C_CODES[i];
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

return {vWizard,ansText,parseBirth,PHONE_RE,EMAIL_RE,agreed,ageMsg,fmtDate,fmtPhone,a2Hint,REQUIRED,C_CODES,stepOf,WSTEPS,isSubmitted};
}
