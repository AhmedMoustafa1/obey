// Bridge the tiny digital-silence dropouts that AI-generated clips carry where
// their 8s/10s segments were stitched together, and write the repaired audio
// next to the clip as a lossless WAV (no AAC priming, so it stays frame-aligned).
//
// Each dropout is replaced by the ambience just before it, crossfaded in and
// out over 15ms, so the bed never cuts to nothing mid-scene.
//
// Usage: node scripts/patch-audio-dropouts.mjs public/clips/halloween-1.mp4 [...]
//   writes public/clips/halloween-1.wav
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const SILENCE = 1e-4; // ~ -80 dBFS
const MIN_HOLE = Math.round(0.025 * SAMPLE_RATE); // shorter runs are just a quiet moment
const EDGE_GUARD = Math.round(0.3 * SAMPLE_RATE); // leave real head/tail silence alone
const PAD = Math.round(0.045 * SAMPLE_RATE); // the hole's fade-in/out edges sit this far outside
const XFADE = Math.round(0.015 * SAMPLE_RATE);

const ffmpeg = (args, opts = {}) =>
  execFileSync('npx', ['remotion', 'ffmpeg', '-v', 'error', ...args], {
    maxBuffer: 1 << 30,
    ...opts,
  });

// Remotion's bundled ffmpeg only ships 16/24-bit PCM encoders, so decode through a 24-bit WAV.
const decode = (file, tmp) => {
  ffmpeg(['-y', '-i', file, '-vn', '-c:a', 'pcm_s24le', '-ac', String(CHANNELS), '-ar', String(SAMPLE_RATE), tmp]);
  const buf = readFileSync(tmp);
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      const start = offset + 8;
      const count = Math.floor(Math.min(size, buf.length - start) / 3);
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = buf.readIntLE(start + i * 3, 3) / 8388608;
      return samples;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${tmp}`);
};

const encodeWav = (samples) => {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28);
  header.writeUInt16LE(CHANNELS * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
};

const findHoles = (samples) => {
  const frames = samples.length / CHANNELS;
  const holes = [];
  let start = -1;
  for (let i = 0; i <= frames; i++) {
    const quiet =
      i < frames &&
      Math.abs(samples[i * CHANNELS]) < SILENCE &&
      Math.abs(samples[i * CHANNELS + 1]) < SILENCE;
    if (quiet && start < 0) start = i;
    if (!quiet && start >= 0) {
      if (i - start >= MIN_HOLE && start > EDGE_GUARD && i < frames - EDGE_GUARD) {
        holes.push([start, i]);
      }
      start = -1;
    }
  }
  return holes;
};

const patch = (samples, [a, b]) => {
  const from = a - PAD;
  const length = b + PAD - from;
  const source = from - length;
  if (source < 0) return false;
  for (let i = 0; i < length; i++) {
    const rampIn = Math.sin(Math.min(1, i / XFADE) * (Math.PI / 2));
    const rampOut = Math.cos(Math.min(1, Math.max(0, i - (length - XFADE)) / XFADE) * (Math.PI / 2));
    const patchGain = Math.min(rampIn, rampOut);
    const origGain = Math.sqrt(1 - patchGain * patchGain);
    for (let c = 0; c < CHANNELS; c++) {
      const dst = (from + i) * CHANNELS + c;
      samples[dst] = samples[dst] * origGain + samples[(source + i) * CHANNELS + c] * patchGain;
    }
  }
  return true;
};

const dir = mkdtempSync(path.join(tmpdir(), 'patch-audio-'));
try {
  for (const file of process.argv.slice(2)) {
    const samples = decode(file, path.join(dir, 'decoded.wav'));
    const holes = findHoles(samples);
    const times = holes.map(([a, b]) => `${(a / SAMPLE_RATE).toFixed(3)}-${(b / SAMPLE_RATE).toFixed(3)}s`);
    console.log(`${file}: ${holes.length} dropout(s)${times.length ? ` at ${times.join(', ')}` : ''}`);

    // Patch first to last so each patch reads audio that is already clean.
    for (const hole of holes) {
      if (!patch(samples, hole)) console.warn(`  skipped ${hole[0] / SAMPLE_RATE}s: no audio before it`);
    }

    const out = file.replace(/\.[^.]+$/, '.wav');
    writeFileSync(out, encodeWav(samples));
    console.log(`  wrote ${out} (${(readFileSync(out).length / 1e6).toFixed(1)} MB)`);
  }
} finally {
  rmSync(dir, {recursive: true, force: true});
}
