// Measure public/vo/*.mp3 durations and compute placement for each voiceover
// line inside its clip, writing src/vo-manifest.json for the EggHacks comp.
//
// Placement: each line has a desired start; lines with a hard end cap (the
// intro must finish before the SPLAT at 4.6s, hack 1's closer before the real
// "Wow!" at 9.08s, closers before the segment's end) are shifted earlier when
// the measured audio would overrun.
//
// Usage: node scripts/build-vo-manifest.mjs
import {parseMedia} from '@remotion/media-parser';
import {nodeReader} from '@remotion/media-parser/node';
import {writeFileSync} from 'node:fs';
import path from 'node:path';

const LINES = [
  {slug: '00-intro', file: '00a.mp3', start: 1.3, endCap: 4.55, minStart: 1.18},
  {slug: '01-strainer-poached', file: '01a.mp3', start: 0.4, endCap: 6.0},
  {slug: '01-strainer-poached', file: '01b.mp3', start: 6.4, endCap: 8.95, minStart: 5.7},
  {slug: '02-yogurt-scramble', file: '02a.mp3', start: 0.4, endCap: 6.0},
  {slug: '02-yogurt-scramble', file: '02b.mp3', start: 6.3, endCap: 9.55, minStart: 5.7},
  {slug: '03-parmesan-crispy', file: '03a.mp3', start: 0.4, endCap: 6.0},
  {slug: '03-parmesan-crispy', file: '03b.mp3', start: 6.3, endCap: 9.55, minStart: 5.7},
  {slug: '04-easy-peel', file: '04a.mp3', start: 0.3, endCap: 6.0},
  {slug: '04-easy-peel', file: '04b.mp3', start: 6.0, endCap: 9.55, minStart: 5.7},
  {slug: '05-chili-crisp', file: '05a.mp3', start: 0.4, endCap: 6.0},
  {slug: '05-chili-crisp', file: '05b.mp3', start: 6.3, endCap: 9.55, minStart: 5.7},
  {slug: '06-steam-lid-sunny', file: '06a.mp3', start: 0.3, endCap: 6.0},
  {slug: '06-steam-lid-sunny', file: '06b.mp3', start: 6.0, endCap: 9.55, minStart: 5.7},
  {slug: '07-bottle-shake', file: '07a.mp3', start: 0.4, endCap: 6.0},
  {slug: '07-bottle-shake', file: '07b.mp3', start: 6.2, endCap: 9.55, minStart: 5.7},
];

const manifest = {};
for (const line of LINES) {
  const src = path.join(process.cwd(), 'public', 'vo', line.file);
  const {durationInSeconds} = await parseMedia({
    src,
    reader: nodeReader,
    fields: {durationInSeconds: true},
    acknowledgeRemotionLicense: true,
  });
  const dur = durationInSeconds ?? 0;
  let start = line.start;
  if (start + dur > line.endCap) {
    start = Math.max(line.minStart ?? 0, line.endCap - dur);
  }
  const overrun = start + dur > line.endCap;
  (manifest[line.slug] ??= []).push({
    file: line.file,
    startSec: Math.round(start * 100) / 100,
    durationSec: Math.round(dur * 100) / 100,
  });
  console.log(
    `${line.file}: ${dur.toFixed(2)}s @ ${start.toFixed(2)}s${overrun ? '  ⚠ OVERRUNS cap ' + line.endCap : ''}`,
  );
}

const out = path.join(process.cwd(), 'src', 'vo-manifest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${out}`);
