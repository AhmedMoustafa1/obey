// Transcribe public/clips/*.mp4 audio into src/captions/<slug>.json (Caption[]).
// Usage: node scripts/transcribe.mjs <wav-dir>
// Requires wavs extracted at 16kHz mono, named like the clips.
import {
  installWhisperCpp,
  downloadWhisperModel,
  transcribe,
  toCaptions,
} from '@remotion/install-whisper-cpp';
import {existsSync, mkdirSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const WHISPER_PATH = path.join(process.env.HOME ?? '/root', 'whisper.cpp');
const WHISPER_VERSION = '1.5.5';
const MODEL = 'small';

const wavDir = process.argv[2];
if (!wavDir) {
  console.error('Usage: node scripts/transcribe.mjs <wav-dir>');
  process.exit(1);
}

await installWhisperCpp({to: WHISPER_PATH, version: WHISPER_VERSION});
await downloadWhisperModel({model: MODEL, folder: WHISPER_PATH});

const outDir = path.join(process.cwd(), 'src', 'captions');
mkdirSync(outDir, {recursive: true});

const wavs = readdirSync(wavDir)
  .filter((f) => f.endsWith('.wav'))
  .sort();

for (const wav of wavs) {
  const slug = wav.replace(/\.wav$/, '');
  const inputPath = path.join(wavDir, wav);
  console.log(`\n=== Transcribing ${slug}`);
  const whisperCppOutput = await transcribe({
    inputPath,
    whisperPath: WHISPER_PATH,
    whisperCppVersion: WHISPER_VERSION,
    model: MODEL,
    tokenLevelTimestamps: true,
  });
  const {captions} = toCaptions({whisperCppOutput});
  const outPath = path.join(outDir, `${slug}.json`);
  writeFileSync(outPath, JSON.stringify(captions, null, 2));
  console.log(
    `${slug}: ${captions.length} tokens -> ${outPath}`,
    captions.map((c) => c.text).join(''),
  );
}

console.log('\nDone. All transcripts written to src/captions/.');
if (!existsSync(path.join(outDir))) process.exit(1);
