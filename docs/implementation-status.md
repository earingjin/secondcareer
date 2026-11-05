# 요구사항별 구현 현황 점검

## 1. 점검 목적 및 기준 커밋

점검일: **2026-11-05**. 조사 기준 HEAD: `1caebc76e9317c56757a7d17c5a6553887ddbbfd`, 브랜치 `dev-005-counselor-pagination`. 원격 참조를 가져온 뒤 해당 브랜치의 로컬과 원격이 같았으며 STEP 03 커밋이 포함됐다. 이 문서는 요구사항과 기준 커밋의 코드 경로를 비교한 정적 조사이며, 구현 판정은 운영 준비나 배포 승인이 아니다.

**갱신 (2026-11-05, 관리자 핵심 기능 개발 01)**: HEAD `992d0b8` 위에서 REQ-A-004를 구현하고 해당 행, 4절 집계, 10~13절을 갱신했다. 다른 요구사항의 판정은 바꾸지 않았다. 이 갱신에서는 자동화 테스트를 실행했다(13절). 다른 행의 "미실행" 표기는 원래 점검 당시 기준이다.

**갱신 (2026-11-05, STEP 08 관리자 개인 결과보고서)**: HEAD `f770dd6` 위에서 REQ-A-005의 조회·인쇄를 구현하고 해당 행, 4절 집계, 10~13절을 갱신했다. 다른 요구사항의 판정은 바꾸지 않았다.

**갱신 (2026-11-05, STEP 07 관리자 운영 관리 조회)**: HEAD `1aa7012` 위에서 REQ-A-001·002의 조회 기능을 추가하고 두 행과 10~13절을 갱신했다. 계정 생성·변경 기능이 없어 두 행은 **부분 구현**을 유지하므로 4절 집계는 바뀌지 않는다. REQ-A-003은 이번 단계에서 제외했고 판정을 유지한다.

## 2. 점검 범위와 제외 사항

`requirements.md`, `decisions.md`, `security-architecture.md`, `AGENTS.md`, `README.md`, `src/live`, `src/admin`, `src/js` 엔진, `supabase/functions`, `supabase/proposals`, 관련 `tests/live`, `tests/admin`, `tests/contract`, `tests/golden`, 보고서 스냅샷과 레거시를 조사했다. 아래 경로는 별도 표기가 없으면 기준 커밋에 추적되는 로컬 파일이며 fetch한 해당 원격 브랜치에도 같은 커밋으로 존재한다. 원격 운영 배포 자산이나 DB와의 동일성은 확인하지 않았다. 실제 운영 환경의 설정·사용자 데이터·DB 쓰기·배포는 확인하지 않았다.

## 3. 상태 판정 기준

- **구현**: 기준 커밋에 요구 기능의 주요 코드 경로가 확인된다. 실제 배포, 보안 또는 동작 성공을 보증하지 않는다.
- **부분 구현**: 일부 경로는 있으나 기능·안전 경계의 중요한 부분이 없거나 적용 조건이 남아 있다.
- **미구현**: 조사한 live/서버 경로에서 해당 기능을 찾지 못했다. 레거시 데모만 있으면 이 범주다.
- **판정 보류**: 정책이 미확정이거나 요구사항 충족 판단의 근거가 부족하다.

표의 테스트 열은 관련 테스트 **파일의 존재와 이번 실행 여부**를 뜻한다. 이번 점검에서 모든 테스트는 **미실행**이다. 코드·설정·테스트 파일의 정적 확인만 수행했고, 실제 브라우저 흐름과 실제 서버·DB·운영 환경은 미검증이다. SQL 제안은 코드 저장과 실제 DB 적용을 구분한다. 우선순위는 P0 보안·무결성·운영 검증, P1 상담사 페이지네이션과 관리자 기반, P2 관리자 분석·출력, P3 고객사 후속 기능의 제안이며 일정이나 승인이 아니다. 접근 통제 미완성은 역할과 무관하게 P0으로 올렸다.

## 4. 사용자별 구현 현황 요약

막대는 확정 요구사항 중 **구현 건수 ÷ (구현 + 부분 구현 + 미구현)**을 10칸에 반올림한다. 부분 구현은 완료로 계산하지 않고 보류 1건은 분모에서 제외한다. 비율은 코드 경로 판정일 뿐 운영 완성도가 아니다.

| 역할 | 구현 | 부분 구현 | 미구현 | 보류 | 구현률 | 막대 |
|---|---:|---:|---:|---:|---:|---|
| 참여자 | 5 | 3 | 0 | 0 | 5/8 = 62.5% | ██████░░░░ |
| 상담사 | 3 | 6 | 0 | 1 | 3/9 = 33.3% | ███░░░░░░░ |
| 관리자 | 2 | 2 | 12 | 0 | 2/16 = 12.5% | █░░░░░░░░░ |
| 고객사 담당자 | 0 | 2 | 4 | 0 | 0/6 = 0% | ░░░░░░░░░░ |
| 공통 비기능 | 0 | 4 | 0 | 0 | 0/4 = 0% | ░░░░░░░░░░ |
| 합계 | 10 | 17 | 16 | 1 | 10/43 = 23.3% | ██░░░░░░░░ |

집계 변경 이력: 최초 점검은 관리자 0/2/14, 합계 8/17/18(18.6%). REQ-A-004 미구현 → 구현으로 관리자 1/2/13, 합계 9/17/17(20.9%). STEP 08에서 REQ-A-005 미구현 → 구현으로 현재 값이 됐다.

