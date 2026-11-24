# 로그인 없는 사전진단 서버 접수 — STEP 1

2026-11-23. 기존 웹서비스의 서버 기능이다. UI 연결, 개별 배정, 기존 기능 삭제는 후속 단계다. 운영 DB·Auth 접속, SQL 적용, Edge 배포는 수행하지 않았다.

## API 계약

배포 후 URL: `https://<project-ref>.supabase.co/functions/v1/secondcareer-public-assessment`.
모든 업무는 POST JSON이며 Cache-Control은 no-store다. GET·목록·리포트·관리자·상담사 작업은 제공하지 않는다. `SECONDCAREER_PUBLIC_INTAKE_ENABLED=true`가 아니면 503이다. `supabase/config.toml`의 이 함수만 `verify_jwt=false`이며 기존 인증 함수는 변경하지 않는다.

공통 필드: `action`, `linkId`, `intakeId`, `accessToken`. ID는 UUID v4다. 설문 URL에는 운영자가 발급한 공개 `linkId`만 넣고 응답별 토큰은 URL에 넣지 않는다. 브라우저는 접수 시작 전에 `crypto.randomUUID()`와 `crypto.getRandomValues(new Uint8Array(32))`로 접수 ID와 32바이트 토큰을 만들고, 토큰은 패딩 없는 base64url 43자로 인코딩한다. 이 값을 안전한 동일 기기 저장소에 먼저 보관한 뒤 start를 요청한다. 시작 응답을 잃어도 동일 값으로 재시도한다. 서버는 토큰 SHA-256만 DB로 전달한다. 원문 토큰·개인정보를 로그에 출력하지 않는다.

| action | 추가 요청 필드 | 응답 |
|---|---|---|
| start | requestId(UUID v4) | intakeId, status, version, expiresAt |
| read | 없음 | 공통 상태 + draft일 때만 answers |
| draft | requestId, version, answers | 공통 상태 |
| submit | requestId, version, answers | 공통 상태 + submittedAt |
| status | 없음 | 공통 상태 + 제출 시 submittedAt |

answers는 기존 `reg`, `goal`, `expect`, `done`, `pre` 계약을 사용한다. 서버의 기존 sanitize와 missing을 재사용하고 신규 submit에서만 A2를 제외한다. 기존 로그인 경로의 A2 필수 검증은 보존한다. 사전진단 문항 수·선택지·평가 버전·엔진은 기존 서버 모듈을 그대로 사용한다. 전달된 결과·점수·상담사·조직은 저장하지 않는다. 제출 결과는 서버가 계산하며 응답에는 점수·판정·리포트·내부 참여자 ID를 포함하지 않는다.

version은 0부터 시작하며 성공한 draft/submit마다 증가한다. 저장 충돌은 409 CONFLICT, 제출 후 새 쓰기는 409 LOCKED다. 성공했던 동일 requestId와 동일 canonical 요청을 재시도하면 현재 상태만 반환하며 결과를 재저장하지 않는다. 같은 requestId의 다른 내용은 409 REQUEST_REUSED다. 네트워크 오류 시 새 접수를 만들지 말고 status 또는 기존 requestId로 처리 결과를 확인한다. 결과 랜덤 선택은 최초 성공한 DB 쓰기의 값만 남는다.

## 토큰·접근·남용 제한

무기한 공용 링크에서 새로 만든 개별 접수 토큰은 접수 생성 후 7일에 만료된다. 날짜가 있는 링크에서는 생성 후 7일과 링크 만료 중 이른 시점에 만료된다. start 재호출로 연장되지 않는다. 링크 비활성화·만료도 접근을 차단한다. 링크·접수·토큰 해시를 모두 대조하므로 다른 링크나 응답의 접근은 거부된다. 제출 뒤에는 응답 원문을 다시 제공하지 않고 상태만 확인한다. 만료·분실 시 이름/전화로 복구·병합하지 않는다. 운영 확인 후 별도 신규 접수를 진행하며 기존 데이터는 보존한다. 자동 동일인 판정은 없다.

모든 요청의 본문은 스트리밍으로 64KiB 이하를 확인한다. 공용 DB quota는 링크당 분당 600회(전체 작업), 시간당 30회(start, 재시도 포함)다. 이 수치는 초기 기술 제한이며 운영 용량 확인 후 조정한다. 프록시 IP·클라이언트 조직·CORS를 권한 근거로 쓰지 않는다. quota는 악용 비용을 제한하지만 공개 링크 자체에 대한 quota 소진 공격으로 정상 접수도 지연될 수 있다. 운영 시 모니터링과 추가 게이트웨이 제한/CAPTCHA 필요성을 검토한다. 만료된 quota·세션의 보관/정리 일정은 개인정보 보관 정책 확정 후 별도 승인한다.

## DB·적용 전 확인

