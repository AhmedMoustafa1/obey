// Build src/captions/<slug>.json (Caption[] for @remotion/captions) for the
// EggHacks edit. Captions transcribe what is actually heard, word-synced:
//
//  1. The voiceover lines (public/vo/*.mp3): each line's known text is aligned
//     to its own audio by RMS energy analysis (clean studio speech aligns
//     tightly), then shifted by the line's placement from src/vo-manifest.json.
//  2. Real footage dialogue/SFX: "Seven egg hacks." + SPLAT! in the intro and
//     the "Wow!" in the strainer clip, aligned to the clip audio.
//
// Usage: node scripts/build-captions.mjs <clip-wav-dir> <vo-wav-dir>
//   clip-wav-dir: 16kHz mono WAVs extracted from public/clips/*.mp4
//   vo-wav-dir:   16kHz mono WAVs extracted from public/vo/*.mp3
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';

const clipWavDir = process.argv[2];
const voWavDir = process.argv[3];
if (!clipWavDir || !voWavDir) {
  console.error('Usage: node scripts/build-captions.mjs <clip-wav-dir> <vo-wav-dir>');
  process.exit(1);
}

const voManifest = JSON.parse(
  readFileSync(path.join(process.cwd(), 'src', 'vo-manifest.json'), 'utf8'),
);

// Must match the generated audio verbatim — the VO speaks the captions.
const VO_TEXTS = {
  '01s1.mp3': 'Crack it into a strainer',
  '01s2.mp3': 'Watery whites drain away',
  '01s3.mp3': 'The perfect poach',
  '02s1.mp3': 'A spoonful of yogurt in the eggs',
  '02s2.mp3': 'Whisk it right in',
  '02s3.mp3': 'Low heat, big patience',
  '03s1.mp3': 'Parmesan goes in first',
  '03s2.mp3': 'Crack the egg right on top',
  '03s3.mp3': 'Lacy crispy edges',
  '04s1.mp3': 'When peeling goes wrong…',
  '04s2.mp3': 'Teta steams them instead',
  '04s3.mp3': 'The shell slips right off',
  '05s1.mp3': 'Chili crisp in the pan first',
  '05s2.mp3': 'The egg fries inside it',
  '05s3.mp3': 'Spicy crispy magic',
  '06s1.mp3': 'No more broken yolks',
  '06s2.mp3': 'Splash of water, lid on',
  '06s3.mp3': 'Steam does the rest',
  '07s1.mp3': 'Crack them into a bottle',
  '07s2.mp3': 'Shake shake SHAKE',
  '07s3.mp3': 'The fluffiest scramble',
};

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

const findIslands = (env, thresh, {mergeGapMs = 260, minMs = 150} = {}) => {
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
    if (prev && isl.startMs - prev.endMs < mergeGapMs) prev.endMs = isl.endMs;
    else merged.push({...isl});
  }
  return merged.filter((i) => i.endMs - i.startMs >= minMs);
};

const peakIn = (env, isl) => {
  let peak = 0;
  const from = Math.floor(isl.startMs / HOP_MS);
  const to = Math.min(env.length, Math.ceil(isl.endMs / HOP_MS));
  for (let i = from; i < to; i++) if (env[i] > peak) peak = env[i];
  return peak;
};

const islandsOfFile = (file, opts) => {
  const env = envelope(readWavSamples(file));
  const sorted = [...env].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  let islands = findIslands(env, floor + 0.22 * (p95 - floor), opts);
  if (islands.length === 0) islands = findIslands(env, floor + 0.1 * (p95 - floor), opts);
  return {env, islands};
};

const loudestIslandIn = (env, islands, fromMs, toMs) => {
  const inWindow = islands.filter((i) => i.endMs > fromMs && i.startMs < toMs);
  if (inWindow.length === 0) return null;
  return inWindow.reduce((a, b) => (peakIn(env, b) > peakIn(env, a) ? b : a));
};

const wordWeights = (words) =>
  words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5);

