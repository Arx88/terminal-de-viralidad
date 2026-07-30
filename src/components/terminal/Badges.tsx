'use client';

import { PHASE_CONFIG, LEGITIMACY_CONFIG, type Phase, type Legitimacy } from '@/lib/types';

interface PhaseBadgeProps {
  phase: Phase;
  confidence?: number;
  size?: 'sm' | 'md';
}

export function PhaseBadge({ phase, confidence, size = 'md' }: PhaseBadgeProps) {
  const cfg = PHASE_CONFIG[phase];
  const fontSize = size === 'sm' ? 9 : 10;
  const padY = size === 'sm' ? 2 : 3;
  const padX = size === 'sm' ? 5 : 7;

  const suffix = confidence != null ? ` ${(confidence * 100).toFixed(0)}%` : '';

  return (
    <span
      className="inline-flex items-center gap-1 font-mono whitespace-nowrap rounded-sm"
      style={{
        fontSize: `${fontSize}px`,
        padding: `${padY}px ${padX}px`,
        border: `1px solid ${cfg.color}50`,
        background: cfg.glow,
        color: cfg.color,
        letterSpacing: '1px',
        fontWeight: 500,
        textTransform: 'uppercase',
      }}
    >
      <span aria-hidden>{cfg.icon}</span>
      <span>{cfg.label}</span>
      {suffix && <span style={{ opacity: 0.7 }}>{suffix}</span>}
    </span>
  );
}

interface LegitimacyBadgeProps {
  legitimacy: Legitimacy;
  size?: 'sm' | 'md';
}

export function LegitimacyBadge({ legitimacy, size = 'sm' }: LegitimacyBadgeProps) {
  const cfg = LEGITIMACY_CONFIG[legitimacy];
  const fontSize = size === 'sm' ? 8 : 9;
  const padY = size === 'sm' ? 1 : 2;
  const padX = size === 'sm' ? 4 : 6;

  return (
    <span
      className="inline-flex items-center gap-1 font-mono whitespace-nowrap rounded-sm"
      style={{
        fontSize: `${fontSize}px`,
        padding: `${padY}px ${padX}px`,
        border: `1px solid ${cfg.color}40`,
        background: cfg.color + '15',
        color: cfg.color,
        letterSpacing: '0.5px',
        fontWeight: 500,
      }}
    >
      {cfg.label}
    </span>
  );
}
