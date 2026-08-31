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
import {fontFamily as interFamily, arabicFontFamily} from '../fonts';

import voManifestEn from '../vo-manifest.json';
import voManifestAr from '../vo-manifest-ar.json';
import introEn from '../captions/00-intro.json';
import strainerEn from '../captions/01-strainer-poached.json';
import yogurtEn from '../captions/02-yogurt-scramble.json';
import parmesanEn from '../captions/03-parmesan-crispy.json';
import easyPeelEn from '../captions/04-easy-peel.json';
import chiliEn from '../captions/05-chili-crisp.json';
import steamLidEn from '../captions/06-steam-lid-sunny.json';
import bottleEn from '../captions/07-bottle-shake.json';
import introAr from '../captions-ar/00-intro.json';
import strainerAr from '../captions-ar/01-strainer-poached.json';
import yogurtAr from '../captions-ar/02-yogurt-scramble.json';
import parmesanAr from '../captions-ar/03-parmesan-crispy.json';
import easyPeelAr from '../captions-ar/04-easy-peel.json';
import chiliAr from '../captions-ar/05-chili-crisp.json';
import steamLidAr from '../captions-ar/06-steam-lid-sunny.json';
import bottleAr from '../captions-ar/07-bottle-shake.json';

export const FPS = 24;
const TRANSITION_FRAMES = 8;

type Locale = 'en' | 'ar';
type VoLine = {file: string; startSec: number; durationSec: number};

type Slug =
  | '00-intro'
  | '01-strainer-poached'
  | '02-yogurt-scramble'
  | '03-parmesan-crispy'
  | '04-easy-peel'
  | '05-chili-crisp'
  | '06-steam-lid-sunny'
  | '07-bottle-shake';

const SEGMENTS: Array<{slug: Slug; file: string; durationInFrames: number; number?: number}> = [
  {slug: '00-intro', file: '00-intro.mp4', durationInFrames: 6 * FPS},
  {slug: '01-strainer-poached', file: '01-strainer-poached.mp4', durationInFrames: 10 * FPS, number: 1},
  {slug: '02-yogurt-scramble', file: '02-yogurt-scramble.mp4', durationInFrames: 10 * FPS, number: 2},
  {slug: '03-parmesan-crispy', file: '03-parmesan-crispy.mp4', durationInFrames: 10 * FPS, number: 3},
  {slug: '04-easy-peel', file: '04-easy-peel.mp4', durationInFrames: 10 * FPS, number: 4},
  {slug: '05-chili-crisp', file: '05-chili-crisp.mp4', durationInFrames: 10 * FPS, number: 5},
  {slug: '06-steam-lid-sunny', file: '06-steam-lid-sunny.mp4', durationInFrames: 10 * FPS, number: 6},
  {slug: '07-bottle-shake', file: '07-bottle-shake.mp4', durationInFrames: 10 * FPS, number: 7},
];

export const EGG_HACKS_DURATION =
  SEGMENTS.reduce((sum, s) => sum + s.durationInFrames, 0) -
  TRANSITION_FRAMES * (SEGMENTS.length - 1);

const segmentStart = (index: number): number =>
  SEGMENTS.slice(0, index).reduce((sum, s) => sum + s.durationInFrames, 0) -
  TRANSITION_FRAMES * index;

