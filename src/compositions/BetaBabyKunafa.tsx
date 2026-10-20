import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
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
import {
  AlmaSparkles,
  CutLight,
  cameraTransform,
  cutState,
  cutStyle,
  impactAt,
  type Cut,
} from './kunafaFx';

// The Beta Baby — kunafa nests + the Alma reveal.
//
// A single 1080×1920 source (public/kunafa/source.mp4, 10 stitched AI shots + the Alma card) is
// re-cut to a music bed so every cut lands on a beat. Each music option has its own plan (beat
// length + shot lengths in beats) because tempo decides how long a shot can run:
//   original — 96 BPM, 15 frames/beat   A / B / C — 120 BPM, 12 frames/beat
// There is deliberately no text over the food — the only words on screen are the ones already
// baked into the Alma card.

export const FPS = 24;

const PALETTE = {
  bg: '#1c0f06',
  glow: '#ffc46b',
  cream: '#fff3ec',
  bloom: '#fff6f1',
};

type Shot = {
  id: string;
  /** Source frame shown on the shot's first frame. */
  srcIn: number;
  beats: number;
  /** Playback rate; >1 speeds the footage up (timeline length stays `beats`). */
  speed?: number;
  /** Slow push/pull over the shot: [start zoom, end zoom, drift x px, drift y px]. */
  camera: [number, number, number?, number?];
  /** Effect cut INTO this shot; the previous shot ramps out of the same cut. */
  cutIn: Cut | null;
  /** Local frame of an impact (punch + shake + flash). */
  impact?: number;
};

// Source shot ranges (frames @ 24fps): 0–53 · 54–165 · 166–298 · 299–349 · 350–409 · 410–480 ·
// 481–530 · 531–589 · 590–646 · 647–716 · Alma 717–812. Each srcIn leaves a 2-frame margin from
// the original hard cuts, and every shot is limited by how much footage the source has.
const SHOTS_96: Shot[] = [
  {id: 'pile', srcIn: 6, beats: 3, camera: [1.1, 1.0], cutIn: {kind: 'intro', half: 10}},
  {id: 'nest', srcIn: 56, beats: 7, camera: [1.0, 1.06, -10, 0], cutIn: {kind: 'zoom', half: 5}},
  {
    id: 'shape',
    srcIn: 168,
    beats: 7,
    speed: 1.15,
    camera: [1.07, 1.0, 8, 0],
    cutIn: {kind: 'whipUp', half: 5},
  },
  {id: 'tray', srcIn: 302, beats: 3, camera: [1.0, 1.05], cutIn: {kind: 'golden', half: 6}},
  {id: 'pistachio', srcIn: 352, beats: 3, camera: [1.0, 1.06, 0, -8], cutIn: {kind: 'zoom', half: 5}},
  {id: 'filled', srcIn: 414, beats: 4, camera: [1.06, 1.0], cutIn: {kind: 'whipLeft', half: 5}},
  {id: 'oven', srcIn: 484, beats: 3, camera: [1.0, 1.06], cutIn: {kind: 'flash', half: 4}},
  {id: 'syrup', srcIn: 536, beats: 3, camera: [1.06, 1.0], cutIn: {kind: 'golden', half: 6}},
  {
    id: 'crack',
    srcIn: 592,
    beats: 3,
    camera: [1.0, 1.08],
    cutIn: {kind: 'zoom', half: 5},
    impact: 15,
  },
  {id: 'taste', srcIn: 649, beats: 4, camera: [1.05, 1.0], cutIn: {kind: 'whipLeft', half: 5}},
];

