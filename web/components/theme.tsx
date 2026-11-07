'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTheme, type ThemePref } from '@/lib/theme';
import { cx, Segmented } from './ui';

/** One tap flips between light and dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setPref } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'Бараан горим руу шилжих' : 'Цайвар горим руу шилжих';
  return (
    <button
      type="button"
      onClick={() => setPref(next)}
      aria-label={label}
      title={label}
      className={cx(
        'relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-panel-2 text-lg ring-1 ring-line transition hover:bg-line active:scale-95',
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 22, rotate: -90, opacity: 0 }}
          animate={{ y: 0, rotate: 0, opacity: 1 }}
          exit={{ y: -22, rotate: 90, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 24 }}
          aria-hidden
        >
          {theme === 'dark' ? '🌙' : '☀️'}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

const options: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Систем' },
  { value: 'light', label: '☀️ Цайвар' },
  { value: 'dark', label: '🌙 Бараан' },
];

/** Full choice, including "follow the phone's setting". */
export function ThemePicker() {
  const { pref, setPref } = useTheme();
  return <Segmented options={options} value={pref} onChange={setPref} />;
}
