import {esc} from './fields.js';

// STEP 14-D (REQ-M-002~004): company manager progress dashboard. Read only.
// The server returns counts for one allowed company; null means withheld (small cell), never 0.
const KEYS=['notStarted','draft','submitted'];
const cnt=v=>v===null||(Number.isInteger(v)&&v>=0);
const pct=v=>v===null||(typeof v==='number'&&v>=0&&v<=100);
const validPhase=(p,total)=>!!p&&typeof p==='object'&&(p.available===false?Object.keys(p).length===1:
  p.available===true&&KEYS.every(k=>cnt(p[k]))&&pct(p.completionRate)&&(p.submitted===null)===(p.completionRate===null&&total!==0)&&
  (KEYS.some(k=>p[k]===null)||KEYS.reduce((s,k)=>s+p[k],0)===total));
const validRow=(r,postOn)=>!!r&&typeof r.label==='string'&&r.label.trim()&&typeof r.unresolved==='boolean'&&cnt(r.total)&&
  !!r.pre&&cnt(r.pre.submitted)&&pct(r.pre.completionRate)&&(postOn?!!r.post&&cnt(r.post.submitted)&&pct(r.post.completionRate):r.post?.available===false);

export function validManagerProgress(d,companyId){
  if(!d||typeof d!=='object'||d.companyId!==companyId||typeof d.companyName!=='string'||d.basis!=='participants.company_id'||typeof d.generatedAt!=='string'||!Number.isFinite(Date.parse(d.generatedAt)))return false;
  if(!d.suppression||!Number.isInteger(d.suppression.minimumGroupSize)||d.suppression.minimumGroupSize<1||typeof d.postAvailable!=='boolean'||typeof d.suppressed!=='boolean'||!Array.isArray(d.counselors))return false;
  if(d.suppressed)return d.total===null&&d.pre===null&&(d.postAvailable?d.post===null:d.post?.available===false)&&d.counselors.length===0;
  if(!Number.isInteger(d.total)||d.total<0||!validPhase(d.pre,d.total)||!validPhase(d.post,d.total)||(d.post.available===true)!==d.postAvailable)return false;
  return d.counselors.every(r=>validRow(r,d.postAvailable))&&(d.total>0||d.counselors.length===0);
}

const fmtTime=t=>{const d=new Date(t);return Number.isFinite(d.getTime())?d.toLocaleString('ko-KR'):'-'};
const HIDDEN='<span data-withheld>비공개</span>';
const num=v=>v===null?HIDDEN:String(v);
const rate=(p,total)=>p.completionRate!==null?p.completionRate.toFixed(1)+'%':p.submitted===null?HIDDEN:total===0?'-':HIDDEN;