## 5. 참여자 요구사항별 점검표

표의 `live/`는 `src/live/`, `assessment`는 `supabase/functions/secondcareer-assessment/index.ts`, `account`는 `supabase/functions/secondcareer-account/index.ts`, `register`는 `supabase/functions/secondcareer-register-participant/index.ts`다. 테스트 경로는 `tests/` 아래이며 `미실행`은 이번 점검 기준이다. 모든 행은 정적 확인, 운영 미검증이다.

| ID | 기능명 | 구현 상태 | 코드 근거 | 테스트 근거·이번 실행 | 운영 검증 | 부족한 부분 | 우선순위 |
|---|---|---|---|---|---|---|---|
| REQ-P-001 | 발급 계정 로그인 | 부분 구현 | `live/api.js` login, `live/app.js` doLogin, `account` | `live/login-fallback.spec.mjs`, `live/registration-server.spec.mjs` 미실행 | 미검증 | 호출하는 `secondcareer-login` 함수 원본·운영 Auth 계약 미확인 | P0 |
| REQ-P-002 | 개인정보 수집·이용 동의 | 구현 | `live/survey-view.js` wConsent, `assessment` missing/sanitize | `contract/contract.spec.mjs`, `live/mobile-survey.spec.mjs` 미실행 | 미검증 | 고지 문구 법적 검토·실제 저장 검증 필요 | P0 |
| REQ-P-003 | 기본정보와 경력목표 입력 | 구현 | `live/survey-view.js` wReg/wGoal, `assessment` cleanAnswers | `live/mobile-survey.spec.mjs` 미실행 | 미검증 | 실제 저장·재접속 미검증 | P1 |
| REQ-P-004 | 사전진단 15문항과 서비스 기대 응답 | 구현 | `live/survey-view.js` wDiagPre/wExpect, `src/js/00-question-defs-module.js` | `contract/contract.spec.mjs`, `live/mobile-survey.spec.mjs` 미실행 | 미검증 | 실제 배포 자산·서버 동일성 미검증 | P1 |
| REQ-P-005 | 작성 중 저장 및 이어쓰기 | 구현 | `live/app.js` flushDraft/hydrate, `assessment` draft | `live/mobile-survey.spec.mjs`, `live/registration-browser.spec.mjs` 미실행 | 미검증 | 실제 DB RPC·동시 편집 확인 필요 | P0 |
| REQ-P-006 | 사전 응답 최종 제출 및 수정 제한 | 구현 | `live/app.js` submit/editable, `live/survey-view.js` vWizard, `assessment` submit/draft | `live/registration-browser.spec.mjs`, `e2e/roles.spec.mjs` 미실행 | 미검증 | 실제 DB 직접 경로의 잠금 검증 필요 | P0 |
| REQ-P-007 | 허용 후 사후진단과 만족도 설문 참여 | 부분 구현 | `live/post-test-gate.js`, `live/app.js` postAllowed/startPost, `assessment` post-draft/post-submit | `live/post-survey.spec.mjs`, `live/post-draft-server.spec.mjs` 미실행 | 미검증 | 서버 플래그·승인·제안 RPC의 실제 적용과 전체 흐름 미확인 | P0 |
| REQ-P-008 | 개인 결과보고서 직접 조회·인쇄 제한 | 부분 구현 | `live/app.js` openRes, `assessment` reportId 역할 검사 | `live/reports.spec.mjs`, `live/assessment-notice-server.spec.mjs` 미실행 | 미검증 | 직접 DB/RPC·배포 경로 전반의 차단 미검증 | P0 |

## 6. 상담사 요구사항별 점검표

동일 약어·검증 기준을 적용한다. 모든 행은 정적 확인, 운영 미검증이다.

