# 참여자 등록 2단계: 로컬 통합 현황과 남은 작업

**판정: 로컬 전체 통합은 부분 완료, 실제 Supabase 배포 준비는 미완료.** 신규 등록·계정 상태·비밀번호 변경 API와 프런트 연결은 모의 환경에서 검증할 수 있다. 기존 로그인·진단 함수 원본 및 DB 기준 DDL이 없어 운영 함수와 DB에 대한 최종 통합은 완료하지 못했다. 대체 진단 함수는 만들지 않았다.

사용자가 기존 Supabase 상담사 계정의 로컬 로그인이 실제로 정상 작동함을 확인했다. 이번 2단계에서 에이전트가 실제 Supabase 로그인·계정 생성·SQL 실행·배포를 수행한 것은 아니다. 미커밋 작업, 기존 로그인 계약, 계산·리포트·CSS·Legacy·기준선은 보존한다.

## 1. 확인한 파일과 기존 계약

| 구분 | 로컬에서 확인한 계약 | 확인 범위 |
|---|---|---|
| 로그인 | `POST /functions/v1/secondcareer-login`, 요청 `{loginId,password}`, 프런트 필수 응답 `access_token,expires_at` | `src/live/api.js`, `verify-auth.cjs`; 함수 원본 없음 |
| 기존 상담사 호환 | 계정 API의 CORS/404/5xx 실패 → `GET /auth/v1/user`로 현재 app_metadata 확인 → 기존 진단 API가 counselor로 확인한 경우만 진입 | `api.js`, `tests/live/login-fallback.spec.mjs`; 401/403/429와 잘못된 응답은 우회하지 않음 |
| 진단 조회·리포트 | `GET secondcareer-assessment`가 profile·participants·assessments·counselors를 반환, `GET ?id=...`가 `{html}` 반환 | 프런트와 `verify-server.cjs`의 테스트 계약; 실제 구현은 없음 |
| 진단 쓰기 | `POST secondcareer-assessment`, `action: draft / submit / edit`, `answers`, `expectedUpdatedAt`, 상담사 수정은 `participantId` | 프런트와 검증 도구의 계약만 확인; 기존 쓰기 RPC의 실제 이름·정의는 로컬에서 확정 불가 |
| 계정 연결 | Auth user.id → user_profiles.user_id → server_login_lookup.user_id 및 participants.auth_user_id | `src/admin/account-operations.cjs`와 신규 서버 코드에서 사용하는 관계; DB 제약의 실제 존재는 미검증 |
| 권한 | 조직은 서버 프로필의 organization_id, 상담사 등록은 본인 배정, 관리자는 같은 조직 상담사만 지정 | 신규 서버 코드는 검증함; 기존 진단 서버의 담당/조직 필터·RLS는 원본 없음 |
| 진단 검증 도구 | `src/live/verify-server.cjs`는 함수 파일들을 stdin으로 받아 실행 | 이 도구와 그 모의 RPC는 운영 함수 원본이 아님. 원본을 공급하지 않아 이번에 실행하지 않음 |

`verify-server.cjs`의 브라우저 라우팅도 신규 account API를 별도로 처리하지 않는 이전 계약이므로, 원본 확보 후 새 경로와 fresh Auth metadata를 반영해야 전체 서버 통합 검증에 사용할 수 있다. 현재 도구를 실행하지 않고 서버 검증이 통과했다고 보고하지 않는다.

로컬 검색 결과 기존 `secondcareer-login/index.ts`, `secondcareer-assessment/index.ts`, 기준 스키마/RLS 마이그레이션, `supabase/config.toml`이 없다. `participant-registration.sql`은 적용하거나 CLI로 생성한 정식 마이그레이션이 아니라 검토 제안이다. 환경변수는 참조 코드만 확인했으며 실제 비밀번호·키 값은 읽거나 출력하지 않는다.

## 2. 재사용한 등록 흐름과 보완 사항

