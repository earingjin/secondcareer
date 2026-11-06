import {esc} from './fields.js';

// REQ-A-004 admin progress. The server returns counts only; nothing here reads answers or results.
const KEYS=['notStarted','draft','submitted'];
const count=v=>Number.isInteger(v)&&v>=0;
const validCounts=(c,total)=>!!c&&typeof c==='object'&&KEYS.every(k=>count(c[k]))&&KEYS.reduce((s,k)=>s+c[k],0)===total;
const validPost=(p,total)=>!!p&&typeof p==='object'&&(p.available===false?Object.keys(p).length===1:p.available===true&&validCounts(p,total));

// Rejects a response whose parts do not add up, so a partial or malformed
// read is never shown as if it were complete.
export function validProgress(d){
  if(!d||typeof d!=='object'||d.scope!=='organization'||!count(d.total)||typeof d.generatedAt!=='string'||!Number.isFinite(Date.parse(d.generatedAt)))return false;
  if(!validCounts(d.pre,d.total)||!validPost(d.post,d.total)||!Array.isArray(d.companies))return false;
  if(!d.companies.every(c=>c&&(c.name===null||(typeof c.name==='string'&&c.name.trim()))&&count(c.total)&&c.total>0&&validCounts(c.pre,c.total)&&validPost(c.post,c.total)&&c.post.available===d.post.available))return false;
  if(new Set(d.companies.map(c=>c.name)).size!==d.companies.length)return false;
  const sum=key=>d.companies.reduce((s,c)=>s+(key?c[key.split('.')[0]][key.split('.')[1]]:c.total),0);
  return sum()===d.total&&KEYS.every(k=>sum('pre.'+k)===d.pre[k]&&(!d.post.available||sum('post.'+k)===d.post[k]));
}
// Percentage of `part` in `whole`, one decimal. Null when there is no denominator.
export function progressRate(part,whole){return whole>0?Math.round(part/whole*1000)/10:null}
const rateText=(part,whole)=>{const r=progressRate(part,whole);return r===null?'-':r.toFixed(1)+'%'};
const fmtTime=t=>{const d=new Date(t);return Number.isFinite(d.getTime())?d.toLocaleString('ko-KR'):'-'};

export function adminProgressView({data,loading=false,message=''}){
  const head=`<div class="filters" style="justify-content:space-between"><h2>진단 진행 현황</h2><div class="acts"><button class="btn ghost" data-admin-progress="refresh" ${loading?'disabled aria-busy="true"':''}>새로 조회</button></div></div>`;
  const status=`<p role="status" class="hintline" id="admin-progress-status">${esc(loading?'진단 현황을 조회하고 있습니다.':message)}</p>`;
  if(!data)return head+status;
  const {total,pre,post}=data,postOn=post.available===true;
  const tiles=`<div class="tiles" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
   <div class="tile" data-kpi="total"><span>전체 참여자</span><b>${total}</b></div>
   <div class="tile c2" data-kpi="pre-submitted"><span>사전진단 완료</span><b>${pre.submitted}</b></div>
   <div class="tile c3" data-kpi="pre-incomplete"><span>사전진단 미완료</span><b>${pre.notStarted+pre.draft}</b></div>
   <div class="tile" data-kpi="pre-rate"><span>사전진단 완료율</span><b>${rateText(pre.submitted,total)}</b></div>
   ${postOn?`<div class="tile c2" data-kpi="post-submitted"><span>사후진단 완료</span><b>${post.submitted}</b></div>`:''}</div>`;
  const stateRow=(label,c)=>`<tr><th scope="row">${label}</th><td>${c.notStarted}</td><td>${c.draft}</td><td>${c.submitted}</td></tr>`;
  const breakdown=`<div class="scroll"><table class="t" data-progress-breakdown><thead><tr><th scope="col">구분</th><th scope="col">미시작</th><th scope="col">작성 중</th><th scope="col">제출 완료</th></tr></thead><tbody>${stateRow('사전진단',pre)}${postOn?stateRow('사후진단',post):''}</tbody></table></div>`;
  const postNote=postOn
    ?'<p class="hintline" data-post-note>사후진단은 상태별 인원만 표시합니다. 사후진단 완료율의 기준 인원(분모)은 아직 정해지지 않아 계산하지 않습니다.</p>'
    :'<p class="hintline" data-post-note>사후진단 기능이 이 서비스 환경에서 사용 설정되어 있지 않아 사후진단 현황을 표시하지 않습니다.</p>';
  const companyRows=data.companies.map(c=>`<tr data-company><td>${c.name===null?'소속기업 미지정':esc(c.name)}</td><td>${c.total}</td><td>${c.pre.submitted}</td><td>${c.pre.notStarted+c.pre.draft}</td><td>${rateText(c.pre.submitted,c.total)}</td>${postOn?`<td>${c.post.submitted}</td>`:''}</tr>`).join('');
  const companies=`<h3>기업별 진단 현황</h3><div class="scroll"><table class="t zebra" data-progress-companies><thead><tr><th scope="col">소속기업</th><th scope="col">참여자</th><th scope="col">사전 완료</th><th scope="col">사전 미완료</th><th scope="col">사전 완료율</th>${postOn?'<th scope="col">사후 완료</th>':''}</tr></thead><tbody>${companyRows||`<tr><td colspan="${postOn?6:5}" class="empty">등록된 참여자가 없습니다.</td></tr>`}</tbody>${data.companies.length?`<tfoot><tr><th scope="row">합계</th><td>${total}</td><td>${pre.submitted}</td><td>${pre.notStarted+pre.draft}</td><td>${rateText(pre.submitted,total)}</td>${postOn?`<td>${post.submitted}</td>`:''}</tr></tfoot>`:''}</table></div>`;
  return head+status+`<p class="hintline">집계 대상: 관리자 계정이 속한 조직에 등록된 참여자 전체 ${total}명 · 조회 시각 ${esc(fmtTime(data.generatedAt))}</p>
  <p class="hintline">완료는 최종 제출, 작성 중은 임시저장만 된 상태, 미시작은 저장된 응답이 없는 상태입니다. 사전진단 완료율 = 사전진단 완료 인원 ÷ 전체 참여자 수이며, 참여자가 0명이면 '-'로 표시합니다.</p>
  ${tiles}${breakdown}${postNote}${companies}`;
}
