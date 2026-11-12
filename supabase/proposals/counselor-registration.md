# 상담사 발급 적용 전 검토 조건

2026-11-11 로컬 구현. 실제 DB·Auth·RPC·RLS 미확인. SQL은 처음부터 예외를 발생시키는 검토 전용 제안이며 적용 승인이나 실행 절차를 대신하지 않는다.

- 기존 user_profiles / server_login_lookup의 열 타입·필수 열·유일 키·FK·역할 CHECK·트리거·권한을 catalog로 확인한다. login_id / internal_email / user_id의 단독 유일성을 확인한다. 기존 데이터와 다른 발급 경로의 ID 충돌도 확인한다. 기존 표를 자동 수정하지 않는다.
- Auth createUser 훅이 프로필을 자동 생성하거나 역할을 덮어쓰는지 확인한다. 등록 전후 Auth 이메일·요청 ID·프로필·매핑을 확인한다. 이메일 템플릿 전송을 발급 수단으로 사용하지 않는다.
- 신규 예약 표와 완료 RPC 이름 충돌, public API 노출, service_role 최소 권한, 함수 invoker, 클라이언트의 직접 표/RPC 접근 차단을 확인한다. 기존 참여자/담당자 예약 표는 필수 필드가 달라 재사용하지 않는다.
- 기존 participant-registration.sql의 password_ready() 제한 정책이 상담사에도 적용되는지 확인한다. participants / assessments / assessment_history, 보고서·쓰기 RPC와 모든 직접 접근 경로가 **최신 Auth 상태**로 최초 변경 전 접근을 거부해야 한다. 클라이언트·JWT 플래그만으로 승인하지 않는다. 기존 운영 상담사 권한은 유지한다.
- client_companies / client_company_counselors의 실제 RLS·복합 FK·역할 검증·유일 키를 기존 client-company-counselors.sql 제안과 대조한다. 동일 상담사 복수 고객사 배정 및 조직 변경 경합 차단을 검증한다. 배정 해제 시 관계 행만 삭제되는지 확인한다.
- 비운영 환경에서 신규 상담사 발급 → 기존 로그인 함수 → 변경 전 데이터/API 거부 → 새 비밀번호 변경 → 상담사 화면 → 고객사 배정/해제를 실제로 검증한다. 기존 네 역할의 로그인도 검증한다.
- 위 검토와 별도 DB/Auth·배포 승인을 완료한 후에만 SECONDCAREER_COUNSELOR_REGISTRATION_ENABLED=true를 설정할 수 있다. 로컬 기본값은 비활성이다.

## 결과 불명확 시

요청 ID, 로그인 ID와 관리자 조직으로 예약 기록을 조회하고 Auth의 deterministic 내부 이메일 및 registration_request_id, 프로필·로그인 매핑을 대조한다. 서버 내부 완료 RPC의 1회 재확인은 같은 Auth 사용자만 허용하며 Auth 생성 재시도는 하지 않는다. 네트워크 오류·중간 실패·클라이언트 응답 유실은 비밀번호를 재조회하거나 자동 재발급하지 않는다. pending 예약을 자동 해제하거나 Auth를 자동 삭제하지 않는다. 완성된 계정의 임시 비밀번호를 잃었을 때 안전한 관리자 초기화 절차는 이번 범위에 없으므로 별도 승인 후 수동 복구한다. 서버 비밀·임시 비밀번호·새 비밀번호를 로그·SQL·작업 기록에 남기지 않는다.

## 적용 전 체크리스트 — 2026-11-11 후속 검토

근거는 저장소의 제안·소스·로컬 모의 테스트만을 뜻한다. 실제 Supabase DB·Auth·RLS 접속이나 SQL 실행은 하지 않았다. 아래 상태는 확인한 가장 구체적인 사실을 나타내며 코드 확인과 실제 적용 검증을 동일시하지 않는다. SQL 맨 앞의 `SCHEMA_REVIEW_REQUIRED` 중단 장치를 유지한다.

