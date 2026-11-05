import {esc} from './fields.js';
import {AREA_COUNT,ITEM_COUNT,SCALE_MIN,SCALE_MAX} from '../js/02-eval-config.js';

// REQ-A-006..014 admin aggregate report. Every figure comes from the server
// (secondcareer-admin-aggregate); this module only checks the response and renders it.
// Screen names follow the legacy report (RTABS). Implemented: r1..r8.
export const AGGREGATE_TABS=[['r1','1. 사전사후 결과',true],['r2','2. 사전사후 상세',true],['r3','3. 만족도',true],['r4','4. 만족도_심리적 안정감',true],['r5','5. 만족도_호소문제의 변화',true],['r6','6. 만족도_컨설팅 기대 및 효과',true],['r7','7. 만족도_전반적인 만족도(개선요인)',true],['r8','8. 첫회기 컨설팅에 대한 기대',true],['r9','9. 만족도_기타의견']];
const IMPLEMENTED=AGGREGATE_TABS.filter(t=>t[2]).map(t=>t[0]);
const num=Number.isFinite,count=v=>Number.isInteger(v)&&v>=0;
const isPermutation=(list,size)=>list.length===size&&[...list].sort((x,y)=>x-y).every((v,i)=>v===i+1);
const validRow=r=>r&&typeof r.name==='string'&&[r.pre,r.post,r.diff,r.rate].every(num)&&Number.isInteger(r.rank);
const sameAreaRows=(a,b)=>a.length===b.length&&a.every((x,i)=>['name','pre','post','diff','rate','rank'].every(k=>x[k]===b[i][k]));

function validSatItem(q,n){
  if(!q||q.n!==n||!num(q.avg)||!Array.isArray(q.distribution)||q.distribution.length!==SCALE_MAX-SCALE_MIN+1)return false;
  if(!q.distribution.every((d,k)=>d&&d.score===SCALE_MAX-k&&count(d.count)&&num(d.pct)))return false;
  if(q.distribution.reduce((s,d)=>s+d.count,0)!==n)return false;
  return !!q.positive&&q.positive.count===q.distribution[0].count+q.distribution[1].count&&num(q.positive.pct);
}

