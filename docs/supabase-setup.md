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
