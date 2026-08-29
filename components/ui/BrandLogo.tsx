'use client'

import React, { useId } from 'react'

// Logo oficial The Track (rebrand): monograma "T" em fita dobrada + fragmento em
// fuga, e o wordmark "thetrack" em Space Grotesk. Os ids de gradiente são únicos
// por instância (useId) pra não colidir quando há mais de um logo na tela.

export function BrandIcon({ size = 28, className = '' }: { size?: number; className?: string }) {
  const u = useId().replace(/:/g, '')
  const g1 = `tt-g1-${u}`, g2 = `tt-g2-${u}`, g3 = `tt-g3-${u}`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={g1} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8FCBFF" /><stop offset="1" stopColor="#2E90FA" /></linearGradient>
        <linearGradient id={g2} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0F4DA8" /><stop offset="0.35" stopColor="#2E90FA" /><stop offset="1" stopColor="#2E90FA" /></linearGradient>
        <linearGradient id={g3} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#093672" /><stop offset="1" stopColor="#1668D9" /></linearGradient>
      </defs>
      <path d="M10 8 H53 A1.5 1.5 0 0 1 54.5 9.5 V17.5 A1.5 1.5 0 0 1 53 19 H22 A12 12 0 0 0 10 8 Z" fill={`url(#${g1})`} />
      <path d="M10 8 A11 11 0 0 1 21 19 H10 Z" fill={`url(#${g1})`} />
      <path d="M24 19 H36 V24 L24 30 Z" fill={`url(#${g3})`} />
      <path d="M24 24 L36 18.6 V50 A4 4 0 0 1 32 54 H28 A4 4 0 0 1 24 50 Z" fill={`url(#${g2})`} />
      <path d="M44 29 H53.5 A1.5 1.5 0 0 1 55 30.5 V46 L46.5 37.5 Z" fill="#16407e" opacity="0.35" transform="translate(-7,7)" />
      <path d="M44 29 H53.5 A1.5 1.5 0 0 1 55 30.5 V46 L46.5 37.5 Z" fill="#1B5AAE" opacity="0.6" transform="translate(-3.5,3.5)" />
      <path d="M44 29 H53.5 A1.5 1.5 0 0 1 55 30.5 V46 L46.5 37.5 Z" fill={`url(#${g1})`} />
    </svg>
  )
}

export function BrandLogo({ size = 28, showWordmark = true, className = '', wordmarkSize }: { size?: number; showWordmark?: boolean; className?: string; wordmarkSize?: number }) {
  const fs = wordmarkSize ?? Math.round(size * 0.72)
  return (
    <div className={`flex items-center ${className}`} style={{ gap: size * 0.28 }}>
      <BrandIcon size={size} />
      {showWordmark && (
        <span
          style={{ fontFamily: 'var(--font-brand), var(--font-app), sans-serif', fontWeight: 700, letterSpacing: '-0.045em', fontSize: fs, lineHeight: 1 }}
          className="select-none"
        >
          <span style={{ color: 'var(--muted-foreground)' }}>the</span>
          <span style={{ color: 'var(--foreground)' }}>track</span>
        </span>
      )}
    </div>
  )
}

export default BrandLogo
