// Build src/captions/<slug>.json (Caption[] for @remotion/captions) for the
// EggHacks edit. Two sources, merged per clip:
//
//  1. Real dialogue (from ElevenLabs Scribe transcripts), word-aligned to the
//     clip audio by RMS energy analysis of the extracted 16kHz mono WAVs.
//  2. Step captions (storyboard action text) with authored time windows,
//     words spread evenly inside each window for TikTok-style word pop.
//
// Usage: node scripts/build-captions.mjs <wav-dir>
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';

const wavDir = process.argv[2];
if (!wavDir) {
  console.error('Usage: node scripts/build-captions.mjs <wav-dir>');
  process.exit(1);
}

const SAMPLE_RATE = 16000;
const HOP_MS = 20;
const WIN_MS = 40;

const readWavSamples = (file) => {
  const buf = readFileSync(file);
  let offset = 12;
  while (offset < buf.length - 8) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      const samples = new Int16Array(size / 2);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = buf.readInt16LE(offset + 8 + i * 2);
      }
      return samples;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`No data chunk in ${file}`);
};

const envelope = (samples) => {
  const hop = (SAMPLE_RATE * HOP_MS) / 1000;
  const win = (SAMPLE_RATE * WIN_MS) / 1000;
  const frames = [];
  for (let start = 0; start + win <= samples.length; start += hop) {
    let sum = 0;
    for (let i = start; i < start + win; i++) sum += samples[i] * samples[i];
    frames.push(Math.sqrt(sum / win));
  }
  return frames;
};

const findIslands = (env, thresh) => {
  const raw = [];
  let start = null;
  for (let i = 0; i < env.length; i++) {
    if (env[i] >= thresh && start === null) start = i;
    if ((env[i] < thresh || i === env.length - 1) && start !== null) {
      raw.push({startMs: start * HOP_MS, endMs: i * HOP_MS});
      start = null;
    }
  }
  const merged = [];
  for (const isl of raw) {
    const prev = merged[merged.length - 1];
    if (prev && isl.startMs - prev.endMs < 260) prev.endMs = isl.endMs;
    else merged.push({...isl});
  }
  return merged.filter((i) => i.endMs - i.startMs >= 150);
};

const peakIn = (env, isl) => {
  let peak = 0;
  const from = Math.floor(isl.startMs / HOP_MS);
  const to = Math.min(env.length, Math.ceil(isl.endMs / HOP_MS));
  for (let i = from; i < to; i++) if (env[i] > peak) peak = env[i];
  return peak;
};

const islandsOf = (slug) => {
  const env = envelope(readWavSamples(path.join(wavDir, `${slug}.wav`)));
  const sorted = [...env].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  let islands = findIslands(env, floor + 0.22 * (p95 - floor));
  if (islands.length === 0) islands = findIslands(env, floor + 0.1 * (p95 - floor));
  return {env, islands};
};

const loudestIslandIn = (env, islands, fromMs, toMs) => {
  const inWindow = islands.filter((i) => i.endMs > fromMs && i.startMs < toMs);
  if (inWindow.length === 0) return null;
  return inWindow.reduce((a, b) => (peakIn(env, b) > peakIn(env, a) ? b : a));
};

// Spread words evenly across [startMs, endMs], weighted by word length.
const spreadWords = (text, startMs, endMs) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const weights = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5);
  const total = weights.reduce((a, b) => a + b, 0);
  const span = endMs - startMs;
  const captions = [];
  let cursor = startMs;
  for (let i = 0; i < words.length; i++) {
    const dur = (weights[i] / total) * span;
    captions.push({
      text: ' ' + words[i],
      startMs: Math.round(cursor),
      endMs: Math.round(cursor + dur),
      timestampMs: Math.round(cursor + dur / 2),
      confidence: null,
    });
    cursor += dur;
  }
  return captions;
};