// 120 BPM = 12 frames per beat: 48 beats of food (24s) so the music's final hit (beat 48) lands on
// frame 576, where the Alma reveal begins. The crack is placed so the pastry splits on beat 40 (frame 480).
const SHOTS_120: Shot[] = [
  {id: 'pile', srcIn: 4, beats: 4, camera: [1.1, 1.0], cutIn: {kind: 'intro', half: 10}},
  {id: 'nest', srcIn: 56, beats: 9, camera: [1.0, 1.06, -10, 0], cutIn: {kind: 'zoom', half: 5}},
  {
    id: 'shape',
    srcIn: 168,
    beats: 8,
    speed: 1.15,
    camera: [1.07, 1.0, 8, 0],
    cutIn: {kind: 'whipUp', half: 5},
  },
  {id: 'tray', srcIn: 304, beats: 3, camera: [1.0, 1.05], cutIn: {kind: 'golden', half: 6}},
  {id: 'pistachio', srcIn: 352, beats: 4, camera: [1.0, 1.06, 0, -8], cutIn: {kind: 'zoom', half: 5}},
  {id: 'filled', srcIn: 414, beats: 4, camera: [1.06, 1.0], cutIn: {kind: 'whipLeft', half: 5}},
  {id: 'oven', srcIn: 486, beats: 3, camera: [1.0, 1.06], cutIn: {kind: 'flash', half: 4}},
  {id: 'syrup', srcIn: 536, beats: 4, camera: [1.06, 1.0], cutIn: {kind: 'golden', half: 6}},
  {
    id: 'crack',
    srcIn: 595,
    beats: 4,
    camera: [1.0, 1.08],
    cutIn: {kind: 'zoom', half: 5},
    impact: 12,
  },
  {id: 'taste', srcIn: 649, beats: 5, camera: [1.05, 1.0], cutIn: {kind: 'whipLeft', half: 5}},
];

// The last food shot blooms into white light that the Alma card emerges from.
const ALMA_CUT: Cut = {kind: 'flash', half: 9, color: PALETTE.bloom};
const ALMA_SRC_IN = 719;
const ALMA_LIVE_FRAMES = 93; // source frames 719–811, then hold the final smile

export type TrackId = 'original' | 'A' | 'B' | 'C';

type Plan = {
  /** Frames per beat. */
  beat: number;
  shots: Shot[];
  /** Length of the Alma reveal: long enough for the music's final chord to ring out. */
  almaFrames: number;
  music: string;
};

// Music beds are prepared by scripts/prep-kunafa-audio.sh and all sit at the same loudness.
const PLANS: Record<TrackId, Plan> = {
  original: {beat: 15, shots: SHOTS_96, almaFrames: 144, music: 'kunafa/music.mp3'},
  A: {beat: 12, shots: SHOTS_120, almaFrames: 120, music: 'kunafa/music-a.mp3'},
  B: {beat: 12, shots: SHOTS_120, almaFrames: 168, music: 'kunafa/music-b.mp3'},
  C: {beat: 12, shots: SHOTS_120, almaFrames: 120, music: 'kunafa/music-c.mp3'},
};

// Foley cues (ElevenLabs SFX). `from` is the frame the file starts; the offsets put each sound's
// transient on its cut / action. Levels are relative; sfxVolume scales them all.
type Cue = {file: string; from: number; frames: number; volume: number};