| ID | 기능명 | 구현 상태 | 코드 근거 | 테스트 근거·이번 실행 | 운영 검증 | 부족한 부분 | 우선순위 |
|---|---|---|---|---|---|---|---|
| REQ-C-001 | 내담자 등록·조회·관리 | 부분 구현 | `live/participant-registration.js`, `register`, `assessment` participantQuery | `live/registration-browser.spec.mjs`, `live/registration-server.spec.mjs` 미실행 | 미검증 | 등록 플래그·SQL·실 DB 적용 및 관리 범위 검증 필요 | P0 |
| REQ-C-002 | 담당 내담자 사전·사후 진행 상태 확인 | 부분 구현 | `live/counselor-view.js` counselorView, `assessment` postStatus | `live/post-survey.spec.mjs` 미실행 | 미검증 | 사후 상태는 프런트·서버 게이트와 DB에 의존 | P1 |
| REQ-C-003 | 이름 검색과 상태 필터 | 구현 | `live/counselor-view.js` rows 필터, `live/app.js` filterCounselor | `live/assessment-notice-server.spec.mjs` 미실행 | 미검증 | 클라이언트의 담당 목록에서 필터, 실제 대량 데이터 검증 필요 | P1 |
| REQ-C-004 | 내담자 목록 페이지네이션 | 부분 구현 | `assessment` readAll의 제한 단위 반복 조회; `live/counselor-view.js` rows.map | `live/assessment-notice-server.spec.mjs` 미실행 | 미검증 | 서버 내부 읽기 분할만 존재; 화면 페이지 상태·이동 UI·필터 연계 없음 | P1 |
| REQ-C-005 | 승인된 범위의 응답 수정과 재계산 | 구현 | `live/app.js` persistEdit, `assessment` edit, `src/js/05-engine.js` recomputeResultCore | `live/reports.spec.mjs`, `golden/golden.spec.mjs` 미실행 | 미검증 | 구체적 허용 범위 미확정, 실제 RPC·이력 검증 필요 | P0 |
| REQ-C-006 | 개인 결과보고서 조회·인쇄 | 구현 | `live/app.js` openRes/fitSheets, `assessment` report, `shared/profile.js` | `live/reports.spec.mjs`, `snapshot/snapshot.spec.mjs` 미실행 | 미검증 | 실제 서버 렌더와 인쇄 환경 3쪽·5쪽 확인 필요 | P1 |
| REQ-C-007 | 사후진단 허용과 안내 | 부분 구현 | `live/counselor-view.js` postApprovalCell, `live/app.js` post-approve, `assessment` | `live/post-survey.spec.mjs`, `live/post-draft-server.spec.mjs` 미실행 | 미검증 | 게이트·승인 RPC와 실제 배포·DB 적용 미검증 | P0 |
| REQ-C-008 | 다른 상담사 내담자 접근 차단 | 부분 구현 | `assessment` participantQuery 조직·담당 필터; `register` | `live/assessment-notice-server.spec.mjs`, `live/post-draft-server.spec.mjs` 미실행 | 미검증 | 실제 RLS·직접 DB/RPC·재배정 우회 미검증 | P0 |
| REQ-C-009 | 통합 분석보고서 생성·조회·관리 차단 | 부분 구현 | `live/app.js` 상담사 화면, `assessment` 역할 분기 | `live/assessment-notice-server.spec.mjs` 미실행; 통합 API 차단 전용 시험 근거 없음 | 미검증 | live 통합 API 자체가 없어 거부 경로 전반 검증 불가; 레거시 상담사 메뉴 존재 | P0 |
| REQ-C-010 | 개인별 사전·사후 비교 화면 유지 여부 | 판정 보류 | `live/compare-view.js`, `live/app.js` openCompare, `assessment` compareId | `live/post-survey.spec.mjs`, `live/post-draft-server.spec.mjs` 미실행 | 미검증 | 코드 존재와 별개로 유지·권한·출력 미확정 | P1 |

## 7. 관리자 요구사항별 점검표

레거시 `aReport`·`rp1`~`rp9`는 운영 API의 구현 근거로 계산하지 않는다. 모든 행은 정적 확인, 운영 미검증이다.

