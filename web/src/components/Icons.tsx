import type { SVGProps } from 'react';
import type { Tone } from '../lib/concern';

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const IconOctagonAlert = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z" />
    <path d="M12 8v4.5M12 16h.01" />
  </svg>
);

export const IconTriangleAlert = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M10.3 3.9 1.8 18.2A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const IconCircleCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="m8 12.5 2.7 2.7L16 9.8" />
  </svg>
);

export const IconCircleMinus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M8 12h8" />
  </svg>
);

export const IconArrowLeft = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </svg>
);

export const IconArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export function ToneIcon({ tone, ...p }: { tone: Tone } & SVGProps<SVGSVGElement>) {
  switch (tone) {
    case 'critical':
      return <IconOctagonAlert {...p} />;
    case 'warning':
      return <IconTriangleAlert {...p} />;
    case 'good':
      return <IconCircleCheck {...p} />;
    case 'neutral':
      return <IconCircleMinus {...p} />;
  }
}
