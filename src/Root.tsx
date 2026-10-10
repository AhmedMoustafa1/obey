import React from 'react';
import {Composition} from 'remotion';
import {
  EggHacks,
  eggHacksSchema,
  EGG_HACKS_DURATION,
  FPS as EGG_HACKS_FPS,
} from './compositions/EggHacks';
import {
  Mahshi,
  mahshiSchema,
  MAHSHI_DURATION,
  FPS as MAHSHI_FPS,
} from './compositions/Mahshi';
import {Intro, introSchema} from './compositions/Intro';
import {SceneTransitions} from './compositions/SceneTransitions';
import {TikTokCaptions, tikTokCaptionsSchema} from './compositions/TikTokCaptions';
import {LogoReveal, logoRevealSchema} from './compositions/LogoReveal';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="EggHacks"
        component={EggHacks}
        durationInFrames={EGG_HACKS_DURATION}
        fps={EGG_HACKS_FPS}
        width={1080}
        height={1920}
        schema={eggHacksSchema}
        defaultProps={{
          locale: 'en' as const,
          highlightColor: '#ffc043',
          musicVolume: 0.3,
        }}
      />
      <Composition
        id="EggHacksAR"
        component={EggHacks}
        durationInFrames={EGG_HACKS_DURATION}
        fps={EGG_HACKS_FPS}
        width={1080}
        height={1920}
        schema={eggHacksSchema}
        defaultProps={{
          locale: 'ar' as const,
          highlightColor: '#ffc043',
          musicVolume: 0.3,
        }}
      />
      <Composition
        id="Mahshi"
        component={Mahshi}
        durationInFrames={MAHSHI_DURATION}
        fps={MAHSHI_FPS}
        width={1080}
        height={1920}
        schema={mahshiSchema}
        defaultProps={{
          colorGrade: true,
          matchStrength: 0.85,
          warmth: -0.04,
          contrast: 0.22,
          saturation: 1,
          musicVolume: 0.65,
          foleyVolume: 1,
          accentColor: '#ffc043',
        }}
      />
      <Composition
        id="Intro"
        component={Intro}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        schema={introSchema}
        defaultProps={{
          title: 'Hello Remotion',
          subtitle: 'Programmatic video editing in React',
          accentColor: '#4f8bff',
        }}
      />
      <Composition
        id="SceneTransitions"
        component={SceneTransitions}
        durationInFrames={190}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="TikTokCaptions"
        component={TikTokCaptions}
        durationInFrames={240}
        fps={30}
        width={1080}
        height={1920}
        schema={tikTokCaptionsSchema}
        defaultProps={{
          highlightColor: '#39e58c',
        }}
      />
      <Composition
        id="LogoReveal"
        component={LogoReveal}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
        schema={logoRevealSchema}
        defaultProps={{
          strokeColor: '#ffffff',
          orbitColor: '#ffb347',
        }}
      />
    </>
  );
};
