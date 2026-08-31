// Measure public/vo/*.mp3 durations and write src/vo-manifest[-ar].json with
// each voiceover line's placement inside its clip.
//
// The VO lines SPEAK the on-screen captions, so each line's start is pinned to
// its caption window's start — captions then re-derive word timing from the
// audio (scripts/build-captions.mjs), keeping text and voice in lockstep.
// A line that runs long toward the next one is reported as an overrun.
//
// Usage: node scripts/build-vo-manifest.mjs [en|ar]
import {parseMedia} from '@remotion/media-parser';
import {nodeReader} from '@remotion/media-parser/node';
import {writeFileSync} from 'node:fs';
import path from 'node:path';

const locale = process.argv[2] ?? 'en';
if (!['en', 'ar'].includes(locale)) {
  console.error('Usage: node scripts/build-vo-manifest.mjs [en|ar]');
  process.exit(1);
}

// Same caption windows for both locales; the Arabic files carry an `ar` prefix.
const WINDOWS = [
  {slug: '01-strainer-poached', step: 's1', start: 0.7, endCap: 3.1},
  {slug: '01-strainer-poached', step: 's2', start: 3.3, endCap: 5.6},
  {slug: '01-strainer-poached', step: 's3', start: 5.8, endCap: 8.9},
  {slug: '02-yogurt-scramble', step: 's1', start: 0.7, endCap: 3.3},
  {slug: '02-yogurt-scramble', step: 's2', start: 3.5, endCap: 5.8},
  {slug: '02-yogurt-scramble', step: 's3', start: 6.0, endCap: 9.55},
  {slug: '03-parmesan-crispy', step: 's1', start: 0.7, endCap: 3.2},
  {slug: '03-parmesan-crispy', step: 's2', start: 3.4, endCap: 5.9},
  {slug: '03-parmesan-crispy', step: 's3', start: 6.1, endCap: 9.55},
  {slug: '04-easy-peel', step: 's1', start: 0.6, endCap: 3.0},
  {slug: '04-easy-peel', step: 's2', start: 3.2, endCap: 6.0},
  {slug: '04-easy-peel', step: 's3', start: 6.2, endCap: 9.55},
  {slug: '05-chili-crisp', step: 's1', start: 0.7, endCap: 3.3},
  {slug: '05-chili-crisp', step: 's2', start: 3.5, endCap: 5.9},
  {slug: '05-chili-crisp', step: 's3', start: 6.1, endCap: 9.55},
  {slug: '06-steam-lid-sunny', step: 's1', start: 0.6, endCap: 3.0},
  {slug: '06-steam-lid-sunny', step: 's2', start: 3.2, endCap: 5.7},
  {slug: '06-steam-lid-sunny', step: 's3', start: 5.9, endCap: 9.55},
  {slug: '07-bottle-shake', step: 's1', start: 0.7, endCap: 3.2},
  {slug: '07-bottle-shake', step: 's2', start: 3.4, endCap: 5.8},
  {slug: '07-bottle-shake', step: 's3', start: 6.0, endCap: 9.55},
];

const prefix = locale === 'ar' ? 'ar' : '';
const manifest = {};
let overruns = 0;
const lastEnd = {};
for (const w of WINDOWS) {
  const file = `${prefix}${w.slug.slice(0, 2)}${w.step}.mp3`;
  const src = path.join(process.cwd(), 'public', 'vo', file);
  const {durationInSeconds} = await parseMedia({
    src,
    reader: nodeReader,
    fields: {durationInSeconds: true},
    acknowledgeRemotionLicense: true,
  });
  const dur = durationInSeconds ?? 0;
  // If the previous line in this clip runs long, start right after it ends
  // rather than talking over it (captions re-derive from this placement).
  let start = w.start;
  const prevEnd = lastEnd[w.slug] ?? 0;
  let note = '';
  if (prevEnd + 0.05 > start) {
    start = Math.round((prevEnd + 0.05) * 100) / 100;
    note = `  ↪ pushed from ${w.start.toFixed(2)} (prev line runs long)`;
  }
  lastEnd[w.slug] = start + dur;
  const overrun = start + dur > w.endCap + 0.35;
  if (overrun) overruns++;
  (manifest[w.slug] ??= []).push({
    file,
    startSec: start,
    durationSec: Math.round(dur * 100) / 100,
  });
  console.log(
    `${file}: ${dur.toFixed(2)}s @ ${start.toFixed(2)}s${note}${overrun ? `  ⚠ ends ${(start + dur).toFixed(2)} well past cap ${w.endCap}` : ''}`,
  );
}

const out = path.join(
  process.cwd(),
  'src',
  locale === 'ar' ? 'vo-manifest-ar.json' : 'vo-manifest.json',
);
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${out}${overruns ? ` (${overruns} overruns)` : ''}`);
