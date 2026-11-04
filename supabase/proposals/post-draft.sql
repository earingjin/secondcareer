-- DEV-009B-1 제안: 사후진단 초안 저장 RPC (검토용 제안서)
--
-- 상태: 적용·실행·검증하지 않았다. 마이그레이션이 아니다. 격리 테스트 DB 에서만 먼저 적용한다.
-- 함께 적용: supabase/proposals/post-submit.sql
-- DEV-014: post_approvals 테이블이 필요하다. post-approval.sql 을 먼저 적용한다(적용 순서는 그 파일 머리말).
--
-- 목적: 기존 Edge Function 은 사전 제출 확인(조회)과 사후 쓰기를 별도 요청으로 했다(DEV-009A R-E1).
-- 이 함수는 역할·조직·본인·사전 제출 확인, 버전 비교, 쓰기, 이력 기록을 한 트랜잭션에서 한다.
-- 초안 저장마다 이력을 남기는 것은 사전 초안(write_v1)과 같은 정책이다(R-E2).
--
-- 입력 검사 범위: 형식(객체·15칸·각 칸 null 또는 1~5·sat 객체)만 본다.
-- 만족도 보기·개수·중복·200자 규칙의 원본은 Edge Function 이다.
--
-- 오류 코드 계약은 post-submit.sql 과 같다:
--   22023 → 400 / 42501 → 403 / 40001 → 409 CONFLICT / 55006 → 409 LOCKED(이미 제출됨)

begin;

create or replace function public.secondcareer_post_draft_v1(
  actor uuid,
  target uuid,
  answers jsonb,
  expected_updated_at text
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
  post_row public.assessments%rowtype;
  expected timestamptz;
  now_ts timestamptz;
  before_answers jsonb;
begin
  -- 입력 형식. 단계별 IF 로 나눈다: SQL 의 OR 는 평가 순서가 보장되지 않아, 형식 확인 전에
  -- jsonb_array_length·jsonb_object_keys 가 배열·객체가 아닌 값에 실행되어 다른 오류가 날 수 있다.
  -- NULL 은 모두 거부한다(is distinct from).
  if actor is null or target is null or pg_catalog.jsonb_typeof(answers) is distinct from 'object' then
    raise exception 'INVALID_ANSWERS' using errcode = '22023';
  end if;
  if exists (select 1 from pg_catalog.jsonb_object_keys(answers) as t(k) where t.k not in ('post', 'sat'))
     or pg_catalog.jsonb_typeof(answers->'post') is distinct from 'array' then
    raise exception 'INVALID_ANSWERS' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(answers->'post') is distinct from 15 then
    raise exception 'INVALID_ANSWERS' using errcode = '22023';
  end if;
  if exists (
       select 1 from pg_catalog.jsonb_array_elements(answers->'post') as e(v)
       where pg_catalog.jsonb_typeof(e.v) is distinct from 'null'
         and (pg_catalog.jsonb_typeof(e.v) is distinct from 'number' or (e.v #>> '{}') !~ '^[1-5]$')
     )
     or (answers ? 'sat' and pg_catalog.jsonb_typeof(answers->'sat') is distinct from 'object') then
    raise exception 'INVALID_ANSWERS' using errcode = '22023';
  end if;
  begin
    expected := expected_updated_at::timestamptz;
  exception when others then
    raise exception 'INVALID_VERSION' using errcode = '22023';
  end;

  select * into me from public.user_profiles where user_id = actor;
  select * into part from public.participants where id = target for share;
  if me.user_id is null or part.id is null or me.role is distinct from 'participant'
     or part.auth_user_id is distinct from actor or me.organization_id is distinct from part.organization_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text || ':post', 0));

  select status into pre_status from public.assessments
    where participant_id = target and phase = 'pre' for share;
  if pre_status is distinct from 'submitted' then
    raise exception 'PRE_REQUIRED' using errcode = '42501';
  end if;
  -- DEV-014: 담당 상담사의 사후진단 허용(post-approval.sql) 이 있어야 한다. 허용은 취소되지 않는다.
  if not exists (select 1 from public.post_approvals where participant_id = target) then
    raise exception 'POST_NOT_APPROVED' using errcode = '42501';
  end if;

  select * into post_row from public.assessments
    where participant_id = target and phase = 'post' for update;

  if post_row.id is not null and post_row.status is distinct from 'draft' then
    raise exception 'LOCKED' using errcode = '55006';
  end if;
  -- 같은 내용 재저장은 버전과 무관하게 현재 행을 돌려준다(Edge Function 의 기존 멱등 규칙).
  if post_row.id is not null and post_row.answers = answers then
    return pg_catalog.jsonb_build_object('status', post_row.status, 'answers', post_row.answers,
      'updated_at', post_row.updated_at, 'submitted_at', post_row.submitted_at);
  end if;
  if (post_row.id is not null and post_row.updated_at is distinct from expected)
     or (post_row.id is null and expected is not null) then
    raise exception 'CONFLICT' using errcode = '40001';
  end if;

  now_ts := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if post_row.id is not null then
    now_ts := greatest(now_ts, post_row.updated_at + interval '1 millisecond');
    before_answers := post_row.answers;
    update public.assessments set answers = answers, updated_at = now_ts
      where id = post_row.id
      returning * into post_row;
  else
    insert into public.assessments(participant_id, phase, status, answers, updated_at, schema_version)
      values (target, 'post', 'draft', answers, now_ts, 'sp-assessment-1')
      returning * into post_row;
  end if;

  insert into public.assessment_history(assessment_id, actor_user_id, action, before_data, after_data)
    values (post_row.id, actor, 'post-draft',
      case when before_answers is not null then pg_catalog.jsonb_build_object('answers', before_answers) end,
      pg_catalog.jsonb_build_object('answers', post_row.answers));

  return pg_catalog.jsonb_build_object('status', post_row.status, 'answers', post_row.answers,
    'updated_at', post_row.updated_at, 'submitted_at', post_row.submitted_at);
end;
$$;

revoke all on function public.secondcareer_post_draft_v1(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.secondcareer_post_draft_v1(uuid, uuid, jsonb, text) to service_role;
-- Data API(PostgREST) 가 새 RPC 를 인식하도록 스키마 캐시를 갱신한다(커밋 시 전달).
notify pgrst, 'reload schema';

commit;

-- 적용 후 확인(격리 DB): 아래가 모두 false 여야 한다.
-- select has_function_privilege('anon', 'public.secondcareer_post_draft_v1(uuid,uuid,jsonb,text)', 'execute'),
--        has_function_privilege('authenticated', 'public.secondcareer_post_draft_v1(uuid,uuid,jsonb,text)', 'execute');
