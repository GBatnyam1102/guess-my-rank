import Link from 'next/link';
import { ThemeToggle } from '@/components/theme';
import { Screen } from '@/components/ui';
import { stagger } from '@/lib/stagger';

const steps = [
  { icon: '🎲', title: 'Ranker', text: 'Нэг тоглогч зургуудыг өөрийн дуртай дарааллаар эрэмбэлнэ.' },
  { icon: '🤔', title: 'Таах', text: 'Бусад нь тэр хүн яаж эрэмбэлснийг таана.' },
  { icon: '🏆', title: 'Оноо', text: 'Зөв байрлал бүрт 1 оноо. Хамгийн их оноотой нь ялна.' },
];

export default function Home() {
  return (
    <Screen className="justify-center">
      <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-10">
        <ThemeToggle />
      </div>
      <div className="text-center">
        <p className="animate-float text-6xl">🎯</p>
        <div className="animate-rise">
          <h1 className="animate-shimmer mt-3 bg-gradient-to-r from-violet-600 via-pink-500 to-violet-600 bg-clip-text text-5xl font-black tracking-tight text-transparent dark:from-violet-300 dark:via-pink-300 dark:to-violet-300">
            Guess My Rank
          </h1>
        </div>
        <p className="animate-rise mt-2 text-muted" style={stagger(1)}>
          Найзынхаа эрэмбийг тааж оноо цуглуул
        </p>
      </div>

      <div className="mt-6 grid gap-3">
        <Link
          href="/new"
          style={stagger(2)}
          className="animate-rise flex h-14 items-center justify-center rounded-xl bg-gradient-to-r from-accent to-accent-2 text-base font-semibold text-white shadow-lg shadow-accent/25 transition hover:shadow-accent/40 hover:brightness-110 active:scale-[0.97]"
        >
          Шинэ тоглоом үүсгэх
        </Link>
        <Link
          href="/join"
          style={stagger(3)}
          className="animate-rise flex h-14 items-center justify-center rounded-xl bg-panel-2 text-base font-semibold text-fg ring-1 ring-line transition hover:bg-line active:scale-[0.97]"
        >
          Кодоор нэгдэх
        </Link>
      </div>

      <ol className="mt-8 grid gap-2">
        {steps.map((s, i) => (
          <li
            key={s.title}
            style={stagger(i, 70, 260)}
            className="animate-rise flex items-start gap-3 rounded-2xl bg-panel/70 p-3 ring-1 ring-line"
          >
            <span className="text-2xl">{s.icon}</span>
            <div>
              <p className="font-bold">{s.title}</p>
              <p className="text-sm text-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-center text-xs text-muted">2–10 тоглогч · найзуудтайгаа эсвэл bot-той тоглоно</p>
    </Screen>
  );
}
