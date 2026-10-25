import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
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
import {fitText, measureText} from '@remotion/layout-utils';
import {fontFamily} from '../fonts';

export const FPS = 24;

// --- Clip timing (source clips are 24fps, 1080x1920) ------------------------
// Both clips open with ~0.1s of digital silence followed by an abrupt onset, so each is
// trimmed 7 frames (starting inside the sound) and clip 1 gets a tiny fade-in.
const HEAD_TRIM = 7;
const CLIP_1_SOURCE_FRAMES = 577;
const CLIP_2_SOURCE_FRAMES = 721;
const CLIP_1_FRAMES = CLIP_1_SOURCE_FRAMES - HEAD_TRIM;
const CLIP_2_FRAMES = CLIP_2_SOURCE_FRAMES - HEAD_TRIM;

// Picture dissolve and equal-power audio crossfade share the same window, so
// the ear and the eye hand over at the same moment. Clip 1 hard-cuts to a short
// final shot (~19 frames) just before the end; keep the dissolve brief so that
// shot still reads instead of being swallowed by a long overlap.
const XFADE = 10;
// Clip 2's tail ends mid-sound; it dips out while the dark outro card dissolves in.
const OUTRO_OVERLAP = 12;

// Clip 1 integrated loudness is -18.0 LUFS vs -19.2 LUFS for clip 2.
// Attenuate the louder one (rather than boosting) so neither can clip.
const CLIP_1_GAIN = 0.871;

const CLIP_2_START = CLIP_1_FRAMES - XFADE;
const OUTRO_START = CLIP_2_START + CLIP_2_FRAMES - OUTRO_OVERLAP;
const OUTRO_FRAMES = 100;

export const HALLOWEEN_DURATION = OUTRO_START + OUTRO_FRAMES;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
// Equal-power curves: gains sum to constant power across the crossfade.
const equalIn = (frame: number, start: number, length: number): number =>
  Math.sin(clamp01((frame - start) / length) * (Math.PI / 2));
const equalOut = (frame: number, start: number, length: number): number =>
  Math.cos(clamp01((frame - start) / length) * (Math.PI / 2));

export const halloweenSchema = z.object({
  showWatermark: z.boolean(),
  watermarkOpacity: z.number().min(0).max(1),
  logoName: z.string(),
  logoSub: z.string(),
  dotColor: zColor(),
});

type Props = z.infer<typeof halloweenSchema>;

const BRAND = {
  bg: '#0b0c10',
  cream: '#f3f0e7',
  blob: '#101612',
  green: '#73b748',
};

// --- The "lol." mark, rebuilt as SVG so the dot can be animated -------------
// Coordinates are in the original logo's pixel space (viewBox crops the blob).
const HOME = {x: 563, y: 461};
const WORD_CENTER = {x: 426, y: 431};
const ORBIT = {rx: 260, ry: 175};

type DotPose = {x: number; y: number; scaleX: number; scaleY: number; opacity: number};

const LolMark: React.FC<{
  size: number;
  dot: DotPose;
  ghosts?: DotPose[];
  dotColor: string;
  blink?: number;
}> = ({size, dot, ghosts = [], dotColor, blink = 1}) => (
  <svg
    viewBox="96 100 665 663"
    width={size}
    height={size * (663 / 665)}
    style={{overflow: 'visible', display: 'block'}}
  >
    <rect x={96} y={100} width={665} height={663} rx={250} fill={BRAND.blob} />
    <rect x={265} y={327} width={46} height={206} fill={BRAND.cream} />
    <path
      fillRule="evenodd"
      fill={BRAND.cream}
      d="M 317 463 a 77 72 0 1 0 154 0 a 77 72 0 1 0 -154 0 Z M 362 463.5 a 31.5 31.5 0 1 0 63 0 a 31.5 31.5 0 1 0 -63 0 Z"
    />
    <rect x={476} y={327} width={46} height={206} fill={BRAND.cream} />
    <circle cx={424} cy={435} r={3.6} fill={BRAND.green} opacity={blink} />
    {ghosts.map((g, i) => (
      <ellipse
        key={i}
        cx={g.x}
        cy={g.y}
        rx={26 * g.scaleX}
        ry={26 * g.scaleY}
        fill={dotColor}
        opacity={g.opacity}
      />
    ))}
    <ellipse
      cx={dot.x}
      cy={dot.y}
      rx={26 * dot.scaleX}
      ry={26 * dot.scaleY}
      fill={dotColor}
      opacity={dot.opacity}
    />
  </svg>
);

const restingDot = (): DotPose => ({
  x: HOME.x,
  y: HOME.y,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
});

