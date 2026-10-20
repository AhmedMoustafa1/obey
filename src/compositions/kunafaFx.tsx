import React from 'react';
import {AbsoluteFill, Easing, interpolate, random, useCurrentFrame, useVideoConfig} from 'remotion';

// ─── Transitions ────────────────────────────────────────────────────────────
// The kunafa edit cuts on the beat. Each cut is an "effect cut": the outgoing shot ramps into the
// effect over its last `half` frames and the incoming shot ramps out of it over its first `half`
// frames, so the swap happens at peak intensity, hidden behind blur / light. No overlap is needed,
// so no source footage is spent on transitions.

export type CutKind = 'zoom' | 'whipUp' | 'whipLeft' | 'flash' | 'golden' | 'intro';
export type Cut = {kind: CutKind; half: number; color?: string};

export type CutState = {cut: Cut; e: number; side: 'in' | 'out'};

// e runs 0 → 1 across the outgoing half and 1 → 0 across the incoming half (null = no effect now).
export const cutState = (
  frame: number,
  duration: number,
  cutIn: Cut | null,
  cutOut: Cut | null,
): CutState | null => {
  if (cutIn && frame < cutIn.half) {
    const t = interpolate(frame, [0, cutIn.half], [1, 0], {extrapolateRight: 'clamp'});
    return {cut: cutIn, e: Easing.out(Easing.cubic)(t), side: 'in'};
  }
  if (cutOut && frame >= duration - cutOut.half) {
    const t = interpolate(frame, [duration - cutOut.half, duration], [0, 1], {
      extrapolateLeft: 'clamp',
    });
    return {cut: cutOut, e: Easing.in(Easing.cubic)(t), side: 'out'};
  }
  return null;
};

export type CutStyle = {
  transform: string;
  filter: string;
  // directional motion blur, applied through an SVG filter (CSS blur() is isotropic)
  directionalBlur?: {sx: number; sy: number};
};

// Visual response of the footage layer at effect energy `e` (0 = untouched, 1 = peak at the cut).
export const cutStyle = (
  kind: CutKind,
  e: number,
  side: 'in' | 'out',
  width: number,
  height: number,
): CutStyle => {
  const sign = side === 'out' ? -1 : 1; // out leaves one way, in arrives from the other
  switch (kind) {
    case 'zoom':
      return {
        transform: `scale(${1 + 0.38 * e})`,
        filter: `blur(${(e * 16).toFixed(2)}px) brightness(${1 + 0.18 * e})`,
      };
    case 'whipUp':
      return {
        transform: `translateY(${(-sign * e * 0.14 * height).toFixed(1)}px) scale(${1 + 0.16 * e})`,
        filter: '',
        directionalBlur: {sx: 0, sy: e * 46},
      };
    case 'whipLeft':
      return {
        transform: `translateX(${(-sign * e * 0.12 * width).toFixed(1)}px) scale(${1 + 0.16 * e})`,
        filter: '',
        directionalBlur: {sx: e * 46, sy: 0},
      };
    case 'flash':
      return {
        transform: `scale(${1 + 0.1 * e})`,
        filter: `blur(${(e * 6).toFixed(2)}px) brightness(${1 + 1.2 * e})`,
      };
    case 'golden':
      return {
        transform: `scale(${1 + 0.06 * e})`,
        filter: `blur(${(e * 5).toFixed(2)}px) brightness(${1 + 0.25 * e}) saturate(${1 + 0.4 * e})`,
      };
    case 'intro':
      return {
        transform: `scale(${1 + 0.1 * e})`,
        filter: `brightness(${1 - 0.6 * e})`,
      };
  }
};

// Warm light that blooms over the cut for `flash` / `golden`.
export const CutLight: React.FC<{state: CutState | null; fallbackColor: string}> = ({
  state,
  fallbackColor,
}) => {
  if (!state || state.e <= 0.001) return null;
  const {cut, e} = state;
  const color = cut.color ?? fallbackColor;
  if (cut.kind === 'flash') {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: color,
          opacity: Math.min(1, e * e * 0.95),
          mixBlendMode: 'screen',
        }}
      />
    );
  }
  if (cut.kind === 'golden') {
    // a diagonal sheen sweeping across the frame with the cut
    const sweep = interpolate(e, [0, 1], [-30, 55]);
    return (
      <AbsoluteFill
        style={{
          opacity: Math.min(1, e * 1.1),
          mixBlendMode: 'screen',
          background: `radial-gradient(ellipse 85% 55% at ${50 + sweep}% ${70 - sweep * 0.6}%, ${color} 0%, rgba(255,150,40,0.55) 38%, rgba(255,120,30,0) 72%)`,
        }}
      />
    );
  }
  return null;
};

