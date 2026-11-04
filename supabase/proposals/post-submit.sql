-- DEV-007B 제안, DEV-009B-1 보완: 사후진단 최종 제출 RPC (검토용 제안서)
--
-- 상태: 적용·실행·검증하지 않았다. 마이그레이션이 아니다. 격리 테스트 DB 에서만 먼저 적용한다.
-- 함께 적용: supabase/proposals/post-draft.sql (같은 잠금 키·오류 코드 계약을 쓴다)
-- DEV-014: post_approvals 테이블이 필요하다. post-approval.sql 을 먼저 적용한다(적용 순서는 그 파일 머리말).
--
-- 전제(DEV-009A 대조로 확인, 실제 DB 동작은 미검증):
--   assessments(participant_id, phase) UNIQUE, status='submitted' 이면 submitted_at NOT NULL,
--   assessment_history(assessment_id, actor_user_id, action, before_data, after_data), action 에 CHECK 없음,
--   updated_at 자동 갱신 트리거 없음.
--
-- 호출 경계: Edge Function 이 Auth 로 확인한 사용자 id 를 actor 로 넘긴다. service_role 만 실행한다.
-- 함수 안에서 역할·조직·본인·사전 제출을 다시 확인하므로 Edge Function 검사가 빠져도 남의 행을 쓰지 못한다.
-- (service_role 키를 가진 쪽은 actor 를 임의로 넘길 수 있다. 그 키는 Edge Function 비밀 설정에만 둔다.)
--
-- 오류 코드 계약(Edge Function 응답):
--   22023 입력 형식 오류 → 400 / 42501 권한·사전 미제출 → 403 /
--   40001 버전 충돌 → 409 CONFLICT / 55006 이미 제출됨(내용 다름) → 409 LOCKED

begin;

create or replace function public.secondcareer_post_submit_v1(
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
       where pg_catalog.jsonb_typeof(e.v) is distinct from 'number' or (e.v #>> '{}') !~ '^[1-5]$'
     )
     or pg_catalog.jsonb_typeof(answers->'sat') is distinct from 'object' then
    raise exception 'INVALID_ANSWERS' using errcode = '22023';
  end if;
  -- 만족도 필수 문항이 모두 있는지만 확인한다. 보기·개수 규칙은 Edge Function 이 원본이다.
  if not (answers->'sat') ?& array['q1','q2','q3a','q3b','q3c','q5fit','d32','d33','d34','d35','q7'] then
    raise exception 'INVALID_ANSWERS' using errcode = '22023';
  end if;
  begin
    expected := expected_updated_at::timestamptz;
  exception when others then
    raise exception 'INVALID_VERSION' using errcode = '22023';
  end;

  -- 권한: write_v1 과 같은 기준(역할·조직·본인).
  select * into me from public.user_profiles where user_id = actor;
  select * into part from public.participants where id = target for share;
  if me.user_id is null or part.id is null or me.role is distinct from 'participant'
     or part.auth_user_id is distinct from actor or me.organization_id is distinct from part.organization_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- 같은 참여자의 사후 쓰기(초안·제출)를 직렬화한다. write_v1 의 ':pre' 키와 겹치지 않는다.
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

  if post_row.id is not null and post_row.status = 'submitted' then
    -- 중복 제출: 같은 내용이면 기존 결과를 그대로 돌려준다. 새 행·이력 없음.
    if post_row.answers = answers then
      return pg_catalog.jsonb_build_object('status', post_row.status, 'answers', post_row.answers,
        'updated_at', post_row.updated_at, 'submitted_at', post_row.submitted_at);
    end if;
    raise exception 'LOCKED' using errcode = '55006';
  end if;
  if (post_row.id is not null and post_row.updated_at is distinct from expected)
     or (post_row.id is null and expected is not null) then
    raise exception 'CONFLICT' using errcode = '40001';
  end if;

  -- 밀리초로 맞춘다. 기존 초안 버전 문자열과 비교가 어긋나지 않게 한다.
  now_ts := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if post_row.id is not null then
    now_ts := greatest(now_ts, post_row.updated_at + interval '1 millisecond');
    before_answers := post_row.answers;
    update public.assessments
      set answers = answers, status = 'submitted', updated_at = now_ts, submitted_at = now_ts
      where id = post_row.id
      returning * into post_row;
  else
    insert into public.assessments(participant_id, phase, status, answers, updated_at, submitted_at, schema_version)
      values (target, 'post', 'submitted', answers, now_ts, now_ts, 'sp-assessment-1')
      returning * into post_row;
  end if;

  insert into public.assessment_history(assessment_id, actor_user_id, action, before_data, after_data)
    values (post_row.id, actor, 'post-submit',
      case when before_answers is not null then pg_catalog.jsonb_build_object('answers', before_answers) end,
      pg_catalog.jsonb_build_object('answers', post_row.answers));

  return pg_catalog.jsonb_build_object('status', post_row.status, 'answers', post_row.answers,
    'updated_at', post_row.updated_at, 'submitted_at', post_row.submitted_at);
end;
$$;

-- 공개 기본 권한으로 실행되는 순간이 없도록 같은 트랜잭션에서 회수한다.
revoke all on function public.secondcareer_post_submit_v1(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.secondcareer_post_submit_v1(uuid, uuid, jsonb, text) to service_role;
-- Data API(PostgREST) 가 새 RPC 를 인식하도록 스키마 캐시를 갱신한다(커밋 시 전달).
notify pgrst, 'reload schema';

commit;

-- 적용 후 확인(격리 DB): 아래가 모두 false 여야 한다.
-- select has_function_privilege('anon', 'public.secondcareer_post_submit_v1(uuid,uuid,jsonb,text)', 'execute'),
--        has_function_privilege('authenticated', 'public.secondcareer_post_submit_v1(uuid,uuid,jsonb,text)', 'execute');
