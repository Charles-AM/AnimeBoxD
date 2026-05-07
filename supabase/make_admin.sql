-- Make your own AnimeBoxD account an admin.
-- Run this after schema.sql.
-- Replace the email below with the email you use to sign in to AnimeBoxD.

update public.profiles
set
  is_admin = true,
  email = auth.users.email
from auth.users
where public.profiles.id = auth.users.id
  and auth.users.email = 'YOUR-LOGIN-EMAIL@example.com';

select id, email, username, is_admin
from public.profiles
where is_admin = true;
