import React from 'react';
import {AbsoluteFill} from 'remotion';
import {linearTiming, springTiming, TransitionSeries} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import {fontFamily} from '../fonts';

const Scene: React.FC<{background: string; label: string}> = ({
  background,
  label,
}) => {
  return (
    <AbsoluteFill
      style={{
        background,
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily,
      }}
    >
      <h1 style={{fontSize: 110, fontWeight: 800, color: 'white', margin: 0}}>
        {label}
      </h1>
    </AbsoluteFill>
  );
};

// 4 scenes of 60 frames, minus 15 + 20 + 15 frames of overlap = 190 frames total.
export const SceneTransitions: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={60}>
        <Scene background="linear-gradient(135deg, #1f2a63, #4f8bff)" label="Fade" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({durationInFrames: 15})}
      />
      <TransitionSeries.Sequence durationInFrames={60}>
        <Scene background="linear-gradient(135deg, #5f27cd, #b06ab3)" label="Slide" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({direction: 'from-right'})}
        timing={springTiming({config: {damping: 200}, durationInFrames: 20})}
      />
      <TransitionSeries.Sequence durationInFrames={60}>
        <Scene background="linear-gradient(135deg, #0f766e, #34d399)" label="Wipe" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={wipe({direction: 'from-left'})}
        timing={linearTiming({durationInFrames: 15})}
      />
      <TransitionSeries.Sequence durationInFrames={60}>
        <Scene background="linear-gradient(135deg, #7c2d12, #f97316)" label="Done" />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
