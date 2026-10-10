// Measure each shot's average color in the Mahshi clips and write
// src/mahshi-grade.json — the data the composition's per-shot color match
// is computed from (see `shotGains` in src/compositions/Mahshi.tsx).
//
// The AI-generated clips contain their own internal cuts, and each shot came
// out with a slightly different orange cast, so stats are per shot, not per
// clip. Shots are found by frame-difference cut detection; the mean is taken
// over midtone pixels only (crushed shadows and clipped highlights such as
// steam would otherwise skew the white balance).
//
// Usage: node scripts/measure-shot-color.mjs
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';

const CLIPS = ['01-the-snatch.mp4', '02-core-and-stuff.mp4', '03-simmer-and-verdict.mp4'];
const W = 54;
const H = 96;
// A cut is an isolated spike in mean abs RGB difference between consecutive
// frames: big in absolute terms and clearly above both neighbours (fast camera
// moves in these clips reach ~0.12 but rise and fall gradually).
const CUT_MIN_DIFF = 0.15;
const CUT_SPIKE_RATIO = 1.4;

const decode = (file) => {
  const res = spawnSync(
    'npx',
    [
      'remotion', 'ffmpeg', '-v', 'error',
      '-i', path.join('public', 'clips', 'mahshi', file),
      '-vf', `scale=${W}:${H}`,
      '-f', 'image2pipe', '-c:v', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ],
    {maxBuffer: 1 << 30},
  );
  if (res.status !== 0) {
    throw new Error(`ffmpeg failed for ${file}: ${res.stderr}`);
  }
  const px = W * H * 3;
  const frames = [];
  for (let o = 0; o + px <= res.stdout.length; o += px) {
    frames.push(res.stdout.subarray(o, o + px));
  }
  return frames;
};

const frameDiff = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length / 255;
};

const round = (v) => Math.round(v * 10000) / 10000;

const out = {};
for (const file of CLIPS) {
  const frames = decode(file);
  const diffs = [0];
  for (let f = 1; f < frames.length; f++) diffs.push(frameDiff(frames[f - 1], frames[f]));
  const cuts = [0];
  for (let f = 1; f < frames.length; f++) {
    const neighbour = Math.max(diffs[f - 1], diffs[f + 1] ?? 0);
    if (diffs[f] > CUT_MIN_DIFF && diffs[f] > CUT_SPIKE_RATIO * neighbour) cuts.push(f);
  }
  cuts.push(frames.length);

  out[file] = [];
  for (let s = 0; s + 1 < cuts.length; s++) {
    const [from, to] = [cuts[s], cuts[s + 1]];
    const acc = [0, 0, 0];
    let lumaSum = 0;
    let n = 0;
    let all = 0;
    // Skip each shot's first/last frame — AI cuts sometimes blend across them.
    for (let f = from + 1; f < to - 1; f++) {
      const fr = frames[f];
      for (let i = 0; i < fr.length; i += 3) {
        const r = fr[i] / 255;
        const g = fr[i + 1] / 255;
        const b = fr[i + 2] / 255;
        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        lumaSum += y;
        all++;
        if (y > 0.04 && y < 0.92) {
          acc[0] += r;
          acc[1] += g;
          acc[2] += b;
          n++;
        }
      }
    }
    out[file].push({
      from,
      to,
      rgb: acc.map((v) => round(v / n)),
      luma: round(lumaSum / all),
    });
  }
  console.log(file, out[file].map((s) => `${s.from}-${s.to} rgb=${s.rgb.join(',')}`).join(' | '));
}

writeFileSync(path.join('src', 'mahshi-grade.json'), JSON.stringify(out, null, 2) + '\n');
console.log('Wrote src/mahshi-grade.json');
