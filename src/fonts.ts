import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// Self-hosted Inter variable font (latin subset, weights 100–900).
// Committed to public/fonts/ so renders are deterministic and work offline.
// For other Google fonts, either download the woff2 the same way or use
// @remotion/google-fonts (requires network access at render time).
export const fontFamily = 'Inter';

loadFont({
  family: fontFamily,
  url: staticFile('fonts/Inter-latin.woff2'),
  weight: '100 900',
});