| ID | 기능명 | 구현 상태 | 코드 근거 | 테스트 근거·이번 실행 | 운영 검증 | 부족한 부분 | 우선순위 |
|---|---|---|---|---|---|---|---|
| REQ-A-001 | 기업과 세컨플래닝 운영 정보 관리 | 부분 구현 | 관리(쓰기): `account`의 조직 진단 URL 설정, `live/app.js` saveAssessmentUrl. 조회: 관리자 전용 읽기 API `supabase/functions/secondcareer-admin-directory/index.ts`가 운영 조직명(`organizations.name`)과 소속기업별(`participants.company_name`, 빈 값은 미지정) 참여자 수·담당 상담사 수를 반환, `live/admin-directory-view.js` 소속기업 현황. 인증·조직 범위는 진단 현황과 공용인 `_shared/admin-access.ts` | `live/admin-directory.spec.mjs` 10건, `live/registration-server.spec.mjs` **실행·통과**(모의) | 미검증: 함수 미배포, 실제 DB·RLS 미확인 | 기업 생성·수정·삭제와 기업 단위 운영 정보 관리 없음(기업은 참여자 등록 시 입력한 문자열이며 별도 기업 테이블 없음). 운영 조직 정보 수정은 진단 URL 외 없음 | P1 |
| REQ-A-002 | 상담사·참여자 계정 관리 | 부분 구현 | 관리(쓰기): `live/participant-registration.js`, `register`(참여자 등록), `src/admin/account-operations.cjs`(운영자 CLI: TEST 참여자 생성·비밀번호 교체). 조회: `secondcareer-admin-directory`가 같은 조직의 상담사 목록(이름·로그인 아이디·담당 참여자 수)과 참여자 목록(등록 이름·로그인 아이디·소속기업·담당 상담사·사전진단 상태), 담당 미배정·담당 확인 필요 인원을 반환. `live/admin-directory-view.js` 상담사 현황·참여자 목록·필터 | `live/admin-directory.spec.mjs` 10건, `live/registration-browser.spec.mjs`, `admin/account-operations.spec.mjs` **실행·통과**(모의) | 미검증: 함수 미배포, 실제 DB·RLS 미확인 | 웹의 상담사 계정 생성·비활성화, 담당 상담사 변경, 참여자 계정 초기화·삭제 없음(안전한 서버 계약과 계정 상태·재배정 정책 미확정). 목록 페이지네이션 없음 | P1 |
| REQ-A-003 | 고객사 담당자 계정 관리 | 미구현 | 레거시 `mgrSection`만 확인 | 관련 live 관리자 계정 테스트 확인 못함; 미실행 | 미검증 | 운영 계정 관리 UI·서버 API 부재 | P1 |
| REQ-A-004 | 전체 진단 진행·완료율·미완료 현황 조회 | 구현 | 관리자 전용 읽기 API `supabase/functions/secondcareer-admin-progress/index.ts`(서버 프로필의 admin 역할·`organization_id`만 범위로 사용, 요청 파라미터 거부, `participants.id,company_name`과 `assessments.participant_id,phase,status`만 읽어 집계); `live/admin-progress-view.js`, `live/app.js` loadProgress, `live/api.js` adminProgress. 기존 `assessment`의 역할 검사는 변경하지 않음 | `live/admin-progress-server.spec.mjs` 8건, `live/admin-progress-browser.spec.mjs` 6건 **실행·통과**(모의 하네스) | 미검증: 함수 미배포, 실제 Auth·DB·RLS·직접 Data API 경로 미확인 | 범위는 관리자 소속 조직 단위만 적용(업무 범위 세분화는 요구사항 10절 3번 미확정). 사후 완료율은 분모 미확정(10절 7번)으로 계산하지 않고 상태별 인원만 표시. 조회 감사 기록 없음(REQ-N-003). Deno 타입 검사·실행 미수행 | P1 |
| REQ-A-005 | 개인 결과보고서 관리 | 구현(조회·인쇄) | 관리자 전용 `supabase/functions/secondcareer-admin-report/index.ts`(서버 프로필의 admin 역할·`organization_id`로 대상 참여자를 매 요청 재조회, 사전진단 최종 제출·결과 있을 때만 `{html}` 반환, 범위 밖·미제출은 같은 403). 보고서는 상담사 경로와 공용인 `secondcareer-assessment/shared/report.ts`(기존 `index.ts`에서 그대로 옮김)로 렌더링하며 계산·판정·저장 코멘트/키워드·5쪽/3쪽 구성은 기존 `shared/profile.js`·`js/*` 그대로. 상담사용 `?id=` 경로의 상담사 전용 조건은 유지. 관리자 화면은 `live/admin-directory-view.js` 보고서 열(제출 완료만 활성), `live/app.js` openAdminReport·보고서 보기·목록 복귀 | `live/admin-report.spec.mjs` 9건 **실행·통과**(모의): 정상 조회, 타 조직·없음·임시저장·미시작 거부, 참여자·타 담당 상담사·고객사 역할 거부, 상담사와 인쇄 쪽 HTML 동일, 화면 PDF 5쪽·3쪽(상담사 화면과 같음), 목록 복귀·필터 유지, 실패·세션 만료 | 미검증: 함수 미배포, 실제 DB·RLS·Auth, 실제 브라우저 인쇄 장치 | 세부 "관리" 행위(재발행·배포 등)는 요구사항 10절 2번 미확정이라 조회·인쇄만 구현. 조직 내 업무 범위 세분화 미확정(조직 단위). 보고서 조회 감사 기록 없음(REQ-N-003, 운영 배포 전 조건) | P1 |
| REQ-A-006 | 통합 사전·사후 분석보고서 생성·조회·인쇄·관리 | 미구현 | 레거시 `aReport`만 확인 | `e2e/roles.spec.mjs`는 레거시; 미실행 | 미검증 | 관리자 통합 API·서버 집계·화면·감사 필요 | P1 |
| REQ-A-007 | 영역별 평균 원점수, 합계, 변화율 및 순위 | 미구현 | 레거시 `rp1` | 운영 분석 테스트 확인 못함; 미실행 | 미검증 | 서버 집계·권한 제한·표시 필요 | P2 |
| REQ-A-008 | 영역·문항 요인별 평균, 차이·변화율과 순위 | 미구현 | 레거시 `rp2` | 운영 분석 테스트 확인 못함; 미실행 | 미검증 | 서버 집계·표·차트 필요 | P2 |
| REQ-A-009 | 서비스 만족도 및 경력설계 유익도 분포·평균 | 미구현 | 레거시 `rp3` | 운영 분석 테스트 확인 못함; 미실행 | 미검증 | 서버 집계·표시 필요 | P2 |
| REQ-A-010 | 마음 상태 변화 및 심리적 안정감 분석 | 미구현 | 레거시 `rp4` | 운영 분석 테스트 확인 못함; 미실행 | 미검증 | 서버 집계·표시 필요 | P2 |
| REQ-A-011 | 호소문제 사전·사후 분포와 상위 변화 | 미구현 | 레거시 `rp5` | 운영 분석 테스트 확인 못함; 미실행 | 미검증 | 서버 집계·표시 필요 | P2 |
| REQ-A-012 | 컨설팅 기대·도움·충족도 및 장애요인 변화 | 미구현 | 레거시 `rp6` | 운영 분석 테스트 확인 못함; 미실행 | 미검증 | 서버 집계·표시 필요 | P2 |
| REQ-A-013 | 만족도 개선 요인과 자유 의견 건수 | 미구현 | 레거시 `rp7` | 운영 분석 테스트 확인 못함; 미실행 | 미검증 | 서버 집계·표시 필요 | P2 |
| REQ-A-014 | 첫 회기 컨설팅 기대 분포 및 상위 항목 | 미구현 | 레거시 `rp8` | 운영 분석 테스트 확인 못함; 미실행 | 미검증 | 사전 완료자 모집단 집계·표시 필요 | P2 |
| REQ-A-015 | 기타 의견과 문구 포함 기준 키워드 집계 | 미구현 | 레거시 `rp9` | 운영 분석 테스트 확인 못함; 미실행 | 미검증 | 서버 집계 및 미확정 자유 의견 보호 정책 필요 | P2 |
| REQ-A-016 | 통합 보고서 출력 형식 | 미구현 | 레거시 `aReport` 인쇄·`exportPptx` | `e2e/roles.spec.mjs`는 레거시; 미실행 | 미검증 | 관리자 통합 인쇄 경로 필요; PPT는 미확정 | P2 |

