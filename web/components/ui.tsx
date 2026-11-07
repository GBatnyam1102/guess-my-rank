'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { spring } from './motion';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-accent to-accent-2 text-white shadow-lg shadow-accent/25 hover:brightness-110 hover:shadow-accent/40 disabled:from-panel-2 disabled:to-panel-2 disabled:text-muted disabled:shadow-none',
  secondary: 'bg-panel-2 text-fg ring-1 ring-line hover:bg-line disabled:text-muted',
  ghost: 'bg-transparent text-muted hover:text-fg hover:bg-panel-2',
  danger: 'bg-bad/15 text-bad ring-1 ring-bad/40 hover:bg-bad/25',
};

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean }) {
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-[15px]', lg: 'h-14 px-6 text-base' };
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100',
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl bg-panel/90 p-4 shadow-sm shadow-violet-950/5 ring-1 ring-line backdrop-blur dark:shadow-none', className)}>
      {children}
    </div>
  );
}

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main
      className={cx(
        'mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {children}
    </main>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-sm font-medium text-muted">{children}</span>;
}

/** Option buttons with a highlight that slides to the chosen one. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1 rounded-xl bg-ink/60 p-1 ring-1 ring-line" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx(
              'relative h-10 rounded-lg px-2 text-sm font-semibold transition-colors',
              selected ? 'text-white' : 'text-muted hover:text-fg',
            )}
            aria-pressed={selected}
          >
            {selected ? (
              <motion.span layoutId={`segment-${id}`} className="absolute inset-0 rounded-lg bg-accent shadow" transition={spring} />
            ) : null}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const avatarColors = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6', '#a855f7', '#f97316', '#06b6d4'];

/** Initials on a colour for people; a robot on steel for bots. */
export function Avatar({ name, size = 36, dim = false, bot = false }: { name: string; size?: number; dim?: boolean; bot?: boolean }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  const initials = [...name.trim()].slice(0, 2).join('').toUpperCase();
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        bot && 'ring-2 ring-sky-300/60 ring-offset-1 ring-offset-transparent',
        dim && 'opacity-40',
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * (bot ? 0.55 : 0.38),
        background: bot ? 'linear-gradient(135deg, #64748b, #1e293b)' : avatarColors[hash % avatarColors.length],
      }}
      aria-hidden
    >
      {bot ? '🤖' : initials}
    </span>
  );
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'good' | 'bad' | 'accent' | 'bot' }) {
  const tones = {
    muted: 'bg-panel-2 text-muted',
    good: 'bg-good/15 text-good',
    bad: 'bg-bad/15 text-bad',
    accent: 'bg-accent/20 text-accent-fg',
    bot: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>;
}

export function BotTag() {
  return <Pill tone="bot">🤖 Bot</Pill>;
}

/** Bottom sheet on phones, centred card on wider screens; slides in and out. */
export function Dialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="dialog"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center dark:bg-black/60"
          onClick={onClose}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            role="dialog"
            aria-modal
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-panel p-5 shadow-2xl ring-1 ring-line"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 48, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 32, opacity: 0, scale: 0.98 }}
            transition={spring}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  tone = 'primary',
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  tone?: 'primary' | 'danger';
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <h2 className="text-lg font-bold">{title}</h2>
      {body ? <p className="mt-2 text-sm text-muted">{body}</p> : null}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Болих
        </Button>
        <Button
          variant={tone}
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
