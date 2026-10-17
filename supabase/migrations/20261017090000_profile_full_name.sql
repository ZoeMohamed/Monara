-- The User's own full name, asked for during onboarding. Categorization compares it
-- with a payment's recipient to tell a move between the User's own accounts from a
-- real expense. display_name stays what Google sent; full_name is what the User confirmed.
-- Null until the User answers. Only the backend writes it: authenticated keeps
-- select-only access to profiles.
alter table public.profiles
  add column full_name text
  constraint profiles_full_name_length
  check (full_name is null or char_length(btrim(full_name)) between 1 and 150);

comment on column public.profiles.full_name is
  'Full name the User confirmed during onboarding; used to recognise transfers to their own accounts.';
