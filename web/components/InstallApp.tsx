'use client';

import { useState } from 'react';
import { promptInstall, useInstallMode } from '@/lib/install';
import { QrCode } from './QrCode';
import { Button, Card, cx } from './ui';

const steps = {
  ios: [
    <>
      Хөтчийн <b>Хуваалцах</b> товчийг (дээшээ сумтай дөрвөлжин ⬆️) дарна.
    </>,
    <>
      Жагсаалтаас <b>Add to Home Screen</b> (Нүүр дэлгэцэнд нэмэх) сонгоно.
    </>,
    <>
      Баруун дээд буланд <b>Add</b> дарна.
    </>,
  ],
  android: [
    <>
      Хөтчийн баруун дээд буланд <b>⋮</b> цэсийг дарна.
    </>,
    <>
      <b>Install app</b> эсвэл <b>Add to Home screen</b> сонгоно.
    </>,
    <>
      <b>Install</b> дарна.
    </>,
  ],
};

/**
 * Home-screen install for the PWA: an Install button where the browser allows it, steps on iPhone
 * and other phones, and on a computer a QR code that opens the game on a phone.
 */
export function InstallApp({ className }: { className?: string }) {
  const mode = useInstallMode();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (mode === 'unknown' || mode === 'installed') return null;

  if (mode === 'desktop') {
    return (
      <Card className={cx('flex items-center gap-4', className)}>
        <QrCode value={`${window.location.origin}/?source=qr`} label="Тоглоомыг утсаар нээх QR код" className="w-32 shrink-0" />
        <div>
          <p className="font-bold">📱 Утсаараа тоглох</p>
          <p className="mt-1 text-sm text-muted">Утасныхаа камераар уншуулж нээгээд, апп болгон нүүр дэлгэцэндээ суулгаарай.</p>
        </div>
      </Card>
    );
  }

  const install = async () => {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={className}>
      <div className="flex items-center gap-3">
        <img src="/icons/icon-192.png" alt="" className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">Апп болгон суулгах</p>
          <p className="text-sm text-muted">Нүүр дэлгэцнээс нээгдэж, бүтэн дэлгэцээр тоглоно.</p>
        </div>
        {mode === 'prompt' ? (
          <Button size="sm" busy={busy} onClick={() => void install()}>
            Суулгах
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Хаах' : 'Яаж?'}
          </Button>
        )}
      </div>
      {open && mode !== 'prompt' ? (
        <ol className="animate-rise mt-3 grid gap-2 border-t border-line pt-3 text-sm">
          {steps[mode].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}
