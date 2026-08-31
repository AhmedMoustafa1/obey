// Measure public/vo/*.mp3 durations and write src/vo-manifest.json with each
// voiceover line's placement inside its clip.
//
// The VO lines SPEAK the on-screen captions, so each line's start is pinned to
// its caption window's start — captions then re-derive word timing from the
// audio (scripts/build-captions.mjs), keeping text and voice in lockstep.
// A line that runs long toward the next one is reported as an overrun.
//
// Usage: node scripts/build-vo-manifest.mjs
import {parseMedia} from '@remotion/media-parser';
import {nodeReader} from '@remotion/media-parser/node';
import {writeFileSync} from 'node:fs';
import path from 'node:path';

const LINES = [
  {slug: '01-strainer-poached', file: '01s1.mp3', start: 0.7, endCap: 3.1},
  {slug: '01-strainer-poached', file: '01s2.mp3', start: 3.3, endCap: 5.6},
  {slug: '01-strainer-poached', file: '01s3.mp3', start: 5.8, endCap: 8.9},
  {slug: '02-yogurt-scramble', file: '02s1.mp3', start: 0.7, endCap: 3.3},
  {slug: '02-yogurt-scramble', file: '02s2.mp3', start: 3.5, endCap: 5.8},
  {slug: '02-yogurt-scramble', file: '02s3.mp3', start: 6.0, endCap: 9.55},
  {slug: '03-parmesan-crispy', file: '03s1.mp3', start: 0.7, endCap: 3.2},
  {slug: '03-parmesan-crispy', file: '03s2.mp3', start: 3.4, endCap: 5.9},
  {slug: '03-parmesan-crispy', file: '03s3.mp3', start: 6.1, endCap: 9.55},
  {slug: '04-easy-peel', file: '04s1.mp3', start: 0.6, endCap: 3.0},
  {slug: '04-easy-peel', file: '04s2.mp3', start: 3.2, endCap: 6.0},
  {slug: '04-easy-peel', file: '04s3.mp3', start: 6.2, endCap: 9.55},
  {slug: '05-chili-crisp', file: '05s1.mp3', start: 0.7, endCap: 3.3},
  {slug: '05-chili-crisp', file: '05s2.mp3', start: 3.5, endCap: 5.9},
  {slug: '05-chili-crisp', file: '05s3.mp3', start: 6.1, endCap: 9.55},
  {slug: '06-steam-lid-sunny', file: '06s1.mp3', start: 0.6, endCap: 3.0},
  {slug: '06-steam-lid-sunny', file: '06s2.mp3', start: 3.2, endCap: 5.7},
  {slug: '06-steam-lid-sunny', file: '06s3.mp3', start: 5.9, endCap: 9.55},
  {slug: '07-bottle-shake', file: '07s1.mp3', start: 0.7, endCap: 3.2},
  {slug: '07-bottle-shake', file: '07s2.mp3', start: 3.4, endCap: 5.8},
  {slug: '07-bottle-shake', file: '07s3.mp3', start: 6.0, endCap: 9.55},
];

const manifest = {};
let overruns = 0;
for (const line of LINES) {
  const src = path.join(process.cwd(), 'public', 'vo', line.file);
  const {durationInSeconds} = await parseMedia({
    src,
    reader: nodeReader,
    fields: {durationInSeconds: true},
    acknowledgeRemotionLicense: true,
  });
  const dur = durationInSeconds ?? 0;
  const overrun = line.start + dur > line.endCap;
  if (overrun) overruns++;
  (manifest[line.slug] ??= []).push({
    file: line.file,
    startSec: line.start,
    durationSec: Math.round(dur * 100) / 100,
  });
  console.log(
    `${line.file}: ${dur.toFixed(2)}s @ ${line.start.toFixed(2)}s${overrun ? `  ⚠ ends ${(line.start + dur).toFixed(2)} past cap ${line.endCap}` : ''}`,
  );
}

const out = path.join(process.cwd(), 'src', 'vo-manifest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${out}${overruns ? ` (${overruns} overruns)` : ''}`);