const KEYS=['r1','r2','r3','r4','r5','r6','r7'];
// Consistency checks only (no figure shown comes from here): lists have equal length, counts add up, the top entries
// are the first three by the legacy order (count descending, equal counts keep the option order).
const top3Of=counts=>counts.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]).slice(0,3).map(x=>x[1]);
function validChoices(b,n,{single=false,rankBy,change=false}){
  if(!b||!Array.isArray(b.options)||!b.options.every(o=>typeof o==='string'&&o)||!Array.isArray(b.labels)||b.labels.length!==b.options.length)return false;
  const L=b.options.length,sums=[b.pre,b.post].map(a=>Array.isArray(a)&&a.length===L&&a.every(c=>count(c)&&c<=n)?a.reduce((s,c)=>s+c,0):-1);
  if(sums.includes(-1)||sums.some(s=>single?s!==n:s<n))return false;
  if(!b.selections||b.selections.pre!==sums[0]||b.selections.post!==sums[1])return false;
  if(change&&!(Array.isArray(b.change)&&b.change.length===L&&b.change.every(num)))return false;
  const counts=b[rankBy],order=top3Of(counts);
  return Array.isArray(b.top)&&b.top.length===order.length&&b.top.every((t,k)=>t&&t.index===order[k]&&t.rank===k+1&&t.count===counts[t.index]&&num(t.pct));
}
function validStability(r,n){
  const L=Array.isArray(r.options)?r.options.length:-1;
  if(L<2||!Array.isArray(r.labels)||r.labels.length!==L)return false;
  // Single-choice question: every participant of the screen has exactly one counted answer before and after.
  if(![r.pre,r.post].every(a=>Array.isArray(a)&&a.length===L&&a.every(c=>count(c)&&c<=n)&&a.reduce((s,c)=>s+c,0)===n))return false;
  const q=r.positive;
  return !!q&&[q.pre,q.post,q.change].every(num)&&Array.isArray(r.scores)&&r.scores.length===3&&r.scores.every((s,i)=>s&&s.key===['q3a','q3b','q3c'][i]&&num(s.avg));
}
export function validAggregate(d){
  if(!d||typeof d!=='object'||d.scope!=='organization'||typeof d.generatedAt!=='string'||!Number.isFinite(Date.parse(d.generatedAt)))return false;
  if(!Array.isArray(d.companies)||!d.companies.every(c=>typeof c==='string'&&c.trim())||new Set(d.companies).size!==d.companies.length)return false;
  if(!(d.company===null||d.companies.includes(d.company))||!d.post||typeof d.post.available!=='boolean'||!d.analyses)return false;
  const pre=d.prePopulation,r8=d.analyses.r8;
  if(!pre||pre.available!==true||!count(pre.n)||!count(pre.excludedInvalid))return false;
  if(!pre.n ? r8!==null : !(r8&&r8.n===pre.n&&Array.isArray(r8.options)&&r8.options.length>=3&&r8.options.every(o=>typeof o==='string'&&o)&&Array.isArray(r8.labels)&&r8.labels.length===r8.options.length&&Array.isArray(r8.counts)&&r8.counts.length===r8.options.length&&r8.counts.every(c=>count(c)&&c<=pre.n)&&Array.isArray(r8.percentages)&&r8.percentages.length===r8.options.length&&r8.percentages.every(num)&&r8.selections===r8.counts.reduce((a,b)=>a+b,0)&&r8.selections>=pre.n&&r8.selections<=2*pre.n&&Array.isArray(r8.top)&&r8.top.length===3&&r8.top.every((t,i)=>t&&t.index===top3Of(r8.counts)[i]&&t.rank===i+1&&t.count===r8.counts[t.index]&&num(t.pct))))return false;
  if(!d.post.available)return d.population===null&&KEYS.every(k=>d.analyses[k]===null);
  const p=d.population;if(!p||!count(p.n)||!count(p.satN)||!count(p.detailN)||p.satN>p.n||p.detailN>p.satN||!count(p.excludedInvalid))return false;
  const {r1,r2,r3}=d.analyses;
  if(p.n===0)return KEYS.every(k=>d.analyses[k]===null);
  if(!r1||!num(r1.areaMax)||!num(r1.totalMax)||!Array.isArray(r1.areas)||r1.areas.length!==AREA_COUNT||!r1.total||![r1.total.pre,r1.total.post,r1.total.rate].every(num))return false;
  if(!r1.areas.every(validRow)||!isPermutation(r1.areas.map(a=>a.rank),AREA_COUNT))return false;
  if(!r2||!Array.isArray(r2.factors)||r2.factors.length!==ITEM_COUNT||!Array.isArray(r2.areas)||!r2.areas.every(validRow)||!sameAreaRows(r1.areas,r2.areas))return false;
  if(!r2.factors.every(f=>validRow(f)&&Number.isInteger(f.area)&&f.area>=0&&f.area<AREA_COUNT)||!isPermutation(r2.factors.map(f=>f.rank),ITEM_COUNT)||!num(r2.scaleMax))return false;
  if(p.satN===0?r3!==null:!(r3&&r3.n===p.satN&&validSatItem(r3.q1,p.satN)&&validSatItem(r3.q2,p.satN)))return false;
  const r7=d.analyses.r7;
  if(p.satN===0 ? r7!==null : !(r7 && r7.n===p.satN && num(r7.avg1) && num(r7.avg2) && count(r7.opinions) && r7.opinions<=p.satN && Array.isArray(r7.options) && r7.options.length>0 && r7.options.every(o=>typeof o==='string'&&o) && Array.isArray(r7.counts) && r7.counts.length===r7.options.length && r7.counts.every(c=>count(c)&&c<=p.satN) && Array.isArray(r7.percentages) && r7.percentages.length===r7.options.length && r7.percentages.every(num) && Array.isArray(r7.order) && r7.order.length===r7.options.length && r7.order.every((v,i)=>v===r7.counts.map((_,j)=>j).sort((a,b)=>r7.counts[b]-r7.counts[a]||a-b)[i])))return false;
  const {r4,r5,r6}=d.analyses,N=p.detailN;
  if(N===0)return r4===null&&r5===null&&r6===null;
  return !!r4&&r4.n===N&&validStability(r4,N)&&!!r5&&r5.n===N&&validChoices(r5,N,{rankBy:'pre',change:true})&&!!r6&&r6.n===N&&validChoices(r6.q5,N,{single:true,rankBy:'pre'})&&validChoices(r6.q6,N,{rankBy:'post'})&&validSatItem(r6.fit,N);
}

