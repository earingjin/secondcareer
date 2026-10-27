import {S} from './state.js';
import {esc} from '../js/04-util.js';
import {EVAL_VERSION} from '../js/02-eval-config.js';

function createCounselorEdit({byId,getDB,save,nav,render,toast,missing,ansText,getWSTEPS,toAssessment,qName,getCounselors,recomputeResultCore}){
// 재계산: 같은 영역·같은 분류면 제출 때 고른 코멘트·키워드를 유지하고, 바뀐 경우에만 새로 고른다
function recomputeResult(p,old){
  return recomputeResultCore(p,old,()=>({counselor:getCounselors()[p.counselor]?Object.assign({code:p.counselor},getCounselors()[p.counselor]):null,generatedAt:new Date().toISOString()}));
}
function applyCounselorEdit(p,before,by){
  const codes=getWSTEPS().slice(0,5).flatMap(x=>x.codes);
  const changes=codes.map(c=>({code:c,before:ansText(before,c),after:ansText(p,c)})).filter(x=>x.before!==x.after);
  if(!changes.length)return 0;
  const old=p.result;p.result=recomputeResult(p,old);
  const rc=!old||old.comment!==p.result.comment||String(old.raw)!==String(p.result.raw);
  p.history=(p.history||[]).concat([{at:new Date().toISOString(),by,changes,resultChanged:rc}]);p.updatedAt=new Date().toISOString();
  return changes.length;
}
function startEdit(id){const p=byId(id);if(!p)return;S.cedit={id,before:JSON.parse(JSON.stringify(p)),res:S.res,from:S.from,prevUser:S.user};S.user=p;S.mode2='pre';S.step=5;S.showMiss={};nav('wizard')}
function abortEdit(){const e=S.cedit;const i=getDB().findIndex(x=>x.id===e.id);if(i>=0)getDB()[i]=e.before;save();S.user=e.prevUser;S.cedit=null}
function cancelEdit(){const e=S.cedit;abortEdit();S.res=e.res;S.from=e.from;nav('result');toast('수정을 취소했습니다')}
function saveEdit(){
  const p=S.user,e=S.cedit,m=missing(p);
  if(m.length){S.showMiss={0:1,1:1,2:1,3:1,4:1};render();toast('누락된 항목이 있어 저장할 수 없습니다');return}
  const by=S.mode==='counselor'?((getCounselors()[S.cc]||{n:S.cc}).n+' 상담사'):'관리자 화면(데모)';
  const n=applyCounselorEdit(p,e.before,by);save();S.user=e.prevUser;S.cedit=null;S.res=e.res;S.from=e.from;nav('result');
  toast(n?`${n}개 문항을 수정하고 결과를 다시 계산했습니다`:'바뀐 응답이 없습니다');
}
function editPanel(p){
  const H=p.history||[],A=toAssessment(p);
  return `<div class="editpanel noprint"><h4>상담사 확인용 (인쇄되지 않음)</h4>
  <div>상태: <b>${A.status==='submitted'?'제출 완료 · 내담자 수정 잠금':'작성 중'}</b> · 평가 버전 ${esc(EVAL_VERSION)}</div>
  ${H.length?`<div style="margin-top:8px"><b>변경 이력 ${H.length}건</b><ul style="margin:4px 0 0 18px">${H.slice().reverse().map(h=>`<li>${esc(h.at.slice(0,16).replace('T',' '))} · ${esc(h.by)} · ${h.changes.map(x=>`${qName(x.code)}: ${esc(x.before||'미응답')} → ${esc(x.after||'미응답')}`).join(' / ')}${h.resultChanged?' · <b>결과 재계산됨</b>':''}</li>`).join('')}</ul></div>`:'<div class="hintline" style="margin-top:6px">변경 이력이 없습니다.</div>'}
  <details style="margin-top:8px"><summary>연동 데이터 (Assessment JSON)</summary><div class="acts" style="margin:6px 0"><button class="btn ghost sm" onclick="copyText(JSON.stringify(toAssessment(byId('${p.id}')),null,2),'연동 데이터를 복사했습니다')">JSON 복사</button></div><pre style="white-space:pre-wrap;font-size:11px;max-height:260px;overflow:auto">${esc(JSON.stringify(A,null,2))}</pre></details></div>`;
}
return {recomputeResult,applyCounselorEdit,startEdit,abortEdit,cancelEdit,saveEdit,editPanel};
}

export {createCounselorEdit};
