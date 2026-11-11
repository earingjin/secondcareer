# STEP 14-C 운영 로그인 연동 계약 — 미검증·미적용

운영 `secondcareer-login` 원본은 저장소에 없다. 이 작업은 해당 함수를 생성/교체하지 않는다. 기존 브라우저 호출 `{loginId,password}`와 응답 세션 `{access_token,refresh_token,expires_at|expires_in}` 및 `server_login_lookup(login_id,user_id,internal_email)` 매핑만 재사용한다. 실제 역할 허용 목록·요청 제한·로그·Auth 훅은 확인하지 않았다.

활성화 전 확인할 사항:

- 기존 로그인 구현이 `cm_` + 무작위 16자리 hex ID를 받아 내부 Auth 이메일로 로그인하고 매핑 user_id를 재확인하는지 검증한다. 역할을 participant로 강제하거나 phone ID만 허용한다면 원본 검토와 별도 승인 후 연동한다. 새로운 인증 방식으로 우회하지 않는다.
- `user_profiles.role` CHECK의 실제 이름과 전체 정의를 검토한 뒤 SQL의 두 placeholder를 채운다. 그대로 실행하면 DDL 전 중단된다. B2 복합 유일 키와 기존 RLS/RPC/노출 테이블·로그인 경로를 함께 검토한다.
- SQL/RLS/RPC와 account/담당자 API를 합성 실환경에서 검증한 후에만 `SECONDCAREER_COMPANY_MANAGER_ENABLED=true`를 설정한다. 기본은 비활성이다. 운영 배포는 이번 단계에서 하지 않는다.
- 발급 API는 요청 예약→Auth 생성→전용 DB 완료 RPC 순서다. 완료 응답 유실은 같은 요청 잠금으로 복구한다. 취소/불명확/생성 실패 요청은 중복 발급을 막고 승인된 운영 확인이 필요하다. 생성된 미연결 Auth는 삭제하지 않으며 프로필·로그인 매핑·데이터 접근이 없어야 한다. 임시 비밀번호는 응답 1회뿐이고 로그/평문 DB/재조회/자동 재발급은 없다.
- 최초 변경은 Auth 비밀번호 변경 후 DB must_change_password를 해제한다. 후반 DB 실패 시 접근은 계속 잠기며 사용자는 알고 있는 새 비밀번호로 로그인해 다시 변경할 수 있다. 상태·고객사 접근은 DB에서 매 요청 재검증한다. 정지는 Auth 토큰을 무효화했다는 뜻이 아니며 발급된 토큰도 이후 데이터 요청에서 거부한다.
- 담당자 진입 링크 `?entry=company-manager`는 같은 로그인 API를 사용한다. 로그인 후 최초 변경 또는 허용 고객사명/준비 중 안내만 제공한다. 고객사 접근을 모두 해제하면 context/로그인 후 조회도 403이며 관리자만 다시 부여할 수 있다.
- 현재 코드의 기존 관리자/등록 API는 기본 역할 허용 목록에 company_manager를 추가하지 않는다. assessment는 기존 participant/counselor 허용 목록을 유지한다. 역할 기반 직접 API 거부와 직접 DB/RPC 차단을 각각 검증해야 한다. 노출된 미확인 테이블·RPC가 있다면 공개 금지이며 이 제안만으로 운영 보안 완료로 판정하지 않는다.