export function managerDashboardView({companies,companyId,data,loading,message}){
  const company=companies.find(c=>c.id===companyId);
  const picker=companies.length>1
    ?`<div class="field"><label for="manager-company">고객사 선택</label><select class="in" id="manager-company" data-manager-company ${loading?'disabled':''}>${companies.map(c=>`<option value="${esc(c.id)}" ${c.id===companyId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>`
    :`<p class="sub" data-manager-company-name>${esc(company?.name||'허용된 고객사가 없습니다.')}</p>`;
  const head=`<div class="filters" style="justify-content:space-between"><h2>고객사 진단 현황</h2><div class="acts"><button class="btn ghost" data-manager-progress="refresh" ${loading?'disabled aria-busy="true"':''}>새로고침</button><button class="btn ghost" onclick="logout()">로그아웃</button></div></div>${picker}`;
  const status=`<p role="status" class="hintline" id="manager-progress-status">${esc(loading?'고객사 현황을 불러오고 있습니다.':message)}</p>`;
  const privacy=`<p class="hintline" data-privacy-note>개인정보 보호를 위해 개인별 응답·점수·결과보고서와 참여자 명단은 제공하지 않습니다. ${data?.suppression?.minimumGroupSize||5}명 미만 집계와 공개된 합계에서 빼서 알아낼 수 있는 값은 '비공개'로 표시합니다(검토용 임시 기준).</p>`;
  if(!data)return head+status+privacy;
  const min=data.suppression.minimumGroupSize;
  const basis=`<p class="hintline" data-basis>집계 대상: ${esc(data.companyName)}에 연결된 참여자 전체(기업명만 같은 미연결 참여자 제외) · 조회 기준 시각 ${esc(fmtTime(data.generatedAt))}</p>
  <p class="hintline" data-rate-basis>완료는 최종 제출, 작성 중은 임시저장만 된 상태, 미시작은 저장된 응답이 없는 상태입니다. 완료율 = 단계별 제출 완료 인원 ÷ 연결된 전체 참여 인원입니다.</p>`;
  if(data.suppressed)return head+status+basis+`<p class="hintline" data-state="suppressed">연결된 참여 인원이 ${min}명 미만이어서 이 고객사의 집계를 공개하지 않습니다.</p>`+privacy;
  if(data.total===0)return head+status+basis+`<p class="hintline" data-state="empty">이 고객사에 연결된 참여자가 없습니다 (0명).</p>`+privacy;
  const {total,pre,post}=data,postOn=post.available===true;
  const tiles=`<div class="tiles" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
   <div class="tile" data-kpi="total"><span>전체 참여 인원</span><b>${total}</b></div>
   <div class="tile c2" data-kpi="pre-submitted"><span>사전진단 완료</span><b>${num(pre.submitted)}</b></div>
   <div class="tile" data-kpi="pre-rate"><span>사전진단 완료율</span><b>${rate(pre,total)}</b></div>
   <div class="tile c2" data-kpi="post-submitted"><span>사후진단 완료</span><b>${postOn?num(post.submitted):'미운영'}</b></div>
   <div class="tile" data-kpi="post-rate"><span>사후진단 완료율</span><b>${postOn?rate(post,total):'미운영'}</b></div></div>`;
  const stage=(label,p)=>p.available===true
    ?`<tr><th scope="row">${label}</th><td>${num(p.notStarted)}</td><td>${num(p.draft)}</td><td>${num(p.submitted)}</td><td>${rate(p,total)}</td></tr>`
    :`<tr data-post-off><th scope="row">${label}</th><td colspan="4">미운영</td></tr>`;
  const stages=`<h3>단계별 인원</h3><div class="scroll"><table class="t" data-manager-stages><thead><tr><th scope="col">구분</th><th scope="col">미시작</th><th scope="col">작성 중</th><th scope="col">제출 완료</th><th scope="col">완료율</th></tr></thead><tbody>${stage('사전진단',pre)}${stage('사후진단',post)}</tbody></table></div>`;
  const rowRate=p=>p.completionRate!==null?p.completionRate.toFixed(1)+'%':HIDDEN;
  const rows=data.counselors.map(r=>`<tr data-counselor-row${r.unresolved?' data-unresolved':''}><td>${esc(r.label)}</td><td>${num(r.total)}</td><td>${num(r.pre.submitted)}</td><td>${rowRate(r.pre)}</td>${postOn?`<td>${num(r.post.submitted)}</td><td>${rowRate(r.post)}</td>`:'<td colspan="2">미운영</td>'}</tr>`).join('');
  const counselors=`<h3>상담사별 완료 현황</h3><p class="hintline">참여자에게 지정된 담당 상담사 기준입니다. 담당 상담사가 확인되지 않는 참여자는 '담당 확인 필요'로 묶어 표시합니다. 상담사별 완료율 = 상담사별 제출 완료 인원 ÷ 해당 상담사 담당 인원입니다.</p><div class="scroll"><table class="t zebra" data-manager-counselors><thead><tr><th scope="col">상담사</th><th scope="col">담당 인원</th><th scope="col">사전 완료</th><th scope="col">사전 완료율</th><th scope="col">사후 완료</th><th scope="col">사후 완료율</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return head+status+basis+tiles+stages+counselors+privacy;
}