## 8. 고객사 담당자 요구사항별 점검표

기준 커밋의 live assessment는 participant/counselor만 허용한다. 별도 고객사 운영 화면과 집계 API는 조사 범위에서 찾지 못했다. 모든 행은 정적 확인, 운영 미검증이다.

| ID | 기능명 | 구현 상태 | 코드 근거 | 테스트 근거·이번 실행 | 운영 검증 | 부족한 부분 | 우선순위 |
|---|---|---|---|---|---|---|---|
| REQ-M-001 | 별도 발급 계정 로그인 | 미구현 | `live/app.js` hydrate, `assessment` 역할 분기; 레거시 고객사 로그인 | 고객사 live 로그인 테스트 확인 못함; 미실행 | 미검증 | 고객사 계정 발급·운영 로그인 경로 필요 | P3 |
| REQ-M-002 | 참여 인원과 진단 완료 현황 | 미구현 | 레거시 `vManager` | 고객사 live 집계 테스트 확인 못함; 미실행 | 미검증 | 허용 기업 범위의 집계 API·UI 필요 | P3 |
| REQ-M-003 | 사전·사후 완료율과 단계별 인원 | 미구현 | 레거시 `vManager` | 고객사 live 집계 테스트 확인 못함; 미실행 | 미검증 | 서버 모집단·완료율 집계·UI 필요 | P3 |
| REQ-M-004 | 상담사별 완료율 등 집계 지표 | 미구현 | 레거시 `vManager` | 고객사 live 집계 테스트 확인 못함; 미실행 | 미검증 | 서버 범위·재식별 보호·UI 필요 | P3 |
| REQ-M-005 | 원문 응답·개인 결과보고서 접근 차단 | 부분 구현 | `assessment` 역할 허용 목록과 reportId 거부 | `live/assessment-notice-server.spec.mjs` 미실행 | 미검증 | 고객사 역할 및 전체 API·직접 DB/RPC 차단 검증 부재 | P0 |
| REQ-M-006 | 통합 보고서 생성·관리 차단 | 부분 구현 | `assessment` 역할 허용 목록; live 통합 보고서 API 없음 | 전용 통합 API 권한 테스트 확인 못함; 미실행 | 미검증 | 향후 통합 API에서 고객사 생성·조회·관리 거부 구현·검증 필요 | P0 |

## 9. 공통 비기능 요구사항별 점검표

모든 행은 정적 확인, 운영 미검증이다.

| ID | 기능명 | 구현 상태 | 코드 근거 | 테스트 근거·이번 실행 | 운영 검증 | 부족한 부분 | 우선순위 |
|---|---|---|---|---|---|---|---|
| REQ-N-001 | 기존 계산 결과와 개인 보고서 형식 회귀 검증 | 부분 구현 | `src/js/05-engine.js`, `assessment` 엔진·report | `golden/golden.spec.mjs`, `contract/contract.spec.mjs`, `snapshot/snapshot.spec.mjs` 미실행 | 미검증 | 기준선과 Excel 매크로의 실제 동일성, 운영 서버·인쇄 회귀는 별도 확인 필요 | P0 |
| REQ-N-002 | 인증·인가, 데이터 최소화 및 서버 집계 | 부분 구현 | `assessment` getUser/participantQuery; `register`; `supabase/proposals/*.sql` | `live/registration-server.spec.mjs`, `live/post-draft-server.spec.mjs` 미실행 | 미검증 | 모든 역할·직접 DB/RPC·최소 응답·서버 통합 집계와 배포 자산 경계 미완성 | P0 |
| REQ-N-003 | 조회·수정·재계산·내보내기·권한 변경 감사 기록 | 부분 구현 | `assessment` assessment_history 및 `supabase/proposals/post-draft.sql` | `live/post-draft-server.spec.mjs` 미실행 | 미검증 | 조회·보고서 생성/인쇄·내보내기·권한 변경 전반의 감사와 보관 정책 필요 | P0 |
| REQ-N-004 | 실데이터 베타 전 보안·회귀 검증 및 사용자 승인 | 부분 구현 | `docs/security-architecture.md` 11절, 기존 테스트 | `golden/golden.spec.mjs`, `snapshot/snapshot.spec.mjs` 미실행 | 미검증 | 실제 보안·회귀 증거와 사용자 배포 승인 확인되지 않음 | P0 |

## 10. 코드·문서 간 불일치