| 구분 | 확인 항목과 저장소 근거 | 상태 / 남은 확인 |
|---|---|---|
| A | `user_profiles(user_id,organization_id,role,display_name)`와 `counselor` 사용: 제안 SQL의 완료 RPC, `_shared/registration-http.ts` | 실제 DB 확인 필요 — 타입, NOT NULL/default, FK, role CHECK, 기존 트리거·열·제약과 호환성 |
| A | `server_login_lookup(user_id,login_id,internal_email)`: 기존 로그인 함수와 완료 RPC | 실제 DB 확인 필요 — 각 단독 유일 인덱스와 정규화·기존 중복 데이터, 타 발급 경로와 충돌. 읽기 전용 진단 결과의 민감정보 비공개 관리 |
| A | 요청 표의 `id` PK·`login_id` 유일 및 RPC `FOR UPDATE`: `counselor-registration.sql` | 기존 문서 근거 확인 — 미적용 제안이며 시험 DB에서 동시 요청·별도 발급 경로와 경합을 확인 |
| A | 기존 `participant_registration_requests`, `company_manager_registration_requests`, 완료/복구 RPC 및 신규 표·RPC | 실제 DB 확인 필요 — 같은 이름·시그니처·소유자·기존 grants·트리거 충돌 여부. 신규 표의 필요 필드가 기존 발급 표와 다름 |
| A | 예약→Auth 생성→원자적 프로필·매핑 완료: `secondcareer-admin-counselors/index.ts`, 제안 SQL | 위험 또는 충돌 발견 — Auth와 DB는 단일 트랜잭션이 아니므로 pending 예약·고아 Auth·응답 유실 가능. 자동 삭제·예약 해제 금지. SQL 트랜잭션 실제 검증 필요 |
| B | 로그인 ID 정규화 및 매핑: `secondcareer-login/index.ts`; 테스트 `counselor-registration-server.spec.mjs` | 코드 확인 완료 — Auth/DB 프로토콜 모의만 확인. 실제 로그인 함수 배포 버전·유일성·레이트 제한 검증 필요 |
| B | Auth `createUser` 후 완료 RPC가 요청 ID·내부 이메일·metadata·관리자 조직을 재확인 | 기존 문서 근거 확인 — Auth 훅/프로필 자동 생성·이메일 변경·사용자 관리 플러그인과 실제 충돌 여부 확인 |
| B | 암호는 1회 응답, 최초 변경은 server-controlled `app_metadata`와 `secondcareer-account` | 코드 확인 완료 — 실제 Auth 토큰 갱신·비밀번호 정책·오류 시 게이트 유지 확인 필요. 비밀번호/비밀키 평문 저장·로그 금지 |
| B | `secondcareer-assessment`와 `secondcareer-register-participant`는 최신 사용자 상태를 검사 | 코드 확인 완료 — 모의 테스트에서 최초 변경 전 거부. 다른 함수·직접 DB/RPC 우회까지 실제 확인 필요 |
| B | 임시 비밀번호 유실·불명확 결과 | 미구현 — 비밀번호 재조회·초기화 UI와 자동 복구 없음. 요청 ID/예약·Auth 사용자·매핑·프로필을 검증하고 별도 승인된 수동 복구 필요 |
| C | `authenticateAdmin()`이 검증된 사용자·프로필의 admin 역할과 조직을 확인, 요청 scope를 받지 않음 | 코드 확인 완료 — service_role RLS 우회이므로 모든 읽기·쓰기와 완료 RPC의 자체 범위 검사를 실제 환경에서도 확인 |
| C | 신규 예약 표는 RLS 활성화, public/anon/authenticated revoke, service_role grant 제안 | 기존 문서 근거 확인 — 실제 노출 스키마, 기본 권한·상속 role·기존 정책·테이블 접근을 확인해야 함 |
| C | 완료 RPC는 security invoker·빈 search_path, 클라이언트 revoke·service_role execute 제안 | 실제 DB 확인 필요 — 소유자·인자·오버로드·권한 상속·실제 execute 권한 및 서비스 역할의 최소 테이블 권한 확인 |
| C | `participant-registration.sql`의 restrictive `password_ready()` 정책은 participants·assessments·assessment_history에 적용하는 제안 | 실제 DB 확인 필요 — 실제 정책이 상담사에게도 적용되는지, 허용 정책·views·RPC·모든 직접 경로의 최초 변경 전 접근 차단을 각각 검증 |
| C | 네 역할의 기존 권한과 조직 제한: `docs/security-architecture.md`, 기존 account/manager/assessment 함수 | 실제 DB 확인 필요 — 실제 RLS·RPC·세션 재검사 및 기존 로그인·업무 회귀. 관리자 역할만으로 타 조직 접근 불가 |
| C | `client_company_counselors`는 기존 고객사 배정 관계 사용 | 실제 DB 확인 필요 — 복합 FK·고유 제약·RLS 및 조직 변경 경합. 해제 시 참여자·진단·보고서 영향이 없는지 확인 |
| C | 상담사 목록은 서버가 읽은 같은 조직 ID만 묶어 매핑을 조회하고 ID·로그인만 반환 | 코드 확인 완료 — 중복 매핑·잘못된 ID는 실패, 누락은 null. 범위 기반 페이지 조회 중 동시 삽입·삭제 시 일관성은 실제 DB에서 검토 필요 |