1. XLSX 첫 워크시트 / UTF-8 CSV / 엑셀 셀 붙여넣기를 기존 입력 모듈로 읽는다. 열은 이름·연락처·담당 상담사·소속기업이다. 서버가 연락처 숫자 마지막 8자리를 다시 계산한다.
2. 등록 API는 서버 Auth로 토큰을 확인하고 프로필의 조직·역할, 지정 상담사의 조직을 확인한다. 상담사는 요청에 다른 상담사를 보내도 본인에게 배정한다.
3. 고유 예약을 저장한 후 CSPRNG 임시 비밀번호를 만들고 Supabase Auth 계정을 생성한다. 기존 server_login_lookup에 내부 이메일·아이디·Auth ID를 연결하고, 하나의 DB RPC에서 profile·mapping·participant를 함께 삽입하도록 제안했다. 기존 계정을 수정하거나 덮어쓰지 않는다.
4. 임시 비밀번호는 Auth 생성과 최초 성공 응답에만 사용한다. 앱 테이블·예약·로그·localStorage·sessionStorage·CSV 다운로드에 평문 저장하지 않는다. 최초 전달 화면에서만 확인하며 이동·탭 숨김·5분 후 지운다. 분실 시 별도 운영자 재설정 절차가 필요하다.
5. `GET secondcareer-account`는 역할과 비밀번호 변경 필요 여부를 반환한다. 참여자의 Auth ID·조직에 맞는 participant 행이 없거나 중복 조회 오류가 나면 진입/비밀번호 변경을 거부한다.
6. 새 계정에는 신뢰할 수 있는 app_metadata의 `registration_request_id`, `must_change_password=true`를 설정한다. 변경 플래그가 사라져도 등록 마커가 있으면 변경 필요 상태로 유지한다. 잘못된 타입·누락된 metadata는 거부한다. user_metadata는 판정에 쓰지 않는다.
7. 계정 API의 변경 POST는 12~128자·임시 비밀번호 재사용 거부를 확인하고 Auth 관리자 업데이트 한 번으로 비밀번호와 완료 플래그를 반영한다. 임시 비밀번호 SHA-256 다이제스트는 Auth app_metadata에만 두고 완료 후 null로 지운다. 실패하면 차단 상태를 해제하지 않는다.
8. 완료 후 같은 세션에서 기존 진단 조회를 사용한다. 등록 전화번호의 기본값은 기존 전화번호 형식 함수로 표시하며, 이미 저장된 answers를 덮어쓰지 않는다.
9. 서버의 `SECONDCAREER_REGISTRATION_ENABLED`가 true일 때만 계정 API가 `registrationAvailable:true`를 반환한다. 비활성 상태 및 기존 상담사 호환 경로에서는 등록 화면을 연결하지 않는다. **이 설정값 자체가 진단 서버 통합 완료를 증명하지는 않는다.**

계정 API가 없을 때의 기존 상담사 로그인 호환 처리는 유지한다. 그 경로로 참여자·관리자를 허용하지 않는다. 참여자는 계정 API에서 상태를 확인해야 한다. 따라서 계정 API 미배포/장애 시 기존 참여자도 로그인되지 않는다.

Auth와 DB는 하나의 트랜잭션이 아니다. 일부 실패나 응답 유실은 예약을 남겨 중복 생성·임시 비밀번호 재조회·자동 삭제를 막는다. 운영자는 request_id와 Auth app_metadata.registration_request_id로 수동 확인해야 한다. 고급 복구·재발급 UI는 미구현이다.

## 3. SQL 비교 결과와 적용 전 검사

DB 기준 DDL이 없으므로 실제 DB와의 일치·무충돌은 판정할 수 없다. 기존 로컬 코드가 사용하는 계약에 맞춰 아래 항목을 검토하고 제안을 보완했다.

| 항목 | 제안 및 충돌 처리 |
|---|---|
| 기존 컬럼 | participants.phone / company_name을 nullable text로 추가. 동명 컬럼이 다른 타입이면 중단하고, 기존 값의 변환·갱신·삭제를 하지 않음 |
| 기존 연결·고유 제약 | UUID/text 타입, Auth·조직·상담사·진단 FK, 로그인 아이디·이메일·사용자 연결의 단일 고유 키를 적용 전 카탈로그에서 확인. 없으면 자동 생성하지 않고 중단 |
| 삽입 계약 | 기존 테이블에 추가 필수 컬럼이 있으면 중단. participant ID는 신규 RPC가 생성하므로 기존 ID 기본값을 가정하지 않음 |
| 기존 권한 | service_role의 기존 SELECT/INSERT와 RLS 활성 상태를 확인. 기존 테이블에 추가 권한을 자동 부여하지 않음 |
| 신규 예약 테이블 | 로그인 아이디·요청 ID 고유, 연락처/아이디 일치, 상태/연결 ID 일관성 검사. anon/authenticated 권한 없음, RLS 활성 |
| 신규 RPC | `secondcareer_complete_registration(uuid,uuid,text)`는 SECURITY INVOKER, service_role만 실행. 예약 잠금 후 조직·담당 권한을 다시 검사하고 신규 연결을 원자적으로 삽입 |
| 기존 RPC와 충돌 | 같은 함수 이름이 이미 있으면 오버로드 여부와 관계없이 중단. CREATE OR REPLACE / DROP으로 덮어쓰지 않음 |
| 기존 private 스키마 | 기존 private의 권한을 건드리지 않고 전용 `secondcareer_registration_private`를 사용. 동명 스키마가 있으면 중단 |
| 추가 RLS | 기존 소유/담당 정책에 RESTRICTIVE 비밀번호 조건만 추가. legacy 메타데이터에는 통과, 새 계정은 명시적 완료 상태에서만 통과. 정책 동명 충돌 시 중단 |
| RLS 한계 | service_role·소유자·SECURITY DEFINER RPC는 우회할 수 있음. 기존 진단 함수와 쓰기 RPC의 별도 검토 필수 |
| Auth·테이블 트리거 | Auth 생성 시 자동 profile을 만드는 기존 트리거가 있으면 RPC INSERT와 충돌 가능. 읽기 전용 목록에서 확인 후 기존 원본과 함께 검토. 임의 삭제·수정하지 않음 |

