import {S} from '../shared/state.js';
import {AREAS,FACTORS} from '../js/01-areas.js';
import {gradeUnsure,gradeTxt,BAL_Y_TICKS,BAL_Y_LEVELS,REF_AVG,UNSURE_NOTE,COMPARE_SETS,ACTIVE_COMPARE,GRADE_SETS,ACTIVE_GRADE,GRADE_NAMES} from '../js/02-eval-config.js';
import {COUNSELORS} from '../js/03-options.js';
import {esc,today,areaScores,lowestArea} from '../js/04-util.js';
import {rawSums,cmtParts,full} from '../js/05-engine.js';

function createProfile({byId,pname,getEntities,entOf,pmOf,resultOf,backV,backLbl,editPanel,jmLogo,hdcLogo,leafSVG,sheetHead,sheetFoot,etcOf,agreed,bandCells,chartLegend,barsSVG}){
function vResult(pp,role){
  const p=pp||byId(S.res.id),c=(role||S.res.role)==='c',tot=c?5:5,rw=rawSums(p.pre),uns=rw.some((r,i)=>gradeUnsure(i,r));
  const sc=areaScores(p.pre),total=c?5:3,name=esc(pname(p)),ent=S.prevEnt?getEntities().find(x=>x.id===S.prevEnt):entOf(p),cn=(p.counselor&&COUNSELORS[p.counselor])||pmOf(p,ent),low=lowestArea(sc),R=resultOf(p),CT=R?cmtParts(R.comment):['',''];
  const goalRow=(l,v)=>`<tr><th>${l}</th><td>${esc(Array.isArray(v)?v.join(', '):v)}</td></tr>`;
  const g=p.goal||{},e=p.expect||{},r=p.reg||{};
  let h=`<div class="narrow"><div class="toolbar">
    <button class="btn ghost sm" onclick="${(c||S.from==='admin')?`nav('${backV()}')`:"nav('home')"}">← ${(c||S.from==='admin')?backLbl():'처음으로'}</button>
    <div class="acts">${c?`<button class="btn ghost sm" onclick="startEdit('${p.id}')">응답 수정 (상담사)</button>`:''}<button class="btn sm" onclick="window.print()">PDF로 저장(인쇄)</button></div></div>${c?editPanel(p):''}`;
  const AC=['1','2','3','4','5'],HEADN=['자기인식','직업환경 탐색','커리어 의사결정','커리어플랜','커리어목표실행'];
  const SUBL=[['Self-Assessment','나는 어떤 사람인가?'],['Looking-Outwards','어디로 가야 하는가?'],['Looking-Forwards','무엇을 선택해야 하는가?'],['Career Goal','어떻게 달성할 것인가?'],['Career Action','실행 및 목표달성']];
  const goal1=(g.b13||[])[0]||'-',goal2=(g.b13||[])[1]||'-',dt=esc(p.preDate||today());
  const iconP='<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="8" r="4" fill="#fff"/><path d="M4 21c0-5 4-8 8-8s8 3 8 8z" fill="#fff"/></svg>',iconM='<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="5" width="18" height="14" rx="2" fill="#fff"/><path d="M3 7l9 6 9-6" stroke="#9FC4C7" stroke-width="2" fill="none"/></svg>',iconT='<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 3h4l2 5-3 2c1 3 3 5 6 6l2-3 5 2v4c0 1-1 2-2 2C10 21 3 14 3 5c0-1 1-2 3-2z" fill="#fff"/></svg>';
  // p1 cover
  h+=`<section class="sheet cvs"><div class="cv">
    <div class="cv-top"><div class="cv-logos">${jmLogo()}${ent&&ent.logo?`<span class="cv-client"><img src="${ent.logo}" alt="${esc(ent.name)} 로고"></span>`:''}</div><span class="cv-guide">Second Planning Leading Guide</span></div>
    <div class="cv-diamond"></div>
    <div class="cv-paper"><div class="cv-sub">The better life, The better career</div><h2>세컨플래닝 리딩 가이드</h2><div class="cv-en">Second Planning</div></div>
    <div class="cv-date">${leafSVG('#7FB5A0')}<span>Date</span><span>${dt}</span></div>
    <div class="cv-name">Client Name : &nbsp;<b>${name}</b></div>
    <div class="cv-foot">${hdcLogo()}<span style="text-align:right">The Human Data Center / : www.humandc.co.kr<br>Copyright © 2026. JMCAREER. All rights reserved.</span></div></div></section>`;
  // p2 balance
  h+=`<section class="sheet rp">${sheetHead()}
    <div class="p2top"><div class="need"><div class="ttl">${leafSVG('#4A8A8E')}세컨플래닝의 필요성</div><p>세컨플래닝이란 원하는 경력목표 달성을 위해 준비해야하는 설계과정을 말합니다. 경력목표 달성을 위한 과정에서 필요한 5가지 요인을 확인하고 준비하면 커리어개발에 있어서 불확실성에 따른 리스크 감소, 성공적인 경력목표 달성에 도움을 받을 수 있습니다.</p></div>
    <div class="goal"><h4>${name}님이 작성한 경력목표</h4><div class="gl"><span>경력목표 1순위</span><b>${esc(goal1)}</b></div><div class="gl"><span>경력목표 2순위</span><b>${esc(goal2)}</b></div></div></div>
    <div class="tealpill">세컨플래닝 밸런스</div>
    <div class="myres"><div class="lab">나의 종합결과</div><div class="cells">${AREAS.map((a,i)=>`<div><div class="hd bg${AC[i]}">${HEADN[i]}</div><div class="lv">${gradeTxt(i,rw[i])}</div></div>`).join('')}</div></div>
    <div class="band">${leafSVG('#4A8A8E')}세컨플래닝을 통해 5가지 영역의 밸런스를 확인해보세요.</div>
    <div class="bal-sub">${SUBL.map(([e,k])=>`<div><span>${e}</span><b>${k}</b></div>`).join('')}</div>
    <div class="bal-legend"><span><i style="background:var(--bar)"></i>나의 평균</span><span><i style="background:var(--avg)"></i>성인 평균</span></div>
    <div class="bal-wrap"><div class="bal-y">${BAL_Y_TICKS.map(v=>`<span class="num" style="bottom:${v}%">${v}</span>`).join('')}${BAL_Y_LEVELS.map(([t,b])=>`<span class="lvw" style="bottom:${b}%">${t}</span>`).join('')}</div>
    <div class="bal-plot" role="img" aria-label="영역별 나의 평균과 성인 평균">${sc.map((v,i)=>`<div class="bal-col"><div class="bb me" style="height:${v}%"><em>${v}</em></div><div class="bb avg" style="height:${REF_AVG[i]}%"><em>${REF_AVG[i]}</em></div></div>`).join('')}</div></div>
    <div class="bal-x">${AREAS.map((a,i)=>`<div class="x${i}">${a.k}</div>`).join('')}</div>${uns?`<div class="unsure">${UNSURE_NOTE}</div>`:''}
    <div class="bal-ul">${AREAS.map(a=>`<ul>${a.tag.map(t=>`<li>${t}</li>`).join('')}</ul>`).join('')}</div>
    <div class="tealpill">결과표를 읽는 방법</div>
    <div class="readtbl">${AREAS.map((a,i)=>`<div class="rrow"><div class="rl bg${AC[i]}">${a.k}<small>(${a.en})</small></div><p>${a.desc}</p></div>`).join('')}</div>${sheetFoot(2,total)}</section>`;
  // p3 detail
  h+=`<section class="sheet rp">${sheetHead()}
    <div class="t3title">커리어플랜 세부 응답항목</div><div class="t3note">클라이언트가 응답한 문항 결과를 나타냅니다.</div>
    <div class="t3head"><span>항목점수</span><span>세부항목</span><span class="sc"><i style="font-style:normal">매우 아니다</i><i style="font-style:normal">보통</i><i style="font-style:normal">매우 그렇다 <small>(5점 만점)</small></i></span></div>
    <div class="t3body">${AREAS.map((a,ai)=>`<div class="grp3"><div class="g-l"><b>${gradeTxt(ai,rw[ai])}</b><span>${sc[ai]}<small>점</small></span></div><div class="g-a">${a.k}</div><div class="g-f">${[0,1,2].map(j=>{const i=ai*3+j,v=p.pre[i];return `<div class="f3r"><div class="fn">${FACTORS[i][0]}</div><div class="ftrack"><div class="fbar" style="width:${v/5*100}%"></div><b style="left:calc(${v/5*100}% + 8px)">${v}</b></div></div>`}).join('')}</div></div>`).join('')}</div>
    <div class="cmt"><div class="cmt-h">코멘트</div><div class="cmt-b"><p style="font-weight:700;margin-bottom:8px">“${esc(CT[0])}”</p><p>${esc(CT[1])}</p></div></div>
    ${uns?`<div class="unsure">${UNSURE_NOTE}</div>`:''}<div class="memo-note">커리어컨설턴트와 함께 작성합니다.</div><div class="memo">메모</div>
    <div class="p3bot"><div class="kw"><h5>[ 귀하를 위한 인생키워드 ]</h5>${R&&R.kw.age?`<p># ${esc(R.kw.age.text)}</p>`:''}${R&&R.kw.goal?`<p># ${esc(R.kw.goal.text)}</p>`:''}${R?`<p># ${esc(R.kw.pro.text)}</p>`:''}</div>
    <div class="ccard"><div class="cc-top">${jmLogo()}</div><div>✓ 커리어컨설팅 문의 안내</div><div>${cn?`<div class="ci"><i>${iconP}</i>${esc(cn.n)} PM</div><div class="ci"><i>${iconM}</i>${esc(cn.mail)}</div><div class="ci"><i>${iconT}</i>${esc(cn.tel)}</div>`:'<div class="ci">담당자 배정 전입니다</div>'}</div><div class="cc-priv">✓ 개인정보처리에 대한 안내 &nbsp;<small>제이엠커리어는 고객의 개인정보를 소중하게 보호합니다.</small></div></div></div>${sheetFoot(3,total)}</section>`;

  if(c){
    h+=`<section class="sheet">${sheetHead('상담사용 프로파일')}<div class="ribbon">★ 응답자에게 공개하지 않음 ★</div>
    <h3 class="st">01. 응답자 기본 정보</h3><div class="scroll"><table class="t"><tr><th>응답자 이름</th><td>${name}</td><th>상담코드</th><td>${esc(p.counselor||'-')}</td></tr><tr><th>성별</th><td>${r.gender==='남'?'남성':r.gender==='여'?'여성':esc(r.gender)}</td><th>출생년도</th><td>${esc(r.birth)}${r.birthDate?` <span class="hintline">(생년월일 ${esc(r.birthDate)})</span>`:''}</td></tr><tr><th>휴대폰</th><td>${esc(r.phone)}</td><th>이메일</th><td>${esc(r.email)}</td></tr><tr><th>소속회사</th><td>${esc(p.company)}</td><th>최근 직급/직책</th><td>${esc((r.careers[0]||{}).title)}</td></tr><tr><th>업무/부서</th><td>${esc((r.careers[0]||{}).task)}</td><th>해당업종</th><td>${esc(etcOf(r,'industry'))}</td></tr><tr><th>기대소득수준</th><td>${esc(etcOf(r,'income'))}</td><th>개인정보 동의</th><td>${agreed(p)?'동의':'-'}</td></tr></table></div>
    <h3 class="st">02. 경력목표별 응답</h3><div class="scroll"><table class="t">${goalRow('1 · 직업준비 시작 시기',g.b11)+goalRow('2 · 퇴직 후 계획수준',g.b12)+goalRow('3 · 가장 관심을 두는 분야',g.b13)+goalRow('4 · 경력목표 선택이유',g.b14)+goalRow('5 · 달성가능성(%)',g.b15)+goalRow('6 · 예상 소요기간(개월)',g.b16)}</table></div>
    <h3 class="st">03. 커리어 컨설팅 서비스 기대 (사전/사후 효과성 문항)</h3><div class="scroll"><table class="t">${goalRow('현재 마음상태',e.d32)}<tr><th>컨설팅 호소문제 (우선순위)</th><td>${(e.d33||[]).map((x,i)=>`${i+1}순위 ${esc(x)}`).join('<br>')}</td></tr>${goalRow('컨설팅 목표 (이번 컨설팅을 통한 기대)',e.d34)}${goalRow('경력의 장애요소 2가지',e.d35)}<tr><th>첫 회기 진행방식</th><td>${(e.d36||[]).map((x,i)=>`${i+1}번 ${esc(x)}`).join('<br>')}</td></tr></table></div>${sheetFoot(4,5)}</section>`;
    h+=`<section class="sheet">${sheetHead('상담사용 프로파일')}<h3 class="st">04. 응답자 종합결과</h3>
    <div class="scroll"><table class="t c"><tr>${AREAS.map(a=>`<th>${a.k}</th>`).join('')}</tr><tr>${sc.map(v=>`<td><b>${v}</b></td>`).join('')}</tr><tr>${rw.map((r,i)=>`<td>${gradeTxt(i,r)}</td>`).join('')}</tr></table></div>
    <h3 class="st">응답문항 <span class="hintline" style="font-weight:600">1 전혀 아니다 · 2 아니다 · 3 보통 · 4 그렇다 · 5 매우 그렇다</span></h3>
    <div class="scroll"><table class="t zebra"><tr><th>#</th><th>영역</th><th>요인</th><th>문항</th><th>응답</th></tr>${FACTORS.map((f,i)=>`<tr><td>${i+1}</td><td>${i%3===0?AREAS[i/3].k:''}</td><td>${f[0]}</td><td>${esc(f[1])}</td><td style="text-align:center"><b>${p.pre[i]}</b></td></tr>`).join('')}</table></div>
    <h3 class="st">평가기준표 (100점 만점) <span class="hintline" style="font-weight:600">비교군: ${COMPARE_SETS[ACTIVE_COMPARE].label} · 판정: ${GRADE_SETS[ACTIVE_GRADE].label} · 검증 필요</span></h3><div class="scroll"><table class="t c"><tr><th>영역</th><th>점수</th><th>점수평균</th>${GRADE_NAMES.map(n=>`<th>${n}</th>`).join('')}</tr>${AREAS.map((a,i)=>`<tr><td>${a.k}</td><td><b>${sc[i]}</b></td><td>${REF_AVG[i]}</td>${bandCells(i)}</tr>`).join('')}</table></div>${uns?`<div class="unsure">${UNSURE_NOTE}</div>`:''}${sheetFoot(5,5)}</section>`;
  }
  if(full(p.post)){
    const ps=areaScores(p.post);
    h+=`<section class="sheet noprintpage">${sheetHead('사전·사후 비교')}<h3 class="st">사전·사후 퇴직준비도 변화 <span class="hintline" style="font-weight:600">별도 제공 자료</span></h3>
    ${chartLegend([['pre','사전 '+(p.preDate||'')],['post','사후 '+(p.postDate||'')]])}${barsSVG([{vals:sc,cls:'pre'},{vals:ps,cls:'post'}],AREAS.map(a=>a.k),'사전 사후 영역별 점수')}
    <div class="scroll"><table class="t c"><tr><th>영역</th><th>사전</th><th>사후</th><th>변화</th></tr>${AREAS.map((a,i)=>{const d=Math.round((ps[i]-sc[i])*10)/10;return `<tr><td>${a.k}</td><td>${sc[i]}</td><td>${ps[i]}</td><td><b style="color:${d>0?'var(--mint-deep)':d<0?'var(--coral-deep)':'inherit'}">${d>0?'+':''}${d}</b></td></tr>`}).join('')}</table></div></section>`;
  }
  return h+'</div>';
}
return {vResult};
}

export {createProfile};
