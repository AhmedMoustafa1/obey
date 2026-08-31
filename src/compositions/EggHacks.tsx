import React, {useMemo} from 'react';
import {
  AbsoluteFill,
  Audio,
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
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {createTikTokStyleCaptions, type Caption} from '@remotion/captions';
import {fitText} from '@remotion/layout-utils';
import {fontFamily} from '../fonts';

import voManifest from '../vo-manifest.json';
import introCaptions from '../captions/00-intro.json';
import strainerCaptions from '../captions/01-strainer-poached.json';
import yogurtCaptions from '../captions/02-yogurt-scramble.json';
import parmesanCaptions from '../captions/03-parmesan-crispy.json';
import easyPeelCaptions from '../captions/04-easy-peel.json';
import chiliCaptions from '../captions/05-chili-crisp.json';
import steamLidCaptions from '../captions/06-steam-lid-sunny.json';
import bottleCaptions from '../captions/07-bottle-shake.json';

export const FPS = 24;
const TRANSITION_FRAMES = 8;

// Whisper artifacts worth dropping: bracketed sound events and pure punctuation.
const cleanCaptions = (captions: Caption[]): Caption[] =>
  captions.filter((c) => {
    const t = c.text.trim();
    if (t.length === 0) return false;
    if (/^[[(*♪]/.test(t)) return false;
    return true;
  });

type VoLine = {file: string; startSec: number; durationSec: number};

const VO: Record<string, VoLine[]> = voManifest;

type Segment = {
  file: string;
  slug: string;
  durationInFrames: number;
  captions: Caption[];
  number?: number;
  title?: string;
};

const seg = (
  file: string,
  seconds: number,
  captions: Caption[],
  number?: number,
  title?: string,
): Segment => ({
  file,
  slug: file.replace(/\.mp4$/, ''),
  durationInFrames: seconds * FPS,
  captions: cleanCaptions(captions),
  number,
  title,
});

const SEGMENTS: Segment[] = [
  seg('00-intro.mp4', 6, introCaptions as Caption[]),
  seg('01-strainer-poached.mp4', 10, strainerCaptions as Caption[], 1, 'Strainer Poached Egg'),
  seg('02-yogurt-scramble.mp4', 10, yogurtCaptions as Caption[], 2, 'Creamy Yogurt Scramble'),
  seg('03-parmesan-crispy.mp4', 10, parmesanCaptions as Caption[], 3, 'Parmesan Crispy Egg'),
  seg('04-easy-peel.mp4', 10, easyPeelCaptions as Caption[], 4, 'Easy-Peel Eggs'),
  seg('05-chili-crisp.mp4', 10, chiliCaptions as Caption[], 5, 'Chili-Crisp Egg'),
  seg('06-steam-lid-sunny.mp4', 10, steamLidCaptions as Caption[], 6, 'Steam-Lid Sunny Egg'),
  seg('07-bottle-shake.mp4', 10, bottleCaptions as Caption[], 7, 'Bottle-Shake Scramble'),
];

export const EGG_HACKS_DURATION = SEGMENTS.reduce(
  (sum, s) => sum + s.durationInFrames,
  0,
) - TRANSITION_FRAMES * (SEGMENTS.length - 1);

// Absolute start frame of each segment on the timeline (transitions overlap).
const segmentStart = (index: number): number =>
  SEGMENTS.slice(0, index).reduce((sum, s) => sum + s.durationInFrames, 0) -
  TRANSITION_FRAMES * index;

// Frame spans (absolute) where someone is speaking — used to duck the music.
// Covers on-screen caption beats and the voiceover lines.
const SPEECH_SPANS: Array<[number, number]> = SEGMENTS.flatMap((s, i) => {
  const offset = segmentStart(i);
  const captionSpans = s.captions.map(
    (c): [number, number] => [
      offset + (c.startMs / 1000) * FPS,
      offset + (c.endMs / 1000) * FPS,
    ],
  );
  const voSpans = (VO[s.slug] ?? []).map(
    (l): [number, number] => [
      offset + l.startSec * FPS,
      offset + (l.startSec + l.durationSec) * FPS,
    ],
  );
  return [...captionSpans, ...voSpans];
});

const speechActivity = (frame: number): number => {
  const RAMP = 10;
  let max = 0;
  for (const [start, end] of SPEECH_SPANS) {
    const v = interpolate(
      frame,
      [start - RAMP, start, end, end + RAMP],
      [0, 1, 1, 0],
      {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
    );
    if (v > max) max = v;
    if (max === 1) break;
  }
  return max;
};

export const eggHacksSchema = z.object({
  highlightColor: zColor(),
  musicVolume: z.number().min(0).max(1),
});

const PALETTE = {
  cream: '#fdf6e9',
  charcoal: '#2b2016',
  yolk: '#f5a623',
};

const TitleCard: React.FC<{number: number; title: string}> = ({number, title}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();

  const IN_DELAY = 4;
  const OUT_START = 70;
  const enter = spring({frame: frame - IN_DELAY, fps, config: {damping: 200}, durationInFrames: 14});
  const exit = interpolate(frame, [OUT_START, OUT_START + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = enter * (1 - exit);
  const y = interpolate(enter, [0, 1], [-40, 0]) - exit * 24;

  const {fontSize} = fitText({
    text: title,
    withinWidth: width * 0.66,
    fontFamily,
    fontWeight: '800',
  });

  return (
    <AbsoluteFill style={{alignItems: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          top: '7.5%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          opacity,
          transform: `translateY(${y}px)`,
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 34,
            letterSpacing: 6,
            color: PALETTE.charcoal,
            backgroundColor: PALETTE.yolk,
            borderRadius: 999,
            padding: '12px 34px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          }}
        >
          HACK {number}/7
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: Math.min(64, fontSize),
            color: PALETTE.charcoal,
            backgroundColor: PALETTE.cream,
            borderRadius: 28,
            padding: '18px 44px',
            boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const IntroTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const enter = spring({frame: frame - 8, fps, config: {damping: 11}, durationInFrames: 18});
  const exit = interpolate(frame, [58, 70], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{alignItems: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          top: '7%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          opacity: enter * (1 - exit),
          transform: `scale(${0.7 + enter * 0.3}) rotate(${interpolate(enter, [0, 1], [-6, -2])}deg)`,
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 100,
            lineHeight: 1,
            color: PALETTE.cream,
            textShadow: '0 6px 0 rgba(0,0,0,0.25), 0 14px 40px rgba(0,0,0,0.45)',
          }}
        >
          7
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 64,
            color: PALETTE.cream,
            textShadow: '0 4px 0 rgba(0,0,0,0.25), 0 12px 36px rgba(0,0,0,0.45)',
          }}
        >
          EGG HACKS
        </div>
        <div
          style={{
            marginTop: 12,
            fontFamily,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: 4,
            color: PALETTE.charcoal,
            backgroundColor: PALETTE.yolk,
            borderRadius: 999,
            padding: '10px 28px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          }}
        >
          TETA APPROVED
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CaptionPage: React.FC<{
  page: ReturnType<typeof createTikTokStyleCaptions>['pages'][number];
  highlightColor: string;
}> = ({page, highlightColor}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();

  const enter = spring({frame, fps, config: {damping: 200}, durationInFrames: 6});
  const timeInMs = page.startMs + (frame / fps) * 1000;

  const {fontSize} = fitText({
    text: page.text,
    withinWidth: width * 0.82,
    fontFamily,
    fontWeight: '800',
  });

  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          marginBottom: '21%',
          maxWidth: '86%',
          fontFamily,
          fontWeight: 800,
          fontSize: Math.min(62, Math.max(40, fontSize)),
          lineHeight: 1.25,
          textAlign: 'center',
          color: 'white',
          textShadow:
            '0 3px 6px rgba(0,0,0,0.85), 0 8px 28px rgba(0,0,0,0.6)',
          transform: `scale(${0.92 + enter * 0.08})`,
          WebkitTextStroke: '1.5px rgba(0,0,0,0.35)',
        }}
      >
        {page.tokens.map((token, i) => {
          const active = timeInMs >= token.fromMs && timeInMs < token.toMs;
          return (
            <span key={i} style={{color: active ? highlightColor : 'white'}}>
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const SegmentCaptions: React.FC<{captions: Caption[]; highlightColor: string}> = ({
  captions,
  highlightColor,
}) => {
  const {fps} = useVideoConfig();
  const {pages} = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions,
        // Each authored step (≤2.3s of continuous words) stays one page…
        combineTokensWithinMilliseconds: 2600,
        // …and any ≥450ms gap (between steps, before SPLAT!/Wow!) starts a new one.
        breakOnSilenceAfterMilliseconds: 450,
      }),
    [captions],
  );

  return (
    <>
      {pages.map((page, i) => {
        const from = Math.round((page.startMs / 1000) * fps);
        const duration = Math.max(1, Math.round((page.durationMs / 1000) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <CaptionPage page={page} highlightColor={highlightColor} />
          </Sequence>
        );
      })}
    </>
  );
};

const SegmentVideo: React.FC<{segment: Segment; highlightColor: string}> = ({
  segment,
  highlightColor,
}) => {
  const voLines = VO[segment.slug] ?? [];
  const voSpans = voLines.map(
    (l): [number, number] => [l.startSec * FPS, (l.startSec + l.durationSec) * FPS],
  );

  // Soften the clip's own soundtrack while the voiceover talks over it.
  const clipVolume = (f: number): number => {
    const RAMP = 6;
    let duck = 0;
    for (const [start, end] of voSpans) {
      const v = interpolate(f, [start - RAMP, start, end, end + RAMP], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      if (v > duck) duck = v;
    }
    return 1 - 0.3 * duck;
  };

  return (
    <AbsoluteFill style={{backgroundColor: '#0d0a07'}}>
      <OffthreadVideo
        src={staticFile(`clips/${segment.file}`)}
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
        volume={clipVolume}
      />
      {voLines.map((line) => (
        <Sequence
          key={line.file}
          from={Math.round(line.startSec * FPS)}
          durationInFrames={Math.ceil(line.durationSec * FPS) + 2}
        >
          <Audio src={staticFile(`vo/${line.file}`)} />
        </Sequence>
      ))}
      {segment.number !== undefined && segment.title !== undefined ? (
        <TitleCard number={segment.number} title={segment.title} />
      ) : (
        <IntroTitle />
      )}
      <SegmentCaptions captions={segment.captions} highlightColor={highlightColor} />
    </AbsoluteFill>
  );
};

export const EggHacks: React.FC<z.infer<typeof eggHacksSchema>> = ({
  highlightColor,
  musicVolume,
}) => {
  return (
    <AbsoluteFill style={{backgroundColor: '#0d0a07'}}>
      <TransitionSeries>
        {SEGMENTS.map((segment, i) => (
          <React.Fragment key={segment.file}>
            {i > 0 ? (
              <TransitionSeries.Transition
                presentation={fade()}
                timing={linearTiming({durationInFrames: TRANSITION_FRAMES})}
              />
            ) : null}
            <TransitionSeries.Sequence durationInFrames={segment.durationInFrames}>
              <SegmentVideo segment={segment} highlightColor={highlightColor} />
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}
      </TransitionSeries>
      <Audio
        src={staticFile('music.mp3')}
        volume={(f) => {
          const duck = 1 - 0.55 * speechActivity(f);
          const fadeInOut = interpolate(
            f,
            [0, FPS, EGG_HACKS_DURATION - 2 * FPS, EGG_HACKS_DURATION - 6],
            [0, 1, 1, 0],
            {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
          );
          return musicVolume * duck * fadeInOut;
        }}
      />
    </AbsoluteFill>
  );
};
