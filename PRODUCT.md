# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: React + Vite + TypeScript, built as a static site and deployed to Cloudflare Pages from GitHub. Canvas stage, browser-local storage (IndexedDB), no backend until sharing and collaboration. Chosen because the editor is state-heavy and the canvas ecosystem around React is the deepest.

## Users

- **Choreographer** (primary): plans formations for any kind of dance crew or performance, mostly on a laptop, then times them to music, previews and exports.
- **Co-choreographer**: edits the same routine, live or asynchronously (later phase).
- **Dancer**: opens a link or file, finds their own spot in each formation, never edits.

No single dance style drives the defaults.

## Product Purpose

Eight is a free choreography and formation planner for dancers, choreographers, and crews. Map formations, preview transitions to music, and share the plan with the team, all in the browser. It exists so a crew can get what paid formation apps charge for at zero cost. Success: a new user makes a four-formation routine with music in under five minutes.

## Positioning

Free, in the browser, no account for solo use, and the user owns the data (local storage plus a portable open JSON file). Named for the dance eight-count; timing can be expressed in counts as well as seconds.

## Operating Context

Planning at a laptop before or between rehearsals; checking and light edits on iPad or phone in the rehearsal room; dancers looking up their spot on a phone. Files are passed around over chat apps. Uploaded songs are usually copyrighted and stay private to the project.

## Capabilities and Constraints

- Phased build: (1) core editor, (2) music and paths, (3) power tools, (4) sharing, (5) collaboration. Requirements live in the research brief (FR-1 to FR-45, NFR-1 to NFR-8).
- Built so far (November 2026): phases 1 to 3. That covers the editor, music or video beside the stage, counts or seconds timing, snapping, preset shapes and group tools, clash warnings, props, and export to routine file, picture, PDF and video. Sharing and collaboration are not started.
- Media limits: songs up to 60 MB; videos of any size the device can store, with no waveform of their own above 300 MB (a song file can supply one). One song or video per routine.
- Positions are stored in stage units (metres), never pixels.
- At least 100 dancers per project, 60 fps playback.
- Works offline; hosting and backend stay at US$0.
- Desktop-first, usable with touch on iPad and phone, landscape supported.
- English only.
- Do not copy competitors' code, names, logos or UI assets.
- Hosted at eight.foxesvx.dev (assumed default, not yet confirmed by the owner).
- Won't for now: payments, native apps, AI auto-choreography, public marketplace.

## Brand Commitments

- Name: Eight.
- Tagline: "Every dancer. Every count."
- Origin line: "Eight takes its name from the dance eight-count: a simple structure for bringing movement together. We bring that same clarity to planning formations, helping you see every position, shape every transition, and keep everyone on the same count."
- No logo or visual identity exists yet.

## Evidence on Hand

- Research brief (market research and requirements, 13 November 2026), held by the owner outside the repo.
- No testimonials, users, metrics or press. Do not fabricate any.

## Product Principles

1. Free means free: no caps, no account wall, no upsell.
2. The user owns the work: local first, one-click export in an open format.
3. Counts are the native language; seconds are the translation.
4. Fast to the first formation: a routine in minutes, not a manual.
5. Never identify a dancer by colour alone.

## Accessibility & Inclusion

WCAG AA contrast, keyboard shortcuts and arrow-key nudging, colour plus shape and label for every dancer, reduced-motion respected.