// --- Watermark ---------------------------------------------------------------
// Kept inside the platform-safe area: below the top UI strip, clear of the
// right-hand action buttons and the bottom caption block.
// The mark only shows briefly (about 3s) early in the first clip.
const WATERMARK_IN = 24;
const WATERMARK_OUT = 96;

const Watermark: React.FC<Props> = ({watermarkOpacity, dotColor}) => {
  const frame = useCurrentFrame();

  const visible = interpolate(
    frame,
    [WATERMARK_IN, WATERMARK_IN + 8, WATERMARK_OUT - 8, WATERMARK_OUT],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  // One hop of the dot mid-way, and the green LED blinks — a tiny wink at the brand.
  const hopT = clamp01((frame - 58) / 14);
  const hop = Math.abs(Math.sin(hopT * Math.PI)) * 46;
  const blink = frame >= 48 && frame < 52 ? 0.15 : 1;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: 44,
          top: 300,
          opacity: visible * watermarkOpacity,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 6,
          filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.55))',
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: BRAND.cream,
            paddingLeft: 8,
          }}
        >
          made with
        </div>
        <LolMark
          size={150}
          dotColor={dotColor}
          blink={blink}
          dot={{x: HOME.x, y: HOME.y - hop, scaleX: 1, scaleY: 1, opacity: 1}}
        />
      </div>
    </AbsoluteFill>
  );
};

// --- Outro --------------------------------------------------------------------
const BLOCKS_AT = 4;
const BLOCKS_SPRING = {damping: 9, stiffness: 140, mass: 0.8};
// Logo lockup: cube mark, big name, and a small tracked-out subtitle justified to the name's width.
const LOGO_NAME_WIDTH = 540;
const LOGO_CUBE_HEIGHT = 190;
const NAME_TRACKING = -1;

// First frame at which the dropping BLOCKS logo reaches its resting position —
// used to time the thud and screen shake to the visible impact.
const IMPACT = (() => {
  for (let f = 0; f < 60; f++) {
    if (spring({frame: f, fps: FPS, config: BLOCKS_SPRING}) >= 1) return BLOCKS_AT + f;
  }
  return BLOCKS_AT + 10;
})();

const TAGLINE_AT = 30;
const DROP_AT = 32;
const DROP_FRAMES = 16;
const LOOP_AT = 50;
const LOOP_FRAMES = 20;
const POP_AT = LOOP_AT + LOOP_FRAMES;
const CHIME_AT = POP_AT + 4;

