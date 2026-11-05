import {esc} from './fields.js';
import {AREA_COUNT} from '../js/02-eval-config.js';

// REQ-A-006/007 admin aggregate report. Every figure comes from the server
// (secondcareer-admin-aggregate); this module only checks the response and renders it.
// Screen names follow the legacy report (RTABS). Only r1 is implemented.
export const AGGREGATE_TABS=[['r1','1. 사전사후 결과',true],['r2','2. 사전사후 상세'],['r3','3. 만족도'],['r4','4. 만족도_심리적 안정감'],['r5','5. 만족도_호소문제의 변화'],['r6','6. 만족도_컨설팅 기대 및 효과'],['r7','7. 만족도_전반적인 만족도(개선요인)'],['r8','8. 첫회기 컨설팅에 대한 기대'],['r9','9. 만족도_기타의견']];
const num=Number.isFinite,count=v=>Number.isInteger(v)&&v>=0;

export function validAggregate(d){
  if(!d||typeof d!=='object'||d.scope!=='organization'||typeof d.generatedAt!=='string'||!Number.isFinite(Date.parse(d.generatedAt)))return false;
  if(!Array.isArray(d.companies)||!d.companies.every(c=>typeof c==='string'&&c.trim())||new Set(d.companies).size!==d.companies.length)return false;
  if(!(d.company===null||d.companies.includes(d.company))||!d.post||typeof d.post.available!=='boolean'||!d.analyses)return false;
  if(!d.post.available)return d.population===null&&d.analyses.r1===null;
  const p=d.population;if(!p||!count(p.n)||!count(p.excludedInvalid))return false;
  const r=d.analyses.r1;if(p.n===0)return r===null;
  if(!r||!num(r.areaMax)||!num(r.totalMax)||!Array.isArray(r.areas)||r.areas.length!==AREA_COUNT||!r.total||![r.total.pre,r.total.post,r.total.rate].every(num))return false;
  if(!r.areas.every(a=>a&&typeof a.name==='string'&&[a.pre,a.post,a.diff,a.rate].every(num)&&Number.isInteger(a.rank)))return false;
  return [...r.areas.map(a=>a.rank)].sort((x,y)=>x-y).every((v,i)=>v===i+1);
}

// Display helpers from the legacy report (arrow, sgn, legend2, gbars); no calculation.
const arrow=v=>v>0?'▲':v<0?'▼':'';
const sgn=v=>(v>0?'+':'')+v;
const legend2=(a,b)=>`<div class="legend"><span><i class="sw" style="background:var(--pre)"></i>${a}</span><span><i class="sw" style="background:var(--post)"></i>${b}</span></div>`;
function gbars(o){
  const W=o.w||720,H=o.h||320,pl=34,pb=o.pb||56,pt=o.pt||34,pr=10,iw=W-pl-pr,ih=H-pt-pb,n=o.labels.length,gw=iw/n,ns=o.series.length,bw=Math.min(o.bw||36,(gw-18)/ns);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label||'')}">`;
  for(let v=0;v<=o.max;v+=o.step){const y=pt+ih-v/o.max*ih;s+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" class="grid"/><text x="${pl-6}" y="${y+4}" class="axis" text-anchor="end">${v}</text>`}
  o.labels.forEach((lb,i)=>{
    const cx=pl+gw*i+gw/2,tw=ns*bw+(ns-1)*5;
    o.series.forEach((se,j)=>{const v=se.vals[i],h=v/o.max*ih,x=cx-tw/2+j*(bw+5);s+=`<rect x="${x}" y="${pt+ih-h}" width="${bw}" height="${h}" rx="4" class="${se.cls}"/><text x="${x+bw/2}" y="${pt+ih-h-5}" class="val" text-anchor="middle">${v}</text>`});
    String(lb).split('|').forEach((t,k)=>{s+=`<text x="${cx}" y="${pt+ih+20+k*15}" class="lab" text-anchor="middle">${esc(t)}</text>`});
    const tp=o.top&&o.top[i];if(tp){if(tp.t)s+=`<text x="${cx}" y="16" class="top ${tp.c||''}" text-anchor="middle">${tp.t}</text>`;if(tp.r)s+=`<text x="${cx}" y="${pt-8}" class="rank" text-anchor="middle">${tp.r}</text>`}
  });
  return s+'</svg>';
}
const ORD=['1st','2nd','3rd'];