### D. 승인 후 적용·검증 순서

1. **실제 DB 확인 필요:** 프로젝트와 환경을 확인한 뒤 관련 카탈로그의 테이블·열·타입·NOT NULL/default·CHECK·유일 인덱스·FK·트리거·RLS 정책·뷰·함수 시그니처/본문·소유자·`search_path`·grants·role 상속을 검토한다. 대상은 `auth.users`, `organizations`, `user_profiles`, `server_login_lookup`, `participants`, `assessments`, `assessment_history`, 기존 두 발급 요청 표, `client_companies`, `client_company_counselors`, 관련 RPC와 `secondcareer_registration_private.password_ready()`다. `supabase/checks/readonly-catalog-check.sql`은 관련 기존 참고 자료이며 상담사 전용 완전 점검표는 아니다. Auth 훅 및 배포된 함수 버전과 비밀 설정도 확인한다. 민감한 정책·개인정보는 공개 저장소에 기록하지 않는다.
2. **실제 DB 확인 필요:** 별도 승인된 시험 DB에서 스키마 사전 조건, 충돌·권한·RLS 검토를 통과한 이후에만 검토 제안을 조정한다. 두 관리자·두 조직·기존 네 역할·중복 ID·동시 발급·타 조직·API/직접 DB·RPC 접근·게이트 우회·중간 실패·응답 유실·복수 고객사 배정 및 기존 데이터 보존을 검증한다. 실제 환경의 높은 행 수와 낮은 API 행 제한을 확인한다.
3. **실제 DB 확인 필요:** 승인된 비운영 Auth에서 합성 상담사 발급 → 기존 로그인 → 최초 변경 전 API/직접 DB·RPC 거부 → 새 비밀번호 변경 → 기존 로그인 재확인 및 상담사 화면 → 고객사 배정 조회·배정·해제를 확인한다. 기존 관리자·참여자·상담사·고객사 담당자 로그인과 권한도 확인한다. 실서비스 계정 생성은 별도 승인 대상이다.
4. **위험 또는 충돌 발견:** 불명확·부분 실패 시 발급 플래그를 끄고 재발급을 중단한다. 요청 ID, Auth 상태, 프로필·매핑·완료 RPC 결과를 대조해 확정할 때까지 자동 Auth 삭제·예약 해제·재시도를 하지 않는다. 유실된 임시 비밀번호는 재조회할 수 없으므로 안전한 초기화·복구 방법을 별도 검토·승인한다. DB 트랜잭션 롤백이 이미 생성된 Auth 계정까지 되돌린다고 가정하지 않는다.
5. **실제 DB 확인 필요:** 위 검증 결과와 구체적인 SQL·접근 권한·복구 계획을 검토한 뒤 DB/RLS/RPC 적용, 시험 또는 운영 Auth 계정 생성, Edge Function 배포, 기능 플래그 활성화, Vercel 배포는 각각 해당 범위의 사용자 승인을 받는다. 승인 이전에 SQL의 중단 장치를 제거하지 않는다.