`supabase/migrations/20261123000000_public_assessment_intake.sql`은 기존 participants의 auth_user_id·counselor_user_id·company_id를 nullable로 하고 기존 행은 갱신·삭제하지 않는다. 기존 PK/FK/UNIQUE/CHECK·RLS는 제거하지 않는다. 신규 public_intake_links(서버 조직 연결), public_intakes(토큰 해시·임시 응답·버전), public_intake_requests(멱등 키), public_intake_limits(공유 quota)에 RLS를 켜고 anon/authenticated/PUBLIC 권한을 회수한다. 서비스 역할만 필요한 읽기·쓰기 및 단일 SECURITY INVOKER RPC를 사용한다. 서비스 키는 Edge 비밀 환경변수로만 사용한다.

RPC는 링크의 조직을 확정하고 접수 행을 잠가 버전·멱등성·제출 상태를 검사한다. 최종 제출에서 participants와 assessments(pre, submitted, 원문 answers·result)를 함께 생성하고 접수 상태를 확정한다. DB 오류는 내부 블록의 참여자·진단·멱등 키 변경을 모두 롤백하며 quota만 보존한다. 서버는 오류를 저장 성공으로 반환하지 않는다. 미배정 참여자는 해당 조직의 기존 관리자 전체 조회 대상에 포함되도록 저장하지만 실제 화면 표시는 후속 연동·운영 검증 대상이다.

적용 전 `supabase/checks/public-intake-preflight.sql`의 실제 대상 DB 결과를 검토해야 한다. NULL을 막는 CHECK·복합 FK·UNIQUE·트리거, assessments 기본 ID/필수 열·schema_version 계약, 기존 RPC의 전제, 기존 RLS와 직접 Data API 권한을 확인한다. 특히 NULL Auth/상담사 행이 기존 정책 때문에 외부로 노출되지 않는지 시험한다. 과거 SQL 제안이나 코드만으로 운영 DB 적용 상태를 판단하지 않는다. 불일치 시 마이그레이션을 적용하지 않고 호환 수정·검증을 선행한다. 이 파일은 세 열의 NOT NULL만 완화하며 알 수 없는 제약을 자동 제거하지 않는다.

링크는 기본 비활성이다. 승인된 서버 운영 경로에서 실제 조직 FK와 만료 방식(NULL 또는 지정 날짜)을 정해 발급하고 검증 후 활성화한다. 브라우저에는 링크 ID만 전달한다. STEP 1은 실제 조직 링크를 만들지 않았다. 기존 계정·사후진단은 변경하지 않는다.

## 공용 링크 만료를 선택 사항으로 전환하는 운영 절차

운영 적용과 데이터 전환은 별도 승인 후 수행한다. 아래 절차의 사전 검증은 격리된 Supabase에서 같은 순서로 실행한다.

| 순서 | 적용 및 확인 | 실패 시 복구 |
|---|---|---|
| 1. 운영 상태 확인 | 운영 프로젝트와 마이그레이션 이력을 확인한다. 두 `expires_at` 열의 자료형·NOT NULL, `secondcareer_public_intake_v1` 본문·소유자·실행 권한·`SECURITY INVOKER`·`search_path`, 기존 RLS를 읽기 전용으로 확인한다. 전환 후보의 조직 ID, 링크 ID, `enabled`, 기존 만료 시각을 확보한다. | 기준 마이그레이션과 차이가 있거나 후보가 불명확하면 적용을 중단하고 차이를 확인한다. |
| 2. 스키마와 RPC 적용 | `20261124000000_public_intake_optional_link_expiry.sql`만 적용한다. 실제 함수 본문의 줄바꿈을 정규화한 지문과 열 제약이 일치해야 한다. 링크 열만 NULL을 허용하며 기존 행을 보존한다. 날짜가 있는 링크는 기존 API·프론트엔드에서도 조회된다. | 사전조건·잠금·DDL 실패 시 트랜잭션을 롤백한다. 이미 적용했다면 유한 링크의 기능을 확인하고, 스키마 복귀가 필요한 경우 아래 DB 복구 절차를 따른다. |
| 3. 관리자 조회 함수 반영 | `secondcareer-admin-public-intake-links`만 단독 배포한다. 기존 JWT gateway 설정, 조직 범위, origin 및 접수 플래그를 유지한다. 현재 날짜가 ISO 문자열로 반환되는지 확인한다. 기존 공개 설문 함수는 그대로 사용한다. | 날짜를 사용하는 데이터에서는 직전 관리자 함수로 복귀할 수 있다. NULL 행이 생긴 이후에는 호환 함수가 필요하다. |
| 4. 프론트엔드 반영 | 날짜와 NULL을 모두 처리하는 빌드를 검증하고 반영한다. 스테이징에서 조회·복사·새 탭·주소 저장 후 갱신·로그아웃을 확인한다. | NULL 행이 생기기 전에는 직전 프론트엔드로 복구할 수 있다. NULL 행이 이미 있으면 호환 빌드를 유지하거나 먼저 아래의 링크 행 복구를 완료한다. |
| 5. 승인된 기존 링크 전환 | 운영 트랜잭션에서 조직 ID·링크 ID·기록한 만료 시각이 일치하고, 링크가 활성 상태이며 전환 시점에 아직 만료되지 않았는지 확인한다. 같은 조건으로 `expires_at`만 NULL로 변경하고 영향 행이 정확히 1건이며 링크 ID·조직·활성 상태가 보존됐을 때 커밋한다. | 조건 또는 영향 행 불일치 시 롤백한다. 이미 커밋된 경우 정확한 조직·링크를 다시 확인하고 별도 승인 후 NULL인 해당 행에 기록한 원래 만료 시각을 복원한다. 다른 행과 기존 개별 접수에는 손대지 않는다. |
| 6. 전환 후 확인 | 관리 화면에서 날짜 없이 접수 가능으로 표시되고 복사한 URL이 전환 전과 동일한지 확인한다. 같은 URL의 실제 접수 시작은 임시 접수 행을 생성하므로 운영 검증용 접수가 별도로 승인된 경우에만 수행한다. 새 개별 접수의 7일 만료와 재요청 시 만료 불변은 우선 격리 DB에서 확인한다. | 문제가 있으면 먼저 호환 버전에서 링크 상태와 기존 URL을 확인한다. 전환을 되돌릴 때는 5단계 복구를 적용하고, 직전 관리자 함수나 프론트엔드가 필요하면 NULL 행이 없는지 확인 후 복귀한다. |

