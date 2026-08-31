# obey

A [Remotion](https://www.remotion.dev) video studio — create and edit videos programmatically with React.

## Quickstart

```bash
npm install
npm run dev          # open Remotion Studio (interactive preview + editable props)
```

Render a video:

```bash
npx remotion render Intro out/intro.mp4
npx remotion render TikTokCaptions out/captions.mp4
npx remotion still Intro out/thumbnail.png --frame=60
```

## Demo compositions

| Id | What it shows |
| --- | --- |
| `Intro` | Springs, Google Fonts, shapes, animated transforms, zod-editable props |
| `SceneTransitions` | `@remotion/transitions` — fade, slide, wipe between scenes |
| `TikTokCaptions` | Word-by-word animated captions (vertical 1080×1920) |
| `LogoReveal` | SVG path draw-on, motion-blur trails, noise-driven wobble |

## Installed Remotion packages

**Core:** `remotion`, `@remotion/cli` (Studio + renderer), `@remotion/player` (embed in web apps)

**Editing:** `@remotion/transitions` (scene transitions), `@remotion/media-parser` (read video metadata), `@remotion/captions` (subtitles, TikTok-style captions), `@remotion/media-utils` (audio visualization)

**Motion graphics:** `@remotion/shapes`, `@remotion/paths` (SVG path animation), `@remotion/motion-blur`, `@remotion/noise`, `@remotion/animation-utils`, `@remotion/layout-utils` (text measurement/fitting), `@remotion/gif`, `@remotion/lottie`

**Fonts & props:** `@remotion/fonts` (self-hosted fonts — Inter ships in `public/fonts/` so renders work offline), `@remotion/google-fonts`, `@remotion/zod-types` + `zod` (visually editable props in Studio)

**Dev:** `@remotion/eslint-config-flat`, TypeScript

> All `remotion` and `@remotion/*` packages must stay on the same version — upgrade with `npm run upgrade`.

## Claude Code skills

`.claude/skills/` ships four video-editing skills that Claude Code picks up automatically when working in this repo: `remotion` (fundamentals), `video-editing` (cut/trim/transitions/audio), `motion-graphics` (titles, shapes, paths, blur), and `captions` (subtitles + transcription).

## Docs

- [Remotion fundamentals](https://www.remotion.dev/docs/the-fundamentals)
- [API reference](https://www.remotion.dev/docs/api)
- [Templates](https://www.remotion.dev/templates)
