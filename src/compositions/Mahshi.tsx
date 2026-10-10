import React, {useMemo} from 'react';
import {
  AbsoluteFill,
  Audio,
  Freeze,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {z} from 'zod';
import {zColor} from '@remotion/zod-types';
import {noise2D} from '@remotion/noise';
import {Star} from '@remotion/shapes';
import {fitText} from '@remotion/layout-utils';
import {fontFamily, arabicFontFamily} from '../fonts';
import gradeData from '../mahshi-grade.json';

export const FPS = 24;
// The music bed (public/music-mahshi.mp3) is 120 BPM: one beat = 12 frames.
// Its stop-time intro rests at 1.3–2.0s and 5.3–6.0s and lands big bass hits
// at 2.0s and 6.0s; the groove stops at 24.0s and rings out to 26.0s. The edit
// is cut to that map: freeze-frame in the first rest, resume on the 2.0s hit,
// cut to the cooking on the 6.0s hit, stamp the verdict as the music stops.
export const MAHSHI_DURATION = 26 * FPS;

export const mahshiSchema = z.object({
  colorGrade: z.boolean(),
  matchStrength: z.number().min(0).max(1),
  warmth: z.number().min(-0.2).max(0.2),
  contrast: z.number().min(0).max(0.6),
  saturation: z.number().min(0).max(2),
  musicVolume: z.number().min(0).max(1),
  foleyVolume: z.number().min(0).max(2),
  accentColor: zColor(),
});

type Props = z.infer<typeof mahshiSchema>;

const PALETTE = {
  cream: '#fdf6e9',
  charcoal: '#2b2016',
  stampRed: '#d7263d',
};

// ---------------------------------------------------------------------------
// Footage + color

type ClipFile = keyof typeof gradeData;
type Shot = {from: number; to: number; rgb: number[]; luma: number};

const SHOTS = gradeData as Record<ClipFile, Shot[]>;

// Integrated loudness of each clip's own sound (−20.0 / −23.4 / −21.3 LUFS),
// evened out toward ≈ −22 LUFS so the Foley sits evenly under the music. Clip 2
// is left at unity: its transients already peak at −0.5 dBFS.
const FOLEY_GAIN: Record<ClipFile, number> = {
  '01-the-snatch.mp4': 0.8,
  '02-core-and-stuff.mp4': 1.0,
  '03-simmer-and-verdict.mp4': 0.92,
};

const luma = ([r, g, b]: number[]): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Reference look all shots are matched to: the length-weighted geometric mean
// of every shot's red/green and blue/green balance and its mean exposure.
const REFERENCE = (() => {
  const all = Object.values(SHOTS).flat();
  const total = all.reduce((sum, s) => sum + (s.to - s.from), 0);
  const wmean = (f: (s: Shot) => number) =>
    all.reduce((sum, s) => sum + f(s) * (s.to - s.from), 0) / total;
  return {
    rg: Math.exp(wmean((s) => Math.log(s.rgb[0] / s.rgb[1]))),
    bg: Math.exp(wmean((s) => Math.log(s.rgb[2] / s.rgb[1]))),
    luma: wmean((s) => s.luma),
  };
})();

const shotAt = (clip: ClipFile, srcFrame: number): Shot => {
  const shots = SHOTS[clip];
  return shots.find((s) => srcFrame < s.to) ?? shots[shots.length - 1];
};

// Per-channel gains that pull a shot's white balance and exposure toward the
// reference (by `strength`), then shift the whole edit warmer/cooler.
const shotGains = (
  shot: Shot,
  strength: number,
  warmth: number,
): [number, number, number] => {
  const [r, g, b] = shot.rgb;
  const gr = (REFERENCE.rg / (r / g)) ** strength * (1 + warmth);
  const gb = (REFERENCE.bg / (b / g)) ** strength * (1 - warmth);
  // Keep the shot's brightness through the balance change, then match exposure.
  const keep = luma(shot.rgb) / luma([r * gr, g, b * gb]);
  const k = keep * (REFERENCE.luma / shot.luma) ** strength;
  return [gr * k, k, gb * k];
};

// Gentle filmic S-curve with a subtle split-tone (cool shadows, warm
// highlights), sampled into feComponentTransfer tables.
const makeLook = (contrast: number) => {
  const SPLIT = 0.025;
  const N = 33;
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    const y = x - (contrast * Math.sin(2 * Math.PI * x)) / (2 * Math.PI);
    const shadows = 6.75 * x * (1 - x) ** 2;
    const highlights = 6.75 * x ** 2 * (1 - x);
    r.push(clamp(y + SPLIT * (highlights - shadows)));
    g.push(clamp(y + SPLIT * 0.3 * shadows));
    b.push(clamp(y + SPLIT * (shadows - highlights)));
  }
  const fmt = (arr: number[]) => arr.map((v) => v.toFixed(4)).join(' ');
  return {r: fmt(r), g: fmt(g), b: fmt(b)};
};

