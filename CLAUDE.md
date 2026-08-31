# obey — Remotion video studio

Programmatic video editing: React components in `src/compositions/` are rendered frame-by-frame into videos.

## Commands

- `npm run dev` — Remotion Studio (interactive preview at localhost:3000)
- `npx remotion render <CompId> out/video.mp4` — render a composition (ids in `src/Root.tsx`)
- `npm run typecheck` and `npm run lint` — run both before committing
- `npm run upgrade` — upgrade all Remotion packages together (never bump them individually; all `remotion` and `@remotion/*` versions must match exactly)

## Structure

- `src/index.ts` — entry, registers the root
- `src/Root.tsx` — all `<Composition>` registrations (id, dimensions, fps, duration, zod schema, defaultProps)
- `src/compositions/` — one file per composition
- `public/` — static assets, referenced via `staticFile('name.ext')`
- `remotion.config.ts` — CLI/render config

## Skills

Repo skills in `.claude/skills/` carry the project's video know-how — consult them before writing composition code:

- `remotion` — fundamentals: frame-based animation, springs/interpolate, sequencing, rendering, pitfalls
- `video-editing` — trimming, cuts, transitions, audio mixing/ducking, speed, picture-in-picture
- `motion-graphics` — titles, fonts, shapes, SVG path drawing, noise, motion blur, audio-reactive visuals
- `captions` — subtitles, SRT import/export, TikTok-style word highlighting, Whisper transcription

## Hard rules

- All visuals derive from `useCurrentFrame()`; no CSS transitions/animations, timers, or `Math.random()` (use `random(seed)`/`noise2D`).
- New compositions must be registered in `src/Root.tsx` with a zod `schema` and `defaultProps`.
- Use `<OffthreadVideo>` for embedded footage in renders; assets go in `public/` via `staticFile()`.
- Fonts are self-hosted (`src/fonts.ts` + `public/fonts/`) so renders work offline — import `fontFamily` from there instead of fetching Google Fonts at render time.
