import React, {useMemo} from 'react';
import {
  AbsoluteFill,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {z} from 'zod';
import {zColor} from '@remotion/zod-types';
import {createTikTokStyleCaptions, type Caption} from '@remotion/captions';
import {fontFamily} from '../fonts';

export const tikTokCaptionsSchema = z.object({
  highlightColor: zColor(),
});

// In a real project this array comes from transcription (e.g. Whisper via
// @remotion/install-whisper-cpp) or from parseSrt() on an .srt file.
const makeCaption = (text: string, startMs: number, endMs: number): Caption => ({
  text,
  startMs,
  endMs,
  timestampMs: (startMs + endMs) / 2,
  confidence: 1,
});

const words: [string, number, number][] = [
  [' This', 0, 300],
  [' video', 300, 650],
  [' was', 650, 900],
  [' edited', 900, 1350],
  [' entirely', 1350, 1900],
  [' in', 1900, 2100],
  [' code.', 2100, 2700],
  [' Every', 3000, 3400],
  [' word', 3400, 3750],
  [' pops', 3750, 4100],
  [' in', 4100, 4300],
  [' perfectly', 4300, 4900],
  [' on', 4900, 5100],
  [' time.', 5100, 5700],
  [' Remotion', 6000, 6550],
  [' makes', 6550, 6900],
  [' captions', 6900, 7400],
  [' easy.', 7400, 7900],
];

const captions: Caption[] = words.map(([text, startMs, endMs]) =>
  makeCaption(text, startMs, endMs),
);

const CaptionPage: React.FC<{
  page: ReturnType<typeof createTikTokStyleCaptions>['pages'][number];
  highlightColor: string;
}> = ({page, highlightColor}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const enter = spring({frame, fps, config: {damping: 200}, durationInFrames: 8});
  const timeInMs = page.startMs + (frame / fps) * 1000;

  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div
        style={{
          fontFamily,
          fontSize: 72,
          fontWeight: 800,
          textAlign: 'center',
          width: '80%',
          lineHeight: 1.3,
          color: 'white',
          textShadow: '0 4px 24px rgba(0,0,0,0.8)',
          transform: `scale(${0.9 + enter * 0.1})`,
        }}
      >
        {page.tokens.map((token, i) => {
          const active = timeInMs >= token.fromMs && timeInMs < token.toMs;
          return (
            <span
              key={i}
              style={{color: active ? highlightColor : 'white'}}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const TikTokCaptions: React.FC<z.infer<typeof tikTokCaptionsSchema>> = ({
  highlightColor,
}) => {
  const {fps} = useVideoConfig();

  const {pages} = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions,
        combineTokensWithinMilliseconds: 1200,
      }),
    [],
  );

  return (
    <AbsoluteFill style={{background: 'linear-gradient(180deg, #12121c, #2b1055)'}}>
      {pages.map((page, i) => {
        const from = Math.round((page.startMs / 1000) * fps);
        const duration = Math.max(1, Math.round((page.durationMs / 1000) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <CaptionPage page={page} highlightColor={highlightColor} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