// Display helpers from the legacy report (arrow, sgn, legend2, gbars, hbrow); no calculation.
const arrow=v=>v>0?'▲':v<0?'▼':'';
const sgn=v=>(v>0?'+':'')+v;
const legend2=(a,b)=>`<div class="legend"><span><i class="sw" style="background:var(--pre)"></i>${a}</span><span><i class="sw" style="background:var(--post)"></i>${b}</span></div>`;
const hbrow=(l,pct,v,cls)=>`<div class="hbrow ${cls||''}"><div class="hl">${l}</div><div class="hb"><span style="width:${Math.max(0,Math.min(100,pct))}%"></span></div><div class="hv">${v}</div></div>`;
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
const ORD=['1st','2nd','3rd','4th','5th'];
// Legacy axis scale (mx) and TOP list (sideList): display only, the figures come from the server.
const mx=a=>{const m=Math.max(1,...a),st=m<=6?1:m<=12?2:5;return {max:Math.ceil((m+.5)/st)*st,step:st}};
const sideList=(O,top,unit,label)=>`<div>${top.map((t,k)=>`<div class="topitem t${k+1}"><b>${String(k+1).padStart(2,'0')}</b><span>${esc(O[t.index])}${label?label:''} (${t.pct}%, ${t.count}${unit})</span></div>`).join('')}</div>`;

