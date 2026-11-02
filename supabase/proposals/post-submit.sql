-- DEV-007B 제안: 사후진단 최종 제출 RPC (검토용 제안서)
--
-- 상태: 적용·실행·검증하지 않았다. 마이그레이션이 아니다.
-- 이 저장소에는 기준 DDL이 없으므로 아래 가정은 모두 격리 DB에서 확인해야 한다.
--   * public.participants(id, auth_user_id, organization_id)
--   * public.assessments(id, participant_id, phase, status, answers jsonb, updated_at,
--       submitted_at, schema_version) 와 (participant_id, phase) 유일 제약
--       (서버 코드가 23505 를 전제로 한다)
--   * public.assessment_history(assessment_id, action, before_data, after_data, created_at)
--       action 값에 CHECK 제약이 있으면 'post-submit' 이 거부될 수 있다.
--       기존 보고서는 action='edit' 만 읽으므로 새 값은 보고서에 섞이지 않는다.
--   * updated_at 에 자동 갱신 트리거가 있는지(없다고 가정하고 직접 갱신한다)
-- 서버(Edge Function)가 service_role 로만 호출한다. 일반 사용자 역할은 실행할 수 없다.
-- 검증 로직은 Edge Function 과 같은 규칙을 한 번 더 확인하는 최소 방어선이다.
-- (점수 범위·선택 개수 규칙 원본은 Edge Function 쪽이다. 규칙을 바꾸면 두 곳을 함께 고친다.)
--
-- 오류 코드 계약: 40001 버전 충돌, 55006 이미 제출됨(내용 다름), 42501 권한/사전 미제출.

create or replace function public.secondcareer_post_submit_v1(
  actor uuid,
  target uuid,
  answers jsonb,
  expected_updated_at text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_variable
declare
  part public.participants%rowtype;
  pre_row public.assessments%rowtype;
  post_row public.assessments%rowtype;
  expected timestamptz := expected_updated_at::timestamptz;
  now_ts timestamptz;
begin
  if actor is null or target is null or answers is null then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  if jsonb_typeof(answers->'post') <> 'array' or jsonb_array_length(answers->'post') <> 15 then
    raise exception 'invalid post answers' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(answers->'post') v
    where jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^[1-5]$'
  ) then
    raise exception 'invalid post answers' using errcode = '22023';
  end if;
  if jsonb_typeof(answers->'sat') <> 'object' then
    raise exception 'invalid satisfaction answers' using errcode = '22023';
  end if;

  -- 소유권: 호출자가 이 참여자 본인이어야 한다(클라이언트가 보낸 target 을 신뢰하지 않는다).
  select * into part from public.participants where id = target and auth_user_id = actor;
  if not found then
    raise exception 'not the participant' using errcode = '42501';
  end if;

  -- 같은 참여자의 제출을 직렬화한다.
  select * into pre_row from public.assessments
    where participant_id = part.id and phase = 'pre' for update;
  if not found or pre_row.status <> 'submitted' then
    raise exception 'pre-assessment not submitted' using errcode = '42501';
  end if;

  select * into post_row from public.assessments
    where participant_id = part.id and phase = 'post' for update;

  if found then
    if post_row.status = 'submitted' then
      -- 중복 제출: 같은 내용이면 기존 결과를 그대로 돌려주고, 다르면 거부한다. 새 행·이력 없음.
      if post_row.answers = answers then
        return jsonb_build_object('status', post_row.status, 'answers', post_row.answers,
          'updated_at', post_row.updated_at, 'submitted_at', post_row.submitted_at);
      end if;
      raise exception 'already submitted' using errcode = '55006';
    end if;
    if expected is null or post_row.updated_at is distinct from expected then
      raise exception 'version conflict' using errcode = '40001';
    end if;
    now_ts := greatest(clock_timestamp(), post_row.updated_at + interval '1 millisecond');
    update public.assessments
      set answers = answers, status = 'submitted', updated_at = now_ts, submitted_at = now_ts
      where id = post_row.id
      returning * into post_row;
  else
    if expected is not null then
      raise exception 'version conflict' using errcode = '40001';
    end if;
    now_ts := clock_timestamp();
    insert into public.assessments(participant_id, phase, status, answers, updated_at, submitted_at, schema_version)
      values (part.id, 'post', 'submitted', answers, now_ts, now_ts, 'sp-assessment-1')
      returning * into post_row;
  end if;

  insert into public.assessment_history(assessment_id, action, before_data, after_data)
    values (post_row.id, 'post-submit', null, jsonb_build_object('answers', post_row.answers));

  return jsonb_build_object('status', post_row.status, 'answers', post_row.answers,
    'updated_at', post_row.updated_at, 'submitted_at', post_row.submitted_at);
end;
$$;

-- 일반 사용자 역할은 호출할 수 없다. 서버(service_role)만 실행한다.
revoke all on function public.secondcareer_post_submit_v1(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.secondcareer_post_submit_v1(uuid, uuid, jsonb, text) to service_role;