type Look = ReturnType<typeof makeLook>;

const GradeFilter: React.FC<{
  id: string;
  gains: [number, number, number] | null;
  look: Look | null;
  saturation: number;
  blurX: number;
}> = ({id, gains, look, saturation, blurX}) => (
  <svg width={0} height={0} style={{position: 'absolute'}} aria-hidden>
    <filter id={id} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
      {blurX > 0.5 ? <feGaussianBlur stdDeviation={`${blurX} 0`} edgeMode="duplicate" /> : null}
      {gains ? (
        <feColorMatrix
          type="matrix"
          values={`${gains[0]} 0 0 0 0  0 ${gains[1]} 0 0 0  0 0 ${gains[2]} 0 0  0 0 0 1 0`}
        />
      ) : null}
      {look ? (
        <feComponentTransfer>
          <feFuncR type="table" tableValues={look.r} />
          <feFuncG type="table" tableValues={look.g} />
          <feFuncB type="table" tableValues={look.b} />
        </feComponentTransfer>
      ) : null}
      {look && saturation !== 1 ? <feColorMatrix type="saturate" values={String(saturation)} /> : null}
    </filter>
  </svg>
);

// ---------------------------------------------------------------------------
// Edit decision list

type Timing =
  // Constant speed: (srcOut − srcIn) / duration.
  | {kind: 'play'; srcIn: number; srcOut: number}
  // Speed ramp: 1× at both ends, accelerating through the middle.
  | {kind: 'ramp'; srcIn: number; srcOut: number}
  // Freeze-frame.
  | {kind: 'hold'; src: number};

type Piece = {
  clip: ClipFile;
  from: number;
  duration: number;
  timing: Timing;
  foley?: number;
  // Zoom target in % of the frame, and scale changes that snap in at local frames.
  origin?: [number, number];
  zooms?: Array<{at: number; scale: number}>;
  push?: number; // slow push-in over the piece
  punches?: number[]; // local frames of an impact "punch" zoom
  enter?: 'punch' | 'whip';
  exit?: 'whip';
};

const SNATCH: ClipFile = '01-the-snatch.mp4';
const STUFF: ClipFile = '02-core-and-stuff.mp4';
const VERDICT: ClipFile = '03-simmer-and-verdict.mp4';

