# AnimeBoxD Supabase Setup

This is the first backend step for real user accounts and cloud-saved libraries.

## 1. Create a Supabase project

Create a project at https://supabase.com and copy:

- Project URL
- Anon public key

## 2. Create the database tables

Open the Supabase SQL editor, paste the full contents of `supabase/schema.sql`, and run it.

## 3. Add environment variables

For local development, create `.env` from `.env.example`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_SITE_URL=https://animeboxd.app/
```

Use only the Supabase project root URL for `VITE_SUPABASE_URL`. Do not use a URL ending in `/rest/v1`, `/auth/v1`, or any other path.

For Netlify, add the same two values in:

Site configuration > Environment variables

Also add:

```env
VITE_SITE_URL=https://animeboxd.app/
```

Then redeploy the site.

## 4. Configure Auth URLs

In Supabase:

Authentication > URL Configuration

Set the Site URL to your Netlify URL. Add the same URL to Redirect URLs.

For production, use:

- `https://animeboxd.app`
- `https://animeboxd.app/`
- `https://www.animeboxd.app`
- `https://www.animeboxd.app/`
- `https://animebox-d.netlify.app`
- `https://animebox-d.netlify.app/`

## 5. Current backend behavior

- If Supabase keys are present, AnimeBoxD uses real email/password accounts.
- Libraries, manga, reviews, lists, diary entries, dashboard settings, and favorites save to Supabase.
- Reports are saved to Supabase and still submitted to `vmb4manager@gmail.com`.
- If Supabase keys are missing, the app keeps using local demo accounts so development does not break.

## Next Backend Steps

- Add admin dashboard screens for signups, activity, and reports.
- Move public community reviews/activity from mock data to database tables.
- Add analytics, privacy pages, and AdSense-ready consent/legal pages.

## Admin signup email notifications

AnimeBoxD includes a Supabase Edge Function at `supabase/functions/admin-signup-email`.
It sends `vmb4manager@gmail.com` an email when a new user profile is created.

Deploy it from the project root:

```bash
supabase functions deploy admin-signup-email --no-verify-jwt
```

Set secrets in Supabase:

```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set ADMIN_EMAIL=vmb4manager@gmail.com
supabase secrets set ADMIN_EMAIL_FROM="AnimeBoxD <no-reply@mail.animeboxd.app>"
supabase secrets set ADMIN_NOTIFY_SECRET=use-a-long-random-secret-here
```

Then open `supabase/signup_email_notifications.sql`, replace `REPLACE_WITH_ADMIN_NOTIFY_SECRET` with the same `ADMIN_NOTIFY_SECRET`, and run it in Supabase SQL Editor.

Keep the Resend API key in Supabase secrets only. Do not add it to Netlify or frontend environment variables.
