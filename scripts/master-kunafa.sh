#!/usr/bin/env bash
# Final audio master for the BetaBabyKunafa render: two-pass loudnorm to -14 LUFS integrated with a
# -1.5 dBTP true-peak ceiling (the level TikTok / Reels / Shorts normalize to), video stream copied
# untouched. Remotion has no master limiter, so the raw render peaks higher than it is loud.
#
# Usage: scripts/master-kunafa.sh out/beta-baby-kunafa.mp4 [out/beta-baby-kunafa-master.mp4]
set -euo pipefail

IN="${1:?usage: master-kunafa.sh <render.mp4> [master.mp4]}"
OUT="${2:-${IN%.mp4}-master.mp4}"
TARGET="I=-14:TP=-1.5:LRA=11"

# pass 1: measure
STATS=$(ffmpeg -hide_banner -i "$IN" -af "loudnorm=${TARGET}:print_format=json" -vn -f null - 2>&1 \
  | python3 -c "import sys,re,json; t=sys.stdin.read(); print(json.dumps(json.loads(t[t.rindex('{'):t.rindex('}')+1])))")
get() { python3 -c "import json,sys; print(json.loads(sys.argv[1])['$1'])" "$STATS"; }

# pass 2: apply with the measured values (linear gain, no dynamic compression)
ffmpeg -hide_banner -v error -y -i "$IN" \
  -af "loudnorm=${TARGET}:measured_I=$(get input_i):measured_LRA=$(get input_lra):measured_TP=$(get input_tp):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" \
  -c:v copy -c:a aac -b:a 256k -ar 48000 -movflags +faststart "$OUT"

echo "wrote $OUT"
ffmpeg -hide_banner -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | sed -n '/Summary/,$p' | grep -E "I:|LRA:|Peak:"
