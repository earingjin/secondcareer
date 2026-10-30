import {esc} from './fields.js';

function counselorStatus(p){return p.status==='submitted'?'submitted':p._assessmentId?'draft':'new'}
export function counselorView({profile,records,counselorFilter,pname,assessmentUrl}){
  // records contains only the relationship-scoped response from the server.
  const name=counselorFilter.name.toLocaleLowerCase();
  const rows=records.filter(p=>(!name||String(pname(p)||'').toLocaleLowerCase().includes(name))&&
    (counselorFilter.status==='all'||(counselorFilter.status==='incomplete'?p.status!=='submitted':counselorStatus(p)===counselorFilter.status)));
  const completed=rows.filter(p=>p.status==='submitted').length;
  const labels={new:'미시작',draft:'작성 중',submitted:'진단 완료'};
  const options=[['all','전체'],['new','미시작'],['draft','작성 중'],['submitted','진단 완료'],['incomplete','미완료']];
  return `<div class="wrap" style="padding-top:26px"><div class="filters" style="justify-content:space-between"><div><h2>상담사 페이지</h2><p class="sub">${esc(profile.display_name||'상담사')} · 담당 내담자 관리</p></div><div class="acts"><button class="btn ghost" onclick="refresh()">새로 조회</button><button class="btn ghost" onclick="logout()">로그아웃</button></div></div>
  <div id="live-registration"></div>
  <div class="part"><h2>내 내담자 현황</h2></div>
  <section class="sec" aria-label="담당 내담자 현황"><p class="hintline">검색·상태 조건이 적용된 담당 내담자 기준입니다. 진단 완료는 최종 제출한 경우입니다.</p>
  <div class="tiles" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div class="tile" data-kpi="total"><span>대상자</span><b>${rows.length}</b></div><div class="tile c2" data-kpi="completed"><span>진단 완료</span><b>${completed}</b></div><div class="tile c3" data-kpi="incomplete"><span>미완료 인원</span><b>${rows.length-completed}</b></div></div></section>
  <section class="card sec" id="plist" style="padding:20px 18px"><h2>참여자 리스트 및 진행사항</h2>
  <form class="filters" onsubmit="event.preventDefault();filterCounselor()"><label class="hintline" for="cns-name">이름 검색</label><input class="in" id="cns-name" type="search" placeholder="내담자 이름 검색" value="${esc(counselorFilter.name)}"><label class="hintline" for="cns-status">진행 상태</label><select class="in" id="cns-status" onchange="filterCounselor()">${options.map(([value,label])=>`<option value="${value}" ${counselorFilter.status===value?'selected':''}>${label}</option>`).join('')}</select><button class="btn sm" type="submit">검색</button><button class="btn ghost sm" type="button" onclick="filterCounselor(true)">초기화</button></form>
  <p id="copy-notice-status" role="status"></p><p class="hintline" role="status">검색 결과 ${rows.length}명 / 담당 내담자 ${records.length}명</p>
  <div class="scroll"><table class="t zebra"><thead><tr><th>내담자 이름</th><th>소속기업</th><th>진행 상태</th><th>제출일</th><th>결과 열람</th><th>사전진단 안내</th></tr></thead><tbody>${rows.length?rows.map(p=>{const state=counselorStatus(p);return `<tr data-participant="${esc(p.id)}"><td><b>${esc(pname(p)||'-')}</b></td><td>${esc(p.company||'-')}</td><td><span class="badge-s s-${state==='submitted'?'pre':state==='draft'?'prog':'new'}">${labels[state]}</span></td><td>${esc(p.preDate||p.submittedAt?.slice(0,10)||'-')}</td><td>${state==='submitted'?`<div class="acts"><button class="btn sm" onclick="openRes('${esc(p.id)}','c')">결과 리포트 · 상담사용 5쪽</button><button class="btn ghost sm" onclick="openRes('${esc(p.id)}','p')">내담자용 3쪽</button></div>`:'<span class="hintline">최종 제출 후 열람 가능</span>'}</td><td><button class="btn ghost sm" data-copy-notice="${esc(p.id)}" ${!assessmentUrl||!p.loginId||!p.nick?'disabled':''}>사전진단 안내 복사</button>${!assessmentUrl?'<span>진단 접속 주소 설정이 필요합니다</span>':''}${!p.loginId?'<span>로그인 ID가 없습니다</span>':''}${!p.nick?'<span>내담자 이름이 없습니다</span>':''}</td></tr>`}).join(''):`<tr><td colspan="6" class="empty">${records.length?'검색·상태 조건에 맞는 내담자가 없습니다.':'배정된 내담자가 없습니다.'}</td></tr>`}</tbody></table></div></section></div>`;
}
