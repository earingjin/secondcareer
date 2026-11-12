# 상담사 발급 적용 전 검토 조건

2026-11-11 최초 로컬 구현. 2026-11-12 후속 수정은 최신 `origin/main`의 `52ab1092904dba41372222cf91ab0530e98efa48` 기준이다. 사용자가 확인한 DB 계약(상담사 함수 미배포, 예약 표·완료 RPC 없음, 기존 프로필·로그인 ID 유일 제약, service_role의 Auth 직접 SELECT 불가, 기존 auth_matches 및 최초 변경 제한 정책 존재)을 전제로 한다. 이번 작업에서는 DB에 연결하지 않았다. 아래 과거 체크리스트의 미확인은 당시 이력이며 현재 운영 검증 완료를 뜻하지 않는다. SQL은 처음부터 예외를 발생시키는 검토 전용 제안이며 적용 승인이나 실행 절차를 대신하지 않는다.

## 이번 Auth 계약 수정과 책임 경계

- 완료 RPC의 `auth.users` 직접 SELECT와 `%rowtype`을 제거한다. 기존 `secondcareer_company_private.auth_matches(uuid,text,uuid,boolean)`를 변경 없이 사용한다. `SECURITY INVOKER`, 세 인자와 `jsonb` 반환, RLS·service_role 전용 실행·트랜잭션·실행 중단 장치를 유지하며 Auth SELECT나 새 SECURITY DEFINER 권한은 추가하지 않는다.
- SQL은 요청 행 `FOR UPDATE` → 같은 조직 관리자 프로필 `FOR SHARE` → 결정적 내부 이메일 대조 및 `auth_matches` → 프로필·매핑·완료 상태 저장 순서다. 신규 `pending`은 `require_pending=true`, 이미 `complete`인 동일 요청 재확인은 `false`를 사용한다. 후자는 최초 비밀번호 변경 후에도 저장된 상담사 ID·조직·역할·이름·로그인 매핑이 모두 맞는 경우에만 결과를 반환하며 새 쓰기를 하지 않는다. Auth 사용자·이메일·요청 ID 일치는 완료 재확인에서도 생략하지 않는다.
- 제공된 helper 계약은 임시 비밀번호 digest 형식과 관리자 비밀번호 준비 상태를 보장하지 않는다. 이를 검증한다고 가정하지 않는다. 관리자 상태는 기존 `authenticateAdmin()`이 검증된 최신 Auth 사용자에 `participantAccessError()`를 적용한다. 역할·조직은 완료 RPC에서도 잠금 후 재검증한다. 신규 digest는 Edge가 생성한 SHA-256 값과 Auth `createUser` 응답의 app_metadata를 정확히 대조한다. ID·이메일·요청 ID·최초 변경 플래그가 다르면 연결하지 않고 결과 불명확으로 중단한다. 응답의 오류·metadata 누락을 성공으로 취급하지 않는다.
- 기존 제안의 Auth 행 잠금·관리자 metadata·digest DB 내부 검사를 같은 트랜잭션에서 재현한 것은 아니다. Auth Admin API와 DB 완료 사이의 metadata 변경 경합 및 helper의 잠금·STABLE 여부는 미검증이다. 완료 RPC는 신뢰된 service_role 서버 경로만 호출해야 하며 직접 운영자 호출 시 동일한 관리자 readiness·digest 확인이 필요하다. RPC 자체가 이 두 검사를 모두 수행한다고 보고하거나 기능을 활성화하지 않는다.
- 최초 변경 전 접근 차단은 기존 정책과 account/assessment/register 서버 검사에 의존한다. 정책이 존재한다는 사용자 확인은 수용하되 상담사 직접 DB·RPC·뷰의 실효성, helper의 임시 변경 상태 판정과 Auth 훅 영향은 시험 환경 검증 항목으로 남긴다. 기존 공유 인증·로그인·정책·고객사 배정 코드는 변경하지 않는다.

## 승인 후 적용 순서

