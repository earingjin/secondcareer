-- DEV-014 제안: 상담사의 사후진단 허용(승인) 저장과 승인 RPC (검토용 제안서)
--
-- 상태: 적용·실행·검증하지 않았다. 마이그레이션이 아니다. 격리 테스트 DB 에서 먼저 적용한다.
--
-- 적용 순서(같은 세션에서 연달아):
--   1. 이 파일                 — post_approvals 테이블, 최초 1회 백필, secondcareer_post_approve_v1
--   2. post-draft.sql          — 초안 저장 RPC 에 승인 검사 추가(create or replace)
--   3. post-submit.sql         — 최종 제출 RPC 에 승인 검사 추가(create or replace)
--   4. Edge Function secondcareer-assessment 재배포
-- 2·3 을 이 파일보다 먼저 적용하면 테이블이 없어 사후 쓰기가 모두 실패한다(열리지 않고 닫힌다).
-- 1 과 2 사이에 기존 RPC 로 새로 생긴 사후 초안은 미승인으로 남는다. 데이터는 그대로이며 상담사가 허용하면 이어서 작성한다.
--
-- 정책:
--   - 허용은 내담자당 한 행이며 취소하지 않는다. service_role 에도 UPDATE·DELETE 를 주지 않는다.
--   - source='counselor' 는 담당 상담사가 실행한 허용(approved_by 필수),
--     source='backfill'  는 이 정책 적용 이전에 이미 사후 기록(초안·제출)이 있던 내담자(approved_by 없음).
--   - 백필은 테이블을 이 실행에서 새로 만든 경우에만 한다. 다시 실행하면 테이블이 있으므로 백필하지 않고,
--     기존 승인·응답 데이터도 바꾸지 않는다(create or replace·revoke·grant 만 다시 적용된다).
--   - 사후 응답(assessments)은 읽기만 하고 바꾸지 않는다.
--
-- 오류 코드 계약(post-draft.sql·post-submit.sql 과 같다):
--   22023 → 400 / 42501 권한·담당 아님·사전 미제출 → 403 / 55006 사후 이미 제출 → 409 LOCKED

begin;

do $$
begin
  if pg_catalog.to_regclass('public.post_approvals') is null then
    create table public.post_approvals (
      participant_id uuid primary key references public.participants(id),
      approved_by uuid,
      source text not null check (source in ('counselor', 'backfill')),
      approved_at timestamptz not null,
      constraint post_approvals_source_actor check ((source = 'counselor') = (approved_by is not null))
    );
    -- 백필 중 기존 RPC 의 사후 쓰기가 끼어들지 않게 한다(이 트랜잭션이 끝날 때 풀린다).
    lock table public.assessments in share mode;
    insert into public.post_approvals(participant_id, approved_by, source, approved_at)
      select distinct a.participant_id, null::uuid, 'backfill', pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
      from public.assessments a
      where a.phase = 'post';
  end if;
end;
$$;

-- 브라우저 역할(anon·authenticated)은 직접 읽거나 쓰지 못한다. 정책 없는 RLS 로 Data API 접근을 막는다.
alter table public.post_approvals enable row level security;
revoke all on table public.post_approvals from public, anon, authenticated, service_role;
grant select, insert on table public.post_approvals to service_role;

create or replace function public.secondcareer_post_approve_v1(
  actor uuid,
  target uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_variable
declare
  me public.user_profiles%rowtype;
  part public.participants%rowtype;
  pre_status text;
  post_status text;
  approval public.post_approvals%rowtype;
begin
  if actor is null or target is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  -- 권한: 같은 조직의 상담사이며 이 내담자의 담당 상담사여야 한다.
  select * into me from public.user_profiles where user_id = actor;
  select * into part from public.participants where id = target for share;
  if me.user_id is null or part.id is null or me.role is distinct from 'counselor'
     or part.counselor_user_id is distinct from actor or me.organization_id is distinct from part.organization_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- 사후 초안·제출 RPC 와 같은 잠금 키로 직렬화한다.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text || ':post', 0));

  -- 중복 허용: 기존 행을 그대로 돌려준다. 새 행·변경 없음.
  select * into approval from public.post_approvals where participant_id = target;
  if approval.participant_id is not null then
    return pg_catalog.jsonb_build_object('approved_at', approval.approved_at, 'source', approval.source);
  end if;

  select status into pre_status from public.assessments
    where participant_id = target and phase = 'pre' for share;
  if pre_status is distinct from 'submitted' then
    raise exception 'PRE_REQUIRED' using errcode = '42501';
  end if;
  select status into post_status from public.assessments
    where participant_id = target and phase = 'post' for share;
  if post_status = 'submitted' then
    raise exception 'LOCKED' using errcode = '55006';
  end if;

  insert into public.post_approvals(participant_id, approved_by, source, approved_at)
    values (target, actor, 'counselor', pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()))
    returning * into approval;

  return pg_catalog.jsonb_build_object('approved_at', approval.approved_at, 'source', approval.source);
end;
$$;

revoke all on function public.secondcareer_post_approve_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.secondcareer_post_approve_v1(uuid, uuid) to service_role;
-- Data API(PostgREST) 가 새 RPC·테이블을 인식하도록 스키마 캐시를 갱신한다(커밋 시 전달).
notify pgrst, 'reload schema';

commit;

-- 적용 후 확인(격리 DB): 권한은 모두 false, RLS 는 true, 백필 행 수는 기존 사후 기록이 있는 내담자 수와 같아야 한다.
-- select has_table_privilege('anon', 'public.post_approvals', 'select,insert,update,delete'),
--        has_table_privilege('authenticated', 'public.post_approvals', 'select,insert,update,delete'),
--        has_table_privilege('service_role', 'public.post_approvals', 'update,delete'),
--        has_function_privilege('anon', 'public.secondcareer_post_approve_v1(uuid,uuid)', 'execute'),
--        has_function_privilege('authenticated', 'public.secondcareer_post_approve_v1(uuid,uuid)', 'execute');
-- select relrowsecurity from pg_class where oid = 'public.post_approvals'::regclass;
-- select source, count(*) from public.post_approvals group by 1;
-- select count(distinct participant_id) from public.assessments where phase = 'post';