const PIECES: Piece[] = [
  // Cold open: the daughter-in-law shows off the giant eggplant…
  {clip: SNATCH, from: 0, duration: 36, timing: {kind: 'play', srcIn: 0, srcOut: 36}},
  // …record-scratch freeze on Teta's snatch, inside the music's first rest.
  {
    clip: SNATCH,
    from: 36,
    duration: 12,
    timing: {kind: 'hold', src: 36},
    origin: [22, 37],
    zooms: [{at: 0, scale: 1.3}],
  },
  // Resume on the 2.0s bass hit: she hurls it into the basket.
  {clip: SNATCH, from: 48, duration: 60, timing: {kind: 'play', srcIn: 37, srcOut: 97}},
  // Basket of small eggplants slammed down on the 5.0s downbeat.
  {
    clip: SNATCH,
    from: 108,
    duration: 36,
    timing: {kind: 'play', srcIn: 101, srcOut: 137},
    origin: [30, 40],
    punches: [12],
  },
  // 6.0s: the groove kicks in — cooking starts.
  {
    clip: STUFF,
    from: 144,
    duration: 46,
    timing: {kind: 'play', srcIn: 0, srcOut: 46},
    enter: 'punch',
  },
  {clip: STUFF, from: 190, duration: 26, timing: {kind: 'ramp', srcIn: 46, srcOut: 106}},
  {clip: STUFF, from: 216, duration: 48, timing: {kind: 'play', srcIn: 106, srcOut: 167}},
  {
    clip: STUFF,
    from: 264,
    duration: 72,
    timing: {kind: 'play', srcIn: 167, srcOut: 239},
    // −3 dB: a −0.5 dBFS thump at 8.47s in this clip lands on a music hit.
    foley: 0.7,
    exit: 'whip',
  },
  {
    clip: VERDICT,
    from: 336,
    duration: 48,
    timing: {kind: 'play', srcIn: 0, srcOut: 48},
    enter: 'whip',
  },
  // "1 hour later" fast-forward through the simmer.
  {clip: VERDICT, from: 384, duration: 24, timing: {kind: 'play', srcIn: 52, srcOut: 115}, foley: 0},
  // Lid off — and Teta… smiles?
  {
    clip: VERDICT,
    from: 408,
    duration: 56,
    timing: {kind: 'play', srcIn: 115, srcOut: 171},
    origin: [22, 22],
    push: 0.1,
  },
  // The tasting; punch on the big bite (20.0s beat).
  {
    clip: VERDICT,
    from: 464,
    duration: 69,
    timing: {kind: 'play', srcIn: 171, srcOut: 240},
    origin: [50, 24],
    punches: [15],
  },
  // The verdict: dramatic zooms on the beats, stamp when the music stops.
  {
    clip: VERDICT,
    from: 533,
    duration: MAHSHI_DURATION - 533,
    timing: {kind: 'hold', src: 239},
    origin: [50, 31],
    zooms: [
      {at: 540 - 533, scale: 1.14},
      {at: 552 - 533, scale: 1.3},
      {at: 564 - 533, scale: 1.48},
    ],
  },
];

const srcFrameAt = (timing: Timing, local: number, duration: number): number => {
  if (timing.kind === 'hold') return timing.src;
  const length = timing.srcOut - timing.srcIn;
  if (timing.kind === 'play') return timing.srcIn + (local * length) / duration;
  // Cubic Hermite from 0→1 with slope m at both ends (= 1× playback speed).
  const m = Math.min(duration / length, 1);
  const x = local / duration;
  const eased = m * (2 * x ** 3 - 3 * x ** 2 + x) + (-2 * x ** 3 + 3 * x ** 2);
  return timing.srcIn + length * eased;
};

// Frame-wide camera shakes (absolute frames).
const SHAKES: Array<{at: number; duration: number; amplitude: number}> = [
  {at: 36, duration: 8, amplitude: 14},
  {at: 93, duration: 6, amplitude: 8},
  {at: 120, duration: 8, amplitude: 16},
  {at: 479, duration: 6, amplitude: 10},
  {at: 576, duration: 14, amplitude: 28},
];

const shakeAt = (frame: number) => {
  let dx = 0;
  let dy = 0;
  let rot = 0;
  let envelope = 0;
  for (const s of SHAKES) {
    const t = frame - s.at;
    if (t < 0 || t >= s.duration) continue;
    const decay = (1 - t / s.duration) ** 2;
    dx += noise2D(`shake-x-${s.at}`, t / 2.2, 0) * s.amplitude * decay;
    dy += noise2D(`shake-y-${s.at}`, 0, t / 2.2) * s.amplitude * decay;
    rot += noise2D(`shake-r-${s.at}`, t / 3, t / 3) * s.amplitude * 0.03 * decay;
    envelope += s.amplitude * decay;
  }
  // Overscan just enough that the shaken frame never shows its edges.
  return {dx, dy, rot, overscan: 1 + envelope * 0.003};
};

