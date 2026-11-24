import {esc} from './fields.js';
import {companyLabel, officialCompanyLabel, submittedDate, isPending, isUnclassified, latestSubmissions} from './admin-directory-view.js';

export function adminDashboardView({data,loading,message}){
  const heading=`<div class="admin-section-head">
    <div><h2>운영 대시보드</h2>${data?.organizationName?`<p class="hintline">${esc(data.organizationName)}</p>`:''}</div>
    <button class="btn ghost" data-admin-directory="refresh" ${loading?'disabled':''}>다시 불러오기</button>
  </div>`;
  const links='<section class="card sec admin-intake-section" data-intake-dashboard></section>';
  if(loading||!data){
    const status=loading?'내담자 현황을 조회하고 있습니다.':message||'내담자 현황을 조회해 주세요.';
    return heading+`<p class="admin-dashboard-status" role="status">${esc(status)}</p>`+links;
  }

  const participants=data.participants;
  const hasClassification=Array.isArray(data.assignmentCompanies);
  const counts=[
    ['participants','전체 등록 내담자',participants.length],
    ['submitted','사전진단 제출 완료',participants.filter(p=>p.preStatus==='submitted').length],
    ['unclassified','공식 고객사 미분류',hasClassification?participants.filter(isUnclassified).length:null],
    ['unassigned','담당 상담사 미배정',participants.filter(p=>p.assignment==='unassigned').length]
  ];
  const work=latestSubmissions(participants.filter(isPending));
  const assignment={assigned:'배정 완료',unassigned:'미배정',unknown:'담당 확인 필요'};
  const rows=work.map(p=>`<tr data-admin-work-row>
    <td><strong>${esc(p.name||'-')}</strong></td><td>${esc(companyLabel(p.companyName))}</td>
    <td>${submittedDate(p.submittedAt)}</td>
    <td><span class="admin-status-chip ${p.companyId===null?'needs-action':''}">${esc(officialCompanyLabel(p))}</span></td>
    <td><span class="admin-status-chip ${p.assignment==='assigned'?'':'needs-action'}">${assignment[p.assignment]}</span></td>
    <td><button class="btn ghost sm" data-admin-menu="admin-directory" data-admin-work-participant="${esc(p.id)}">내담자 관리</button></td>
  </tr>`).join('');
  return heading+`<div class="admin-dashboard-kpis">${counts.map(([key,label,value])=>`<button type="button" data-admin-dashboard-kpi="${key}" data-admin-menu="admin-directory" data-directory-preset="${key}" ${value===null?'disabled':''}>
    <span class="admin-kpi-label">${label}</span><span class="admin-kpi-value">${value===null?'조회 정보 없음':`<b>${value.toLocaleString('ko-KR')}</b> 명`}</span>
  </button>`).join('')}</div>
  <section class="card sec admin-dashboard-work">
    <div class="admin-section-head"><h3>처리할 업무 <span>${work.length.toLocaleString('ko-KR')}명</span></h3>
      <button class="btn ghost" data-admin-menu="admin-directory" data-directory-preset="pending">내담자 목록</button></div>
    ${data.totals.unknownCounselor?`<button class="btn ghost sm admin-work-review" data-admin-menu="admin-directory" data-directory-preset="unknown">담당 확인 필요 ${data.totals.unknownCounselor.toLocaleString('ko-KR')}명</button>`:''}
    ${rows?`<p class="hintline admin-scroll-hint">표를 좌우로 스크롤해 모든 열을 볼 수 있습니다.</p>
    <div class="scroll admin-table-scroll" tabindex="0" role="region" aria-label="처리할 내담자 목록"><table class="t zebra">
      <thead><tr>${['내담자 이름','입력 소속기업','최종 제출일 (한국시간)','고객사 분류','상담사 배정','업무 이동'].map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>`:`<p class="admin-dashboard-status" role="status">${!participants.length?'등록된 내담자가 없습니다.':hasClassification?'미분류 또는 미배정 내담자가 없습니다.':'조회된 내담자 중 상담사 미배정 인원이 없습니다.'}</p>`}
  </section>`+links;
}
