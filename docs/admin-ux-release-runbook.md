# 관리자 UX 1~3차 운영 반영 절차

아래 절차는 승인된 운영 반영 시 적용한다. 기준은 `feat/admin-ux-improvement`의 `b385b7dde0246efbf7ee7f5d2da898d282e2a79f` 위 통합 검증 작업본이다.

1. **운영 대상 확인.** Supabase 운영 프로젝트와 Vercel 프로젝트가 이번 서비스의 대상인지 확인한다. 현재 Vercel 운영 배포의 ID·커밋·운영 도메인을 기록하고 복구할 수 있는 배포인지 확인한다. 운영 Supabase에서 `SECONDCAREER_PUBLIC_INTAKE_ALLOWED_ORIGINS`가 `https://secondcareer.vercel.app`을 포함하는지 승인된 운영자가 확인한다. 사용자 등록 보고와 실제 적용 확인을 별도로 기록한다. `SECONDCAREER_PUBLIC_INTAKE_ENABLED`, 링크 행의 조직·활성 여부·만료, 해당 조직의 `organizations.assessment_url`도 확인한다. [Supabase 환경변수](https://supabase.com/docs/guides/functions/secrets)
2. **신규 함수 단독 배포.** 승인된 커밋에서 `supabase functions deploy secondcareer-admin-public-intake-links --project-ref <운영-project-ref>`로 대상 함수만 배포한다. `supabase/config.toml`의 `verify_jwt = true`가 적용됐는지 확인한다. [Supabase 함수 배포](https://supabase.com/docs/guides/functions/deploy)
3. **함수 확인.** 기존 승인 계정과 기존 데이터로 OPTIONS와 GET을 확인한다. 브라우저에서 보내는 사용자 JWT로 관리자의 본인 조직 결과만 반환되는지 확인한다. 비로그인 요청과 잘못된 JWT는 401, 유효한 타 역할 JWT와 비밀번호 변경 필요 계정은 403이어야 한다. 임의 조직 파라미터는 400이어야 한다. 실제 세션 만료와 gateway 설정 문제를 구분할 때는 같은 세션으로 기존 `secondcareer-account` GET과 신규 GET의 상태를 대조하고 함수 호출 로그에 요청이 도달했는지 확인한다. 검증 기록에는 사용자 JWT나 접근 토큰을 남기지 않는다. [Supabase Authorization 헤더와 JWT 검증](https://supabase.com/docs/guides/functions/auth-headers)
4. **실제 링크 확인.** 신규 응답의 `baseUrl`, `intakeEnabled`, `serverTime`, 링크별 `enabled`와 만료를 대조한다. 복사가 허용된 URL의 origin과 `entry=pre` 및 `linkId`를 확인한다. 확인 단계에서 URL을 복사만 한다. 실제 설문을 열면 임시 접수 행이 생성될 수 있으므로 운영 데이터 검증은 쓰기가 발생하지 않는 경로에서 수행한다.
5. **프런트엔드 검증·배포.** Vercel 프로젝트의 빌드 명령 `npm run build`, 출력 디렉터리 `dist`와 운영 브랜치 설정을 확인한다. 승인된 커밋의 빌드·자산 검사를 대조하고 출시 후보에서 관리자 로그인, 대시보드·내담자 관리, 링크 상태·복사, 고객사 탭 및 보고서 진입을 확인한다. 승인 후 연결된 운영 브랜치의 배포 또는 승인된 후보 승격을 사용하고, Vercel에서 실제 운영 도메인이 제공하는 커밋을 확인한다. 운영 배포 연결 후 동일한 읽기·복사 점검을 다시 수행한다. [Vercel 배포 승격](https://vercel.com/docs/deployments/promoting-a-deployment)
6. **장애 복구.** Vercel 프로젝트의 Production Deployment에서 **Instant Rollback**을 열고 1단계에서 기록한 정상 배포를 선택한다. 복구 후 운영 도메인이 직전 프런트엔드를 제공하는지 확인하고 관리자 로그인, 고객사 운영, 기존 계정 기반 진단 진입을 확인한다. 신규 함수가 독립적으로 장애를 유발하면 해당 함수만 운영 담당자에게 격리 요청한다. [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)

로컬 통합 회귀와 산출물 검증은 운영 배포 전 증거다. 실제 프로젝트의 변수, gateway, 조직 경계와 URL 확인이 완료되어야 운영 반영을 승인할 수 있다.
