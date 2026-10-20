#!/usr/bin/env bash
# Levels the ElevenLabs foley takes and writes them to public/kunafa/sfx/.
#
# Peak-normalizing (what the raw takes are closest to) leaves spiky sounds such as the syrup trickle
# or pistachio ticks far quieter than the music bed. Instead each take is gained toward a per-sound
# target for the RMS of its *active* part (frames within 25 dB of its loudest) — capped at 6 dB beyond
# peak-normalizing — and a limiter catches the transients. BetaBabyKunafa's cue volumes are then
# plain relative mix levels.
#
# Usage: scripts/prep-kunafa-sfx.sh <dir-with-raw-mp3s> [out-dir]
#   expects: whoosh_a.mp3 whoosh_b.mp3 crunch_a.mp3 syrup_a.mp3 oven_a.mp3 pistachio_a.mp3 sparkle_a.mp3
set -euo pipefail

IN="${1:?usage: prep-kunafa-sfx.sh <raw-dir> [out-dir]}"
OUT="${2:-public/kunafa/sfx}"
mkdir -p "$OUT"

# raw take : output name : target active-RMS (dBFS)
SPECS=(
  "whoosh_a:whoosh:-17"
  "whoosh_b:whoosh2:-17"
  "crunch_a:crunch:-14"
  "syrup_a:syrup:-18"
  "oven_a:oven:-17"
  "pistachio_a:pistachio:-16"
  "sparkle_a:sparkle:-19"
)

for spec in "${SPECS[@]}"; do
  IFS=: read -r raw name target <<<"$spec"
  gain=$(ffmpeg -hide_banner -v error -i "$IN/$raw.mp3" -ac 1 -ar 22050 -f f32le - | python3 -c "
import sys, numpy as np
x = np.frombuffer(sys.stdin.buffer.read(), dtype=np.float32)
h = 1102  # 50 ms
e = np.array([np.sqrt((x[i:i+h] ** 2).mean()) for i in range(0, len(x) - h, h)])
db = 20 * np.log10(e + 1e-9)
active = db[db > db.max() - 25]
peak = 20 * np.log10(np.abs(x).max() + 1e-9)
# at most 6 dB beyond peak-normalizing (-3 dBFS), so spiky sounds are limited gently, not crushed
print(round(min($target - active.mean(), (-3 - peak) + 6), 2))
")
  ffmpeg -hide_banner -v error -y -i "$IN/$raw.mp3" \
    -af "volume=${gain}dB,alimiter=limit=0.79:level=disabled" -c:a libmp3lame -b:a 192k "$OUT/$name.mp3"
  echo "$raw -> $name.mp3  (gain ${gain} dB, active RMS target ${target} dBFS)"
done
