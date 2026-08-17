-- AnimeBoxD: notify admins when someone submits a favorite pick
-- Run this in Supabase SQL Editor after favorite_picks.sql and
-- signup_email_notifications.sql (reuses the same admin_notify_secret
-- from Vault and the same admin-signup-email edge function — no new
-- secret or function needed on the database side).

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

create or replace function public.log_new_favorite_pick_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_notify_secret text;
  v_display_name text;
begin
  select username into v_display_name
  from public.profiles
  where id = new.user_id;

  v_display_name := coalesce(v_display_name, 'Someone browsing');

  insert into public.admin_notifications (kind, title, body)
  values (
    'favorite_pick',
    'New favorite pick',
    v_display_name || ' picked ' || new.title || ' (' || new.media_type || '): "' || new.reason || '"'
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
        'kind', 'favorite_pick',
        'display_name', v_display_name,
        'title', new.title,
        'media_type', new.media_type,
        'reason', new.reason,
        'created_at', new.created_at
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function public.log_new_favorite_pick_notification() from public;

drop trigger if exists notify_admin_new_favorite_pick on public.favorite_picks;
create trigger notify_admin_new_favorite_pick
after insert on public.favorite_picks
for each row execute function public.log_new_favorite_pick_notification();
