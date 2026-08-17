# Feature idea: "Tonight's Pick"

Status: brainstorm draft, not yet built. Captured so the idea doesn't get lost while
we think through other features.

## The problem this solves

AnimeBoxD as a pure tracker is a smaller AniList/MAL — same core value prop, less
traction behind it. Tracking should become the plumbing under a feature people
actually open the app *for*, not the whole pitch. The gap in the existing anime-site
landscape: nobody solves "I don't know what to watch tonight" well. Everyone offers
search and filters, which hand the decision back to the user instead of making it
for them.

## Why this isn't just a filter with better copy

A filter narrows a haystack — you still scan and compare results yourself. This
feature's job is to end the decision: return one confident pick (plus a couple of
backups), not a sorted list. The two things that make that credible instead of
arbitrary:

1. **Personalized against the user's own taste**, not just static category tags.
2. **A one-line "why this" justification** — "because you loved X, and this has the
   same slow-burn found-family thing, 24 min, low commitment." That sentence is what
   separates "recommendation" from "shuffle."

## Core flow

1. **Once, at signup or whenever (not daily)**: user picks a few favorites, or the
   profile seeds automatically from anything they've already rated in their library.
   This is a one-time setup step, not something repeated each day.
2. **Every day, automatically, zero input required**: "Tonight's Pick" is just there
   when they open the app — the site runs their standing taste profile through the
   similarity engine and serves one fresh pick, refreshed daily. Low effort is the
   point; this is the passive-surprise half of the feature, closer to a daily Wordle
   than a form to fill out.
3. **Anytime, optional, on-demand**: a "Not feeling this? Pick a different vibe"
   prompt next to Tonight's Pick, separate from the daily pick itself. Lets someone
   quickly select a few different favorites, or tap genre/mood chips (Romance,
   Comfort, Slice of Life), to regenerate that day's pick from an alternate seed —
   without touching or overwriting their standing profile. Covers a specific craving,
   a mood shift away from their usual lane, and brand-new visitors with no favorites
   yet to seed a profile from.

**Resolved: the daily pick stays passive by default (zero input, like Wordle) — mood
shifts are handled by an explicit, no-commitment override, not by waiting on
engagement that may never come.**

The original plan leaned on ongoing ratings to slowly drift the taste profile as
someone's mood changed over time (e.g. they start watching romance a few days after
favoriting only racing/sports anime). That's fragile for a new, low-traffic site —
it assumes a level of ongoing rating activity that's unlikely to materialize soon
enough to matter. So instead of depending on that:

- **Standing favorites** stay the default baseline that powers the automatic daily
  pick — set once, no daily input required.
- **"Something else?" quick re-seed** becomes the *primary* way mood-shifting
  actually happens day to day, precisely because it doesn't wait on rating volume.
  Session-only by default — doesn't alter the standing profile unless the same
  alternate picks keep coming up often enough to suggest the standing profile itself
  should widen (a nice-to-have refinement, not something the feature depends on).
- Passive rating-drift is kept as a bonus signal if and when real usage shows up,
  not the mechanism the design leans on to feel responsive from day one.

## Recommendation engine: content-based, not collaborative (v1)

Two different techniques exist, and only one needs real traction:

- **Collaborative filtering** ("people like you also liked this") needs thousands of
  users' rating patterns to find meaningful overlap. At current traction (231
  impressions), this is a dead end for now — not enough signal.
- **Content-based filtering** ("this anime is similar to that anime") needs zero
  other users. It compares anime to each other using metadata already pulled from
  the Jikan/Tenrai APIs — genre, theme, demographic, studio, format, episode count,
  synopsis — against one user's own taste profile. Works from day one with a single
  user.

v1 should be content-based. Collaborative signals become a natural v2 upgrade once
there's real activity data to mine — `activity_events` is already being logged for
sign-ins/sign-ups, so extending it to favorite/rating events now means that upgrade
path isn't blocked later, even though it's not being built yet.

### Scoring sketch (not finalized)

- Weighted overlap across genre, theme, demographic, studio, format/episode-count
  proximity between the candidate anime and the user's favorited/highly-rated titles
- Exclude anything already in the user's library (watched, dropped, or already
  favorited)
- Pick via **weighted random** from the top-N matches, not a single deterministic
  top result and not uniform randomness across everything. Pure random across the
  whole catalog was considered and rejected — it's a regression from a filter, not
  an improvement, since it ignores taste entirely. Random *within* an
  already-curated pool is what should feel like discovery instead of a slot machine.

### Cold start handling

- User with existing library ratings: profile seeds automatically, no action needed
- New user, no library yet: prompted to pick a few favorites, or use the "in the
  mood for X" box as a one-off starting point instead

## Open questions before building

- How many backup options alongside the top pick — just one, or 2-3
- Whether the "something else?" re-seed should offer genre/mood chips, a quick
  favorites picker, or both side by side
- Refresh timing: fixed daily reset (e.g. midnight local time) vs. on next visit
- Where the "why this" line comes from — templated from the matched signals, or
  something more dynamic
- How much each signal (genre vs. theme vs. studio vs. tone) should be weighted —
  this will likely need real usage to tune, not a one-time decision

## Feasibility note

The scoring/ranking logic is ordinary code against data already flowing through the
app (Jikan/Tenrai metadata + each user's own library) — not exotic ML, no new
infrastructure. Buildable and testable as a solid v1: verify it returns genuinely
similar matches for a known seed title, correctly excludes already-watched titles,
handles the no-favorites-yet case, and refreshes on schedule.

What can't be guaranteed upfront is recommendation *taste* — two titles can share
every genre tag and still feel completely different in tone. That's a "ship it,
watch what real people actually pick, tune the weights" problem, not something
solved by writing more code before anyone's used it.
