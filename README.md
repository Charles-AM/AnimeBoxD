# AnimeBoxD

AnimeBoxD is a Letterboxd-style anime and manga tracker built with React, Vite, and TypeScript.

## Features

- Search anime, manga, manhwa, and light novels with Jikan (MyAnimeList) data
- Track watch/read status, ratings, favorites, and personal notes
- Create reviews, diary-style entries, and custom lists
- View dashboard insights and activity visualizations
- Toggle light/dark theme and personalize profile settings
- Use local demo mode or connect Supabase for cloud accounts and synced data

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Recharts + react-calendar-heatmap
- Supabase (optional backend/auth)

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Run the app

```bash
npm run dev
```

The app runs on the local Vite development server.

## Environment Variables

Create a `.env` file from `.env.example`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_SITE_URL=https://animeboxd.app/
```

If Supabase variables are not provided, AnimeBoxD falls back to local demo account behavior.

For full backend setup, see:

- [`docs/supabase-setup.md`](docs/supabase-setup.md)

## Available Scripts

- `npm run dev` — start local development server
- `npm run build` — type-check and build production assets
- `npm run preview` — preview the production build locally

## Credits

Anime and manga metadata is sourced via Jikan/MyAnimeList references. All third-party titles, artwork, and trademarks belong to their respective owners.
