-- AnimeBoxD signup email notifications
-- Run after deploying supabase/functions/admin-signup-email and setting function secrets.
-- Replace REPLACE_WITH_ADMIN_NOTIFY_SECRET with the same secret you set as ADMIN_NOTIFY_SECRET.

create extension if not exists pg_net with schema extensions;

create or replace function public.log_new_profile_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.admin_notifications (kind, title, body)
  values (
    'signup',
    'New user signup',
    coalesce(new.username, 'Anime fan') || coalesce(' joined with ' || new.email, ' joined AnimeBoxD')
  );

  perform net.http_post(
    url := 'https://gdzjvplgnuvbuszjwwcs.functions.supabase.co/admin-signup-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-admin-notify-secret', 'REPLACE_WITH_ADMIN_NOTIFY_SECRET'
    ),
    body := jsonb_build_object(
      'user_id', new.id,
      'username', new.username,
      'email', new.email,
      'created_at', new.created_at
    )
  );

  return new;
end;
$$;
