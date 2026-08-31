---
name: video-editing
description: Editing existing footage in Remotion — trimming, cutting, concatenating clips, scene transitions, audio mixing/ducking/fades, speed changes, and picture-in-picture. Use when the task involves cutting or assembling video/audio clips, adding transitions between scenes, syncing audio, or building a montage.
---

# Video editing workflows

## Embedding footage

Use `<OffthreadVideo>` for anything that gets rendered to a file (frame-accurate, extracts frames with FFmpeg); `<Video>` only when you need imperative access or `<Player>` interactivity. Audio: `<Audio>`. Files live in `public/` → `staticFile('clip.mp4')`; remote URLs also work.

```tsx
import {OffthreadVideo, Audio, staticFile} from 'remotion';
<OffthreadVideo src={staticFile('clip.mp4')} />
```

## Trimming & cutting

`trimBefore`/`trimAfter` are measured in frames of the composition timeline:

```tsx
// Use seconds 2–6 of the source clip:
<OffthreadVideo src={staticFile('clip.mp4')} trimBefore={2 * fps} trimAfter={6 * fps} />
```

(Older API names `startFrom`/`endAt` do the same if the installed version predates the rename.)

A "cut" = two trimmed clips in a row:

```tsx
<Series>
  <Series.Sequence durationInFrames={4 * fps}>
    <OffthreadVideo src={staticFile('a.mp4')} trimBefore={2 * fps} />
  </Series.Sequence>
  <Series.Sequence durationInFrames={3 * fps}>
    <OffthreadVideo src={staticFile('a.mp4')} trimBefore={10 * fps} />
  </Series.Sequence>
</Series>
```

To size a composition to its source footage, compute duration in `calculateMetadata` with `parseMedia()` from `@remotion/media-parser` (reads duration/dimensions/fps without FFmpeg).

## Transitions between scenes

```tsx
import {TransitionSeries, linearTiming, springTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';   // also: wipe, flip, clockWipe, iris, none
<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={60}>{sceneA}</TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 15})} />
  <TransitionSeries.Sequence durationInFrames={60}>{sceneB}</TransitionSeries.Sequence>
</TransitionSeries>
```

Total duration = sum of scenes − sum of transition durations. A transition must be shorter than both neighboring scenes. See `src/compositions/SceneTransitions.tsx` for a working example.

## Audio mixing

`volume` accepts a per-frame callback — use it for fades and ducking:

```tsx
// Fade in over 1s, fade out over the last 2s:
<Audio src={staticFile('music.mp3')}
  volume={(f) =>
    interpolate(f, [0, fps, durationInFrames - 2 * fps, durationInFrames],
      [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
  } />

// Duck music under a voiceover playing frames 90–300:
<Audio src={staticFile('music.mp3')}
  volume={(f) => interpolate(f, [80, 90, 300, 310], [1, 0.2, 0.2, 1],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
```

Layering multiple `<Audio>` tags mixes them. Trim audio with the same `trimBefore`/`trimAfter` props. Loop background music with `loop`.

## Speed

Constant speed: `playbackRate={2}`. Variable speed ramps need the accumulated-time technique — remap the frame manually and render the video inside a `<Sequence>`; see remotion.dev/docs/miscellaneous/snippets/accelerated-video.

## Layout / picture-in-picture

Everything is CSS. PiP = absolutely positioned scaled container on top of the main clip:

```tsx
<AbsoluteFill><OffthreadVideo src={staticFile('screen.mp4')} /></AbsoluteFill>
<div style={{position: 'absolute', right: 48, bottom: 48, width: 480,
  borderRadius: 24, overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.5)'}}>
  <OffthreadVideo src={staticFile('webcam.mp4')} style={{width: '100%'}} />
</div>
```

Fit modes: `style={{objectFit: 'cover', width: '100%', height: '100%'}}`.

## GIFs and Lottie

```tsx
import {Gif} from '@remotion/gif';           // frame-synced GIF playback
import {Lottie} from '@remotion/lottie';     // After Effects animations (lottie JSON)
```

## Rendering

```bash
npx remotion render <CompId> out/final.mp4          # H.264 default
npx remotion render <CompId> out/clip.webm --codec=vp8
npx remotion render <CompId> out/alpha.mov --codec=prores --prores-profile=4444  # transparency
npx remotion render <CompId> out/audio.mp3 --codec=mp3   # audio-only export
```
