-- DEV-009B-2 읽기 전용 카탈로그 점검 (사후진단 적용 전)
--
-- 목적: 운영 DB 가 사후 RPC 제안(post-draft.sql, post-submit.sql)과 R-P1 변경안의 전제와 맞는지 확인한다.
-- 성격: 시스템 카탈로그만 조회한다. 응용 테이블의 행(고객·응답 데이터)은 읽지 않는다.
--       읽기 전용 트랜잭션 안에서 실행하고 rollback 으로 끝난다. 쓰기·DDL 은 시도해도 실패한다.
-- 실행: Supabase 대시보드 SQL Editor 또는 psql 에서 사람이 직접 실행한다.
-- 결과 취급: 결과에는 운영 정책·함수 정의 정보가 포함되므로 공개 저장소·이슈·채팅에 붙이지 않는다.
--           로컬 비공개 파일(docs/dev-009b/*.local.md)에만 저장한다.

begin transaction read only;

-- 0. 접속 대상 식별(프로젝트 확인용). 값은 공유하지 않는다.
select current_database() as db, current_user as login_role, version() as server_version,
       current_setting('transaction_read_only') as read_only;

-- 1. 응용 테이블 열 구성
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default, is_identity
from information_schema.columns
where table_schema = 'public'
  and table_name in ('organizations','user_profiles','participants','assessments','assessment_history')
order by table_name, ordinal_position;

-- 2. 제약 조건(유일·CHECK·FK)
select c.conrelid::regclass as table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid in ('public.participants'::regclass, 'public.assessments'::regclass, 'public.assessment_history'::regclass,
                     'public.user_profiles'::regclass)
order by 1, 2;

-- 3. 사용자 정의 트리거(updated_at 자동 갱신 여부 등)
select tgrelid::regclass as table_name, tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
where not tgisinternal
  and tgrelid in ('public.participants'::regclass, 'public.assessments'::regclass, 'public.assessment_history'::regclass,
                  'public.user_profiles'::regclass);

-- 4. 관련 함수: 보안 모드·search_path·소유자·본문 해시(본문 자체는 출력하지 않는다)
select n.nspname as schema, p.proname, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer, p.proconfig as settings, pg_get_userbyid(p.proowner) as owner,
       md5(p.prosrc) as body_md5, length(p.prosrc) as body_length
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname like 'secondcareer%')
   or n.nspname = 'secondcareer_registration_private'
order by 1, 2;

-- 5. 새 RPC 이름이 비어 있는지(둘 다 0 이어야 적용 가능)
select count(*) filter (where proname = 'secondcareer_post_draft_v1') as post_draft_exists,
       count(*) filter (where proname = 'secondcareer_post_submit_v1') as post_submit_exists
from pg_proc where pronamespace = 'public'::regnamespace;

-- 6. 기존 RPC 실행 권한
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'secondcareer%';

-- 7. 함수 기본 권한(새 함수가 생성 즉시 누구에게 열리는지)
select pg_get_userbyid(d.defaclrole) as owner_role, d.defaclnamespace::regnamespace as schema, d.defaclobjtype, d.defaclacl
from pg_default_acl d where d.defaclobjtype = 'f';

-- 8. RLS 활성 여부와 정책 목록
select relname, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('organizations','user_profiles','participants','assessments','assessment_history')
order by 1;
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- 9. R-P1 관련: authenticated/anon 의 assessments 직접 조회 권한
select r.rolname,
       has_table_privilege(r.rolname, 'public.assessments', 'select') as table_select,
       has_column_privilege(r.rolname, 'public.assessments', 'answers', 'select') as answers_select,
       has_column_privilege(r.rolname, 'public.assessments', 'status', 'select') as status_select
from pg_roles r where r.rolname in ('anon', 'authenticated');

-- 10. service_role 이 RLS 를 우회하는지(초안·제출 RPC 는 SECURITY INVOKER 로 service_role 권한에 의존)
select rolname, rolbypassrls from pg_roles where rolname in ('service_role', 'authenticated', 'anon');
select has_table_privilege('service_role', 'public.assessments', 'insert,update,select') as service_role_assessments,
       has_table_privilege('service_role', 'public.assessment_history', 'insert') as service_role_history,
       has_sequence_privilege('service_role', 'public.assessment_history_id_seq', 'usage') as service_role_history_seq;

-- 11. Data API 노출 스키마(authenticator 설정; 대시보드 설정과 다를 수 있음)
select rolname, rolconfig from pg_roles where rolname = 'authenticator';

-- 12. (선택·집계만) 사후 행 존재 여부. 행 내용은 읽지 않는다. 필요할 때만 주석을 풀어 실행한다.
-- select phase, status, count(*) from public.assessments group by 1, 2 order by 1, 2;

rollback;
