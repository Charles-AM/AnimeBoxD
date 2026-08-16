-- AnimeBoxD signup email notifications
-- Run after deploying supabase/functions/admin-signup-email and setting function secrets.
--
-- The admin-notify secret is stored in Supabase Vault instead of being pasted as
-- plaintext into this function body, so it never ends up committed to git or sitting
-- in cleartext in pg_proc / migration history.
--
-- One-time setup (run once in the SQL editor, then discard the query from your history):
--   select vault.create_secret('<your-long-random-secret>', 'admin_notify_secret');
-- This must be the SAME value configured as the ADMIN_NOTIFY_SECRET env var on the
-- admin-signup-email edge function (supabase secrets set ADMIN_NOTIFY_SECRET=...).

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

create or replace function public.log_new_profile_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_notify_secret text;
begin
  insert into public.admin_notifications (kind, title, body)
  values (
    'signup',
    'New user signup',
    coalesce(new.username, 'Anime fan') || coalesce(' joined with ' || new.email, ' joined AnimeBoxD')
  );

  select decrypted_secret into v_notify_secret
  from vault.decrypted_secrets
  where name = 'admin_notify_secret'
  limit 1;

  if v_notify_secret is not null then
    perform net.http_post(
      url := 'https://gdzjvplgnuvbuszjwwcs.functions.supabase.co/admin-signup-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-admin-notify-secret', v_notify_secret
      ),
      body := jsonb_build_object(
        'user_id', new.id,
        'username', new.username,
        'email', new.email,
        'created_at', new.created_at
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function public.log_new_profile_notification() from public;
