---
workflow: general-video
flow: automation
storyboard: no
message: "Eight lets a dance crew plan, time and watch their formations, free in the browser"
destination: instagram-reels
aspect: 1080x1920
language: en
length: 20s
---

## Intent

A short silent promo for Eight, for choreographers and dance crews who are not on GitHub. It shows the product doing its one job: eight dancers moving through four formations on a stage while a timeline of coloured formation bars plays underneath.

## Notes

- Brand truth is the repository's `DESIGN.md` ("The Gel Book"): ink ground, paper text, saturated colour only on formations, one typeface (Figtree), flat surfaces, no bounce.
- The tagline "Every dancer. Every count." is fixed.
- No voiceover and no music: nothing copyrighted, and the owner adds sound where it is posted.
- No web address on screen; the domain is not confirmed.
- Every claim must be something the app does today. No user numbers or quotes.

## Status

- Rendered to `marketing/promo.mp4` (1080x1920, 30 fps, 20 s, silent). `hyperframes check` passes with warnings only.
- Remaining warnings are accepted: a few elements sit a little outside TikTok's side margins, and the film is silent by choice.
- Run every `hyperframes` command with `HYPERFRAMES_SKIP_SKILLS=1`: the owner scans skills before any install or refresh.
- On-screen wording has been through the humanizer step; the tagline is fixed.
