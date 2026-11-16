# 미연결 참여자 연결 확정 계약 설계안 (4-B, 승인 대기)

이 문서는 4-A 읽기 화면 이후의 설계안이다. 연결 API·RPC·이력 테이블은 구현하거나 적용하지 않았다. 조회 엔드포인트는 `GET /functions/v1/secondcareer-admin-unlinked`이며 관리자 조직의 `participants.company_id IS NULL`만 반환한다.

## 독립 서버 계약

제안 엔드포인트: `POST /functions/v1/secondcareer-admin-unlinked-link`. 본문은 UUID `participantId`, UUID `companyId`, UUID `requestId`만 허용한다. 기존 `authenticateAdmin()`으로 관리자와 소속 조직을 확인하고, 그 조직 ID와 인증된 관리자 계정 ID를 서버에서 RPC로 전달한다. 요청의 조직 ID나 기존 기업명은 신뢰하지 않는다. 다른 역할·조직은 403, 잘못된 입력은 400, 이미 다른 고객사에 연결됐거나 동일 참여자에 다른 요청이 먼저 성공했으면 409를 반환한다. 서버 오류는 결과를 확인하라고 안내하며 자동 재시도하지 않는다.

성공 응답은 `participantId`, `companyId`, 마스터의 `companyName`, `linkedAt`, `requestId`와 처리 결과(`linked` 또는 `already_completed`)만 반환한다. 동일 `requestId`와 동일 요청의 완료 기록이 있으면 재발급이나 재변경 없이 저장된 결과를 돌려준다. 같은 요청 ID에 다른 참여자·고객사 값이 오면 409다. 연결 전·후 목록과 고객사별 화면은 다시 조회한다.

## 원자성·이력 제안

운영 스키마 확인 후 `public.participant_company_link_events` 테이블을 제안한다. 열: `id uuid primary key`, `organization_id uuid not null`, `participant_id uuid not null`, `old_company_id uuid null`, `new_company_id uuid not null`, `actor_admin_user_id uuid not null`, `request_id uuid not null`, `linked_at timestamptz not null`. `request_id`와 `participant_id`에 각각 고유 제약을 두고, 조직 포함 참여자·고객사 관계의 FK와 필요한 인덱스를 실제 운영 키 정의에 맞춰 검토한다. `old_company_id IS NULL`을 강제한다. 이력 테이블은 RLS를 켜고 브라우저 역할에 직접 SELECT/INSERT/UPDATE/DELETE를 부여하지 않는다. 이력 수정·삭제 경로는 제공하지 않는다.

서비스 역할만 호출하는 별도 RPC가 단일 DB 트랜잭션에서 다음을 수행한다.

1. 관리자 프로필의 역할·조직과 참여자·고객사의 조직을 재확인한다.
2. 요청 ID의 기존 완료 기록이 있으면 본문 일치 여부를 확인한다.
3. 참여자 행을 잠그고 `company_id IS NULL`을 다시 확인한다. 고객사 행도 조회해 동일 조직인지 확인한다.
4. 확정될 활성 상태·상담사 배정 정책을 검사한다.
5. `UPDATE participants SET company_id = 대상 ID WHERE id = 참여자 ID AND organization_id = 관리자 조직 AND company_id IS NULL RETURNING id`의 단일 행 성공을 확인한다.
6. 같은 트랜잭션에 성공 이력을 삽입한다. 고유 제약 충돌이나 이력 저장 실패 시 전체 변경을 롤백한다.

서로 다른 관리자가 A기업·B기업 연결을 동시에 시도하면 행 잠금과 조건부 UPDATE로 한 요청만 성공한다. 나머지는 409이며 이력을 남기지 않는다. 동일 요청의 응답 유실은 `request_id` 이력으로 확인한 후 같은 결과를 반환한다. RPC는 `search_path`를 고정하고 모든 객체를 스키마로 한정한다. `PUBLIC`, `anon`, `authenticated` 실행 권한은 차단하고 `service_role`만 허용한다. 직접 테이블 UPDATE로 이 경로를 우회할 수 없는지 권한을 재검토한다.

기존 `participants_company_org_fk`, `participants_org_company_idx`, `participants_company_link_guard`를 보존한다. 현재 저장소의 SQL 제안은 서비스 역할의 `company_id` 변경을 허용하는 구조이지만, 실제 운영 정의·FK 동작·RLS·권한은 적용 전에 다시 읽어야 한다. SQL 제안 파일이 운영 적용의 증거는 아니다.

수정 열은 `participants.company_id` 하나로 제한한다. `company_name`, 담당 상담사, Auth 계정, 사전·사후 응답, 계산 결과, 개인 보고서 원본과 등록 이력은 그대로 둔다. 연결 후 고객사명 표시는 `client_companies` 마스터에서 조회한다. 공유 관리자 계정의 `actor_admin_user_id`는 계정을 기록할 뿐 실제 작업자 개인을 식별하지 못한다.

## 사용자 결정 필요

- **비활성 고객사:** 기본 제안은 신규 연결 거부다. 승인 전에는 연결 API를 만들지 않는다.
- **기존 담당 상담사와 고객사 운영 배정 불일치:** 기본 제안은 담당자를 자동 변경하지 않고 불일치를 표시하며 연결을 보류하는 것이다. 승인 전에는 연결 API를 만들지 않는다.

## 적용 전 확인·검증

운영 스키마의 참여자 PK/조직 키, 고객사 복합 FK, 트리거 원문, RLS 및 역할별 권한, 기존 감사 구조와 이름 충돌을 읽기 전용으로 확인한다. 승인 후 격리 DB에서 관리자·타 조직·다른 역할 거부, 동시 A/B 경합, 중복 요청·응답 유실, 이력 삽입 실패 시 롤백, 기존 열·진단·보고서 불변을 검증한다. 이어 승인된 SQL 적용·서버 배포·운영 검증 순서를 별도로 정한다.