function r1View(d){
  const r=d.analyses.r1,n=d.population.n,A=r.areas;
  const top=A.map(a=>({t:`${a.rate}% ${arrow(a.rate)}`,c:a.rate<0?'dn':'',r:a.rank<=3?ORD[a.rank-1]:''}));
  return `<div class="tiles" data-agg-kpis><div class="tile" data-agg-kpi="n"><span>사전·사후 참여자</span><b>${n}명</b></div><div class="tile c3" data-agg-kpi="pre-total"><span>사전 평균 합계 (${r.totalMax}점)</span><b>${r.total.pre}</b></div><div class="tile c2" data-agg-kpi="post-total"><span>사후 평균 합계 (${r.totalMax}점)</span><b>${r.total.post}</b></div><div class="tile c1" data-agg-kpi="rate"><span>전체 변화율</span><b>${r.total.rate}% ${arrow(r.total.rate)}</b></div></div>
  <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">${legend2('사전_평균','사후_평균')}<span class="hintline">영역별 원점수(${r.areaMax}점 만점 기준) · 변화율 순위 TOP3 표시</span></div>
  ${gbars({series:[{vals:A.map(a=>a.pre),cls:'rpre'},{vals:A.map(a=>a.post),cls:'rpost'}],labels:A.map(a=>a.name),max:r.areaMax,step:1,top,pt:50,h:350,label:'영역별 사전 사후 평균 원점수'})}
  <div class="scroll"><table class="t c" data-agg-areas><tr><th>구분</th>${A.map(a=>`<th>${esc(a.name)}</th>`).join('')}<th>합계</th></tr>
  <tr data-row="pre"><th>사전_평균</th>${A.map(a=>`<td>${a.pre}</td>`).join('')}<td>${r.total.pre}</td></tr>
  <tr data-row="post"><th>사후_평균</th>${A.map(a=>`<td>${a.post}</td>`).join('')}<td>${r.total.post}</td></tr>
  <tr data-row="diff"><th>차이(점)</th>${A.map(a=>`<td>${sgn(a.diff)}</td>`).join('')}<td>-</td></tr>
  <tr data-row="rate"><th>변화율(%)</th>${A.map(a=>`<td>${a.rate}% ${arrow(a.rate)}</td>`).join('')}<td>${r.total.rate}% ${arrow(r.total.rate)}</td></tr>
  <tr data-row="rank"><th>변화율 순위</th>${A.map(a=>`<td>${a.rank}위</td>`).join('')}<td>-</td></tr></table></div>
  <p class="hintline" data-agg-method>계산 기준: 영역 원점수는 영역 3문항 응답의 합(${r.areaMax}점 만점)이며, 영역 평균은 참여자별 영역 원점수의 평균을 소수 첫째 자리에서 반올림한 값입니다. 차이는 사후 평균 − 사전 평균, 변화율은 (사후 평균 − 사전 평균) ÷ 사전 평균 × 100(소수 첫째 자리)이며 반올림된 평균으로 계산합니다. 합계는 반올림된 영역 평균의 합(${r.totalMax}점 만점)입니다. 순위는 변화율이 높은 순이며, 같으면 영역 순서(자기인식 → 목표실행)를 따릅니다.</p>`;
}

export function adminAggregateView({data,loading=false,message=''}){
  const select=data?`<label class="hintline" for="agg-company">기업</label><select class="in" id="agg-company" data-aggregate-company ${loading?'disabled':''}><option value="" ${data.company===null?'selected':''}>전체</option>${data.companies.map(c=>`<option value="${esc(c)}" ${data.company===c?'selected':''}>${esc(c)}</option>`).join('')}</select>`:'';
  const head=`<div class="filters" style="justify-content:space-between"><h2>통합 분석보고서</h2><div class="acts">${select}<button class="btn ghost" data-admin-aggregate="load" ${loading?'disabled aria-busy="true"':''}>${data?'통합 분석 다시 불러오기':'통합 분석보고서 열기'}</button></div></div>`;
  const status=`<p role="status" class="hintline" id="admin-aggregate-status">${esc(loading?'통합 분석을 집계하고 있습니다.':message)}</p>`;
  const intro='<p class="hintline">관리자 소속 조직 참여자 중 사전진단과 사후진단을 모두 최종 제출한 참여자를 기준으로 서버에서 집계합니다. 개인별 응답은 화면에 내려오지 않습니다. 이 화면은 조회용이며 통합 보고서 인쇄는 아직 제공하지 않습니다.</p>';
  if(!data)return head+status+intro;
  const tabs=`<div class="filters" role="tablist" aria-label="통합 분석 화면" data-agg-tabs>${AGGREGATE_TABS.map(([k,l,on])=>on?`<button class="btn sm" role="tab" aria-selected="true" data-agg-tab="${k}">${esc(l)}</button>`:`<button class="btn ghost sm" role="tab" aria-selected="false" disabled data-agg-tab="${k}" title="구현 예정">${esc(l)} · 구현 예정</button>`).join('')}</div>`;
  let body;
  if(!data.post.available)body='<div class="empty" data-agg-empty>사후진단 기능이 이 서비스 환경에서 사용 설정되어 있지 않아 사전·사후 통합 분석을 집계하지 않습니다.</div>';
  else if(!data.population.n)body='<div class="empty" data-agg-empty>사전·사후를 모두 완료한 참여자가 아직 없습니다.</div>';
  else body=r1View(data);
  const base=data.post.available?`<div class="rbase" data-agg-base>[Base: ${data.company===null?'전체 기업':esc(data.company)} 사전·사후 참여자(n=${data.population.n}), 단위: 명] · 집계 시각 ${esc(new Date(data.generatedAt).toLocaleString('ko-KR'))}</div>`:'';
  const excluded=data.post.available&&data.population.excludedInvalid?`<p class="hintline" data-agg-excluded>두 진단을 모두 제출했지만 응답이 완전하지 않아 제외한 참여자 ${data.population.excludedInvalid}명</p>`:'';
  return head+status+intro+tabs+base+body+excluded+'<p class="hintline">2~9번 화면(사전사후 상세, 만족도 등)은 아직 구현되지 않았습니다.</p>';
}