`participant-registration-preflight.sql`은 컬럼·제약·인덱스·정책·테이블/열 권한·RPC 시그니처·트리거의 **메타데이터만 조회**하는 읽기 전용 점검안이다. 개인정보 행·비밀번호·기밀 함수 본문을 조회하지 않는다. 이번 작업에서는 실행하지 않았다.

`participant-registration.sql`은 같은 계약의 필수 조건과 신규 객체 이름 충돌을 DDL 전에 검사한다. 검사와 DDL은 한 트랜잭션이며 짧은 잠금/문장 제한을 둔다. 검사가 실패하면 실 DB DDL을 검토해 제안을 수정해야 한다. 정당한 다른 타입·부분 고유 인덱스가 있는 DB도 보수적으로 중단할 수 있으며, 이 검사는 호환성 검토를 대신하지 않는다.

로컬에는 psql·Supabase CLI·Docker·Deno 실행 파일이 발견되지 않았다. SQL/RLS의 PostgreSQL 실행 및 Edge의 Deno 타입/런타임 검증은 미수행이다.

## 4. 기존 진단 함수에 필요한 통합 — 미완료

필요한 원본은 다음과 같다. 기존 비공개 엔진·계산/문구 원본은 승인된 비공개 경로에서만 검토하며 공개 저장소로 복사하지 않는다.

- 기존 `secondcareer-assessment/index.ts`와 인증·조회·보고서·저장 처리에 쓰는 imports.
- 해당 코드가 호출하는 실제 쓰기 RPC의 SQL 정의, 원자성/동시 수정 처리 및 권한 정의.
- 기존 `secondcareer-login/index.ts`와 login lookup·Auth ID 일치 확인 처리. 요청/응답은 변경하지 않고 신규 매핑과 호환되는지 확인해야 한다.
- 기준 DB 스키마·RLS·GRANT 마이그레이션 또는 위 읽기 전용 점검 결과. Auth 사용자 생성 트리거·설정과 Edge 플랫폼 JWT 설정도 필요하다.

원본 확보 후 검증된 `getUser(token)` 직후, profile/participant/assessment 조회·보고서 렌더·모든 POST 분기보다 앞에 기존 `_shared/participant-access.ts`를 연결한다.

```ts
const accessError = participantAccessError(user);
if (accessError) return out({error: accessError}, 403);
```

JWT 디코드나 user_metadata로 바꾸면 안 된다. 현재 Auth user를 매 요청 확인해야 이미 발급된 토큰도 변경 완료 상태를 따라간다. 기존 담당·조직 필터와 제출/수정 권한 검사는 그대로 유지한다.

조회 허용 목록에 `participants.phone,company_name`을 추가하되 본인·담당 범위 밖 정보를 반환하지 않는다. 기존 응답/결과/버전·문구·비교·리포트 계산·history 형식은 바꾸지 않는다. draft·submit·edit의 기존 RPC 원자성과 낙관적 잠금, 제출 중복 처리도 보존한다. 새 참여자에게는 새 assessment를 미리 삽입하지 않고 기존 최초 임시저장/제출 경로가 생성하도록 확인한다.

**위 실제 함수 통합·서버 계산 회귀는 원본 부재로 실행하지 못했다.** 로컬 공유 가드와 그 모의 테스트가 통과해도 기존 운영 함수가 보호된 것으로 보고하지 않는다.

## 5. 로컬 검증과 한계

