---
name: captions
description: Subtitles and captions in Remotion — the Caption data model, SRT import/export, TikTok-style word-by-word caption pages with active-word highlighting, and transcription with Whisper. Use when adding subtitles, karaoke/word-pop captions, or transcribing audio for a video.
---

# Captions & subtitles

`@remotion/captions` defines one standard shape that all tooling converts to/from:

```ts
import type {Caption} from '@remotion/captions';
// {text: string; startMs: number; endMs: number; timestampMs: number | null; confidence: number | null}
// One caption per word, with a leading space on continuation words: " word".
```

## Getting captions

- **From an .srt file:** `parseSrt({input})` → `{captions}`. Export back with `serializeSrt()`.
- **From audio (transcription):** `@remotion/install-whisper-cpp` downloads and runs Whisper locally — `transcribe()` returns per-word tokens; convert with `toCaptions()`. Cloud alternative: `@remotion/openai-whisper` (`openAiWhisperApiToCaptions()`).
- **Hardcoded/generated:** build the array yourself (see `src/compositions/TikTokCaptions.tsx`).

## TikTok-style captions (word-by-word pop)

`createTikTokStyleCaptions` groups word-captions into short "pages":

```ts
const {pages} = createTikTokStyleCaptions({
  captions,
  combineTokensWithinMilliseconds: 1200, // ~1–2 words/page at 500–800, phrases at 1200+
});
// page: {text, startMs, durationMs, tokens: [{text, fromMs, toMs}]}
```

Render each page in a `<Sequence>` and highlight the active token:

```tsx
{pages.map((page, i) => (
  <Sequence key={i}
    from={Math.round((page.startMs / 1000) * fps)}
    durationInFrames={Math.max(1, Math.round((page.durationMs / 1000) * fps))}>
    <Page page={page} />
  </Sequence>
))}

// Inside <Page>: frame is relative to the Sequence, so:
const timeInMs = page.startMs + (frame / fps) * 1000;
const active = timeInMs >= token.fromMs && timeInMs < token.toMs;
```

Working example: `src/compositions/TikTokCaptions.tsx` (composition id `TikTokCaptions`).

## Styling conventions

- Vertical video: 1080×1920, captions centered or in the lower third (safe from platform UI: keep ≥ 220px from the bottom).
- Big bold font (see `motion-graphics` skill for `loadFont`/`fitText`), `textShadow` or stroke for contrast over footage.
- Active word: color change plus a small `scale` spring reads best; animate per-page entrance with a fast spring (`durationInFrames: 6–10`).
- Keep caption text un-transformed (no re-wrapping between frames): measure with `fitText` per page, not per frame.

## Syncing to real audio

When captions come from transcription of an `<Audio>`/`<OffthreadVideo>` track in the same composition, they're already in the same clock (ms from media start). If the media is trimmed with `trimBefore`, subtract the trimmed duration from every caption timestamp.
