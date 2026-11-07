// Bot players for testing on one device.
//   Join your room:     pnpm --filter @gmr/server bots --join ABC123 --count 3
//   Bots-only game:     pnpm --filter @gmr/server bots --create --count 4 [--custom] [--images 5] [--rounds EACH]
import { parseArgs } from 'node:util';
import {
  shuffle,
  type AckResult,
  type ClientToServerEvents,
  type JoinedRoom,
  type PlayerView,
  type PresignedUpload,
  type ServerToClientEvents,
} from '@gmr/shared';
import sharp from 'sharp';
import { io, type Socket } from 'socket.io-client';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:4000' },
    join: { type: 'string' },
    create: { type: 'boolean', default: false },
    count: { type: 'string', default: '3' },
    custom: { type: 'boolean', default: false },
    images: { type: 'string', default: '5' },
    rounds: { type: 'string', default: 'EACH' },
    delay: { type: 'string', default: '1200' },
  },
});

const count = Number(values.count);
const baseDelay = Number(values.delay);
const names = ['Бот Бат', 'Бот Сараа', 'Бот Тэмүүлэн', 'Бот Номин', 'Бот Анар', 'Бот Хулан', 'Бот Энх', 'Бот Сэргэлэн', 'Бот Оюун'];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const think = () => wait(baseDelay * (0.5 + Math.random()));

type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

async function call<T>(socket: BotSocket, event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
  const s = socket as unknown as { timeout(ms: number): { emitWithAck(ev: string, ...a: unknown[]): Promise<AckResult<T>> } };
  const res = payload === undefined ? await s.timeout(10_000).emitWithAck(event) : await s.timeout(10_000).emitWithAck(event, payload);
  if (!res.ok) throw new Error(`${event}: ${res.message}`);
  return res.data;
}

async function testImage(n: number): Promise<Buffer> {
  const hue = (n * 67) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="hsl(${hue},70%,55%)"/><text x="200" y="250" font-size="160" text-anchor="middle" fill="#fff" font-family="sans-serif">${n}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

class Bot {
  readonly socket: BotSocket;
  view: PlayerView | null = null;
  joined: JoinedRoom | null = null;
  private busyKey = '';
  done: Promise<void>;
  private finish!: () => void;

  constructor(readonly name: string, private readonly host: boolean) {
    this.socket = io(values.url, { transports: ['websocket'], forceNew: true });
    this.done = new Promise((r) => (this.finish = r));
    this.socket.on('state', (v) => {
      this.view = v;
      void this.act(v).catch((err: unknown) => console.error(`[${this.name}]`, (err as Error).message));
    });
  }

  log(msg: string) {
    console.log(`[${this.name}] ${msg}`);
  }

  private async act(v: PlayerView) {
    const r = v.round;
    const key = `${v.room.status}:${v.players.length}:${r?.id ?? ''}:${r?.state ?? ''}:${r?.myGuess?.status ?? ''}:${r?.items?.length ?? ''}`;
    if (key === this.busyKey) return;
    this.busyKey = key;

    if (v.room.status === 'LOBBY' && this.host && values.create && v.players.length >= count) {
      await wait(500);
      this.log('starting the game');
      await call(this.socket, 'game:start');
      return;
    }
    if (v.room.status === 'FINISHED') {
      const top = v.leaderboard.map((e) => `${e.nickname} ${e.totalScore}`).join(', ');
      if (this.host || !values.create) this.log(`final: ${top}`);
      this.finish();
      return;
    }
    if (!r) return;
    if (r.myRole === 'RANKER' && r.state === 'CATEGORY' && v.categories?.length) {
      await think();
      const cat = shuffle(v.categories, Math.random)[0]!;
      this.log(`round ${r.number}: ranking "${cat.name}"`);
      await call(this.socket, 'ranker:category', { categoryId: cat.id });
      return;
    }
    if (r.myRole === 'RANKER' && r.state === 'RANKING' && r.items) {
      if (v.room.settings.imageSource === 'CUSTOM' && r.items.length < r.imageCount) {
        const n = r.items.length + 1;
        const data = await testImage(n);
        const p = await call<PresignedUpload>(this.socket, 'upload:presign', { mime: 'image/jpeg', bytes: data.length });
        const url = /^https?:/.test(p.url) ? p.url : `${values.url}${p.url}`;
        const res = await fetch(url, { method: 'PUT', headers: p.headers, body: data });
        if (!res.ok) throw new Error(`upload failed: ${res.status}`);
        await call(this.socket, 'upload:done', { uploadId: p.uploadId, title: `Зураг ${n}` });
        return;
      }
      if (r.items.length === r.imageCount) {
        await think();
        await call(this.socket, 'ranker:lock', { order: shuffle(r.items.map((i) => i.id), Math.random) });
        this.log('locked the ranking');
      }
      return;
    }
    if (r.state === 'GUESSING' && r.myGuess?.status === 'GUESSING' && r.items) {
      await think();
      await call(this.socket, 'guess:submit', { order: shuffle(r.items.map((i) => i.id), Math.random) });
      return;
    }
    if (r.state === 'REVEAL' && r.myGuess && this.host) {
      this.log(`round ${r.number} revealed: ${r.reveal?.guesses.map((g) => g.score).join('/')}`);
    }
  }
}

async function main() {
  if (!values.create && !values.join) {
    console.log('Usage: bots --join <CODE> [--count 3]   or   bots --create [--count 4] [--custom]');
    process.exit(1);
  }
  const bots: Bot[] = [];
  let code = values.join?.toUpperCase() ?? '';
  for (let i = 0; i < count; i++) {
    const bot = new Bot(names[i % names.length]!, values.create === true && i === 0);
    bots.push(bot);
    if (values.create && i === 0) {
      bot.joined = await call<JoinedRoom>(bot.socket, 'room:create', {
        nickname: bot.name,
        settings: {
          maxPlayers: 10,
          imageCount: Number(values.images),
          imageSource: values.custom ? 'CUSTOM' : 'RANDOM',
          roundsMode: values.rounds === 'EACH' ? 'EACH' : Number(values.rounds),
        },
      });
      code = bot.joined.code;
      console.log(`room ${code} created`);
    } else {
      bot.joined = await call<JoinedRoom>(bot.socket, 'room:join', { code, nickname: bot.name });
      bot.log(`joined ${code}`);
    }
  }
  await Promise.all(bots.map((b) => b.done));
  for (const b of bots) b.socket.disconnect();
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
