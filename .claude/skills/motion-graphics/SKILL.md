---
name: motion-graphics
description: Motion graphics in Remotion — animated titles and kinetic typography, fonts, auto-sizing text, SVG shapes and path drawing, organic noise motion, and motion blur. Use when animating text, logos, lower thirds, intros/outros, shapes, or any designed animation (as opposed to cutting footage).
---

# Motion graphics

## Typography

```tsx
import {fontFamily} from '../fonts';   // repo convention: self-hosted Inter (100–900 variable)

import {fitText} from '@remotion/layout-utils';           // auto-size text to a width
const {fontSize} = fitText({text, withinWidth: width * 0.8, fontFamily, fontWeight: '800'});
```

New local fonts: drop the woff2 in `public/fonts/`, register in `src/fonts.ts` with `@remotion/fonts` → `loadFont({family: 'Brand', url: staticFile('fonts/brand.woff2')})` (it delays rendering until loaded). `@remotion/google-fonts/…` (tree-shaken, any Google font) also works but fetches from the network at render time — pass `{weights, subsets}` to keep requests down.
Also in `@remotion/layout-utils`: `measureText()` for precise boxes (word highlights, underlines).

### Kinetic typography pattern

Stagger springs per word/letter:

```tsx
{words.map((word, i) => {
  const s = spring({frame: frame - i * 4, fps, config: {damping: 200}});
  return (
    <span key={i} style={{
      display: 'inline-block', marginRight: 18,
      opacity: s,
      transform: makeTransform([translateY(interpolate(s, [0, 1], [30, 0]))]),
    }}>{word}</span>
  );
})}
```

`makeTransform`, `scale`, `rotate`, `translateX/Y` come from `@remotion/animation-utils`; it also has `interpolateStyles()` for keyframing whole style objects.

## Shapes

```tsx
import {Circle, Ellipse, Rect, Star, Triangle, Polygon, Pie, Heart} from '@remotion/shapes';
<Star points={5} innerRadius={80} outerRadius={200} fill="#4f8bff" />
<Pie radius={100} progress={frame / durationInFrames} fill="white" />  // progress rings
```

Each shape also has a `make*` function (e.g. `makeStar`) returning the raw SVG path for use with path utilities.

## SVG path animation

```tsx
import {evolvePath, getPointAtLength, getLength, warpPath} from '@remotion/paths';

// Draw-on effect (0 → 1):
const {strokeDasharray, strokeDashoffset} = evolvePath(progress, d);
<path d={d} fill="none" stroke="white" strokeWidth={12}
  strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />

// Move an element along a path:
const point = getPointAtLength(d, getLength(d) * progress);
```

See `src/compositions/LogoReveal.tsx` for a working draw-on example.

## Organic motion — noise

Smooth deterministic wobble/drift (never `Math.random()`):

```tsx
import {noise2D} from '@remotion/noise';  // also noise3D, noise4D; returns −1…1
const dx = noise2D('seed-x', frame / 40, 0) * 10;
const dy = noise2D('seed-y', 0, frame / 40) * 10;
```

Divide `frame` by 30–60 for slow drift; multiply output for amplitude.

## Motion blur

```tsx
import {Trail, CameraMotionBlur} from '@remotion/motion-blur';

<Trail layers={6} lagInFrames={0.4} trailOpacity={0.4}>{fastMovingElement}</Trail>
<CameraMotionBlur shutterAngle={180} samples={10}>{wholeScene}</CameraMotionBlur>
```

`Trail` echoes one element behind itself; `CameraMotionBlur` blurs the entire scene like a camera shutter. Both multiply render cost — keep `samples`/`layers` modest.

## Backgrounds

Animated gradients are just interpolated CSS:

```tsx
const angle = interpolate(frame, [0, durationInFrames], [120, 200]);
background: `linear-gradient(${angle}deg, #1f2a63, #4f8bff)`
```

For film grain / organic textures, sample `noise2D` on a low-res grid of divs or an SVG turbulence filter — avoid per-pixel canvas work per frame.

## Audio-reactive graphics

```tsx
import {useAudioData, visualizeAudio} from '@remotion/media-utils';
const audioData = useAudioData(staticFile('music.mp3'));
if (!audioData) return null;
const freqs = visualizeAudio({fps, frame, audioData, numberOfSamples: 32});
// map freqs (0…1) to bar heights / scale pulses
```
