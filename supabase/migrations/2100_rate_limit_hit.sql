-- 2100: atomic fixed-window counter used by lib/security/rate-limit.ts through RateLimitRepository.hit.
-- One upsert per call, so concurrent requests cannot lose a count. Service role only.
-- Applied to the Supabase project as migration ai2_2100_rate_limit_hit.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer)
returns table (count integer, window_ends_at timestamptz)
language plpgsql security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
begin
  if p_key is null or char_length(p_key) < 1 or char_length(p_key) > 200
     or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'invalid rate limit input' using errcode = 'GG001';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  return query
    insert into public.rate_limits as r (key, window_start, window_ends_at, count)
    values (p_key, v_start, v_start + make_interval(secs => p_window_seconds), 1)
    on conflict (key, window_start) do update set count = r.count + 1
    returning r.count, r.window_ends_at;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer) to service_role;
