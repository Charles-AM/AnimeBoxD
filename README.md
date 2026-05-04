# Animeboxd

A complete Letterboxd-style anime tracker built with React 18, Vite, TypeScript, Tailwind CSS, Lucide React, Recharts, react-calendar-heatmap, the Jikan API v4, and localStorage.

## Features

- Search Jikan and add anime to a local library
- Track status, rating, progress, rewatches, dates, notes, tags, and priority
- Write spoiler-aware reviews with helpful counts and nested comments
- Create default and custom lists with drag-and-drop ordering and hash share links
- Log diary entries with date, episode range, rating, review, heatmap, streaks, and lifetime hours
- View statistics charts for ratings, statuses, genres, studios, monthly activity, decades, completion, and activity heatmap
- Explore mock profiles, activity feeds, follows, profile pages, and community reviews
- Discover trending, seasonal, recommended, recently reviewed, and random anime
- View anime detail pages with personal entry editing, list membership, reviews, recommendations, external links, and relations
- Export, import, and clear all local data
- Persist dark, light, and system theme settings

## Component Structure

The app is intentionally local-first and compact:

- `src/App.tsx`: hash router, pages, reusable UI components, review/list/diary/stat workflows
- `src/lib/jikan.ts`: Jikan API client with debounce-friendly search cache, retry logic, backoff, and 429 messaging
- `src/lib/storage.ts`: localStorage schema, defaults, import/export support
- `src/lib/mock.ts`: mock community users and review copy
- `src/types/anime.ts`: full TypeScript data model
- `src/styles.css`: Tailwind entry and heatmap styling

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## GitHub Pages Deploy

1. Replace `YOUR_GITHUB_USERNAME` in `package.json`.
2. If your repository is not named `animeboxd`, update `homepage` and `vite.config.ts` `base`.
3. Deploy:

```bash
npm run deploy
```