// ---- Authored step captions (from the user's storyboards), seconds. ----
const STEPS = {
  '00-intro': [],
  '01-strainer-poached': [
    {text: 'Crack it into a strainer', from: 0.7, to: 2.7},
    {text: 'Watery whites drain away', from: 3.3, to: 5.3},
    {text: 'The perfect poach', from: 5.8, to: 7.4},
  ],
  '02-yogurt-scramble': [
    {text: 'A spoonful of yogurt in the eggs', from: 0.7, to: 3.0},
    {text: 'Whisk it right in', from: 3.5, to: 5.4},
    {text: 'Low heat, big patience', from: 6.0, to: 7.9},
  ],
  '03-parmesan-crispy': [
    {text: 'Parmesan goes in first', from: 0.7, to: 2.8},
    {text: 'Crack the egg right on top', from: 3.4, to: 5.6},
    {text: 'Lacy crispy edges', from: 6.1, to: 7.9},
  ],
  '04-easy-peel': [
    {text: 'When peeling goes wrong…', from: 0.6, to: 2.6},
    {text: 'Teta steams them instead', from: 3.2, to: 5.4},
    {text: 'The shell slips right off', from: 6.2, to: 8.4},
  ],
  '05-chili-crisp': [
    {text: 'Chili crisp in the pan first', from: 0.7, to: 2.9},
    {text: 'The egg fries inside it', from: 3.5, to: 5.6},
    {text: 'Spicy crispy magic', from: 6.1, to: 7.9},
  ],
  '06-steam-lid-sunny': [
    {text: 'No more broken yolks', from: 0.6, to: 2.6},
    {text: 'Splash of water, lid on', from: 3.2, to: 5.4},
    {text: 'Steam does the rest', from: 5.9, to: 7.8},
  ],
  '07-bottle-shake': [
    {text: 'Crack them into a bottle', from: 0.7, to: 2.8},
    {text: 'Shake shake SHAKE', from: 3.4, to: 5.5},
    {text: 'The fluffiest scramble', from: 6.0, to: 8.0},
  ],
};

const out = {};
for (const [slug, steps] of Object.entries(STEPS)) {
  out[slug] = steps.flatMap((s) => spreadWords(s.text, s.from * 1000, s.to * 1000));
}

// ---- Real dialogue, aligned to audio. ----

// Intro: "Seven egg hacks." on the first strong island, then SPLAT! on the
// loudest burst in the 3.0–5.6s window (the egg hitting Mom's forehead).
{
  const {env, islands} = islandsOf('00-intro');
  console.log('00-intro islands:', islands.map((i) => `${i.startMs}-${i.endMs}`).join(', '));
  const speech = islands.find((i) => i.startMs < 3000) ?? {startMs: 500, endMs: 2100};
  const lineEnd = Math.min(speech.endMs, speech.startMs + 1900);
  out['00-intro'].push(...spreadWords('Seven egg hacks.', speech.startMs, lineEnd));
  const splat = loudestIslandIn(env, islands, 3000, 5600);
  if (splat) {
    const start = Math.max(splat.startMs, 3000);
    out['00-intro'].push({
      text: ' SPLAT!',
      startMs: Math.round(start),
      endMs: Math.round(start + 1000),
      timestampMs: Math.round(start + 500),
      confidence: null,
    });
    console.log('00-intro SPLAT at', Math.round(start));
  }
}

// Strainer: "Wow!" on the loudest island in the last 2.5 seconds (the reveal).
{
  const {env, islands} = islandsOf('01-strainer-poached');
  console.log('01-strainer islands:', islands.map((i) => `${i.startMs}-${i.endMs}`).join(', '));
  const wow = loudestIslandIn(env, islands, 7600, 10000);
  if (wow) {
    const start = Math.max(wow.startMs, 7600);
    out['01-strainer-poached'].push({
      text: ' Wow!',
      startMs: Math.round(start),
      endMs: Math.round(Math.min(start + 800, wow.endMs + 300)),
      timestampMs: Math.round(start + 400),
      confidence: null,
    });
    console.log('01-strainer Wow! at', Math.round(start));
  }
}

const outDir = path.join(process.cwd(), 'src', 'captions');
mkdirSync(outDir, {recursive: true});
for (const [slug, captions] of Object.entries(out)) {
  captions.sort((a, b) => a.startMs - b.startMs);
  writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(captions, null, 2) + '\n');
  console.log(`${slug}: ${captions.length} caption tokens`);
}
console.log('Done.');
