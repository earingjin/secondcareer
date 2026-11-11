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