- 상담사 목록은 `assessment`의 `readAll`이 서버 응답을 나눠 읽지만 `counselorView`는 검색·필터 후 전체 `rows.map`을 렌더링한다. 페이지 상태·이동 UI가 없어 사용자 목록 페이지네이션은 완료되지 않았다. 테스트의 “pagination”은 서버 읽기 분할을 검증한다.
- 통합 보고서는 레거시의 관리자·상담사 데모에 있으나 최신 정책은 관리자 전용이다. 운영 관리자 통합 API와 9개 분석 경로는 확인되지 않았다. 레거시 메뉴가 현행 권한을 부여하지 않는다.
- `supabase/proposals/INTEGRATION.md`는 과거 시점에 assessment 원본이 없었다고 기록하지만 현재 기준 커밋에는 `supabase/functions/secondcareer-assessment/index.ts`가 있다. 과거 기록을 현재 상태로 취급하지 않는다. 실제 배포본과의 일치도 추정하지 않는다.
- `live/survey-view.js`의 사후 화면에는 임시저장만 가능하다는 개발 안내가 남아 있는 반면 `live/app.js`와 `assessment`에는 최종 제출 경로가 있다. 코드 경로의 존재는 활성화나 실제 DB 적용의 증거가 아니다.
- REQ-A-004 진단 현황의 상태 정의는 기존 DB 계약을 따른다: 해당 단계 `assessments` 행 없음 = 미시작, `status='draft'` = 작성 중, `status='submitted'` = 제출 완료. 그 밖의 상태값이나 같은 참여자·단계의 중복 행이 있으면 집계하지 않고 오류를 반환한다. 사전 완료율의 분모는 관리자 조직의 등록 참여자 전체로 화면에 명시했다. 요구사항 10절 7번의 완료율 분모 상세 정의가 확정되면 이 기준을 다시 확인해야 한다. 기업 구분은 등록 시 입력한 `participants.company_name`(빈 값은 "소속기업 미지정")이며 참여자 응답의 소속회사(`reg.careers[0].co`)는 읽지 않는다.
- 단위 구분(STEP 07): `organizations`는 관리자·상담사·참여자가 속한 운영 조직(테넌트)이고 서버 권한 범위의 기준이다. 소속기업은 참여자 등록 시 입력한 `participants.company_name` 문자열이며 별도 테이블·ID가 없다. 운영 관리 화면은 두 단위를 따로 표시한다. 같은 기업이 표기만 다르게 입력되면(띄어쓰기 등) 다른 기업으로 집계된다. 앞뒤 공백만 제거한다.
- 담당 상담사가 이 조직의 상담사 목록에 없는 참여자(다른 조직 계정이나 역할이 바뀐 계정을 가리키는 경우)는 "담당 확인 필요"로 따로 세고, 가리키는 계정의 정보는 반환하지 않는다. 기존 상담사 화면은 `counselor_user_id`로 담당을 판단하므로 이 상태의 참여자를 다룰 정책(재배정 등)은 미확정이다.
- 관리자 보고서(STEP 08)는 상담사 보고서와 인쇄되는 쪽(`section.sheet`)이 같다. 인쇄되지 않는 도구 영역만 다르다: 돌아가기 버튼이 관리자 목록으로 가고, 상담사 변경 이력 패널(과거 응답 문구 포함)은 관리자에게 넣지 않으며, 서버 공용 렌더러가 넣는 "응답 수정 (상담사)" 버튼은 관리자 화면에서 제거한다(수정은 상담사 전용). 운영 관리 목록은 보고서 요청용으로 참여자 ID를 반환하며 이 ID는 조회 키일 뿐 권한 근거가 아니다.
- README의 과거 비공개 저장소 설명은 `decisions.md`의 공개 유지 결정과 다르다. 본 점검에서 공개 범위를 변경하거나 원격 공개 설정을 확인하지 않았다.

## 11. 미검증 항목 및 운영 위험

- **사후 활성화 네 층**: 프런트 `post-test-gate.js`는 `true`; 서버는 `SECONDCAREER_POST_DRAFT_ENABLED === 'true'`를 검사하나 실제 값 미확인; 승인 상태는 `post_approvals`와 상담사 승인 확인에 의존; `post-approval.sql`, `post-draft.sql`, `post-submit.sql`은 미적용·미실행으로 표시된 제안이며 실제 DB·RPC 적용 여부는 미확인이다. 기존 승인 기록의 적용 여부도 미확인이다.
- `SECONDCAREER_REGISTRATION_ENABLED` 및 등록 SQL 제안의 실제 적용·권한, 로그인 함수 원본, 서버 배포 버전, DB 스키마·RLS·직접 RPC 우회, 조직·담당 변경 반영을 확인하지 않았다.
- 브라우저에 이미 내려간 보고서의 실제 인쇄 여부를 서버가 관찰할 수 있는지와 감사 기록의 구현 방식은 미검증이다. 자유 의견·소수 집단의 재식별 방지 기준과 고객사 제공 범위는 미확정이다.
- 코드와 배포 환경의 동일성, 모든 역할의 실제 Auth·DB 요청, 인쇄 쪽수, 동시 저장·재시도, 민감 데이터 노출, 베타 승인 및 Excel 매크로 대조는 미검증이다.
- **REQ-A-004 운영 미검증**: `secondcareer-admin-progress` 함수는 배포하지 않았다. 배포 전에는 관리자 화면의 진단 현황 영역에 조회 실패 메시지가 표시되고(문구는 게이트웨이 응답 형태에 따라 다를 수 있음, 실제 확인 안 함) 기존 등록·URL 설정은 계속 동작한다(모의 테스트로 확인). 서비스 역할 키로 RLS를 우회해 읽으므로 범위 제한은 함수 코드의 조직 필터에 의존한다. 실제 DB에서 `participants.company_name` 열 존재(등록 SQL 제안의 추가 열), `assessments`의 (participant_id, phase) 유일성, 상태값 집합, 관리자 계정의 `organization_id`를 확인하지 않았다. 사후 표시는 `SECONDCAREER_POST_DRAFT_ENABLED` 값에 따르며 실제 값은 미확인이다. 새 테이블·RPC·RLS 변경은 없으므로 이 기능으로 새 직접 DB 경로가 생기지 않지만, 기존 테이블의 authenticated 직접 조회 차단(RLS)은 이번에도 확인하지 않았다. 집계 조회의 감사 기록(REQ-N-003)은 감사 저장소가 없어 구현하지 않았다.
- **REQ-A-005 운영 미검증·배포 전 조건(STEP 08)**: `secondcareer-admin-report`는 배포하지 않았다. 보고서 렌더링을 `secondcareer-assessment/shared/report.ts`로 옮겼으므로 운영의 `secondcareer-assessment`를 다시 배포하면 이 공용 모듈을 쓰게 된다(동작 변경 없음, 기존 상담사 보고서·이력 테스트로 확인). 관리자 보고서 함수는 서버 계산 엔진을 묶어 배포하므로 엔진 비공개 원칙상 서버 함수에만 둔다(브라우저 번들에 포함되지 않음을 빌드 산출물에서 확인). **개인 보고서 조회 감사 기록이 없다(REQ-N-003)**: 감사 저장소 결정 전에는 실데이터 운영에 사용하지 않는다. 실제 브라우저·프린터 인쇄는 확인하지 않았고, Chromium headless PDF 쪽수만 확인했다.
- **REQ-A-001·002 조회 운영 미검증(STEP 07)**: `secondcareer-admin-directory`는 배포하지 않았다. `secondcareer-admin-progress`도 공용 모듈 `_shared/admin-access.ts`로 옮겨졌으므로 두 함수를 함께 배포해야 한다(동작 변경 없음, 모의 테스트로 확인). 서비스 역할 키로 읽으므로 범위 제한은 함수 코드의 조직 필터에 의존한다. 실제 DB에서 `organizations.name`, `user_profiles.display_name`, `server_login_lookup.login_id` 등 조회 열과 상담사·참여자 관계를 확인하지 않았다(2026-11-02 기준선에는 존재). 목록 조회(개인 목록 포함)의 감사 기록도 없다. Deno 타입 검사·실행은 미수행이다.

