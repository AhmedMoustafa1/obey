#!/usr/bin/env bash
# Builds public/kunafa/music.mp3 — the beat-locked music bed for BetaBabyKunafa.
#
# Input: an ElevenLabs Music v2.5 instrumental (36s, exactly 96 BPM = 0.625s = 15 frames @ 24fps per beat,
# first beat at 0.0368s, 12 bars of groove that end on a soft final chord at beat 48 = 30.04s). This script
#   1. starts the track on its first beat, so beat N lands on video frame N*15,
#   2. removes 8 beats (2 bars) at the best-matching bar-aligned splice (beat 24 -> beat 32) with a 120ms
#      equal-power crossfade, so the groove ends and the final chord rings out exactly on frame 600 (25.0s),
#      which is where the Alma reveal begins.
#
# Usage: scripts/prep-kunafa-audio.sh <music-variation.mp3> [out.mp3]
set -euo pipefail

IN="${1:?usage: prep-kunafa-audio.sh <music.mp3> [out.mp3]}"
OUT="${2:-public/kunafa/music.mp3}"

FIRST_BEAT=0.0368   # seconds, fitted to the kick drum
BEAT=0.625
XF=0.12             # crossfade length
CUT=$(python3 -c "print($FIRST_BEAT + 24*$BEAT)")    # last beat we keep (start of bar 7)
LAND=$(python3 -c "print($FIRST_BEAT + 32*$BEAT)")   # beat we continue from (start of bar 9)
HEAD_END=$(python3 -c "print($CUT + $XF/2)")
TAIL_START=$(python3 -c "print($LAND - $XF/2)")

mkdir -p "$(dirname "$OUT")"
ffmpeg -hide_banner -v error -y -i "$IN" -filter_complex "
  [0:a]asplit=2[a][b];
  [a]atrim=start=${FIRST_BEAT}:end=${HEAD_END},asetpts=PTS-STARTPTS[head];
  [b]atrim=start=${TAIL_START},asetpts=PTS-STARTPTS[tail];
  [head][tail]acrossfade=d=${XF}:c1=qsin:c2=qsin
" -c:a libmp3lame -b:a 256k "$OUT"

echo "wrote $OUT"