export function r1View(d){
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

export function r2View(d){
  const r=d.analyses.r2,F=r.factors,A=r.areas,per=F.length/A.length;
  const byArea=i=>F.slice(i*per,(i+1)*per);
  const row=(key,label,fmt,hl)=>`<tr data-row="${key}"><th>${label}</th>${A.map((a,i)=>byArea(i).map(f=>`<td class="${hl&&f.rank<=5?'hl1':''}">${fmt(f[key])}</td>`).join('')+`<td class="${hl&&a.rank<=3?'hl2':''}" style="font-weight:800">${hl&&a.rank<=3?'▲':''}${fmt(a[key])}</td>`).join('')}</tr>`;
  const top=F.map(f=>f.rank<=5?{t:`${f.rate} ▲`}:null);
  return `<div class="axisnote"><span>cognition</span><i></i><span>behavior</span></div>
  <div class="scroll"><table class="t c" style="min-width:900px" data-agg-detail><tr><th rowspan="2">사전<br>사후<br>모두응답</th>${A.map((a,i)=>`<th colspan="${per+1}">요인${i+1}_${esc(a.name)}</th>`).join('')}</tr>
  <tr>${A.map((a,i)=>byArea(i).map(f=>`<th>${esc(f.name)}</th>`).join('')+`<th>종합 <sup>${ORD[a.rank-1]||''}</sup></th>`).join('')}</tr>
  ${row('pre','사전_평균점수',v=>v.toFixed(1),false)}${row('post','사후_평균점수',v=>v.toFixed(1),false)}${row('diff','변화 스코어(Point)',sgn,false)}${row('rate','변화율(%)',sgn,true)}</table></div>
  <p class="fnote">요인은 ${r.scaleMax}점 평균, 종합은 영역별 원점수(${r.areaMax}점 만점) 기준 · 노란색: 요인별 변화율 TOP5, 주황색: 영역 종합 변화율 TOP3</p>
  <div class="legend" style="margin-top:12px"><span><i class="sw" style="background:var(--ink-soft);opacity:.4"></i>사전_평균</span><span><i class="sw" style="background:linear-gradient(90deg,var(--a1),var(--a3),var(--a5))"></i>사후_평균 (영역별 색 구분)</span></div>
  <div class="scroll"><div style="min-width:880px">${gbars({series:[{vals:F.map(f=>f.pre),cls:'rgray'},{vals:F.map(f=>f.post),cls:i=>'ra'+(F[i].area+1)}],labels:F.map(f=>f.name),max:r.scaleMax,step:1,top,box:F.map((f,i)=>f.rank<=5?i:-1).filter(i=>i>=0),w:1000,h:340,pt:40,bw:24,label:'요인별 사전 사후 평균'})}</div></div>
  <p class="hintline" data-agg-method>계산 기준: 요인은 진단 문항 1개이며 사전·사후 평균은 참여자 응답의 평균(소수 첫째 자리 반올림, ${r.scaleMax}점 척도), 종합은 영역 원점수 평균(${r.areaMax}점 만점)입니다. 변화 스코어는 사후 평균 − 사전 평균, 변화율은 (사후 − 사전) ÷ 사전 × 100(소수 첫째 자리)이며 반올림된 평균으로 계산합니다. 순위는 변화율이 높은 순이고 같으면 표의 앞쪽(요인·영역 순서)이 먼저입니다. 요인은 상위 5개, 영역 종합은 상위 3개를 강조합니다.</p>`;
}

const SAT_Q1=['매우 만족','만족','보통','불만족','매우 불만족'],SAT_Q2=['매우 그렇다','그렇다','보통','아니다','매우 아니다'];
function satCard(key,title,q,labels){
  const C=2*Math.PI*30,f=Math.min(1,q.avg/SCALE_MAX);
  return `<div data-agg-sat="${key}"><div class="qbar">${title}</div>
  <div class="pie"><svg viewBox="0 0 100 100" role="img" aria-label="종합평균 ${q.avg}점"><circle cx="50" cy="50" r="30" fill="none" style="stroke:var(--line);stroke-width:60"/><circle cx="50" cy="50" r="30" fill="none" style="stroke:var(--coral);stroke-width:60" stroke-dasharray="${C*f} ${C}" transform="rotate(-90 50 50)"/></svg></div><div class="pie-lab">종합평균 ${q.avg}점</div>
  ${hbrow('Total , 전체 긍정 만족도',q.positive.pct,`<b>${q.positive.pct}%</b>${q.positive.count}명`,'tot')}${labels.map((l,i)=>hbrow(`Q${i+1}. ${l}`,q.distribution[i].pct,`<b>${q.distribution[i].pct}%</b>${q.distribution[i].count}명`)).join('')}</div>`;
}
export function r3View(d){
  const r=d.analyses.r3,N=d.population.n;
  return `<div class="sat2" style="margin-top:6px">${satCard('q1','Q 1.0 서비스에 대한 전반적인 만족도',r.q1,SAT_Q1)}${satCard('q2','Q 2.0 새로운 경력을 만들어가는데 유익했는지 여부',r.q2,SAT_Q2)}</div>
  <p class="hintline" data-agg-sat-base>모집단: 사전·사후 참여자 ${N}명 중 만족도 설문(Q1·Q2)에 응답한 ${r.n}명입니다${N>r.n?`(만족도 응답이 없거나 완전하지 않은 ${N-r.n}명은 이 화면에서 제외)`:''}. Q1과 Q2는 함께 필수 응답이라 두 문항의 분모(${r.n}명)가 같습니다.</p>
  <p class="hintline" data-agg-method>계산 기준: 평균은 응답 점수 평균(소수 첫째 자리 반올림, ${SCALE_MAX}점 만점), 비율은 해당 점수 응답 수 ÷ 응답자 수 × 100(소수 첫째 자리), 전체 긍정은 ${SCALE_MAX}점과 ${SCALE_MAX-1}점 응답의 합입니다. 항목 이름은 점수 ${SCALE_MAX}→${SCALE_MIN} 순서이며 보기 문구는 레거시 보고서와 같습니다.</p>`;
}

export function r4View(d){
  const r=d.analyses.r4,m=mx([...r.pre,...r.post]),st=[['q3a','상담 이후 막연한 불안이 줄었다'],['q3b','미래에 대한 자신감이 높아졌다'],['q3c','마음이 이전보다 안정되었다']];
  return `<div class="qbar">Q 3.0 서비스 이후 심리적 안정감</div>
  <div class="tiles" style="grid-template-columns:repeat(3,1fr);margin-top:14px"><div class="tile"><span>사전 긍정적 마음 상태</span><b>${r.positive.pre}%</b></div><div class="tile c2"><span>사후 긍정적 마음 상태</span><b>${r.positive.post}%</b></div><div class="tile c1"><span>변화</span><b>${sgn(r.positive.change)}%p</b></div></div>
  <p class="hintline">긍정적 마음 상태 = ‘잘 될 것이라고 믿는다’ + ‘구체적으로 준비하고 있어 안심이다’ 선택 비율</p>
  <h3 class="st">Q 3.1 마음 상태 사전·사후 분포 (명)</h3>${legend2('사전응답','사후응답')}
  ${gbars({series:[{vals:r.pre,cls:'rpre'},{vals:r.post,cls:'rpost'}],labels:r.labels,max:m.max,step:m.step,label:'마음 상태 사전 사후 분포',h:310})}
  <h3 class="st">Q 3.2 심리적 안정감 문항 (5점 척도)</h3>
  ${st.map(([k,l],i)=>hbrow(l,r.scores[i].avg/SCALE_MAX*100,`<b>${r.scores[i].avg}점</b>`)).join('')}
  <p class="hintline" data-agg-method>Base 단위는 명입니다. Q 3.1은 마음 상태를 한 가지만 고른 단일 선택 문항이라 사전·사후 각각 합계가 ${r.n}명(기준 인원)입니다. 긍정 비율 = 긍정 선택 인원 ÷ 기준 인원 × 100(소수 첫째 자리), 변화는 사후 − 사전(%p)이며 반올림된 비율로 계산합니다. Q 3.2 점수는 응답 평균(소수 첫째 자리 반올림, ${SCALE_MAX}점 만점)입니다.</p>`;
}
export function r5View(d){
  const r=d.analyses.r5,m=mx([...r.pre,...r.post]),order=r.top.map(t=>t.index);
  const top=r.options.map((o,i)=>{const k=order.indexOf(i);return k>=0?{t:`${r.change[i]}% ${arrow(r.change[i])}`,c:r.change[i]<0?'dn':'',r:`TOP ${k+1}`}:null});
  return `<div class="qbar">Q 4.0 사전사후 변화 TOP3 · 사전(퇴직을 맞이하며 고민되는 부분), 사후(서비스 이후 가장 고민되는 부분)</div>
  <div class="sidechart"><div style="padding-top:34px">${sideList(r.options,r.top,'명')}</div><div>${legend2('사전응답','사후응답')}${gbars({series:[{vals:r.pre,cls:'rpre'},{vals:r.post,cls:'rpost'}],labels:r.labels,max:m.max,step:m.step,top,pt:46,h:330,label:'호소문제 사전 사후 변화'})}</div></div>
  <p class="fnote">3가지 우선순위를 모두 집계한 중복선택 문항입니다 (사전 ${r.selections.pre}건, 사후 ${r.selections.post}건). 상단 수치는 사전 대비 사후 응답 변화율입니다.</p>
  <p class="hintline" data-agg-method>Base 단위는 명이며 기준 인원은 ${r.n}명입니다. 중복선택 문항이라 한 사람이 여러 항목에 포함되어 항목별 인원의 합이 기준 인원과 다릅니다. TOP3 옆의 비율은 해당 항목 선택 건수 ÷ 전체 선택 건수(사전 ${r.selections.pre}건)이며 참여자 비율이 아닙니다. 순위는 사전 선택 건수가 많은 순이고 같으면 문항 보기 순서가 먼저입니다. 변화율 = (사후 − 사전) ÷ 사전 × 100(소수 첫째 자리), 사전이 0건이면 0입니다.</p>`;
}
export function r6View(d){
  const r=d.analyses.r6,{q5,q6}=r,m5=mx([...q5.pre,...q5.post]),m6=mx([...q6.pre,...q6.post]),o5=q5.top.map(t=>t.index),o6=q6.top.map(t=>t.index);
  const t5=q5.options.map((o,i)=>o5.includes(i)?{t:'',r:`TOP ${o5.indexOf(i)+1}`}:null),t6=q6.options.map((o,i)=>o6.includes(i)?{t:'',r:`TOP ${o6.indexOf(i)+1}`}:null);
  return `<div class="qbar">Q 5.0 사전(컨설팅 기대), 사후(가장 도움이 된 부분)</div>
  <div class="sidechart"><div style="padding-top:34px">${sideList(q5.options,q5.top,'명')}</div><div>${legend2('사전응답(기대)','사후응답(도움이 된 부분)')}${gbars({series:[{vals:q5.pre,cls:'rpre'},{vals:q5.post,cls:'rpost'}],labels:q5.labels,max:m5.max,step:m5.step,top:t5,pt:46,h:320,label:'컨설팅 기대와 도움이 된 부분'})}</div></div>
  <div class="sat2" style="margin-top:22px">${satCard('q5fit','Q 5.2 컨설팅 전 기대했던 부분의 충족도',r.fit,SAT_Q2)}<div></div></div>
  <div class="qbar" style="margin-top:26px">Q 6.0 사전(경력준비에 장애가 되는 요인), 사후(가장 크게 극복된 장애요인)</div>
  <div class="sidechart"><div style="padding-top:34px">${sideList(q6.options,q6.top,'건',' 극복')}</div><div>${legend2('사전응답','사후응답')}${gbars({series:[{vals:q6.pre,cls:'rpre'},{vals:q6.post,cls:'rpost'}],labels:q6.labels,max:m6.max,step:m6.step,top:t6,box:o6,pt:46,h:320,label:'경력준비 장애요인 사전 사후'})}</div></div>
  <p class="fnote">중복선택 문항으로 사전과 사후의 응답 건수가 다를 수 있습니다 (사전 ${q6.selections.pre}건, 사후 ${q6.selections.post}건)</p>
  <p class="hintline" data-agg-method>Base 단위는 명이며 기준 인원은 ${r.n}명입니다. 세 질문은 서로 다른 문항이라 합치거나 같은 지표로 비교하지 않습니다. Q 5.0은 한 가지만 고른 단일 선택(사전은 기대, 사후는 가장 도움이 된 부분), Q 5.2는 사후 충족도 점수(분모 ${r.fit.n}명), Q 6.0은 중복선택(사전 장애요인, 사후 극복된 요인)입니다. 옆 목록의 비율은 선택 건수 ÷ 해당 질문의 전체 선택 건수이며 참여자 비율이 아닙니다. Q 5.0 순위는 사전 선택 수, Q 6.0 순위는 사후(극복) 선택 수가 많은 순이고 같으면 보기 순서가 먼저입니다.</p>`;
}
export function r7View(d){
  const r=d.analyses.r7;
  return `<div class="qbar">Q 7.0 전반적인 만족도 · 개선이 필요한 부분 (최대 2가지 선택)</div>
  <div class="tiles" style="grid-template-columns:repeat(3,1fr);margin-top:14px"><div class="tile c1"><span>전반적 만족도 (5점)</span><b>${r.avg1}</b></div><div class="tile c2"><span>경력 설계 유익도 (5점)</span><b>${r.avg2}</b></div><div class="tile"><span>자유 의견</span><b>${r.opinions}건</b></div></div>
  ${r.order.map(i=>hbrow(esc(r.options[i]),r.counts[i]/r.n*100,`<b>${r.percentages[i]}%</b>${r.counts[i]}명`)).join('')}
  <p class="fnote">자유 의견 원문은 표시하지 않습니다.</p>
  <p class="hintline" data-agg-method>기준 인원은 사전·사후 참여자 중 만족도 응답 ${r.n}명입니다. 최대 2개 중복선택으로 항목별 인원 ÷ 기준 인원 × 100을 소수 첫째 자리로 반올림합니다. 무응답은 선택 건수에 포함하지 않고 분모에는 포함합니다. 건수가 같으면 보기 순서로 표시합니다. 평균은 만족도 응답 점수의 평균이며 자유 의견은 앞뒤 공백을 제외한 내용이 있는 응답 건수입니다.</p>`;
}
export function r8View(d){
  const r=d.analyses.r8,m=mx(r.counts),order=r.top.map(t=>t.index);
  const top=r.options.map((o,i)=>order.includes(i)?{t:'',r:`TOP ${order.indexOf(i)+1}`}:null);
  return `<div class="sidechart" style="margin-top:0"><div><div class="qbar">Q 7.0 첫 회기 컨설팅 기대, TOP3</div><div style="padding-top:58px">${sideList(r.options,r.top,'건')}</div></div>
  <div><div class="qbar">Q 7.1 첫 회기 컨설팅은 어떤 형식으로 진행하기를 바라나요? (중복 : 최대 2개 선택)</div><div class="legend" style="margin-top:10px"><span><i class="sw" style="background:var(--pre)"></i>사전응답</span></div>
  ${gbars({series:[{vals:r.counts,cls:'rpre'}],labels:r.labels,max:m.max,step:m.step,top,pt:46,pb:66,h:350,bw:42,label:'첫 회기 컨설팅 진행 형식 기대'})}</div></div>
  <p class="fnote">중복선택 문항입니다 (총 ${r.selections}건, 응답자 ${r.n}명). 비율은 응답자 대비입니다.</p>
  <table><thead><tr><th>응답 항목</th><th>인원</th><th>비율</th></tr></thead><tbody>${r.options.map((o,i)=>`<tr><td>${esc(o)}</td><td>${r.counts[i]}명</td><td>${r.percentages[i]}%</td></tr>`).join('')}</tbody></table>
  <p class="hintline" data-agg-method>사전진단을 최종 제출하고 진단 응답과 첫 회기 기대 문항이 유효한 ${r.n}명을 기준으로 합니다. 각 비율은 선택 인원 ÷ 기준 인원 × 100(소수 첫째 자리 반올림)입니다. 최대 2개 선택을 모두 세며 순위 가중치는 없습니다. 동점은 보기 순서가 먼저입니다.</p>`;
}
export function adminAggregateView({data,loading=false,message='',tab='r1'}){
  const active=IMPLEMENTED.includes(tab)?tab:'r1';
  const select=data?`<label class="hintline" for="agg-company">기업</label><select class="in" id="agg-company" data-aggregate-company ${loading?'disabled':''}><option value="" ${data.company===null?'selected':''}>전체</option>${data.companies.map(c=>`<option value="${esc(c)}" ${data.company===c?'selected':''}>${esc(c)}</option>`).join('')}</select>`:'';
  const head=`<div class="filters" style="justify-content:space-between"><h2>통합 분석보고서</h2><div class="acts">${select}<button class="btn ghost" data-admin-aggregate="load" ${loading?'disabled aria-busy="true"':''}>${data?'통합 분석 다시 불러오기':'통합 분석보고서 열기'}</button></div></div>`;
  const status=`<p role="status" class="hintline" id="admin-aggregate-status">${esc(loading?'통합 분석을 집계하고 있습니다.':message)}</p>`;
  const intro='<p class="hintline">관리자 소속 조직의 사전·사후 최종 제출자를 기준으로 집계하며, 8번은 사전진단 최종 제출자를 기준으로 합니다. 개인별 응답은 화면에 내려오지 않습니다. 이 화면은 조회용이며 통합 보고서 인쇄는 아직 제공하지 않습니다.</p>';
  if(!data)return head+status+intro;
  const tabs=`<div class="filters" role="tablist" aria-label="통합 분석 화면" data-agg-tabs>${AGGREGATE_TABS.map(([k,l,on])=>on?`<button class="btn ${k===active?'':'ghost '}sm" role="tab" aria-selected="${k===active}" data-agg-tab="${k}">${esc(l)}</button>`:`<button class="btn ghost sm" role="tab" aria-selected="false" disabled data-agg-tab="${k}" title="구현 예정">${esc(l)} · 구현 예정</button>`).join('')}</div>`;
  const p=data.population,detail=['r4','r5','r6'].includes(active),sat=active==='r3'||active==='r7'||detail;
  let body;
  if(active==='r8')body=data.prePopulation.n?r8View(data):'<div class="empty" data-agg-empty>유효한 사전진단 완료자가 아직 없습니다.</div>';
  else if(!data.post.available)body='<div class="empty" data-agg-empty>사후진단 기능이 이 서비스 환경에서 사용 설정되어 있지 않아 사전·사후 통합 분석을 집계하지 않습니다.</div>';
  else if(!p.n)body='<div class="empty" data-agg-empty>사전·사후를 모두 완료한 참여자가 아직 없습니다.</div>';
  else if(sat&&!p.satN)body='<div class="empty" data-agg-empty>사후 만족도 설문에 응답한 참여자가 아직 없습니다.</div>';
  else if(detail&&!p.detailN)body='<div class="empty" data-agg-empty>만족도와 사전 기대 응답이 모두 완전한 참여자가 아직 없습니다.</div>';
  else body=({r1:r1View,r2:r2View,r3:r3View,r4:r4View,r5:r5View,r6:r6View,r7:r7View})[active](data);
  const base=active==='r8'?`<div class="rbase" data-agg-base>[Base: ${data.company===null?'전체 기업':esc(data.company)} 유효한 사전진단 완료자(n=${data.prePopulation.n}), 단위: 명] · 집계 시각 ${esc(new Date(data.generatedAt).toLocaleString('ko-KR'))}</div>`:data.post.available?`<div class="rbase" data-agg-base>[Base: ${data.company===null?'전체 기업':esc(data.company)} 사전·사후 참여자(n=${p.n})${sat&&p.n?`, 만족도 응답 n=${detail?p.detailN:p.satN}`:''}, 단위: 명] · 집계 시각 ${esc(new Date(data.generatedAt).toLocaleString('ko-KR'))}</div>`:'';
  const partial=detail&&data.post.available&&p.satN>p.detailN?`<p class="hintline" data-agg-detail-base>만족도 응답 ${p.satN}명 중 사전 기대·만족도 선택 응답이 완전한 ${p.detailN}명을 이 화면의 기준으로 합니다(나머지 ${p.satN-p.detailN}명 제외).</p>`:'';
  const excluded=active==='r8'&&data.prePopulation.excludedInvalid?`<p class="hintline" data-agg-excluded>사전진단을 제출했지만 진단 또는 첫 회기 기대 응답이 유효하지 않아 제외한 참여자 ${data.prePopulation.excludedInvalid}명</p>`:active!=='r8'&&data.post.available&&p.excludedInvalid?`<p class="hintline" data-agg-excluded>두 진단을 모두 제출했지만 응답이 완전하지 않아 제외한 참여자 ${p.excludedInvalid}명</p>`:'';
  return head+status+intro+tabs+base+body+partial+excluded+'<p class="hintline">9번 화면(기타의견)은 아직 구현되지 않았습니다.</p>';
}