## 12. 구현 우선순위 및 다음 작업

1. **P0**: 인증·담당/조직 범위·RLS와 직접 DB/RPC 우회, 서버 계산·데이터 최소화, 감사 및 실환경 검증 계획을 확정한다. 실데이터 베타 전 보안·회귀와 사용자 승인이 필요하다.
2. **P1**: 상담사 목록의 실제 페이지 상태·이동과 검색/필터 연계, 관리자 계정·조직·진단 현황·개인 보고서의 서버 권한 기반을 구현한다.
3. **P2**: 관리자 전용 통합 보고서의 권한·모집단·서버 집계 및 9개 분석과 인쇄를 구현한다. 자유 의견 보호와 추가 출력은 결정 후 처리한다.
4. **P3**: 고객사 계정과 허용 기업 집계 화면·API를 구현한다. 개인 데이터 차단은 P0으로 먼저 다룬다.

이는 우선순위 제안이며 후속 코드 변경이나 일정의 승인이 아니다. 개인별 비교 화면은 정책 결정 전 임의 삭제·권한 전환하지 않는다.

진행 기록(2026-11-05, STEP 07): REQ-A-001·002의 조회 기능을 추가했다. 쓰기 기능(상담사 계정 생성·비활성화, 담당 변경, 참여자 초기화·삭제, 기업 관리)은 서버 계약과 정책 확정 후 별도 작업이다. 필요한 결정: 상담사 계정 발급 방식(관리자 화면 발급과 초대·초기 비밀번호), 정지·퇴사 시 담당 내담자 재배정 방식, 상담코드와 로그인 아이디 분리 여부(`decisions.md` 미결정), 기업을 별도 테이블로 관리할지 여부, 계정 변경 감사 기록(REQ-N-003).

진행 기록(2026-11-05): P1 중 REQ-A-004를 먼저 구현했다. REQ-C-004(상담사 목록 페이지네이션)는 사용자 결정에 따라 사용성 개선으로 보류하고 이번 관리자 개발에서 제외했다. 사유는 관리자 핵심 기능을 먼저 개발하기로 한 작업 순서 결정이다. REQ-C-004의 요구사항(확정)과 구현 판정(부분 구현)은 그대로 유지한다.

## 13. 테스트 결과 및 근거

이번 STEP 04에서 테스트·실제 브라우저 조작·실제 서버/DB 검증은 **실행하지 않았다**. 위 점검표의 테스트 파일은 정적으로 읽은 관련 근거이며 실행 결과가 아니다. `tests/live`의 일부는 모의 API·합성 RPC를 사용하므로 통과하더라도 실제 DB 적용을 뜻하지 않는다. `supabase/proposals/INTEGRATION.md`의 과거 로컬 확인·미실행 기록은 작성 당시의 기록이다.