const build = (track: TrackId) => {
  const plan = PLANS[track];
  const timeline = plan.shots.reduce<Array<Shot & {from: number; duration: number}>>(
    (acc, shot) => {
      const prev = acc[acc.length - 1];
      const from = prev ? prev.from + prev.duration : 0;
      return [...acc, {...shot, from, duration: shot.beats * plan.beat}];
    },
    [],
  );
  const last = timeline[timeline.length - 1];
  const almaFrom = last.from + last.duration;
  const cutFrame = (i: number): number => timeline[i].from;
  const crackShot = timeline.findIndex((sh) => sh.id === 'crack');
  const crackFrame = cutFrame(crackShot) + (timeline[crackShot].impact ?? 0);

  const cues: Cue[] = [
    {file: 'whoosh', from: cutFrame(1) - 5, frames: 22, volume: 0.55},
    {file: 'whoosh2', from: cutFrame(2) - 5, frames: 22, volume: 0.5},
    {file: 'whoosh2', from: cutFrame(3) - 5, frames: 22, volume: 0.4},
    {file: 'whoosh', from: cutFrame(4) - 5, frames: 22, volume: 0.55},
    {file: 'pistachio', from: cutFrame(4) + 6, frames: 32, volume: 0.7},
    {file: 'pistachio', from: cutFrame(4) + 31, frames: 32, volume: 0.65},
    {file: 'whoosh2', from: cutFrame(5) - 5, frames: 22, volume: 0.5},
    {file: 'whoosh', from: cutFrame(6) - 4, frames: 22, volume: 0.55},
    {file: 'oven', from: cutFrame(6) - 2, frames: 44, volume: 0.6},
    {file: 'whoosh2', from: cutFrame(7) - 5, frames: 22, volume: 0.4},
    {file: 'syrup', from: cutFrame(7) + 2, frames: 50, volume: 0.7},
    {file: 'whoosh', from: cutFrame(8) - 5, frames: 22, volume: 0.55},
    {file: 'crunch', from: crackFrame - 4, frames: 36, volume: 0.9},
    {file: 'whoosh2', from: cutFrame(9) - 5, frames: 22, volume: 0.5},
    {file: 'sparkle', from: almaFrom - 4, frames: 76, volume: 0.6},
  ];

  // The music dips under the hero foley (like a sidechain) so the oven ding, pistachio ticks and the
  // pastry crunch cut through the groove. [first frame, last frame, music level while ducked]
  const ducks: Array<[number, number, number]> = [
    [cutFrame(4) + 4, cutFrame(4) + 17, 0.8],
    [cutFrame(4) + 29, cutFrame(4) + 42, 0.8],
    [cutFrame(6) - 2, cutFrame(6) + 8, 0.7],
    [cutFrame(7) + 2, cutFrame(7) + 28, 0.82],
    [crackFrame - 3, crackFrame + 14, 0.5],
  ];

  return {plan, timeline, almaFrom, duration: almaFrom + plan.almaFrames, cues, ducks};
};

const BUILT: Record<TrackId, ReturnType<typeof build>> = {
  original: build('original'),
  A: build('A'),
  B: build('B'),
  C: build('C'),
};

export const trackDuration = (track: TrackId): number => BUILT[track].duration;

