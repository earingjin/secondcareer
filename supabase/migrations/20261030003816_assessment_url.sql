alter table public.organizations
  add column assessment_url text;

alter table public.organizations
  add constraint organizations_assessment_url_https
  check (assessment_url is null or assessment_url ~ '^[[:space:]]*$' or (
    length(assessment_url) <= 2048 and
    assessment_url ~* $url$^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?(:[0-9]{1,5})?(/([a-z0-9._~!$&'()*+,;=:@/-]|%[a-f0-9]{2})*)?$$url$ and
    coalesce(substring(lower(assessment_url) from '^https://[^/]+:([0-9]{1,5})(/|$)')::integer, 0) <= 65535
  ));
