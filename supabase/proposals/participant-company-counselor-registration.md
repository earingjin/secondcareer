# 고객사 배정 상담사로 신규 내담자 연결 등록

2026-11-11 검토 제안. 실제 DB·RPC·권한·RLS를 조회하거나 SQL을 실행하지 않았다. 제안 SQL의 명시적 실행 중단 및 함수 정의 해시 placeholder를 유지한다.

2026-11-12 로컬 후속 검증. 잠금 및 권한 조건은 [PostgreSQL SELECT 문서](https://www.postgresql.org/docs/current/sql-select.html)의 locking clause와 UPDATE 권한 설명을 기준으로 검토했다. 배포된 DB 버전·정책·권한에 대한 검증을 대신하지 않는다.

## 2026-11-12 제공된 실제 DB 계약 반영

아래 정보는 사용자가 실제 secondcareer DB를 읽기 전용으로 확인해 제공한 결과다. 이번 작업에서 에이전트가 Supabase에 접속·조회·실행한 결과가 아니다. 기존 문서의 “실제 구조 미확인” 중 아래 항목만 제공된 근거로 보완한다.

| 항목 | 제공된 실제 계약 | 이번 제안 |
|---|---|---|
| 완료 | `public.secondcareer_complete_company_registration(uuid,uuid,text) → jsonb`, SECURITY INVOKER, MD5 `eaedb5e9ca427815dd4c13a34050e358` | 인자·반환·invoker 유지, 배정 행 확인/잠금 뒤 `auth_matches(new_user_id,new_internal_email,request_id,true)` |
| 복구 | `public.secondcareer_recover_company_registration(uuid,uuid,text) → jsonb`, SECURITY INVOKER, MD5 `a5cfe90880d927b60072682ffe66a15f` | 인자·반환·invoker 유지, 완료/pending 분기 전에 `auth_matches(new_user_id,new_internal_email,request_id,false)` |
| Auth helper | `secondcareer_company_private.auth_matches(uuid,text,uuid,boolean) → boolean`, SECURITY DEFINER, postgres 소유, 빈 search_path | 기존 helper를 호출만 함. 생성·변경·권한 부여 없음. false/NULL은 거부 |
| Auth 권한 | service_role은 auth.users SELECT 불가, helper 실행 가능. anon/authenticated는 helper 실행 불가 | 직접 auth.users SELECT를 제거하고 Auth 테이블 grant를 추가하지 않음 |
| 배정 관계 | `(organization_id,company_id,counselor_user_id)` 복합 PK·검증된 고객사/상담사 복합 FK, RLS 활성 | 같은 복합 키의 행을 공유 잠금. 새 테이블·영구 참여자→배정 FK 없음 |
| service_role 관계 권한 | SELECT·DELETE 가능, 테이블 및 counselor_user_id UPDATE 불가 | 잠금용 열 UPDATE grant는 미실행 제안으로 유지. 승인 및 시험 검증 필수 |

**불일치 원인:** 기존 신규 제안은 저장소의 과거 B1 초안을 복사해 SECURITY INVOKER 안에서 auth.users를 직접 조회했다. 실제 DB는 기존 보안 helper에 검증을 위임하므로 그대로 적용하면 권한 오류가 난다. 또한 기존 신규 복구 제안의 직접 Auth 검사는 pending 분기에만 있었지만, 수정안은 복구의 완료 분기에서도 제공된 helper 계약을 사용한다.

**MD5 자리표시자 유지 이유:** 값은 제공됐지만 실제 함수 원문은 제공되지 않았다. 해시로 인자 이름·default·전체 검증·트리거 호출·예외·기타 설정의 동일성을 역산할 수 없다. 그러므로 SQL의 두 `__REVIEW_*_FUNCTION_MD5__`는 대체하지 않는다. 실제 원문과 수정안의 전후 본문을 대조하고 배정 검사 및 Auth helper 경로 외의 의미 변경이 없는지 확인한 뒤 승인된 후속 작업에서만 채운다. 명시적 SCHEMA_REVIEW_REQUIRED 중단도 유지한다. 현 최종 판정은 **실제 DB 계약 확인 필요**다.

로컬 SQL에는 외부 두 함수의 jsonb/invoker 및 기존 helper의 존재·boolean/definer·postgres 소유·service_role 실행/스키마 사용 권한·anon/authenticated 실행 거부를 확인하는 사전 검사를 추가했다. helper 빈 search_path·본문과 전체 ACL/상속 role은 여전히 원문/카탈로그 대조 대상이며 여기서 helper를 수정하지 않는다. 이 검사들도 실제 DB에서는 실행하지 않았다.

### 기존 동작과의 대조 범위

- 완료의 요청 pending/취소 마커, 조직·관리자·상담사 역할, 활성 고객사, 프로필·매핑·참여자 생성 및 요청 complete 처리와 JSON 필드는 로컬 기존 제안과 동일하다. 잠금 뒤 Auth ID·내부 이메일·registration ID·비밀번호 변경 대기 검사를 기존 helper의 true 호출에 위임한다.
- 복구의 요청 행 잠금, 완료 시 Auth/참여자/조직/고객사/상담사 일치, pending의 미연결 검사·취소 마커·결과 JSON을 유지한다. false 호출은 최초 변경 대기를 요구하지 않을 뿐 Auth ID·이메일·registration ID 검사를 생략하지 않는다. 이미 완료된 내담자에게 현재 배정 존재를 요구하지 않는다.
- SQL 자체에는 Auth/내담자 삭제나 계정 생성 API 호출이 없다. 현재 서버 코드는 `outcome='cancelled'`가 확인된 이번 요청의 새 Auth만 삭제한다. 삭제 실패·복구 실패·결과 불명확 시 성공으로 보고하지 않으며 예약을 재사용해 자동 생성하지 않는다. 서버 코드는 이번에 변경하지 않는다.
- 운영 본문 전체와의 동일성, 모든 입력 인자 이름/default, 기존 SECURITY INVOKER의 실제 소유자·설정·트리거·숨은 검증은 원문 부재로 확정하지 않는다. 과거 B1 SQL의 auth.users 직접 조회를 실제 DB 계약으로 사용하지 않는다. 다른 SQL 제안은 이번에 수정하지 않았다.

## 적용 범위와 호환성

관리자 companyId 연결 신규 등록만 제한한다. 기존 `client_companies`, `client_company_counselors`, `participant_registration_requests`와 완료·복구 RPC 시그니처를 재사용한다. 신규 관계 표, 기존 내담자 재배정·자동 이관·삭제는 없다. 미연결 등록의 기존 완료 RPC와 상담사 직접 등록은 변경하지 않는다.

프런트엔드는 기존 고객사 배정 조회 API에서 조직 상담사와 관계를 받아 해당 고객사에 배정된 ID만 후보로 쓴다. CSV·XLSX·붙여넣기·행 입력은 같은 후보 검증을 거친다. 서버는 관리자 조직·고객사 활성·상담사 역할/조직·배정 행을 Auth 생성 전에 검사한다. 이 조회 이후의 경합은 DB 완료 트랜잭션이 해결해야 하며 사전 검사만으로 최종 정합성을 보장하지 않는다.

## 완료·해제 경합

완료 RPC는 기존 순서의 요청 행 `FOR UPDATE` → 활성 고객사 `FOR SHARE` 이후 해당 조직·고객사·상담사 배정 행을 `FOR SHARE`로 잠그고 확인한다. 하나의 완료 트랜잭션 안에서 프로필·로그인 매핑·참여자·요청 완료를 저장한다. 같은 상담사의 다른 고객사 배정 행은 잠그지 않는다.

- 해제가 먼저 커밋되면 배정 행이 없어 완료가 실패한다. 기존 복구 RPC는 요청 행 잠금을 통해 미완료·미연결 상태만 확인 취소한다. 서버가 확인된 취소 후 이번 요청의 신규 Auth만 정리하는 기존 동작을 유지한다. 결과 불명확 시 예약을 유지하고 자동 재등록하지 않는다.
- 완료가 공유 잠금을 먼저 얻으면 해제 DELETE는 완료 커밋/롤백까지 기다린다. 완료 커밋 뒤 해제는 가능하며 이미 등록한 내담자의 담당·진단·보고서를 변경하지 않는다. 참여자→배정 관계의 영구 FK는 만들지 않는다.
- 완료 응답이 유실된 뒤 배정이 해제됐더라도 복구는 요청/참여자에 저장된 회사·상담사·Auth ID가 일치하면 기존 완료 결과를 반환한다. 현재 배정 존재를 다시 요구해 완료 계정을 취소하지 않는다. pending 복구는 새 계정을 완성하지 않고 기존 취소 절차만 수행한다.

위 설명은 제안 설계다. 로컬 하네스의 전후 콜백 테스트는 순서별 결과만 모의하며 PostgreSQL 행 잠금·격리·RLS·실제 동시성을 증명하지 않는다.

## 최소 권한 평가

`FOR SHARE`는 SELECT와 더불어 잠그는 테이블의 적어도 한 열에 UPDATE 권한을 요구한다. 제공된 SELECT/DELETE만으로는 부족하다. 제안의 `UPDATE(counselor_user_id)`는 **열 수 기준으로 최소인 충분 조건**이지만, 가장 위험이 낮은 열이라는 뜻은 아니다. [PostgreSQL SELECT 권한 설명](https://www.postgresql.org/docs/current/sql-select.html)을 근거로 검토했으며 실제 DB 버전·실행 역할에서 시험해야 한다.

- 이 grant는 잠금 전용이 아니다. service_role로 counselor_user_id를 실제 변경할 수 있게 된다. 다른 조직/비상담사·중복 키는 실제 복합 FK/PK가 거부해야 하지만, 같은 조직의 다른 유효 상담사로 바꾸는 것은 그 제약만으로 막히지 않는다. 조직/고객사 열의 UPDATE나 전체 테이블 UPDATE는 부여하지 않는다.
- RLS 활성 자체가 service_role의 쓰기를 제한한다고 가정하지 않는다. 실제 BYPASSRLS·role 상속·정책·UPDATE 트리거와 감사·연쇄 동작을 확인해야 한다. 이 제안은 사용자 역할·권한 체계를 새로 만들지 않는다.
- PostgreSQL에는 별도의 행 잠금 전용 grant가 없다. `FOR KEY SHARE`로 바꾸어도 UPDATE 권한 요구는 사라지지 않는다. 실제 스키마에 의미를 바꿀 수 없는 생성 열이 있다면 그 열에만 UPDATE를 주는 대안을 검토할 수 있으나, 열 존재/생성식/DEFAULT 갱신·트리거 영향을 확인하지 않고 제안 SQL을 추측으로 바꾸지 않는다. 새 SECURITY DEFINER 잠금 함수를 만드는 대안은 이번 금지 범위이며 사용하지 않는다. advisory lock은 모든 해제/변경 경로가 함께 참여해야 해 현재 코드 범위를 벗어난다.
- 시험 DB에서 grant 전 FOR SHARE 거부, 승인한 열 grant 후 공유 잠금/DELETE 대기, 다른 열 UPDATE 거부, 유효 상담사 ID 변경이 가능해지는 영향, 잘못된 조직/역할·중복 PK 거부, UPDATE 트리거, anon/authenticated의 함수·직접 표 접근 거부를 확인한다. 원래 grants를 기록해 롤백 시 새로 추가한 권한만 되돌려야 한다.

## 경합·실패 10개 시나리오

아래는 정상적인 READ COMMITTED 및 검토한 제약/트리거를 전제로 한 **예상 처리**다. 높은 격리 수준, FK action, 트리거와 deadlock에 따라 오류로 롤백될 수도 있다. 관련 행 잠금의 충돌/해제는 [PostgreSQL 잠금 문서](https://www.postgresql.org/docs/current/explicit-locking.html)에 근거한다. 모든 행의 실제 DB 두 세션·Auth 연동 검증은 아직 필요하다. 각 경우 기존 내담자·진단·보고서는 이 제안으로 수정/삭제하지 않는다.

| 상황 | 대기·성공/실패 | Auth 상태 | 요청 상태 / 신규 내담자 | 기존 데이터·실제 검증 |
|---|---|---|---|---|
| 1. 배정 DELETE 선행 | DELETE가 행 잠금을 보유하면 완료의 FOR SHARE가 대기. DELETE 커밋 후 행이 없으면 완료 실패. DELETE 롤백이면 관계를 확인해 진행 가능 | 이미 생성된 신규 Auth는 완료 실패만으로 사라지지 않음. 확인된 취소 뒤 삭제 시도 가능 | 실패 시 pending·내담자 없음. 복구 성공이면 pending + 취소 마커 | 기존 데이터 보존. 커밋/롤백 양쪽 실제 검증 필요 |
| 2. 완료 공유 잠금 선행 | DELETE가 완료 트랜잭션 종료까지 대기. 완료 커밋 뒤 DELETE 가능 | 유지 | complete·내담자 1명. 이후 관계만 해제 | 기존/신규 내담자 보존. 실제 대기·해제 검증 필요 |
| 3. 완료 롤백 | 완료의 모든 DB 삽입·상태 갱신 롤백, 잠금 해제 후 대기 중 DELETE 진행 | 외부 Auth는 남음. 확정 취소 후에만 정리 | 이전 pending으로 복귀·내담자 없음. 복구가 취소 마커 기록 가능 | 기존 데이터 보존. 삽입 단계별 오류/롤백 시험 필요 |
| 4. 완료 성공 후 응답 유실 | 복구는 완료가 미종료면 요청 행 잠금에서 대기, 커밋 확인 후 helper false와 저장 ID 일치 검사. 재생성 없음 | 유지, 삭제 금지 | complete·기존 생성 1명 반환 | 기존/완료 데이터 보존. 응답 유실·재호출 시험 필요 |
| 5. 완료 후 배정 해제 | 완료 커밋 이후 DELETE는 가능. 복구는 현재 배정을 요구하지 않음 | 유지 | complete·내담자 유지 | 담당·진단·보고서 유지. 실제 해제/복구 검증 필요 |
| 6. 복구와 완료 동시 | 같은 요청의 FOR UPDATE로 직렬화. 완료가 먼저 커밋하면 복구는 complete 반환. pending 복구가 먼저 취소 마커를 커밋하면 대기한 완료는 REQUEST_NOT_PENDING 실패 | 완료 경로는 유지. 취소 경로는 확인 후 신규 Auth만 삭제 시도. 복구가 실패/롤백하면 삭제 불가 | 승자에 따라 complete + 1명 또는 pending/취소 마커 + 0명 | 기존 데이터 보존. 양방향 실제 세션 검증 필요 |
| 7. lock timeout | 기다리던 SQL문 실패. RPC 호출 트랜잭션을 롤백해야 함. 실제 종료/커밋 여부를 모르면 복구도 요청 잠금에서 기다릴 수 있음 | 확인 전 남김, 삭제 금지 | 확인 전 pending/complete 미확정. 롤백 확정은 0명, 커밋 확인은 1명 | 기존 데이터 보존. timeout/연결단절·복구 실패 시험 필요 |
| 8. Auth 생성 후 DB 완료 실패 | DB만 롤백. 복구가 요청 잠금과 helper false·미연결 검사를 통과해 cancelled를 반환해야 정리 가능 | 취소 확인 전 또는 복구 실패면 남음; 확인 후 삭제 성공 시 없음 | pending 또는 pending/취소 마커·내담자 0명. 예약 유지 | 기존 계정 삭제 금지. 실제 훅·부분 실패 검증 필요 |
| 9. Auth 삭제 실패 | 이미 취소가 확인됐어도 삭제 API 실패는 DB 트랜잭션과 별개. 자동 완료·재발급하지 않음 | 고아 Auth가 남을 수 있어 수동 확인 필요 | pending/취소 마커·내담자 0명 | 기존 데이터 보존. 삭제 실패·재시도 차단·접근 불가 검증 필요 |
| 10. 상담사 역할 변경 경합 | 완료의 역할 사전 검사만으로 모든 경합을 보장하지 않음. 실제 FK가 RESTRICT이면 배정이 남은 역할/조직 변경은 보통 거부. CASCADE/트리거면 배정 공유 잠금과 대기·교착 가능. 역할 변경과 해제가 먼저 확정되면 완료의 역할/배정 검사 실패 | 완료 커밋 시 유지, 실패 시 위 취소 확인 절차. 교착 종료 전 임의 삭제 금지 | 커밋 시 complete/1명, 실패·교착 victim은 pending/0명 | 실제 FK action·트리거·잠금 순서가 제공되지 않아 확정 불가. 반드시 양방향 경합 시험 |

파일 머리의 `SET LOCAL lock_timeout/statement_timeout`은 **이 검토 SQL 설치 트랜잭션**에만 적용된다. 이후 호출되는 RPC의 런타임 timeout을 보장하지 않는다. 실제 PostgREST/DB role/function/session 설정을 별도 확인하고 시험 호출에 명시적 timeout을 설정해야 한다. 함수 설정을 추측해 추가하거나 기존 운영 설정을 덮어쓰지 않았다.

## 적용 전 확인 및 별도 승인

| 항목 | 현재 근거와 상태 | 적용 전 조건 |
|---|---|---|
| 스키마 | 사용자 제공: 복합 PK/FK 검증·RLS 활성. 전체 열·FK action·트리거는 미제공 | 실제 열·타입·FK action·트리거·인덱스·NOT NULL 및 기존 쓰기 경로 확인 |
| 기존 함수 | 사용자 제공 인자 타입·jsonb·invoker·MD5 및 helper 계약 반영. 운영 원문 미제공 | 원문·입력 인자 이름/default·설정·소유자·grants·기존 호출자를 대조한 후에만 placeholder 확정. 차이가 있으면 중단 |
| 잠금 권한 | 사용자 제공: SELECT/DELETE 가능, UPDATE 및 해당 열 UPDATE 불가 | 제안한 UPDATE(counselor_user_id) 최소 열 권한의 추가 쓰기 영향·RLS/trigger 확인 후 별도 승인. anon/authenticated 권한은 확대하지 않음 |
| 완료/복구 | 로컬 프로토콜 모의만 확인 | 시험 DB 두 세션에서 DELETE 선행/완료 선행/롤백/lock timeout·응답 유실/복구 경합·역할/조직 변경을 검증 |
| 데이터 보존 | 기존 레코드 변경·자동 이관 없음 | 기존 내담자·진단·보고서·로그인 계정 보존, 복수 고객사 배정과 미연결/상담사 직접 등록 회귀 확인 |
| 배포 | SQL·Auth·서버 미적용 | DB 함수·권한 적용과 Edge 배포는 각각 승인. 최종 DB 검증 전 서버 사전 검사만으로 운영 정합성 완료라 보고하지 않음 |

적용은 B1/B2 실제 구조와 현재 함수 정의 확인 → 승인된 시험 환경에서 제안 검증 → 실제 두 세션 경합/실패 복구/직접 DB·RPC 권한 검사 → 변경 SQL·복구 계획 승인 → DB 함수/권한과 서버 배포 순으로 검토한다. DDL 트랜잭션 실패 시 SQL 변경은 롤백하되 이미 생성한 Auth까지 자동 롤백된다고 가정하지 않는다. 커밋된 적용을 되돌릴 때도 검토된 이전 함수 정의와 권한을 사용하며 기존 내담자나 배정 데이터를 삭제하지 않는다.