DB 자체를 복구하려면 모든 NULL 링크를 먼저 승인된 방식으로 처리한다. 한 트랜잭션에서 원본 마이그레이션의 함수 정의를 `CREATE OR REPLACE FUNCTION`으로 복원하고 링크 `expires_at`의 NOT NULL을 재설정한다. 기존 RPC의 소유자·ACL·RLS 및 개별 접수 날짜를 보존한다. 공용 링크에 더 이른 기존 만료일을 복원하면, 이후 접근은 그 시각부터 차단되며 이미 발급된 개별 만료일 자체는 유지된다.

## 검증 및 실행

- 로컬 프로토콜 모의: `npx.cmd playwright test tests/live/public-intake.spec.mjs --global-timeout=60000`. RPC를 모의하며 실제 DB 잠금/롤백/RLS 검증은 아니다.
- 영향 회귀: registration-server, company-link-server, admin-progress-server와 신규 파일 합계 43건 통과·종료 0. shared 검증 이동 후 기존 상담사 조회·보고서·관리자 권한과 제출 계산 경로를 포함한다.
- `npm.cmd run test:golden -- --global-timeout=120000`: 기본 legacy 대상 10/10, 종료 0. `npm.cmd run build`: 종료 0. 신규 테스트 최초 샌드박스 실행은 esbuild 상위 디렉터리 접근 거부로 종료 1, 권한 재실행은 통과했다.
- 실제 DB 실행기: `node tests/tools/public-intake-db.mjs`. INTAKE_TEST_URL(localhost HTTP+포트만 허용), INTAKE_TEST_SERVICE_KEY, INTAKE_TEST_ANON_KEY, INTAKE_TEST_ORG(참여자가 없는 테스트 조직) 필요. 운영 URL을 거부한다. 격리 DB에 사전 검증·마이그레이션 적용 후 실행한다. 실제 start/draft/resume, 동시 제출, 멱등 재확인, NULL 배정, 실패 롤백, 위조·만료·링크 경계 및 anon ACL을 검사한다. 생성 데이터는 격리 DB에만 남긴다. 실제 운영 스키마·로그인 역할별 RLS를 대체하지 않는다.
- 현재 환경에서 Supabase CLI·Deno·Docker·psql을 찾지 못했고 격리 DB 연결도 없으므로 SQL 실행·Deno 타입/런타임·실제 DB 통합은 미실행이다. CLI migration new를 실행할 수 없어 표준 타임스탬프 형식의 파일을 작성했다. DB 통합 실행기의 구문 검사는 통과했으며 실행 시 필수 격리 환경변수 부재를 감지하여 네트워크 요청 전 종료 1로 중단했다. DB 검증 통과나 서비스 동작 완료로 판정하지 않는다.

공식 근거: [Edge 인증 설정](https://supabase.com/docs/guides/functions/auth), [RLS와 권한](https://supabase.com/docs/guides/database/postgres/row-level-security), [변경 이력](https://supabase.com/changelog.md)을 확인했다. 실제 배포 전 gateway JWT 설정·서비스 키 보관·실제 schema/RLS·트랜잭션/경합·운영 부하·개인정보 보관 정책을 검증하고 별도 적용 승인을 받아야 한다.
