# Feature idea: "What's your favorite anime?" — shareable taste cards + community board

Status: brainstorm draft, not yet built.

## The problem this solves

Every other feature discussed so far (Tonight's Pick, the continuation tracker,
where-to-watch, Wrapped) attracts *or* retains, not both — they either need existing
history to work (Wrapped is useless to a brand-new visitor) or don't deepen anyone's
relationship with the tracker (a standalone game is a detour from the real product,
not a demo of it). This feature is designed to be the same action doing both jobs at
once, the way Letterboxd actually grew: its viral unit was never "your year in
film," it was a single witty one-line review of one movie, shared the same day, from
someone's very first review — no history required. The individual artifact *is* the
core product action, just made instantly shareable.

## Core flow

1. **Zero-friction entry point, no account needed**: "What's your favorite anime,
   manga, or manhwa — and why?" This is deliberately the single most-asked icebreaker
   in every anime community that exists — everyone has an instant answer, no
   browsing a catalog required. Asking across all three formats (not anime-only)
   matters — it's the thing that actually differentiates this site from AniList.
2. Typed title is matched via autocomplete against the existing Jikan/Tenrai search
   (reuses the search infrastructure already in the app) — needed so the card can
   pull real poster art, not just render their typed text.
3. Generates a shareable card: poster art + title + their one-line "why" + a small
   site watermark. The watermark is the actual growth mechanic, not decoration —
   every reshare needs to carry the site's name on it or the share doesn't drive
   anyone back (same reason Letterboxd and Spotify Wrapped both brand their images).
4. **Save-to-collection prompt, staged in two steps**:
   - A small, low-pressure "Save this?" option available immediately after the card
     is made — easy to ignore, not a blocking modal
   - A stronger, more direct prompt later, after they've engaged with more of the
     site (browsed a bit, seen the Tonight's Pick teaser, etc.)
   - Two steps because relying only on "later" risks losing one-off visitors from a
     shared link who close the tab before coming back; relying only on "immediately"
     interrupts the moment they were just enjoying with a sales pitch. Both, at
     different pressure levels, hedges against both failure modes.
5. With consent, the submission also posts to a public community board (below).

## Handling repeat visits (don't re-ask)

Getting asked this on every single visit would kill the feature fast. Two cases,
and this app already has the pattern needed for both:

- **Anonymous visitors**: same trick already used for the cookie banner and the
  report-form cooldown — a `localStorage` flag set the moment they either submit a
  card *or* explicitly dismiss/skip the prompt. Skipping has to suppress it too, not
  just submitting, or declining once means getting asked every visit forever.
- **Signed-in users**: no separate flag needed — the check is just "does this
  account already have an entry in the favorites/board table?" If yes, show an
  "edit your pick" option instead of the ask-prompt. The submission data is the
  flag, and unlike the localStorage version it's authoritative across every device
  they log into.
- **Reconciling the two**: someone who answers anonymously and *then* signs up
  shouldn't lose that pick — whatever's sitting in their local storage at signup
  time should get attached to the new account, so the first favorite carries over
  instead of becoming an orphaned, disconnected thing.
- **After the first dismissal or submission**, the prompt shouldn't disappear
  forever — it should downgrade from "greets you on arrival" to a small, always
  available entry point (near the community board, say) where they can submit or
  update a pick whenever they want. Suppressed as an interruption, not deleted as a
  feature.

## Community board: "Most Favorited"

- Aggregates every card submission into a browsable, public leaderboard
- Each entry shows a sample of the actual "why" quotes people wrote, not just a
  count — a bare vote tally is boring; a feed of real one-line takes is genuinely
  interesting to browse even for a visitor who's never used the site, and is itself
  shareable content independent of the ranking
- Serves three purposes at once: homepage social proof for brand-new visitors before
  they've made their own card, a reason for contributors to check back ("did my pick
  move up?"), and the simplest possible seed of real collaborative signal — this is
  the natural on-ramp to the collaborative-filtering upgrade path already noted as
  v2 in the Tonight's Pick doc, without needing to build that machinery now
- Needs to look credible at low volume rather than inflated — show real counts
  honestly (e.g. "12 favorites") even when small; a modest real board reads better
  than a fake-looking one

## Practical considerations

- **Anti-abuse, tied directly to the security work already done on this repo**:
  since anonymous/unauthenticated submission is the whole point (zero friction is
  the point of the feature), the underlying table needs the same pattern already
  used for the report form — RLS allows public inserts, but a cooldown and
  one-active-pick-per-session/account guard is needed against someone spamming
  votes for a single title to game the board. Mirrors the existing
  `user_reports`/`page_views` RLS pattern rather than inventing a new one.
- Card image generation/export needs real poster art from the matched title, not
  just rendered user text, or the shareable artifact won't look good enough to
  actually get shared
- Allowing changing/updating a pick later (without letting old picks stack as
  separate votes) is probably needed so the board doesn't ossify around whatever
  someone typed the first time they tried the feature

## Feasibility note

Mostly reuses what already exists: the anime/manga search infra for autocomplete,
the RLS + rate-limit pattern from the report form, the same card-adjacent styling
already in the app. New pieces are the card image generation/export, a new
public-readable aggregation table for the board, and the two-stage save-prompt
logic. No new external API or paid dependency required.