// Dot position for a normalized point in the loop-the-loop (t: 0 → 1).
const loopPose = (t: number): {x: number; y: number} => {
  const ease = Easing.inOut(Easing.cubic)(clamp01(t));
  const u0 = (HOME.x - WORD_CENTER.x) / ORBIT.rx;
  const v0 = (HOME.y - WORD_CENTER.y) / ORBIT.ry;
  const rho0 = Math.hypot(u0, v0);
  const theta0 = Math.atan2(v0, u0);
  const theta = theta0 - Math.PI * 2 * ease; // counter-clockwise over the top first
  const rho = rho0 + (1 - rho0) * interpolate(t, [0, 0.18, 0.82, 1], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  return {
    x: WORD_CENTER.x + ORBIT.rx * rho * Math.cos(theta),
    y: WORD_CENTER.y + ORBIT.ry * rho * Math.sin(theta),
  };
};

const dotPoseAt = (frame: number, popSpring: number): DotPose => {
  if (frame < DROP_AT) return {...restingDot(), opacity: 0};

  if (frame < LOOP_AT) {
    const t = clamp01((frame - DROP_AT) / DROP_FRAMES);
    const fall = 1 - Easing.bounce(t);
    // Squash on each ground contact: widen and flatten while it is near the floor.
    const squash = Math.max(0, 1 - fall * 14) * (t < 1 ? 1 : 0) * 0.28;
    return {
      x: HOME.x,
      y: HOME.y - 430 * fall,
      scaleX: 1 + squash,
      scaleY: 1 - squash,
      opacity: clamp01((frame - DROP_AT) / 3),
    };
  }

  if (frame < POP_AT) {
    const t = (frame - LOOP_AT) / LOOP_FRAMES;
    const p = loopPose(t);
    // Stretch along the direction of travel a little for speed.
    return {x: p.x, y: p.y, scaleX: 1.12, scaleY: 0.92, opacity: 1};
  }

  // Landing pop: starts oversized and settles back to 1.
  const pulse = 1 + 0.55 * Math.max(0, 1 - popSpring);
  return {x: HOME.x, y: HOME.y, scaleX: pulse, scaleY: pulse, opacity: 1};
};

const Outro: React.FC<Props> = ({logoName, logoSub, dotColor}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const bgIn = interpolate(frame, [0, OUTRO_OVERLAP], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const shakeAmp = interpolate(frame, [IMPACT, IMPACT + 2, IMPACT + 14], [0, 16, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const shakeX = noise2D('shake-x', frame / 1.5, 0) * shakeAmp;
  const shakeY = noise2D('shake-y', 0, frame / 1.5) * shakeAmp;

  const drop = spring({frame: frame - BLOCKS_AT, fps, config: BLOCKS_SPRING});
  const blocksY = (1 - drop) * -560;
  const blocksOpacity = clamp01((frame - BLOCKS_AT) / 4);

  const madeIn = spring({frame: frame - 20, fps, config: {damping: 200}, durationInFrames: 12});
  const badgeIn = spring({frame: frame - 22, fps, config: {damping: 12}, durationInFrames: 18});
  const taglineIn = spring({frame: frame - TAGLINE_AT, fps, config: {damping: 200}, durationInFrames: 14});

  const popSpring = spring({
    frame: frame - POP_AT,
    fps,
    config: {damping: 6, stiffness: 220, mass: 0.6},
    durationInFrames: 18,
  });

  const dot = dotPoseAt(frame, popSpring);

  // Trail behind the dot only while it is looping.
  const ghosts: DotPose[] =
    frame >= LOOP_AT && frame < POP_AT + 2
      ? [1, 2, 3, 4, 5, 6].map((k) => {
          const p = loopPose(clamp01((frame - k * 0.7 - LOOP_AT) / LOOP_FRAMES));
          return {
            x: p.x,
            y: p.y,
            scaleX: 1 - k * 0.1,
            scaleY: 1 - k * 0.1,
            opacity: 0.38 * (1 - k / 7),
          };
        })
      : [];

  // Ring burst when the dot lands.
  const ringT = clamp01((frame - POP_AT) / 14);

  const nameSize = Math.min(
    fitText({text: logoName, withinWidth: LOGO_NAME_WIDTH, fontFamily, fontWeight: '800'}).fontSize,
    170,
  );
  const nameWidth = measureText({
    text: logoName,
    fontFamily,
    fontWeight: '800',
    fontSize: nameSize,
    letterSpacing: `${NAME_TRACKING}px`,
  }).width;
  const subSize = Math.round(nameSize * 0.34);
  const subWidth = measureText({
    text: logoSub,
    fontFamily,
    fontWeight: '600',
    fontSize: subSize,
  }).width;
  // Spread the subtitle so its right edge lines up with the name's.
  const subSpacing = Math.max(0, (nameWidth - subWidth) / Math.max(1, logoSub.length - 1));

  return (
    <AbsoluteFill style={{opacity: bgIn}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 45%, #171a22 0%, ${BRAND.bg} 62%)`,
        }}
      />
      <AbsoluteFill style={{transform: `translate(${shakeX}px, ${shakeY}px)`}}>
        {/* Logo lockup: cube mark, name, small subtitle underneath */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 520,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 30,
            opacity: blocksOpacity,
            transform: `translateY(${blocksY}px)`,
          }}
        >
          <Img src={staticFile('brand/blocks-cube.png')} style={{height: LOGO_CUBE_HEIGHT}} />
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start'}}>
            <div
              style={{
                fontFamily,
                fontWeight: 800,
                fontSize: nameSize,
                letterSpacing: NAME_TRACKING,
                lineHeight: 1,
                color: BRAND.cream,
                whiteSpace: 'nowrap',
              }}
            >
              {logoName}
            </div>
            <div
              style={{
                marginTop: Math.round(nameSize * 0.06),
                fontFamily,
                fontWeight: 600,
                fontSize: subSize,
                letterSpacing: subSpacing,
                lineHeight: 1,
                color: BRAND.cream,
                opacity: 0.85,
                whiteSpace: 'nowrap',
              }}
            >
              {logoSub}
            </div>
          </div>
        </div>

        {/* made with lol. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 910,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontFamily,
              fontWeight: 600,
              fontSize: 34,
              letterSpacing: 10,
              paddingLeft: 10,
              textTransform: 'uppercase',
              color: BRAND.cream,
              opacity: madeIn * 0.7,
              transform: `translateY(${interpolate(madeIn, [0, 1], [18, 0])}px)`,
            }}
          >
            made with
          </div>
          <div
            style={{
              position: 'relative',
              marginTop: 18,
              opacity: clamp01(badgeIn * 1.4),
              transform: `scale(${interpolate(badgeIn, [0, 1], [0.55, 1])})`,
            }}
          >
            <LolMark size={500} dot={dot} ghosts={ghosts} dotColor={dotColor} />
            {ringT > 0 && ringT < 1 ? (
              <svg
                viewBox="96 100 665 663"
                width={500}
                height={500 * (663 / 665)}
                style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}
              >
                <circle
                  cx={HOME.x}
                  cy={HOME.y}
                  r={26 + ringT * 70}
                  fill="none"
                  stroke={dotColor}
                  strokeWidth={6 * (1 - ringT)}
                  opacity={1 - ringT}
                />
              </svg>
            ) : null}
          </div>
          <div
            style={{
              marginTop: 30,
              fontFamily,
              fontWeight: 700,
              fontSize: 38,
              letterSpacing: 12,
              paddingLeft: 12,
              textTransform: 'uppercase',
              color: BRAND.cream,
              opacity: taglineIn * 0.75,
              transform: `translateY(${interpolate(taglineIn, [0, 1], [14, 0])}px)`,
            }}
          >
            lore on loop
          </div>
        </div>
      </AbsoluteFill>

      {/* Sound design: block lands, dot boings, whooshes round the loop, pops home, chimes. */}
      <Sequence from={IMPACT} durationInFrames={12} layout="none">
        <Audio src={staticFile('sfx/thud.wav')} volume={0.75} />
      </Sequence>
      <Sequence from={DROP_AT + 6} durationInFrames={14} layout="none">
        <Audio src={staticFile('sfx/boing.wav')} volume={0.7} />
      </Sequence>
      <Sequence from={DROP_AT + 12} durationInFrames={14} layout="none">
        <Audio src={staticFile('sfx/boing.wav')} volume={0.38} playbackRate={1.15} />
      </Sequence>
      <Sequence from={DROP_AT + 15} durationInFrames={14} layout="none">
        <Audio src={staticFile('sfx/boing.wav')} volume={0.22} playbackRate={1.3} />
      </Sequence>
      <Sequence from={LOOP_AT - 2} durationInFrames={24} layout="none">
        <Audio src={staticFile('sfx/whoosh.wav')} volume={0.8} />
      </Sequence>
      <Sequence from={POP_AT} durationInFrames={6} layout="none">
        <Audio src={staticFile('sfx/pop.wav')} volume={0.8} />
      </Sequence>
      <Sequence from={CHIME_AT} durationInFrames={OUTRO_FRAMES - CHIME_AT} layout="none">
        <Audio src={staticFile('sfx/chime.wav')} volume={0.5} />
      </Sequence>
    </AbsoluteFill>
  );
};

// --- Main composition ----------------------------------------------------------
export const HalloweenPumpkin: React.FC<Props> = (props) => {
  const frame = useCurrentFrame();

  const secondOpacity = interpolate(frame - CLIP_2_START, [0, XFADE], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: BRAND.bg}}>
      <Sequence durationInFrames={CLIP_1_FRAMES}>
        <OffthreadVideo
          src={staticFile('clips/halloween-1.mp4')}
          trimBefore={HEAD_TRIM}
          muted
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
        {/* Audio comes from the dropout-patched WAV (scripts/patch-audio-dropouts.mjs). */}
        <Audio
          src={staticFile('clips/halloween-1.wav')}
          trimBefore={HEAD_TRIM}
          volume={(f) =>
            CLIP_1_GAIN *
            interpolate(f, [0, 5], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) *
            equalOut(f, CLIP_1_FRAMES - XFADE, XFADE)
          }
        />
      </Sequence>

      <Sequence from={CLIP_2_START} durationInFrames={CLIP_2_FRAMES}>
        <AbsoluteFill style={{opacity: secondOpacity}}>
          <OffthreadVideo
            src={staticFile('clips/halloween-2.mp4')}
            trimBefore={HEAD_TRIM}
            muted
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
          />
        </AbsoluteFill>
        <Audio
          src={staticFile('clips/halloween-2.wav')}
          trimBefore={HEAD_TRIM}
          volume={(f) =>
            equalIn(f, 0, XFADE) * equalOut(f, CLIP_2_FRAMES - OUTRO_OVERLAP, OUTRO_OVERLAP)
          }
        />
      </Sequence>

      {props.showWatermark ? (
        <Sequence durationInFrames={WATERMARK_OUT}>
          <Watermark {...props} />
        </Sequence>
      ) : null}

      <Sequence from={OUTRO_START} durationInFrames={OUTRO_FRAMES}>
        <Outro {...props} />
      </Sequence>
    </AbsoluteFill>
  );
};
