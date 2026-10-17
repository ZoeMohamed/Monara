-- Auto-confirm only highly certain Gmail transactions. The score is necessary,
-- but never sufficient: the current ingestion function also requires an
-- authenticated sender, a complete IDR transaction, and one unambiguous active
-- Financial Account owned by the User.
create or replace function public.gmail_auto_confirm_confidence()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 0.95::numeric $$;

-- The original overload predates sender authentication and therefore cannot
-- prove that the message came from a registered institution. All production
-- ingestion uses the five-argument overload below, which receives that result
-- from the Gmail adapter.
drop function public.record_gmail_extraction(uuid, text, jsonb);

comment on function public.gmail_auto_confirm_confidence() is
  'Minimum normalized extraction confidence for Gmail auto-confirm; all deterministic ingestion guards must also pass.';

