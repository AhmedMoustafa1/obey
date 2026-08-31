import React from 'react';
import {Composition} from 'remotion';
import {Intro, introSchema} from './compositions/Intro';
import {SceneTransitions} from './compositions/SceneTransitions';
import {TikTokCaptions, tikTokCaptionsSchema} from './compositions/TikTokCaptions';
import {LogoReveal, logoRevealSchema} from './compositions/LogoReveal';

export const RemotionRoot: React.FC = () => {
  return (
    <>
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