// Distribute words across speech islands in order, proportionally to length.
// Words flow through islands like text through columns: when an island is
// full, the next word starts at the next island (so caption pauses land on
// the audio's real pauses).
const alignWordsToIslands = (text, islands) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const weights = wordWeights(words);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const totalMs = islands.reduce((s, i) => s + (i.endMs - i.startMs), 0);

  const result = [];
  let islandIdx = 0;
  let cursor = islands[0].startMs;
  for (let w = 0; w < words.length; w++) {
    const dur = (weights[w] / totalWeight) * totalMs;
    let isl = islands[islandIdx];
    // If less than half this word fits in the current island, move on.
    if (cursor + dur / 2 > isl.endMs && islandIdx < islands.length - 1) {
      islandIdx++;
      isl = islands[islandIdx];
      cursor = isl.startMs;
    }
    const startMs = cursor;
    const endMs = Math.min(Math.max(cursor + dur, startMs + 120), isl.endMs + 200);
    result.push({word: words[w], startMs: Math.round(startMs), endMs: Math.round(endMs)});
    cursor = endMs;
  }
  return result;
};

const toCaption = (word, startMs, endMs) => ({
  text: ' ' + word,
  startMs,
  endMs,
  timestampMs: Math.round((startMs + endMs) / 2),
  confidence: null,
});

// ---- Voiceover captions, word-synced to the VO audio. ----
const out = {
  '00-intro': [],
  '01-strainer-poached': [],
  '02-yogurt-scramble': [],
  '03-parmesan-crispy': [],
  '04-easy-peel': [],
  '05-chili-crisp': [],
  '06-steam-lid-sunny': [],
  '07-bottle-shake': [],
};
for (const [slug, lines] of Object.entries(voManifest)) {
  for (const line of lines) {
    const text = VO_TEXTS[line.file];
    if (!text) throw new Error(`No VO text for ${line.file}`);
    const {islands} = islandsOfFile(path.join(voWavDir, line.file.replace(/\.mp3$/, '.wav')), {
      mergeGapMs: 200,
      minMs: 100,
    });
    const offset = line.startSec * 1000;
    const aligned = alignWordsToIslands(text, islands.length ? islands : [
      {startMs: 0, endMs: line.durationSec * 1000},
    ]);
    for (const {word, startMs, endMs} of aligned) {
      out[slug].push(toCaption(word, Math.round(offset + startMs), Math.round(offset + endMs)));
    }
    console.log(
      `${line.file}: ${islands.length} islands -> "${text.split(/\s+/)[0]}…" ${Math.round(offset + aligned[0].startMs)}–${Math.round(offset + aligned[aligned.length - 1].endMs)}ms`,
    );
  }
}

// ---- Real footage dialogue/SFX captions (aligned to the clip audio). ----

// Intro: Mom's real "Seven egg hacks." + SPLAT! on the egg impact.
{
  const {env, islands} = islandsOfFile(path.join(clipWavDir, '00-intro.wav'));
  const speech = islands.find((i) => i.startMs < 3000) ?? {startMs: 500, endMs: 2100};
  const lineEnd = Math.min(speech.endMs, speech.startMs + 1900);
  const aligned = alignWordsToIslands('Seven egg hacks.', [
    {startMs: speech.startMs, endMs: lineEnd},
  ]);
  for (const {word, startMs, endMs} of aligned) {
    out['00-intro'].push(toCaption(word, startMs, endMs));
  }
  const splat = loudestIslandIn(env, islands, 3000, 5600);
  if (splat) {
    const start = Math.max(splat.startMs, 3000);
    out['00-intro'].push(toCaption('SPLAT!', Math.round(start), Math.round(start + 1000)));
    console.log('00-intro SPLAT at', Math.round(start));
  }
}

// Strainer: the real "Wow!" on the reveal.
{
  const {env, islands} = islandsOfFile(path.join(clipWavDir, '01-strainer-poached.wav'));
  const wow = loudestIslandIn(env, islands, 7600, 10000);
  if (wow) {
    const start = Math.max(wow.startMs, 7600);
    out['01-strainer-poached'].push(
      toCaption('Wow!', Math.round(start), Math.round(Math.min(start + 800, wow.endMs + 300))),
    );
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
