---
name: remotion
description: Remotion fundamentals for this repo — composition model, frame-based animation (interpolate, spring), sequencing, props/schemas, and render commands. Use whenever creating or editing compositions, animating anything, debugging playback/render issues, or running the studio/renders.
---

# Remotion fundamentals

Remotion turns React components into videos: a component is rendered once per frame, and the only input that may change over time is the current frame.

## Golden rules

1. **Everything visual derives from `useCurrentFrame()`.** Never use CSS `transition`/`animation`, `setTimeout`, `requestAnimationFrame`, or state that changes over time — frames render out of order and in parallel, so only pure frame-derived output is correct.
2. **Determinism.** Never `Math.random()` — use `random(seed)` from `remotion` or `noise2D()` from `@remotion/noise`. Same frame must always produce the same pixels.
3. **Assets** go in `public/` and are referenced with `staticFile('name.png')` — never relative `src` paths or `import` of media.
4. **All `@remotion/*` packages and `remotion` must be on the exact same version.** Upgrade with `npm run upgrade` (runs `remotion upgrade`), never by bumping one package.
5. Fonts: this repo self-hosts fonts for offline, deterministic renders — `import {fontFamily} from '../fonts'` (`src/fonts.ts` loads `public/fonts/*.woff2` via `@remotion/fonts`). To add a font, download its woff2 into `public/fonts/` and register it there; `@remotion/google-fonts` also works but needs network access at render time. Never link Google Fonts CSS by URL.

## Animation toolkit

```tsx
const frame = useCurrentFrame();
const {fps, durationInFrames, width, height} = useVideoConfig();

// Linear mapping with clamping (almost always clamp both ends):
const opacity = interpolate(frame, [0, 20], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

// Natural motion — default choice for enters/exits:
const pop = spring({frame, fps, config: {damping: 200}}); // smooth, no overshoot
const bouncy = spring({frame, fps});                      // default = slight bounce
const delayed = spring({frame: frame - 15, fps});         // starts at frame 15
const stretched = spring({frame, fps, durationInFrames: 40}); // fixed length

// Combine transforms cleanly (@remotion/animation-utils):
transform: makeTransform([scale(pop), translateY(interpolate(pop, [0, 1], [40, 0]))])
```

Seconds → frames: `Math.round(seconds * fps)`; ms → frames: `(ms / 1000) * fps`.

## Sequencing

```tsx
<Sequence from={30} durationInFrames={60}>   // children see frame 0 at frame 30
<Series>                                     // back-to-back clips
  <Series.Sequence durationInFrames={45}>…</Series.Sequence>
  <Series.Sequence durationInFrames={60} offset={-10}>…</Series.Sequence> // overlap
</Series>
```

For crossfades/slides between scenes use `<TransitionSeries>` — see the `video-editing` skill.

## Compositions & props

Register in `src/Root.tsx` with a Zod schema so props are editable in the Studio sidebar:

```tsx
export const myCompSchema = z.object({title: z.string(), accent: zColor()});
<Composition id="MyComp" component={MyComp} schema={myCompSchema}
  defaultProps={{title: 'Hi', accent: '#4f8bff'}}
  durationInFrames={150} fps={30} width={1920} height={1080} />
```

Duration/fps/dimensions can be computed from props or fetched data via
`calculateMetadata` (e.g. match a source video's length with
`parseMedia()` from `@remotion/media-parser`).

## Commands

```bash
npm run dev                                  # Remotion Studio (interactive preview)
npx remotion render <CompId> out/video.mp4   # render a composition
npx remotion render <CompId> --frames=0-29   # render a subset
npx remotion still <CompId> out/frame.png --frame=45
npm run typecheck && npm run lint            # verify before committing
```

Pass input props: `--props='{"title":"Hello"}'` or a path to a JSON file.

## Common pitfalls

- Flicker/jumping between frames → hidden nondeterminism (random, Date.now, CSS animation).
- `spring()` feels slow → it uses `fps`; always pass the real `fps` from `useVideoConfig()`.
- Content missing at start → `interpolate` extrapolates by default; add clamps.
- Slow renders → prefer JPEG frames (already set in `remotion.config.ts`), use `<OffthreadVideo>` for embedded video, raise `--concurrency`.
- Data fetching belongs in `calculateMetadata` or `delayRender()`/`continueRender()`; keep it deterministic.
