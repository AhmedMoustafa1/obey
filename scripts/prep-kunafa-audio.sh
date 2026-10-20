#!/usr/bin/env bash
# Builds a beat-locked, level-matched music bed for BetaBabyKunafa from an ElevenLabs instrumental.
#
# What it does, in order:
#   1. trims the track to start on its first beat (--start; default = --grid0),
#   2. optionally removes whole beats at a splice (--cut / --land are beat indices on the track's own
#      grid; the join is an equal-power 120ms crossfade),
#   3. optionally rides the intro up (--intro-boost DB:SECONDS) for tracks whose first bars are much
#      quieter than the groove,
#   4. gains the result to a common integrated loudness (--lufs) and catches peaks with a limiter, so every
#      candidate track sits at the same level against the foley and can be compared fairly.
#
# Grid facts for the tracks used so far (measured against the kick / percussion):
#   v2 (the original 96 BPM bed)  --grid0 0.0368 --beat 0.625 --cut 24 --land 32     (defaults)
#   A  scored-to-video, 120 BPM   --grid0 -0.008 --start 0 --beat 0.5 --cut 32 --land 40
#   B  wild 120 BPM v1            --grid0 -0.016 --start 0 --beat 0.5 --no-splice --intro-boost 9:7.95
#   C  wild 120 BPM v2            --grid0 -0.012 --start 0 --beat 0.5 --cut 12 --land 20
# At 120 BPM a beat is 12 frames @ 24fps; A and C drop 8 beats so their final hit lands on frame 576.
#
# Usage: scripts/prep-kunafa-audio.sh <in.mp3> <out.mp3> [options]
set -euo pipefail

IN="${1:?usage: prep-kunafa-audio.sh <in.mp3> <out.mp3> [options]}"
OUT="${2:?usage: prep-kunafa-audio.sh <in.mp3> <out.mp3> [options]}"
shift 2

GRID0=0.0368; START=""; BEAT=0.625; CUT=24; LAND=32; LUFS=-13.9; INTRO_BOOST=""; XF=0.12
while [[ $# -gt 0 ]]; do
  case "$1" in
    --grid0) GRID0="$2"; shift 2 ;;
    --start) START="$2"; shift 2 ;;
    --beat) BEAT="$2"; shift 2 ;;
    --cut) CUT="$2"; shift 2 ;;
    --land) LAND="$2"; shift 2 ;;
    --no-splice) LAND="$CUT"; shift ;;
    --lufs) LUFS="$2"; shift 2 ;;
    --intro-boost) INTRO_BOOST="$2"; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 1 ;;
  esac
done
START="${START:-$GRID0}"
py() { python3 -c "print($1)"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ "$LAND" != "$CUT" ]]; then
  CUT_T=$(py "$GRID0 + $CUT*$BEAT")
  LAND_T=$(py "$GRID0 + $LAND*$BEAT")
  ffmpeg -hide_banner -v error -y -i "$IN" -filter_complex "
    [0:a]asplit=2[a][b];
    [a]atrim=start=${START}:end=$(py "$CUT_T + $XF/2"),asetpts=PTS-STARTPTS[head];
    [b]atrim=start=$(py "$LAND_T - $XF/2"),asetpts=PTS-STARTPTS[tail];
    [head][tail]acrossfade=d=${XF}:c1=qsin:c2=qsin
  " -c:a pcm_f32le "$TMP/joined.wav"
else
  ffmpeg -hide_banner -v error -y -i "$IN" -af "atrim=start=${START},asetpts=PTS-STARTPTS" -c:a pcm_f32le "$TMP/joined.wav"
fi

# optional intro ride: +DB for the first SECONDS, released over 50ms so the groove's first hit is untouched
FILTER="anull"
if [[ -n "$INTRO_BOOST" ]]; then
  DB="${INTRO_BOOST%%:*}"; SEC="${INTRO_BOOST##*:}"
  FILTER="volume=volume='pow(10,(if(lt(t,${SEC}),${DB},if(lt(t,${SEC}+0.05),${DB}*(1-(t-${SEC})/0.05),0)))/20)':eval=frame"
fi
ffmpeg -hide_banner -v error -y -i "$TMP/joined.wav" -af "$FILTER" -c:a pcm_f32le "$TMP/ridden.wav"

# integrated loudness -> gain to the common target, then a limiter at -1.5 dBFS
loudness() { ffmpeg -hide_banner -i "$1" -af ebur128 -f null - 2>&1 | sed -n '/Summary/,$p' | sed -n 's/.*I: *\(-\?[0-9.]*\) LUFS.*/\1/p' | head -1; }
MEASURED=$(loudness "$TMP/ridden.wav")
GAIN=$(py "round($LUFS - ($MEASURED), 2)")
mkdir -p "$(dirname "$OUT")"
# the limiter takes a little loudness back, so close the loop: re-measure the encoded result and nudge the gain
for _ in 1 2 3; do
  ffmpeg -hide_banner -v error -y -i "$TMP/ridden.wav" \
    -af "volume=${GAIN}dB,alimiter=limit=0.84:level=disabled" -c:a libmp3lame -b:a 256k "$OUT"
  GOT=$(loudness "$OUT")
  DIFF=$(py "round($LUFS - ($GOT), 2)")
  [[ $(py "1 if abs($DIFF) < 0.1 else 0") == 1 ]] && break
  GAIN=$(py "round($GAIN + $DIFF, 2)")
done

echo "wrote $OUT  (measured ${MEASURED} LUFS, gain ${GAIN} dB -> ${GOT} LUFS, target ${LUFS})"
