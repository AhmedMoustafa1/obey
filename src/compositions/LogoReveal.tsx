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
import {evolvePath} from '@remotion/paths';
import {Trail} from '@remotion/motion-blur';
import {noise2D} from '@remotion/noise';

export const logoRevealSchema = z.object({
  strokeColor: zColor(),
  orbitColor: zColor(),
});

// A circle drawn as an SVG path, plus a checkmark inside it.
const CIRCLE_PATH = 'M 960 240 a 300 300 0 1 1 -0.01 0';
const CHECK_PATH = 'M 830 550 L 930 660 L 1110 440';

export const LogoReveal: React.FC<z.infer<typeof logoRevealSchema>> = ({
  strokeColor,
  orbitColor,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const circleProgress = spring({frame, fps, config: {damping: 200}, durationInFrames: 45});
  const checkProgress = spring({
    frame: frame - 35,
    fps,
    config: {damping: 200},
    durationInFrames: 35,
  });

  const circleEvolution = evolvePath(circleProgress, CIRCLE_PATH);
  const checkEvolution = evolvePath(checkProgress, CHECK_PATH);

  // Organic wobble driven by deterministic noise (never Math.random()).
  const wobbleX = noise2D('wobble-x', frame / 40, 0) * 8;
  const wobbleY = noise2D('wobble-y', 0, frame / 40) * 8;

  // A dot orbiting the logo, motion-blurred with <Trail>.
  const orbitAngle = interpolate(frame, [0, 120], [0, Math.PI * 3]);
  const orbitX = 960 + Math.cos(orbitAngle) * 380;
  const orbitY = 540 + Math.sin(orbitAngle) * 380;
  const orbitOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#101018'}}>
      <AbsoluteFill style={{transform: `translate(${wobbleX}px, ${wobbleY}px)`}}>
        <svg viewBox="0 0 1920 1080" style={{width: '100%', height: '100%'}}>
          <path
            d={CIRCLE_PATH}
            fill="none"
            stroke={strokeColor}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={circleEvolution.strokeDasharray}
            strokeDashoffset={circleEvolution.strokeDashoffset}
          />
          <path
            d={CHECK_PATH}
            fill="none"
            stroke={strokeColor}
            strokeWidth={22}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={checkEvolution.strokeDasharray}
            strokeDashoffset={checkEvolution.strokeDashoffset}
          />
        </svg>
      </AbsoluteFill>
      <Trail layers={6} lagInFrames={0.4} trailOpacity={0.4}>
        <AbsoluteFill>
          <div
            style={{
              position: 'absolute',
              left: orbitX - 18,
              top: orbitY - 18,
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: orbitColor,
              opacity: orbitOpacity,
            }}
          />
        </AbsoluteFill>
      </Trail>
    </AbsoluteFill>
  );
};
