import {S} from '../../shared/state.js';
import {COUNSELORS} from '../../js/03-options.js';

// 기존 프로토타입 연결을 주입한다. 계산 엔진과 저장 구현은 진입점에 둔다.
function createSurvey({save,render,nav,toast,getPath,setPath,OPT,LIM,ITEM_COUNT,REQUIRED,stepOf,agreed,parseBirth,PHONE_RE,EMAIL_RE,C_CODES,full,today,computeResult,EVAL_VERSION,ageMsg,submitAssessment}){
function setF(path,val){const p=S.user;if(!p)return;setPath(p,path,val);save()}
function setCareer(i,k,v){const p=S.user;p.reg.careers[i]=p.reg.careers[i]||{};p.reg.careers[i][k]=v;save()}
function toggleChip(path,i,root){
  const p=root==='x'?S.user:S.user;const arr=(getPath(p,path)||[]).slice();const o=OPT[path][i];const max=LIM[path]||1;const at=arr.indexOf(o);
  if(at>=0)arr.splice(at,1);else{if(max===1)arr.length=0;if(arr.length>=max){toast('최대 '+max+'개까지 선택할 수 있어요');return}arr.push(o)}
  setPath(p,path,arr);save();render();
}
function answer(i,v){const p=S.user;const t=S.mode2==='post'?'post':'pre';if(t==='post'&&!p.post)p.post=Array(ITEM_COUNT).fill(null);p[t][i]=v;save();render()}
function missing(p){
 const r=p.reg||{},c0=(r.careers||[])[0]||{},g=p.goal||{},e=p.expect||{},out=[];
 const add=(code,msg)=>{if(REQUIRED[code]!==false)out.push({code,step:stepOf(code),msg})};
 const blank=v=>!String(v==null?'':v).trim();
 if(r.a1!=='동의'&&!agreed(p))add('A1',r.a1==='미동의'?'개인정보 제공 및 활용에 동의해야 설문에 참여할 수 있습니다.':'동의 여부를 선택해 주세요.');
 if(blank(p.counselor))add('A2','상담코드를 입력해 주세요.');
 if(blank(r.name))add('A3','성함을 입력해 주세요.');
 if(!r.gender)add('A4','성별을 선택해 주세요.');
 if(blank(r.birthDate))add('A5','생년월일을 입력해 주세요.');else if(!parseBirth(r.birthDate))add('A5','생년월일을 YYYY-MM-DD 형식의 실제 날짜로 입력해 주세요.');
 if(blank(r.phone))add('PH','휴대전화번호를 입력해 주세요.');else if(!PHONE_RE.test(r.phone))add('PH','휴대전화번호 형식을 확인해 주세요. (예: 010-1234-5678)');
 if(blank(r.email))add('EM','이메일을 입력해 주세요.');else if(!EMAIL_RE.test(String(r.email).trim()))add('EM','이메일 형식을 확인해 주세요. (예: name@example.com)');
 if(blank(c0.co))add('A6','소속회사를 입력해 주세요.');
 if(blank(c0.title))add('A7','직급/직책을 입력해 주세요.');
 if(blank(c0.task))add('A8','업무(부서명)를 입력해 주세요.');
 if(!r.industry)add('A9','업종을 하나 선택해 주세요.');else if(r.industry==='기타'&&blank(r.industryEtc))add('A9','기타 내용을 입력해 주세요.');
 if(!r.income)add('A10','기대 소득수준을 하나 선택해 주세요.');else if(r.income==='기타'&&blank(r.incomeEtc))add('A10','기타 내용을 입력해 주세요.');
 if(!(g.b11||[]).length)add('B11','하나를 선택해 주세요.');
 if(!(g.b12||[]).length)add('B12','하나를 선택해 주세요.');
 const b13=g.b13||[];if(b13.length!==2||b13[0]===b13[1])add('B13','서로 다른 2가지를 1순위, 2순위 순서로 선택해 주세요. (현재 '+b13.length+'개)');
 if(!(g.b14||[]).length)add('B14','하나를 선택해 주세요.');
 if(blank(g.b15))add('B15','달성 가능성을 숫자로 입력해 주세요.');else if(!/^\d{1,3}$/.test(String(g.b15).trim())||+g.b15>100)add('B15','0~100 사이 숫자로 입력해 주세요.');
 if(blank(g.b16))add('B16','예상 소요기간을 개월 수로 입력해 주세요.');else if(!/^\d{1,3}$/.test(String(g.b16).trim())||+g.b16>600)add('B16','0~600 사이 개월 수로 입력해 주세요.');
 C_CODES.forEach((c,i)=>{const v=(p.pre||[])[i];if(!(v>=1&&v<=5))add(c,'응답을 선택해 주세요.')});
 if((e.d32||[]).length!==1)add('D32','하나를 선택해 주세요.');
 const d33=e.d33||[];if(d33.length!==3||new Set(d33).size!==3)add('D33','서로 다른 3가지를 순서대로 선택해 주세요. (현재 '+d33.length+'개)');
 if((e.d34||[]).length!==1)add('D34','하나를 선택해 주세요.');
 if((e.d35||[]).length!==2)add('D35','정확히 2가지를 선택해 주세요. (현재 '+(e.d35||[]).length+'개)');
 const n36=(e.d36||[]).length;if(n36<1||n36>2)add('D36','1~2가지를 선택해 주세요.');
 return out;
}
function goStep(n){S.step=n;S.err='';render();window.scrollTo(0,0)}
function goQ(step,code){S.step=step;S.showMiss=S.showMiss||{};S.showMiss[step]=1;render();setTimeout(()=>{const el=document.getElementById('q-'+code);if(el)el.scrollIntoView({block:'center',behavior:'smooth'})},60)}
function nextFrom(n){
  const p=S.user,m=missing(p).filter(x=>x.step===n);
  if(m.length){goQ(n,m[0].code);toast('표시된 문항을 확인해 주세요');return}
  if(n===1)p.done.reg=true;if(n===2)p.done.goal=true;
  save();goStep(n+1);
}
function submitPre(){
  const p=S.user,m=missing(p);
  if(m.length){S.showMiss={0:1,1:1,2:1,3:1,4:1};render();toast('누락된 항목이 있어 제출할 수 없습니다');return}
  if(submitAssessment)return submitAssessment(p);
  const now=new Date();
  p.done.reg=p.done.goal=p.done.expect=true;p.preDate=p.preDate||today();
  p.status='submitted';p.submittedAt=now.toISOString();
  // 제출 시점 스냅샷: 원응답 + 계산결과 + 코멘트·키워드 선택 + 담당 상담사 출력정보
  p.result=computeResult(p);
  p.result.evaluationVersion=EVAL_VERSION;
  p.result.snapshot={counselor:COUNSELORS[p.counselor]?Object.assign({code:p.counselor},COUNSELORS[p.counselor]):null,generatedAt:now.toISOString()};
  save();S.showMiss={};S.err='';nav('home');toast('제출했습니다');
}
function toSat(){const p=S.user;if(!full(p.post)){S.err='아직 답하지 않은 문항이 '+(p.post?p.post.filter(v=>!v).length:ITEM_COUNT)+'개 있습니다.';render();return}S.err='';S.pstep=2;render();window.scrollTo(0,0)}
function satOK(p){const t=p.sat||{};return ['q1','q2','q3a','q3b','q3c','q5fit'].every(k=>t[k]>=1)&&(t.d32||[]).length===1&&(t.d33||[]).length===3&&(t.d34||[]).length===1&&(t.d35||[]).length>=1&&(t.q7||[]).length>=1}
function setSat(k,v){const p=S.user;p.sat=p.sat||{};p.sat[k]=v;save();render()}
function finishPost(){
  const p=S.user;
  if(!full(p.post)){S.pstep=1;S.err='아직 답하지 않은 문항이 있습니다.';render();return}
  if(!satOK(p)){S.err='답하지 않은 설문 문항이 있습니다. 모든 문항에 답해 주세요. (Q5-1·Q6·Q7은 1개 이상 선택)';render();return}
  p.postDate=today();save();S.mode2='pre';S.pstep=1;S.err='';nav('home');toast('사후 진단을 제출했습니다');
}
function setConsent(o){const r=S.user.reg;r.a1=o;r.consent=o==='동의';save();render()}
function setBirth(v){setF('reg.birthDate',v);const b=parseBirth(v);if(b)setF('reg.birth',String(b.y));const e=document.getElementById('age-a5');if(e)e.textContent=ageMsg(v)}
return {setF,setCareer,toggleChip,answer,missing,goStep,goQ,nextFrom,submitPre,toSat,satOK,setSat,finishPost,setConsent,setBirth};
}

export {createSurvey};