- `npm run build`
- `npx playwright test tests/live tests/admin`
- `node tests/run-url.mjs --root src --page demo.html tests/golden tests/contract tests/e2e tests/snapshot tests/split`

이번 실행 결과: `npm run build` 통과. `node tests/run-url.mjs --root src --page demo.html --max-failures=1`로 live·admin을 포함한 전체 152건 중 150건 통과, 단계 1a 전용 조건부 테스트 2건 건너뜀. 최초 변경 전 API 직접 호출 차단과 관리자 등록 가용 상태 정규화를 포함한 최종 live 테스트 29건도 별도 재실행해 통과했다. 캡처 전체 252장 비교는 실행하지 않았다. Legacy SHA256은 기준과 같고 기준선은 갱신하지 않았다.

신규 live 테스트는 외부 요청을 모두 로컬 모의 구현으로 대체한다. 기존 아이디→내부 이메일→Auth ID와 비밀번호 검증, 발급·변경 후 이전 비밀번호 거부, 새 참여자의 임시저장/재로그인/이어쓰기/제출 요청 계약, 상담사 fallback·리포트 요청, 권한/중복/실패 시 차단을 확인한다. 모의 진단은 프로토콜·담당 관계만 구현하며 서버 계산·DB/RLS·실제 쓰기 RPC를 검증하지 않는다. `demo.html` 회귀 통과는 기존 계산/화면 보존의 증거이며 운영 서버 계산 검증의 대체물이 아니다. XLSX는 생성한 압축 워크북으로 검증하고 실제 사용자 파일은 별도 확인이 필요하다.

기존 `test:src`는 file://의 src/index.html을 열어 현재 운영 모듈 경로와 맞지 않는다. 기존 회귀 UI는 HTTP의 demo.html로 검증한다. 기준선은 갱신하지 않는다.

## 6. 실제 적용을 위해 남은 순서

1. 누락된 함수·DB 원본을 승인된 경로에서 확보하고 읽기 전용 스키마 점검 결과와 제안을 비교한다.
2. 기존 진단 가드·조회 필드 통합과 기존 쓰기 RPC의 접근 통제/회귀를 검증한다. 직접 Data API/RPC 우회, Auth 생성 트리거 충돌도 확인한다.
3. SQL 제안을 확정한 뒤 CLI의 `migration new`로 정식 로컬 마이그레이션을 만든다. 현재 제안을 바로 운영에 실행하지 않는다.
4. 별도 승인된 검증 환경에서 DB 변경·기존 진단 가드·신규 account/register 함수를 적용하는 계획을 검토한다. 이 작업에서는 적용하지 않는다. 등록 활성 플래그는 false로 유지한다.
5. 기존 상담사(계정 API 미배포/배포 두 경우), legacy 참여자, 신규 임시 계정의 로그인·담당 격리·변경 전 GET/POST/직접 API 거부·변경 후 임시저장/이어쓰기/제출/서버 계산/리포트를 실제 Auth/DB로 확인한다.
6. Auth 비밀번호 정책·내부 이메일 도메인 허용, 서비스 키의 서버 전용 보관, Edge JWT/CORS, 기존 로그인 제한, 개인정보/예약 보관 및 실패 수동 복구 절차를 확인한다. 키·실제 계정 정보를 저장소에 넣지 않는다.
7. 검증 결과와 사용자 배포 승인을 받은 후에만 등록 활성화와 프런트 게시를 진행한다. 기존 상담사 fallback만으로 신규 등록을 사용할 수는 없다.

## 7. 이번 2단계에서 수정·추가한 파일

- 프런트: `src/live/api.js`, `src/live/app.js`.
- 서버: `supabase/functions/secondcareer-account/index.ts`, `supabase/functions/_shared/participant-access.ts`.
- SQL/안내: `supabase/proposals/participant-registration.sql`, `participant-registration-preflight.sql`, `INTEGRATION.md`.
- 테스트: `tests/live/server-harness.cjs`, `registration-server.spec.mjs`, `registration-browser.spec.mjs`, `login-fallback.spec.mjs`.

기존 미커밋 등록·입력·관리자 코드와 테스트를 재사용했고, 기존 기능을 되돌리지 않았다. 기존 운영 함수를 대체하는 파일, 기밀 엔진 복제, 새 의존성, DB 변경, 함수 배포, 커밋·푸시는 없다.

## 참고

[Supabase Auth 관리자 업데이트](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [PostgreSQL RESTRICTIVE 정책](https://www.postgresql.org/docs/current/sql-createpolicy.html), [함수 권한과 SECURITY DEFINER](https://www.postgresql.org/docs/current/sql-createfunction.html).