**REQ-A-004 개발 검증(2026-11-05, HEAD `992d0b8` + 작업본)**: `npm run build` 통과. `npx playwright test` 전체 281건 중 276건 통과·5건 건너뜀(기존 조건부), 실패 0건, 약 2분 40초. 신규 14건(`tests/live/admin-progress-server.spec.mjs` 8건: 허용 관리자 조회, 상담사·참여자·기타 역할·무인증 거부, 타 조직 미집계·요청 파라미터 거부, 0명, 사전 상태별 집계, 사후 플래그별 처리, 기업별 합계 = 전체 합계, 응답·조회 열 최소화, 100건 초과 분할 조회, 비정상 상태·중복 행·조회 실패 시 오류; `tests/live/admin-progress-browser.spec.mjs` 6건: 화면 수치·기업별 표·합계, 사후 비활성 안내와 0명 '-' 표시, 참여자 등록·URL 저장 유지와 새로 조회의 제자리 갱신, 거부·실패 메시지, 상담사 화면 미호출, 비율 계산·응답 검증 함수)을 포함한다. 기존 참여자·상담사·등록·골든·계약·스냅샷·e2e 회귀가 같은 실행에 포함됐다. 관리자 화면이 진입 시 새 API를 호출하므로 기존 모의 라우터 두 곳(`registration-browser.spec.mjs`, `mobile-survey.spec.mjs`)에 해당 경로 응답만 추가했고 검증 내용은 바꾸지 않았다. `server-harness.cjs`에는 `in`·`gt`·`order`·`limit`, 열 선택, 조회 기록·실패 주입을 추가했다. 이 테스트는 모두 **모의 테스트**이며 실제 Supabase(Auth·DB·RLS·배포 함수) 검증은 하지 않았다. Deno 실행 파일이 없어 Edge Function의 Deno 타입 검사·실행도 하지 않았다. legacy SHA256은 기준과 같고 기준선은 갱신하지 않았다. 캡처 비교(`test:visual`)는 실행하지 않았다.

**STEP 08 관리자 개인 결과보고서 검증(2026-11-05, HEAD `f770dd6` + 작업본)**: `npm run build` 통과. `npx playwright test` 전체 300건 중 295건 통과·5건 건너뜀(기존 조건부), 실패 0건, 약 2분 55초. 신규 9건(`tests/live/admin-report.spec.mjs`)은 위 REQ-A-005 행의 시나리오를 다룬다. 상담사와의 동일성은 같은 모의 테이블에서 실제 `secondcareer-assessment` 처리 코드와 관리자 함수를 함께 호출해 보고서 HTML의 인쇄 쪽 부분을 문자열로 비교했고, 화면에서는 두 역할로 각각 연 보고서의 `section.sheet` HTML과 Chromium PDF 쪽수(5쪽·3쪽)를 비교했다. 기존 인쇄 쪽수 기준선(스냅샷 34건)·골든·계약·상담사 보고서·이력·사후 테스트가 같은 실행에서 통과했다. 보고서 코드를 공용 모듈로 옮긴 직후 기존 진단 함수 관련 테스트 85건을 먼저 실행해 통과를 확인했다. `admin-directory.spec.mjs`는 목록에 참여자 ID가 추가된 계약에 맞춰 기대값만 바꿨고, `server-harness.cjs`는 진단·관리자 보고서 함수를 불러오도록 확장했다. 모두 **모의 테스트**이며 실제 Supabase 검증·배포는 하지 않았다. legacy SHA256은 기준과 같고 기준선은 갱신하지 않았다.

**STEP 07 관리자 운영 관리 조회 검증(2026-11-05, HEAD `1aa7012` + 작업본)**: `npm run build` 통과. `npx playwright test` 전체 291건 중 286건 통과·5건 건너뜀(기존 조건부), 실패 0건, 약 2분 45초. 신규 10건(`tests/live/admin-directory.spec.mjs`): 관리자 정상 조회와 상담사별·기업별·미배정·담당 확인 필요 집계, 다른 조직·개인정보·응답 원문 미포함과 조회 열 제한, 상담사·참여자·기타 역할·무인증·요청 파라미터 거부, 빈 조직, 진단 현황 API와 기업별·사전 상태 인원 일치, 100건 초과 분할 조회와 조회 실패·조직 행 없음·비정상 상태 오류, 응답 일관성 검사·필터 함수, 화면 표시·필터·등록 후 다시 불러오기·URL 저장 유지, 빈 조직·거부 화면, 상담사 화면 미호출. 기존 참여자 등록·진단 현황·상담사 보고서·참여자 진단·골든·계약·스냅샷·e2e 회귀가 같은 실행에 포함됐다. 관리자 화면이 진입 시 새 API를 호출하므로 기존 모의 라우터 세 곳(`registration-browser.spec.mjs`, `mobile-survey.spec.mjs`, `admin-progress-browser.spec.mjs`)에 해당 경로 응답만 추가했고 검증 내용은 바꾸지 않았다. 모두 **모의 테스트**이며 실제 Supabase 검증·배포는 하지 않았다. legacy SHA256은 기준과 같고 기준선은 갱신하지 않았다.

이 대화의 STEP 01에서 이전 HEAD 기준 Playwright 결과는 262건 통과·5건 건너뜀이었으나 래퍼의 120초 제한으로 명령 종료 코드는 실패였다. 이는 과거 결과이며 이번 점검의 실행 결과나 운영 검증이 아니다. 골든 기준선은 레거시 동작의 회귀 근거로, Excel 매크로와 실서버의 실제 동일성을 자동으로 증명하지 않는다.

## 14. 종합 판단

참여자·상담사의 주요 코드 경로는 존재하지만 운영 검증은 별개다. 목록 페이지네이션, 관리자 운영·통합 보고서와 고객사 운영 집계가 핵심 공백이다. 보안·실제 배포·DB 조건이 미검증이므로 이 문서는 실데이터 사용 또는 배포 준비 완료를 의미하지 않는다.
