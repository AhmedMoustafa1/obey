import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {z} from 'zod';
import {zColor} from '@remotion/zod-types';
import {makeTransform, scale, translateY} from '@remotion/animation-utils';
import {Circle, Star} from '@remotion/shapes';
import {fontFamily} from '../fonts';

export const introSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  accentColor: zColor(),
});

export const Intro: React.FC<z.infer<typeof introSchema>> = ({
  title,
  subtitle,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const titleSpring = spring({frame, fps, config: {damping: 200}});
  const subtitleSpring = spring({frame: frame - 12, fps, config: {damping: 200}});
  const starRotation = interpolate(frame, [0, durationInFrames], [0, 120]);
  const pulse = 1 + 0.05 * Math.sin(frame / 7);
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames - 5],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  return (
    <AbsoluteFill style={{backgroundColor: '#0b0e1a', fontFamily, opacity: fadeOut}}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{position: 'absolute', transform: `rotate(${starRotation}deg)`, opacity: 0.15}}>
          <Star points={6} innerRadius={260} outerRadius={430} fill={accentColor} />
        </div>
        <div style={{position: 'absolute', transform: `scale(${pulse})`, opacity: 0.12}}>
          <Circle radius={330} fill={accentColor} />
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 130,
            fontWeight: 800,
            color: 'white',
            opacity: titleSpring,
            transform: makeTransform([
              scale(interpolate(titleSpring, [0, 1], [0.8, 1])),
              translateY(interpolate(titleSpring, [0, 1], [40, 0])),
            ]),
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: 0,
            marginTop: 24,
            fontSize: 44,
            fontWeight: 500,
            color: accentColor,
            opacity: subtitleSpring,
            transform: makeTransform([
              translateY(interpolate(subtitleSpring, [0, 1], [30, 0])),
            ]),
          }}
        >
          {subtitle}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