// Whisper artifacts worth dropping: bracketed sound events and pure punctuation.
const cleanCaptions = (captions: Caption[]): Caption[] =>
  captions.filter((c) => {
    const t = c.text.trim();
    if (t.length === 0) return false;
    if (/^[[(*♪]/.test(t)) return false;
    return true;
  });

const AR_DIGITS = ['١', '٢', '٣', '٤', '٥', '٦', '٧'];

type LocaleData = {
  fontFamily: string;
  dir: 'ltr' | 'rtl';
  captions: Record<Slug, Caption[]>;
  vo: Record<string, VoLine[]>;
  badge: (n: number) => string;
  titles: Record<number, string>;
  intro: {big: string; main: string; tag: string};
};

const LOCALES: Record<Locale, LocaleData> = {
  en: {
    fontFamily: interFamily,
    dir: 'ltr',
    captions: {
      '00-intro': cleanCaptions(introEn as Caption[]),
      '01-strainer-poached': cleanCaptions(strainerEn as Caption[]),
      '02-yogurt-scramble': cleanCaptions(yogurtEn as Caption[]),
      '03-parmesan-crispy': cleanCaptions(parmesanEn as Caption[]),
      '04-easy-peel': cleanCaptions(easyPeelEn as Caption[]),
      '05-chili-crisp': cleanCaptions(chiliEn as Caption[]),
      '06-steam-lid-sunny': cleanCaptions(steamLidEn as Caption[]),
      '07-bottle-shake': cleanCaptions(bottleEn as Caption[]),
    },
    vo: voManifestEn,
    badge: (n) => `HACK ${n}/7`,
    titles: {
      1: 'Strainer Poached Egg',
      2: 'Creamy Yogurt Scramble',
      3: 'Parmesan Crispy Egg',
      4: 'Easy-Peel Eggs',
      5: 'Chili-Crisp Egg',
      6: 'Steam-Lid Sunny Egg',
      7: 'Bottle-Shake Scramble',
    },
    intro: {big: '7', main: 'EGG HACKS', tag: 'TETA APPROVED'},
  },
  ar: {
    fontFamily: arabicFontFamily,
    dir: 'rtl',
    captions: {
      '00-intro': cleanCaptions(introAr as Caption[]),
      '01-strainer-poached': cleanCaptions(strainerAr as Caption[]),
      '02-yogurt-scramble': cleanCaptions(yogurtAr as Caption[]),
      '03-parmesan-crispy': cleanCaptions(parmesanAr as Caption[]),
      '04-easy-peel': cleanCaptions(easyPeelAr as Caption[]),
      '05-chili-crisp': cleanCaptions(chiliAr as Caption[]),
      '06-steam-lid-sunny': cleanCaptions(steamLidAr as Caption[]),
      '07-bottle-shake': cleanCaptions(bottleAr as Caption[]),
    },
    vo: voManifestAr,
    badge: (n) => `الحيلة ${AR_DIGITS[n - 1]} من ٧`,
    titles: {
      1: 'بيض بوشيه بالمصفاة',
      2: 'سكرامبل كريمي بالزبادي',
      3: 'بيض مقرمش بالبارميزان',
      4: 'بيض سهل التقشير',
      5: 'بيض بالشطة المقرمشة',
      6: 'بيض عيون على البخار',
      7: 'سكرامبل رجّ الإزازة',
    },
    intro: {big: '٧', main: 'حيل للبيض', tag: 'بختم تيتا'},
  },
};

// Frame spans (absolute) where someone is speaking — used to duck the music.
const speechSpansFor = (loc: LocaleData): Array<[number, number]> =>
  SEGMENTS.flatMap((s, i) => {
    const offset = segmentStart(i);
    const captionSpans = loc.captions[s.slug].map(
      (c): [number, number] => [
        offset + (c.startMs / 1000) * FPS,
        offset + (c.endMs / 1000) * FPS,
      ],
    );
    const voSpans = (loc.vo[s.slug] ?? []).map(
      (l): [number, number] => [
        offset + l.startSec * FPS,
        offset + (l.startSec + l.durationSec) * FPS,
      ],
    );
    return [...captionSpans, ...voSpans];
  });

const SPEECH_SPANS: Record<Locale, Array<[number, number]>> = {
  en: speechSpansFor(LOCALES.en),
  ar: speechSpansFor(LOCALES.ar),
};

const speechActivity = (spans: Array<[number, number]>, frame: number): number => {
  const RAMP = 10;
  let max = 0;
  for (const [start, end] of spans) {
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
  locale: z.enum(['en', 'ar']),
  highlightColor: zColor(),
  musicVolume: z.number().min(0).max(1),
});

const PALETTE = {
  cream: '#fdf6e9',
  charcoal: '#2b2016',
  yolk: '#f5a623',
};

const TitleCard: React.FC<{number: number; loc: LocaleData}> = ({number, loc}) => {
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

  const title = loc.titles[number];
  const {fontSize} = fitText({
    text: title,
    withinWidth: width * 0.66,
    fontFamily: loc.fontFamily,
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
          direction: loc.dir,
        }}
      >
        <div
          style={{
            fontFamily: loc.fontFamily,
            fontWeight: 800,
            fontSize: 34,
            letterSpacing: loc.dir === 'rtl' ? 0 : 6,
            color: PALETTE.charcoal,
            backgroundColor: PALETTE.yolk,
            borderRadius: 999,
            padding: '12px 34px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          }}
        >
          {loc.badge(number)}
        </div>
        <div
          style={{
            fontFamily: loc.fontFamily,
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

const IntroTitle: React.FC<{loc: LocaleData}> = ({loc}) => {
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
          direction: loc.dir,
        }}
      >
        <div
          style={{
            fontFamily: loc.fontFamily,
            fontWeight: 800,
            fontSize: 100,
            lineHeight: 1,
            color: PALETTE.cream,
            textShadow: '0 6px 0 rgba(0,0,0,0.25), 0 14px 40px rgba(0,0,0,0.45)',
          }}
        >
          {loc.intro.big}
        </div>
        <div
          style={{
            fontFamily: loc.fontFamily,
            fontWeight: 800,
            fontSize: 64,
            color: PALETTE.cream,
            textShadow: '0 4px 0 rgba(0,0,0,0.25), 0 12px 36px rgba(0,0,0,0.45)',
          }}
        >
          {loc.intro.main}
        </div>
        <div
          style={{
            marginTop: 12,
            fontFamily: loc.fontFamily,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: loc.dir === 'rtl' ? 0 : 4,
            color: PALETTE.charcoal,
            backgroundColor: PALETTE.yolk,
            borderRadius: 999,
            padding: '10px 28px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          }}
        >
          {loc.intro.tag}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CaptionPage: React.FC<{
  page: ReturnType<typeof createTikTokStyleCaptions>['pages'][number];
  highlightColor: string;
  loc: LocaleData;
}> = ({page, highlightColor, loc}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();

  const enter = spring({frame, fps, config: {damping: 200}, durationInFrames: 6});
  const timeInMs = page.startMs + (frame / fps) * 1000;

  const {fontSize} = fitText({
    text: page.text,
    withinWidth: width * 0.82,
    fontFamily: loc.fontFamily,
    fontWeight: '800',
  });

  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          marginBottom: '21%',
          maxWidth: '86%',
          fontFamily: loc.fontFamily,
          fontWeight: 800,
          fontSize: Math.min(62, Math.max(40, fontSize)),
          lineHeight: 1.25,
          textAlign: 'center',
          direction: loc.dir,
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

const SegmentCaptions: React.FC<{
  captions: Caption[];
  highlightColor: string;
  loc: LocaleData;
}> = ({captions, highlightColor, loc}) => {
  const {fps} = useVideoConfig();
  const {pages} = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions,
        // Wide combine window: pages break only on real pauses in the audio
        // (≥450ms of silence between words), so text follows the voiceover.
        combineTokensWithinMilliseconds: 5200,
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
            <CaptionPage page={page} highlightColor={highlightColor} loc={loc} />
          </Sequence>
        );
      })}
    </>
  );
};

const SegmentVideo: React.FC<{
  segment: (typeof SEGMENTS)[number];
  highlightColor: string;
  loc: LocaleData;
}> = ({segment, highlightColor, loc}) => {
  const voLines = loc.vo[segment.slug] ?? [];
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
      {segment.number !== undefined ? (
        <TitleCard number={segment.number} loc={loc} />
      ) : (
        <IntroTitle loc={loc} />
      )}
      <SegmentCaptions
        captions={loc.captions[segment.slug]}
        highlightColor={highlightColor}
        loc={loc}
      />
    </AbsoluteFill>
  );
};

export const EggHacks: React.FC<z.infer<typeof eggHacksSchema>> = ({
  locale,
  highlightColor,
  musicVolume,
}) => {
  const loc = LOCALES[locale];
  const spans = SPEECH_SPANS[locale];

  return (
    <AbsoluteFill style={{backgroundColor: '#0d0a07'}}>
      <TransitionSeries>
        {SEGMENTS.map((segment, i) => (
          <React.Fragment key={segment.slug}>
            {i > 0 ? (
              <TransitionSeries.Transition
                presentation={fade()}
                timing={linearTiming({durationInFrames: TRANSITION_FRAMES})}
              />
            ) : null}
            <TransitionSeries.Sequence durationInFrames={segment.durationInFrames}>
              <SegmentVideo segment={segment} highlightColor={highlightColor} loc={loc} />
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}
      </TransitionSeries>
      <Audio
        src={staticFile('music.mp3')}
        volume={(f) => {
          const duck = 1 - 0.55 * speechActivity(spans, f);
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