const duckLevel = (ducks: Array<[number, number, number]>, f: number): number =>
  ducks.reduce(
    (level, [from, to, depth]) =>
      Math.min(
        level,
        interpolate(f, [from - 3, from, to, to + 8], [1, depth, depth, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
      ),
    1,
  );

export const betaBabyKunafaSchema = z.object({
  track: z.enum(['original', 'A', 'B', 'C']),
  musicVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
  glowColor: zColor(),
  sparkleColor: zColor(),
});

const GRADE = 'saturate(1.1) contrast(1.05) brightness(1.02)';

const FootageShot: React.FC<{
  shot: Shot;
  duration: number;
  cutOut: Cut | null;
  glowColor: string;
}> = ({shot, duration, cutOut, glowColor}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  const state = cutState(frame, duration, shot.cutIn, cutOut);
  const fx = state ? cutStyle(state.cut.kind, state.e, state.side, width, height) : null;
  const hit = shot.impact !== undefined ? impactAt(frame, shot.impact) : null;
  const [zoomFrom, zoomTo, driftX, driftY] = shot.camera;
  const camera = cameraTransform(frame, duration, zoomFrom, zoomTo, driftX, driftY);

  const blurId = `whip-${shot.id}`;
  const filter = fx?.directionalBlur
    ? `url(#${blurId}) ${GRADE}`
    : `${fx?.filter ?? ''} ${GRADE}`.trim();
  // CSS applies the rightmost transform first: camera → impact → cut effect.
  const transform = [
    fx?.transform,
    hit ? `translate(${hit.shakeX}px, ${hit.shakeY}px) scale(${hit.scale})` : null,
    camera,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <AbsoluteFill style={{backgroundColor: PALETTE.bg}}>
      {fx?.directionalBlur ? (
        <svg width={0} height={0} style={{position: 'absolute'}}>
          <filter id={blurId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={`${fx.directionalBlur.sx} ${fx.directionalBlur.sy}`} />
          </filter>
        </svg>
      ) : null}
      <AbsoluteFill style={{transform, filter, transformOrigin: '50% 55%'}}>
        <OffthreadVideo
          src={staticFile('kunafa/source.mp4')}
          trimBefore={shot.srcIn}
          playbackRate={shot.speed ?? 1}
          muted
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
      </AbsoluteFill>
      <CutLight state={state} fallbackColor={glowColor} />
      {hit && hit.flash > 0 ? (
        <AbsoluteFill
          style={{backgroundColor: PALETTE.glow, opacity: hit.flash, mixBlendMode: 'screen'}}
        />
      ) : null}
      {/* warm vignette: pulls the eye to the centre, keeps the grade cohesive across shots */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(40,16,0,0.34) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

const AlmaEnding: React.FC<{sparkleColor: string; duration: number}> = ({
  sparkleColor,
  duration,
}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  // The card settles in from a soft zoom while the white bloom from the last food shot clears…
  const settle = spring({frame, fps, config: {damping: 200}, durationInFrames: 32});
  // …then it pushes in very slowly. Origin sits on the baby's face so the title stays inside the frame.
  const push = interpolate(frame, [0, duration], [1.0, 1.035], {
    easing: Easing.inOut(Easing.quad),
    extrapolateRight: 'clamp',
  });
  const scale = (1.06 - 0.06 * settle) * push;
  const bloom = interpolate(frame, [0, 16], [1, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateRight: 'clamp',
  });
  const glow = 0.2 + 0.08 * Math.sin((frame / fps) * 2.1);
  const endFade = interpolate(frame, [duration - 22, duration], [0, 1], {
    extrapolateLeft: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: PALETTE.cream}}>
      <AbsoluteFill style={{transform: `scale(${scale})`, transformOrigin: '50% 62%'}}>
        <Freeze frame={Math.min(frame, ALMA_LIVE_FRAMES - 1)}>
          <OffthreadVideo
            src={staticFile('kunafa/source.mp4')}
            trimBefore={ALMA_SRC_IN}
            muted
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
          />
        </Freeze>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          mixBlendMode: 'screen',
          opacity: glow,
          background: `radial-gradient(ellipse ${width * 0.6}px ${height * 0.38}px at 50% 52%, #ffe3ee 0%, rgba(255,227,238,0) 100%)`,
        }}
      />
      <AlmaSparkles color={sparkleColor} />
      <AbsoluteFill style={{backgroundColor: PALETTE.bloom, opacity: bloom}} />
      <AbsoluteFill style={{backgroundColor: PALETTE.cream, opacity: endFade}} />
    </AbsoluteFill>
  );
};

export const BetaBabyKunafa: React.FC<z.infer<typeof betaBabyKunafaSchema>> = ({
  track,
  musicVolume,
  sfxVolume,
  glowColor,
  sparkleColor,
}) => {
  const {plan, timeline, almaFrom, duration, cues, ducks} = BUILT[track];

  return (
    <AbsoluteFill style={{backgroundColor: PALETTE.bg}}>
      {timeline.map((shot, i) => {
        const next = timeline[i + 1];
        return (
          <Sequence key={shot.id} from={shot.from} durationInFrames={shot.duration} layout="none">
            <FootageShot
              shot={shot}
              duration={shot.duration}
              cutOut={next ? next.cutIn : ALMA_CUT}
              glowColor={glowColor}
            />
          </Sequence>
        );
      })}
      <Sequence from={almaFrom} durationInFrames={plan.almaFrames}>
        <AlmaEnding sparkleColor={sparkleColor} duration={plan.almaFrames} />
      </Sequence>

      <Audio
        src={staticFile(plan.music)}
        volume={(f) =>
          musicVolume *
          duckLevel(ducks, f) *
          interpolate(f, [0, 2], [0, 1], {extrapolateRight: 'clamp'}) *
          interpolate(f, [duration - 30, duration], [1, 0], {extrapolateLeft: 'clamp'})
        }
      />
      {cues.map((cue, i) => (
        <Sequence key={`${cue.file}-${i}`} from={cue.from} durationInFrames={cue.frames}>
          <Audio src={staticFile(`kunafa/sfx/${cue.file}.mp3`)} volume={() => cue.volume * sfxVolume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