const PieceView: React.FC<{
  piece: Piece;
  look: Look | null;
  props: Props;
}> = ({piece, look, props}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {timing, duration} = piece;

  const src = srcFrameAt(timing, frame, duration);
  const gains = props.colorGrade
    ? shotGains(shotAt(piece.clip, src), props.matchStrength, props.warmth)
    : null;

  // Camera: step zooms snap in with a stiff spring; punches bump and settle.
  let scale = 1;
  for (const z of piece.zooms ?? []) {
    const s = spring({frame: frame - z.at, fps, config: {damping: 16, stiffness: 320}});
    scale = interpolate(s, [0, 1], [scale, z.scale]);
  }
  scale *= 1 + (piece.push ?? 0) * (frame / duration);
  for (const at of piece.punches ?? []) {
    const t = frame - at;
    if (t >= 0) scale *= 1 + 0.07 * Math.exp(-t / 4);
  }

  let translateX = 0;
  let blurX = 0;
  if (piece.enter === 'punch') {
    const s = spring({frame, fps, config: {damping: 14, stiffness: 260}});
    scale *= interpolate(s, [0, 1], [1.28, 1]);
  }
  if (piece.enter === 'whip') {
    const p = interpolate(frame, [0, 5], [1, 0], {extrapolateRight: 'clamp'});
    translateX += 15 * p;
    blurX += 70 * p;
    scale *= 1 + 0.3 * p;
  }
  if (piece.exit === 'whip') {
    const p = interpolate(frame, [duration - 5, duration], [0, 1], {extrapolateLeft: 'clamp'});
    translateX -= 15 * p;
    blurX += 70 * p;
    scale *= 1 + 0.3 * p;
  }

  const filterId = `mahshi-grade-${piece.from}`;
  const useFilter = gains !== null || blurX > 0.5;
  const videoStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    filter: useFilter ? `url(#${filterId})` : undefined,
  };
  const file = staticFile(`clips/mahshi/${piece.clip}`);
  const foley = (piece.foley ?? 1) * props.foleyVolume * FOLEY_GAIN[piece.clip];

  return (
    <AbsoluteFill style={{backgroundColor: '#0d0a07', overflow: 'hidden'}}>
      <GradeFilter
        id={filterId}
        gains={gains}
        look={props.colorGrade ? look : null}
        saturation={props.saturation}
        blurX={blurX}
      />
      <AbsoluteFill
        style={{
          transformOrigin: `${piece.origin?.[0] ?? 50}% ${piece.origin?.[1] ?? 50}%`,
          transform: `translateX(${translateX}%) scale(${scale})`,
        }}
      >
        {timing.kind === 'play' ? (
          <OffthreadVideo
            src={file}
            trimBefore={timing.srcIn}
            playbackRate={(timing.srcOut - timing.srcIn) / duration}
            volume={foley}
            muted={foley === 0}
            style={videoStyle}
          />
        ) : (
          // Freeze-frames and speed ramps pick the exact source frame per frame.
          <Freeze frame={Math.round(src)}>
            <OffthreadVideo src={file} muted style={videoStyle} />
          </Freeze>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Graphics

// Thick outline drawn behind the fill (paint-order), plus a soft drop shadow.
const outline = (
  radius: number,
  color: string,
  shadow = `0 ${radius + 6}px ${radius * 3}px rgba(0,0,0,0.45)`,
): React.CSSProperties => ({
  WebkitTextStroke: `${radius * 2}px ${color}`,
  paintOrder: 'stroke fill',
  textShadow: shadow,
});

const fadeOut = (frame: number, start: number, length = 6) =>
  interpolate(frame, [start, start + length], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

// Words pop in one after another (kinetic typography).
const KineticLine: React.FC<{
  words: Array<{text: string; color?: string}>;
  top: string;
  fontSize: number;
  delay?: number;
  stagger?: number;
  exitAt?: number;
}> = ({words, top, fontSize, delay = 0, stagger = 2, exitAt}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const out = exitAt === undefined ? 1 : fadeOut(frame, exitAt, 5);
  return (
    <AbsoluteFill style={{alignItems: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          top,
          width: '88%',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          columnGap: fontSize * 0.34,
          rowGap: fontSize * 0.05,
          opacity: out,
        }}
      >
        {words.map((w, i) => {
          const s = spring({
            frame: frame - delay - i * stagger,
            fps,
            config: {damping: 16, stiffness: 260},
          });
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                fontFamily,
                fontWeight: 900,
                fontSize,
                lineHeight: 1.12,
                color: w.color ?? 'white',
                ...outline(5, PALETTE.charcoal),
                opacity: Math.min(1, s * 2),
                transform: `translateY(${interpolate(s, [0, 1], [26, 0])}px) scale(${interpolate(s, [0, 1], [0.6, 1])})`,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Each word slams in on its own frame, big.
const SlamWords: React.FC<{
  words: string[];
  at: number[];
  top: string;
  color: string;
  maxFontSize: number;
  exitAt?: number;
}> = ({words, at, top, color, maxFontSize, exitAt}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const {fontSize} = fitText({
    text: words.join(' '),
    withinWidth: width * 0.84,
    fontFamily,
    fontWeight: '900',
  });
  const size = Math.min(maxFontSize, fontSize);
  const out = exitAt === undefined ? 1 : fadeOut(frame, exitAt, 5);
  return (
    <AbsoluteFill style={{alignItems: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          top,
          display: 'flex',
          gap: size * 0.25,
          opacity: out,
          transform: `rotate(-3deg) scale(${interpolate(out, [0, 1], [0.85, 1])})`,
        }}
      >
        {words.map((w, i) => {
          const s = spring({frame: frame - at[i], fps, config: {damping: 13, stiffness: 400}});
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                fontFamily,
                fontWeight: 900,
                fontSize: size,
                lineHeight: 1,
                color,
                ...outline(7, PALETTE.charcoal),
                opacity: frame >= at[i] ? 1 : 0,
                transform: `scale(${interpolate(s, [0, 1], [1.9, 1])})`,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Pill: React.FC<{
  children: React.ReactNode;
  top: string;
  background: string;
  color: string;
  fontSize: number;
  at?: number;
  exitAt?: number;
}> = ({children, top, background, color, fontSize, at = 0, exitAt}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - at, fps, config: {damping: 14, stiffness: 260}});
  const out = exitAt === undefined ? 1 : fadeOut(frame, exitAt, 5);
  return (
    <AbsoluteFill style={{alignItems: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          top,
          fontFamily,
          fontWeight: 800,
          fontSize,
          color,
          backgroundColor: background,
          borderRadius: 999,
          padding: `${fontSize * 0.3}px ${fontSize * 0.8}px`,
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap',
          opacity: (frame >= at ? 1 : 0) * out,
          transform: `scale(${interpolate(s, [0, 1], [0.4, 1])}) rotate(${interpolate(s, [0, 1], [-8, -2])}deg)`,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

const Arabic: React.FC<{children: React.ReactNode}> = ({children}) => (
  <span style={{fontFamily: arabicFontFamily, direction: 'rtl', unicodeBidi: 'isolate'}}>
    {children}
  </span>
);

const TitleCard: React.FC<{accent: string}> = ({accent}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const {fontSize} = fitText({text: 'MAHSHI', withinWidth: width * 0.84, fontFamily, fontWeight: '900'});
  const slam = spring({frame, fps, config: {damping: 12, stiffness: 300}});
  const out = fadeOut(frame, 48, 6);
  return (
    <>
      <Pill top="34%" background={accent} color={PALETTE.charcoal} fontSize={46} exitAt={48}>
        TETA&apos;S
      </Pill>
      <AbsoluteFill style={{alignItems: 'center', pointerEvents: 'none'}}>
        <div
          style={{
            position: 'absolute',
            top: '40%',
            fontFamily,
            fontWeight: 900,
            fontSize: Math.min(230, fontSize),
            lineHeight: 1,
            color: PALETTE.cream,
            ...outline(9, PALETTE.charcoal),
            opacity: out,
            transform: `scale(${interpolate(slam, [0, 1], [2.2, 1]) * interpolate(out, [0, 1], [0.8, 1])}) rotate(-3deg)`,
          }}
        >
          MAHSHI
        </div>
      </AbsoluteFill>
      <Pill
        top="56%"
        background={PALETTE.cream}
        color={PALETTE.charcoal}
        fontSize={40}
        at={12}
        exitAt={48}
      >
        stuffed eggplant · <Arabic>محشي بتنجان</Arabic>
      </Pill>
    </>
  );
};

const STEPS = [
  {at: 0, label: "Core 'em"},
  {at: 18, label: 'Rice + tomato + herbs'},
  {at: 66, label: "Stuff 'em. Pack 'em tight."},
  {at: 140, label: 'Drown in tomato broth'},
];

const StepChip: React.FC<{accent: string; exitAt: number}> = ({accent, exitAt}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  let index = 0;
  STEPS.forEach((s, i) => {
    if (frame >= s.at) index = i;
  });
  const step = STEPS[index];
  const enter = spring({frame, fps, config: {damping: 200}, durationInFrames: 8});
  const swap = spring({frame: frame - step.at, fps, config: {damping: 12, stiffness: 300}});
  const out = fadeOut(frame, exitAt, 4);
  return (
    <AbsoluteFill style={{alignItems: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          top: '6.5%',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          opacity: enter * out,
          transform: `translateY(${interpolate(enter, [0, 1], [-60, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 34,
            letterSpacing: 4,
            color: PALETTE.charcoal,
            backgroundColor: accent,
            borderRadius: 999,
            padding: '12px 26px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          STEP {index + 1}
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 44,
            color: PALETTE.charcoal,
            backgroundColor: PALETTE.cream,
            borderRadius: 22,
            padding: '12px 30px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
            transform: `scale(${interpolate(swap, [0, 1], [0.7, 1])})`,
          }}
        >
          {step.label}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const FastForward: React.FC<{accent: string}> = ({accent}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 11, stiffness: 260}});
  const jitter = noise2D('ff-jitter', frame / 1.5, 0) * 6;
  const blink = Math.floor(frame / 4) % 2 === 0 ? 1 : 0.35;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {/* VHS-style scanlines + slight dim to sell the time skip */}
      <AbsoluteFill
        style={{
          background:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 2px, transparent 2px, transparent 6px)',
          backgroundColor: 'rgba(20,10,40,0.18)',
        }}
      />
      <div
        style={{position: 'absolute', top: '7%', left: '8%', display: 'flex', gap: 4, opacity: blink}}
      >
        {[0, 1].map((i) => (
          <svg key={i} width={46} height={52} viewBox="0 0 46 52">
            <polygon points="0,0 46,26 0,52" fill="white" stroke={PALETTE.charcoal} strokeWidth={4} />
          </svg>
        ))}
      </div>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 128,
            lineHeight: 0.95,
            textAlign: 'center',
            color: accent,
            ...outline(8, '#4a1d6b', '10px 14px 0 #4a1d6b'),
            transform: `translateX(${jitter}px) skewX(-10deg) scale(${interpolate(s, [0, 1], [0.3, 1])}) rotate(-4deg)`,
          }}
        >
          1 HOUR
          <br />
          LATER
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Sparkles: React.FC<{x: number; y: number; color: string}> = ({x, y, color}) => {
  const frame = useCurrentFrame();
  const STARS = [
    {dx: -150, dy: -40, size: 34, delay: 0},
    {dx: 160, dy: -70, size: 46, delay: 3},
    {dx: 120, dy: 110, size: 28, delay: 6},
    {dx: -120, dy: 130, size: 38, delay: 8},
  ];
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {STARS.map((s, i) => {
        const t = frame - s.delay;
        const life = interpolate(t, [0, 5, 16, 24], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `calc(${x}% + ${s.dx}px)`,
              top: `calc(${y}% + ${s.dy}px)`,
              opacity: life,
              transform: `translate(-50%, -50%) scale(${life}) rotate(${t * 6}deg)`,
              filter: `drop-shadow(0 0 12px ${color})`,
            }}
          >
            <Star points={4} innerRadius={s.size * 0.28} outerRadius={s.size} fill="white" />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const VerdictDots: React.FC = () => {
  const frame = useCurrentFrame();
  const dots = frame >= 31 ? 3 : frame >= 19 ? 2 : frame >= 7 ? 1 : 0;
  return (
    <AbsoluteFill style={{alignItems: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          top: '70%',
          fontFamily,
          fontWeight: 900,
          fontSize: 76,
          color: 'white',
          ...outline(6, PALETTE.charcoal),
        }}
      >
        the verdict{'.'.repeat(dots)}
        <span style={{opacity: 0}}>{'.'.repeat(3 - dots)}</span>
      </div>
    </AbsoluteFill>
  );
};

const ApprovedStamp: React.FC<{accent: string}> = ({accent}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const slam = spring({frame, fps, config: {damping: 14, stiffness: 520}});
  const scale = interpolate(slam, [0, 1], [3.2, 1]);
  const ink = interpolate(frame, [0, 3], [0, 1], {extrapolateRight: 'clamp'});
  const tagIn = spring({frame: frame - 14, fps, config: {damping: 200}, durationInFrames: 10});
  return (
    <AbsoluteFill style={{alignItems: 'center', pointerEvents: 'none'}}>
      {/* Darken behind the stamp so it reads on any frame */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at 50% 62%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 60%)',
          opacity: ink,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '54%',
          padding: '18px 40px 22px',
          border: `12px solid ${PALETTE.stampRed}`,
          outline: `4px solid ${PALETTE.stampRed}`,
          outlineOffset: 8,
          borderRadius: 26,
          backgroundColor: 'rgba(253,246,233,0.88)',
          textAlign: 'center',
          opacity: ink,
          transform: `rotate(-9deg) scale(${scale})`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 66,
            letterSpacing: 10,
            color: PALETTE.stampRed,
            lineHeight: 1,
          }}
        >
          TETA
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 118,
            letterSpacing: 2,
            color: PALETTE.stampRed,
            lineHeight: 1,
          }}
        >
          APPROVED
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: '79%',
          fontFamily,
          fontWeight: 800,
          fontSize: 40,
          color: PALETTE.charcoal,
          backgroundColor: accent,
          borderRadius: 999,
          padding: '12px 34px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          opacity: tagIn,
          transform: `translateY(${interpolate(tagIn, [0, 1], [30, 0])}px)`,
          whiteSpace: 'nowrap',
        }}
      >
        Teta&apos;s Mahshi · <Arabic>محشي بتنجان</Arabic>
      </div>
    </AbsoluteFill>
  );
};

const Flash: React.FC<{strength: number; length: number}> = ({strength, length}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, length], [strength, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{backgroundColor: 'white', opacity, pointerEvents: 'none'}} />;
};

const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        'radial-gradient(ellipse 85% 70% at 50% 46%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)',
      pointerEvents: 'none',
    }}
  />
);

// ---------------------------------------------------------------------------
// Sound

const SFX_FRAMES = 2 * FPS;

const SFX: Array<{at: number; file: string; volume: number; trimBefore?: number}> = [
  {at: 36, file: 'record-scratch.mp3', volume: 0.5},
  // Whoosh peaks 12 frames in, so each starts a beat before what it hits.
  {at: 69, file: 'whoosh.mp3', volume: 0.35},
  {at: 132, file: 'whoosh.mp3', volume: 0.5},
  {at: 188, file: 'whoosh.mp3', volume: 0.25},
  {at: 324, file: 'whoosh.mp3', volume: 0.5},
  {at: 382, file: 'fast-forward.mp3', volume: 0.9, trimBefore: 10},
  {at: 433, file: 'sparkle.mp3', volume: 0.45},
  {at: 576, file: 'stamp.mp3', volume: 2.2},
];

// ---------------------------------------------------------------------------

export const Mahshi: React.FC<Props> = (props) => {
  const frame = useCurrentFrame();
  const {accentColor, musicVolume, contrast} = props;
  const look = useMemo(() => makeLook(contrast), [contrast]);
  const {dx, dy, rot, overscan} = shakeAt(frame);

  return (
    <AbsoluteFill style={{backgroundColor: '#0d0a07'}}>
      <AbsoluteFill
        style={{transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${overscan})`}}
      >
        {PIECES.map((piece) => (
          <Sequence key={piece.from} from={piece.from} durationInFrames={piece.duration}>
            <PieceView piece={piece} look={look} props={props} />
          </Sequence>
        ))}
        <Vignette />

        {/* Cold open */}
        <Sequence durationInFrames={36}>
          <KineticLine
            top="6%"
            fontSize={68}
            delay={3}
            words={[
              {text: 'POV:'},
              {text: 'you'},
              {text: 'bring'},
              {text: 'Teta'},
              {text: 'the'},
              {text: 'BIGGEST', color: accentColor},
              {text: 'eggplant'},
            ]}
          />
        </Sequence>
        <Sequence from={36} durationInFrames={72}>
          <SlamWords
            words={['NOT.', 'THAT.', 'ONE.']}
            at={[0, 4, 8]}
            top="8%"
            color={accentColor}
            maxFontSize={140}
            exitAt={64}
          />
          <Pill
            top="19%"
            background={PALETTE.cream}
            color={PALETTE.charcoal}
            fontSize={38}
            at={22}
            exitAt={64}
          >
            too big = too seedy for mahshi
          </Pill>
        </Sequence>
        <Sequence from={110} durationInFrames={34}>
          <Pill top="6%" background={accentColor} color={PALETTE.charcoal} fontSize={36}>
            TETA&apos;S RULE
          </Pill>
          <SlamWords
            words={['SMALL', 'ONES', 'ONLY.']}
            at={[10, 13, 16]}
            top="12%"
            color="white"
            maxFontSize={120}
          />
        </Sequence>

        {/* Cooking */}
        <Sequence from={144} durationInFrames={56}>
          <TitleCard accent={accentColor} />
        </Sequence>
        <Sequence from={198} durationInFrames={186}>
          <StepChip accent={accentColor} exitAt={182} />
        </Sequence>
        <Sequence from={292} durationInFrames={40}>
          <KineticLine
            top="66%"
            fontSize={58}
            exitAt={34}
            words={[
              {text: "she's"},
              {text: 'allowed'},
              {text: 'to'},
              {text: 'help.'},
              {text: '(barely)', color: accentColor},
            ]}
          />
        </Sequence>
        <Sequence from={384} durationInFrames={24}>
          <FastForward accent={accentColor} />
        </Sequence>

        {/* Reveal + verdict */}
        <Sequence from={433} durationInFrames={30}>
          <Sparkles x={22} y={20} color={accentColor} />
          <KineticLine
            top="47%"
            fontSize={74}
            stagger={3}
            exitAt={25}
            words={[
              {text: 'wait…'},
              {text: 'is'},
              {text: 'Teta'},
              {text: 'SMILING?!', color: accentColor},
            ]}
          />
        </Sequence>
        <Sequence from={533} durationInFrames={43}>
          <VerdictDots />
        </Sequence>
        <Sequence from={576}>
          <ApprovedStamp accent={accentColor} />
        </Sequence>

        <Sequence from={36} durationInFrames={5}>
          <Flash strength={0.35} length={4} />
        </Sequence>
        <Sequence from={144} durationInFrames={7}>
          <Flash strength={0.55} length={6} />
        </Sequence>
        <Sequence from={576} durationInFrames={7}>
          <Flash strength={0.5} length={6} />
        </Sequence>
      </AbsoluteFill>

      <Audio
        src={staticFile('music-mahshi.mp3')}
        volume={(f) =>
          musicVolume *
          interpolate(f, [MAHSHI_DURATION - 10, MAHSHI_DURATION - 1], [1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />
      {SFX.map((s) => (
        <Sequence key={`${s.file}-${s.at}`} from={s.at} durationInFrames={SFX_FRAMES}>
          <Audio
            src={staticFile(`sfx/${s.file}`)}
            trimBefore={s.trimBefore}
            // Short fade at the tail so no effect is ever cut off with a click.
            volume={(f) =>
              s.volume *
              interpolate(f, [SFX_FRAMES - 6, SFX_FRAMES], [1, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })
            }
            allowAmplificationDuringRender
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
