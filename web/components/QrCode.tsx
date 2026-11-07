'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { cx } from './ui';

/** Black-on-white QR code (phone cameras read it in both themes), drawn as SVG in the browser. */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const [svg, setSvg] = useState<{ value: string; markup: string } | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((markup) => {
        if (alive) setSvg({ value, markup });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value]);

  const ready = svg?.value === value;
  return (
    <div
      role="img"
      aria-label={label}
      className={cx('aspect-square rounded-xl bg-white p-2 shadow-sm ring-1 ring-line [&>svg]:size-full', !ready && 'animate-pulse', className)}
      // The markup is generated locally by the qrcode library from our own URL.
      dangerouslySetInnerHTML={ready ? { __html: svg.markup } : undefined}
    />
  );
}