1. 기능 플래그를 비활성으로 유지한다. 확인된 스키마를 다시 전수 조사하지 않고, 이번 SQL이 사용하는 열·유일 제약·함수 인자/반환·현재 helper 본문 및 ACL·스키마 USAGE와 관련 잠금 권한만 배포 담당자가 대조한다. `user_profiles FOR SHARE`에 필요한 기존 권한도 확인한다. 기존 Auth SELECT 금지 및 일반 사용자 helper 실행 금지를 유지한다.
2. 별도 승인된 시험 환경에서 검토 기록을 남긴 후 실행본만 준비한다. 저장소 제안의 `SCHEMA_REVIEW_REQUIRED`는 유지한다. 실행본은 `BEGIN/COMMIT` 안에서 예약 표·RLS·최소 테이블 권한 → 완료 RPC → 공개 실행 REVOKE·service_role EXECUTE 순서로 적용한다. 이름 충돌이나 실패 시 전체 트랜잭션을 롤백하고 기존 표·계정을 삭제하거나 재사용하지 않는다.
3. 비활성 상태로 Edge 코드를 별도 배포한 후 승인된 시험 설정·합성 계정에서 목록, 정상 발급, 중복/동시 요청, 잘못된 Auth 응답·실패·응답 유실을 확인한다. 새 비밀번호 변경 전 API 및 직접 DB/RPC 접근 차단, 임시 비밀번호 재사용 거부, 변경 후 로그인·배정 및 기존 데이터 보존을 확인한다.
4. 시험 결과와 수동 복구 담당·절차 승인 후 운영 DB/RLS/RPC 및 Edge 배포를 별도로 수행한다. 운영 기능 활성화는 이번 작업 범위에 없으며 별도 승인 전 비활성을 유지한다. 실패 시 새 발급을 중단하고 불완전 요청을 보존한다. 테이블/RPC의 무조건 DROP이나 Auth 자동 삭제는 복구 수단으로 사용하지 않는다.

## 수동 복구 절차

운영자만 접근 가능한 경로에서 요청 ID·로그인 ID·조직·행위자, 결정적 내부 이메일의 Auth ID·request marker·최초 변경 플래그·digest 유무, 프로필과 매핑의 ID/조직/역할/이메일을 대조한다. 비밀번호·digest 값·전체 metadata·토큰·개인정보를 공개 로그나 이슈에 복사하지 않는다.

| 확인된 상태 | 안전한 수동 조치 |
|---|---|
| pending, Auth 존재 여부 불명확 또는 생성 응답 유실 | 플래그 비활성·재발급 중단. 승인된 Auth 관리 조회로 확정할 때까지 요청/계정 보존. Auth가 없다고 네트워크 오류만으로 판단하지 않음 |
| pending, 정확히 일치하는 Auth 1개, 프로필·매핑 모두 없음 | 관리자 readiness·역할/조직과 Auth 이메일·요청 ID·최초 변경 플래그·digest 유효성을 확인한 후 별도 승인된 운영자가 같은 세 인자로 완료 RPC를 호출할 수 있음. 새 Auth 생성 금지. 완료해도 유실된 비밀번호는 복원되지 않음 |
| complete, 프로필·매핑·Auth 모두 일치, 응답/임시 비밀번호 유실 | 중복 생성·요청 해제 금지. 기존 계정 보존. 비밀번호 조회 불가. 승인된 보안 채널의 사용자 신원 확인 및 별도 초기화 절차가 마련되기 전 인계 보류 |
| 초기화가 필요한 완료 계정 | 초기화 UI/API는 미구현. 별도 승인된 운영 절차로 Auth 비밀번호·대응 digest·최초 변경 플래그를 일관되게 갱신하고 이전 비밀번호 거부·변경 전 접근 차단·새 비밀번호 변경 후 정상 접근을 시험한 뒤 1회 전달. 비밀번호만 바꾸고 digest/플래그를 방치하지 않음 |
| 같은 ID의 다른 요청/조직, 잘못된 metadata, 프로필 또는 매핑만 존재, Auth 훅 충돌 | 자동 완료·덮어쓰기·삭제·예약 해제 금지. 증거를 보존하고 담당자가 충돌 원인을 확정한 뒤 별도 복구 승인. 기존 사용자/진단 데이터에 손대지 않음 |
| Auth가 없다는 사실이 확정된 pending | 예약은 그대로 보존. 현재 API는 동일 로그인 ID/요청 재사용을 차단함. 안전한 재개/정리 기능은 미구현이며 별도 설계·승인 필요 |

Auth 비밀번호 초기화·수동 RPC 완료·DB 정정은 이 문서만으로 실행 승인되지 않는다. Auth 생성과 DB 완료는 단일 트랜잭션이 아니며, DB 롤백 후 Auth가 남을 수 있다. 자동 계정 삭제/재생성/예약 해제 및 비밀번호 재조회는 제공하지 않는다.

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
