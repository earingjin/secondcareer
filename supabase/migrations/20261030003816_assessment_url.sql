alter table public.organizations
  add column assessment_url text;

alter table public.organizations
  add constraint organizations_assessment_url_https
  check (assessment_url is null or btrim(assessment_url) = '' or
    assessment_url ~* '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$');
