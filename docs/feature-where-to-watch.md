# Feature idea: "Where to Watch / Read"

Status: brainstorm draft, not yet built.

## The problem this solves

Anime streaming rights are fragmented across Crunchyroll, Netflix, Hulu, HIDIVE, and
others, and shift often as licenses change hands. Manga/manhwa reading locations are
even less centralized. Neither AniList nor MAL solves "where can I actually watch or
read this right now" well or consistently. It's a small but constant friction point —
exactly the kind of thing people check often enough for it to matter, even if it's
not flashy.

## Core mechanic

- A "Watch on ___ / Read on ___" badge on each anime/manga/manhwa detail page
- **Anime**: sourced from Watchmode's API (free tier: 2,500 calls/month, up to 3
  countries, no card required) — see cost research below
- **Manga/manhwa**: no equivalent free/paid aggregator exists. Starts as a small,
  hand-maintained mapping table for popular titles (Webtoon and Tapas host a lot of
  original manhwa directly; licensed/translated manga spans Viz, MangaPlus,
  Kodansha, etc.), expanding over time rather than being automatic from day one

## Critical architecture note: the API key must not touch the frontend

This app has no custom backend — it's a Vite/React SPA talking to Supabase directly.
Putting the Watchmode key in frontend code means anyone can pull it out of the
shipped bundle and burn through the free quota (or a paid one, later). Same category
of issue as the `ADMIN_NOTIFY_SECRET` handled during the security audit.

Fix: proxy it through a new Supabase Edge Function, the same pattern already used by
`admin-signup-email` — the key lives server-side as a Supabase secret, the frontend
calls the edge function, the edge function calls Watchmode.

Rough shape:
- New edge function (e.g. `watchmode-lookup`) takes a title/MAL ID, calls Watchmode
  server-side, returns just the platform list to the client
- Cache lookups (a new table, same pattern as `anime_home_cache`) so popular titles
  aren't re-fetched from Watchmode on every page view — protects the free-tier
  budget and keeps the UI fast

## Cost research (done)

- **Watchmode**: real free tier — 2,500 API calls/month, up to 3 countries, no
  credit card required. Paid tiers exist above that but aren't needed yet at
  current traffic, especially with caching in place.
- **JustWatch**: not self-serve — no published pricing, official access requires
  contacting their data-partner team directly for a custom deal, which is generally
  aimed at larger businesses. Not a realistic option for this project regardless of
  budget, separate from cost.

Decision: incorporate Watchmode.

## Open questions before building

- Matching MAL IDs (what this app uses internally) to whatever ID/title system
  Watchmode expects — likely needs a title-based search/match step, not a direct
  ID lookup
- Cache TTL — availability changes, but not hourly; needs a sensible refresh window
- Graceful fallback when no match is found (quietly hide the badge, don't show an
  error state)

## Feasibility note

Buildable now. One new edge function plus one new Supabase secret, following a
pattern already established in this codebase from the security work. Free tier
comfortably covers current traffic, especially with caching.