// ─── Camera ─────────────────────────────────────────────────────────────────
// Slow push / pull across a shot so locked-off AI footage keeps breathing. Eased, deterministic.
export const cameraTransform = (
  frame: number,
  duration: number,
  from: number,
  to: number,
  driftX = 0,
  driftY = 0,
): string => {
  const t = Easing.inOut(Easing.quad)(
    interpolate(frame, [0, Math.max(1, duration - 1)], [0, 1], {extrapolateRight: 'clamp'}),
  );
  const s = from + (to - from) * t;
  return `translate(${(driftX * t).toFixed(1)}px, ${(driftY * t).toFixed(1)}px) scale(${s.toFixed(4)})`;
};

// ─── Impact (the pastry pull-apart) ─────────────────────────────────────────
const IMPACT_FRAMES = 10;

export const impactAt = (
  frame: number,
  hit: number,
): {scale: number; shakeX: number; shakeY: number; flash: number} => {
  const f = frame - hit;
  if (f < 0 || f > IMPACT_FRAMES) return {scale: 1, shakeX: 0, shakeY: 0, flash: 0};
  const decay = 1 - f / IMPACT_FRAMES;
  return {
    scale: 1 + 0.07 * Math.sin(Math.min(1, f / 3) * (Math.PI / 2)) * decay,
    shakeX: (random(`ix${f}`) - 0.5) * 22 * decay,
    shakeY: (random(`iy${f}`) - 0.5) * 22 * decay,
    flash: 0.28 * decay * decay,
  };
};

// ─── Alma reveal sparkles ───────────────────────────────────────────────────
const STAR =
  'M0,-1 C0.12,-0.3 0.3,-0.12 1,0 C0.3,0.12 0.12,0.3 0,1 C-0.12,0.3 -0.3,0.12 -1,0 C-0.3,-0.12 -0.12,-0.3 0,-1 Z';
const HEART = 'M0,0.9 C-1.3,-0.2 -0.7,-1 0,-0.45 C0.7,-1 1.3,-0.2 0,0.9 Z';

// Where the baby's face sits in the card (fractions of the frame): sparkles avoid this ellipse.
const FACE = {x: 0.5, y: 0.64, rx: 0.4, ry: 0.19};

// Soft stars and hearts drifting upward over the newborn card. Positions are seeded, so every
// frame renders identically; nothing here is text.
export const AlmaSparkles: React.FC<{color: string; count?: number}> = ({color, count = 30}) => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
      <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
        {Array.from({length: count}, (_, i) => {
          const x0 = random(`sx${i}`) * width;
          const size = 14 + random(`ss${i}`) * 30;
          const speed = 0.05 + random(`sv${i}`) * 0.07; // fraction of the frame height per second
          const phase = random(`sp${i}`);
          const rise = (phase + t * speed) % 1.15;
          const y = height * (1.08 - rise);
          const sway = Math.sin(t * (0.9 + random(`sw${i}`)) + i) * 26;
          const twinkle = 0.5 + 0.5 * Math.sin(t * (2.2 + random(`st${i}`) * 3) + i * 1.7);
          const fadeEdge = interpolate(rise, [0, 0.12, 0.95, 1.15], [0, 1, 1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const heart = i % 3 === 0;
          const rot = heart ? Math.sin(t + i) * 14 : t * 30 * (i % 2 ? 1 : -1);
          // keep the baby's face clear: particles fade out as they cross it
          const px = (x0 + sway) / width - FACE.x;
          const py = y / height - FACE.y;
          const inFace = Math.sqrt((px / FACE.rx) ** 2 + (py / FACE.ry) ** 2);
          const faceClear = interpolate(inFace, [0.8, 1.25], [0.12, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <path
              key={i}
              d={heart ? HEART : STAR}
              fill={heart ? '#ffb3cf' : color}
              opacity={(heart ? 0.7 : 0.9) * fadeEdge * faceClear * (0.35 + 0.65 * twinkle)}
              transform={`translate(${x0 + sway}, ${y}) rotate(${rot}) scale(${size})`}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
