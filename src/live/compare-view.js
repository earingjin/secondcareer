import {OPT} from '../js/03-options.js';
import {AREAS,FACTORS} from '../js/01-areas.js';
import {ITEMS_PER_AREA,SCALE_MAX} from '../js/02-eval-config.js';
import {esc} from './fields.js';
import {SAT_QUESTIONS,SAT_COMMENT_LABEL} from './sat-defs.js';

// Counselor pre/post comparison. Scores and differences come from the server; this view only
// formats them and adds no grade or interpretation.
const signed=(v,digits)=>{const s=v.toFixed(digits);return v>0?'+'+s:s};
const date=v=>v?esc(String(v).slice(0,10)):'-';
function satAnswer(q,t){
  const v=t[q.key];
  if(q.scale)return `${esc(v)}점 / ${SCALE_MAX}점 <span class="hintline">(1 ${esc(q.scale[0])} · ${SCALE_MAX} ${esc(q.scale[1])})</span>`;
  const ranked=q.key==='d33';// Q4 keeps the participant's selection order
  return (v||[]).filter(x=>OPT['sat.'+q.key].includes(x)).map((x,i)=>esc((ranked?(i+1)+'순위 ':'')+x)).join(', ')||'-';
}
export function compareView({record,data,pname}){
  let h=`<div class="wrap" style="padding-top:26px" id="live-compare"><div class="filters" style="justify-content:space-between"><div><h2>사전·사후 비교</h2><p class="sub">${esc(pname(record)||'-')} · 사전 제출일 ${date(data.preDate||data.preSubmittedAt)} · 사후 제출일 ${date(data.postSubmittedAt)}</p></div><div class="acts"><button class="btn ghost" onclick="nav('cns')">담당 내담자 목록</button></div></div>
  <p class="hintline">평가 버전 ${esc(data.evaluationVersion||'-')} · 점수 차이는 사후 점수에서 사전 점수를 뺀 값입니다.</p>`;
  h+=`<section class="card sec" id="cmp-areas" style="padding:20px 18px"><h2>영역별 점수 비교</h2><div class="scroll"><table class="t zebra"><thead><tr><th>영역</th><th>사전</th><th>사후</th><th>차이</th></tr></thead><tbody>${AREAS.map((a,i)=>{const r=data.areas[i];return `<tr data-area="${i}"><td><b>${esc(a.k)}</b></td><td>${r.pre.toFixed(1)}</td><td>${r.post.toFixed(1)}</td><td>${signed(r.diff,1)}</td></tr>`}).join('')}</tbody></table></div></section>`;
  h+=`<section class="card sec" id="cmp-items" style="padding:20px 18px"><h2>문항별 응답 비교</h2><div class="scroll"><table class="t zebra"><thead><tr><th>번호</th><th>영역</th><th>문항</th><th>사전</th><th>사후</th><th>차이</th></tr></thead><tbody>${data.items.pre.map((v,i)=>{const p=data.items.post[i];return `<tr data-item="${i}"><td>${i+1}</td><td>${esc(AREAS[Math.floor(i/ITEMS_PER_AREA)].k)}</td><td><small class="hintline">${esc(FACTORS[i][0])}</small><br>${esc(FACTORS[i][1])}</td><td>${v}</td><td>${p}</td><td>${signed(p-v,0)}</td></tr>`}).join('')}</tbody></table></div></section>`;
  const t=data.sat||{};
  h+=`<section class="card sec" id="cmp-sat" style="padding:20px 18px"><h2>사후 만족도 응답</h2><dl class="rv">${SAT_QUESTIONS.map(q=>`<div data-sat="${q.key}"><dt>${esc(q.no)}. ${esc(q.text)}</dt><dd>${satAnswer(q,t)}</dd></div>`).join('')}<div data-sat="q7txt"><dt>${esc(SAT_COMMENT_LABEL)}</dt><dd>${t.q7txt?esc(t.q7txt):'<span class="none">작성하지 않음</span>'}</dd></div></dl></section>`;
  return h+`<div class="acts"><button class="btn ghost" onclick="nav('cns')">담당 내담자 목록으로 돌아가기</button></div></div>`;
}
