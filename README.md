# Guess My Rank

Олон тоглогчтой realtime тоглоом. Ranker зургуудыг өөрийн дуртай дарааллаар эрэмбэлж, бусад нь тэр дарааллыг таана. Зөв байрлал бүрт 1 оноо.

Хэрэгжүүлэлт: [хөгжүүлэлтийн төлөвлөгөө](https://claude.ai/artifact/VE6jSNrtEXmVccpKdLfeYH) (Draft v1.3).

## Бүтэц

```
shared/   Тоглоомын дүрэм (цэвэр функц), төрлүүд, Socket.IO event-үүд, тестүүд
server/   Node.js + Socket.IO тоглоомын сервер, Drizzle + PostgreSQL, зураг хадгалалт
web/      Next.js 16 + React 19 + Tailwind 4 + dnd-kit + motion (animation)
docs/     Шийдвэрүүд (Үе 0), дэлгэцүүдийн жагсаалт
```

Сервер бүхнийг удирдана: Ranker сонгох, таймер, оноо, SKIPPED, Reveal. Тоглогч бүр өөрт зөвшөөрөгдсөн "харагдах төлөв"-ийг (`shared/src/projection.ts`) л авна. Ranker-ийн дараалал REVEAL-ээс өмнө Guesser-т хэзээ ч очихгүй.

## Ажиллуулах

Шаардлага: Node.js ≥ 22.12, pnpm 10 (`npm i -g pnpm@10`), PostgreSQL (заавал биш).

```bash
pnpm install
cp server/.env.example server/.env   # DATABASE_URL-аа тохируул (хоосон бол санах ойд ажиллана)
pnpm dev                              # сервер :4000, web :3000
```

Сервер асахдаа migration-ээ өөрөө ажиллуулж, DB хоосон бол эхний контентыг импортлоно.
http://localhost:3000 нээнэ.

**Утсаар тоглох (нэг Wi-Fi):** компьютерийн IP-гаар нээнэ, жишээ нь `http://192.168.1.20:3000`. Web нь серверийг ижил host-ын `:4000` дээрээс автоматаар хайна. Windows Firewall 3000, 4000 портыг зөвшөөрсөн байх ёстой.

**Bot-той тоглох:** "Шинэ тоглоом" дээр **🤖 Bot-той**-г сонгоод bot-ын тоог (1–9) тохируулна. Bot-ууд сервер дотор ажиллаж, өөрсдөө category сонгож, эрэмбэлж, таана (Custom горимд Ranker болохдоо сангаас зураг авна). Lobby-д Host bot нэмж, хасаж болно. Bot-той өрөөнд өөр хүн нэгдэхгүй; хүн гарвал өрөө хаагдана. Bot бүр 🤖 avatar, "Bot" шошготой.

**Цайвар / бараан горим:** анхандаа утасны тохиргоог дагана. Нүүр, Lobby-гийн ☀️/🌙 товч, эсвэл тоглоомын цэс → "Харагдац" (Систем / Цайвар / Бараан). Сонголт тухайн төхөөрөмжид хадгалагдана.

**Ачааллын/олон client-ийн туршилт:** socket-оор холбогддог тусдаа bot script (энгийн тоглогч мэт нэгдэнэ):

```bash
pnpm --filter @gmr/server bots --join ABC123 --count 3
pnpm --filter @gmr/server bots --create --count 4 --custom   # зөвхөн bot-той бүтэн тоглоом
```

## Production

Oracle Cloud-ийн үнэгүй VM дээр Docker Compose-оор ажиллана (Caddy HTTPS → web + server → Postgres). Бэлтгэл болон команд: [docs/deploy.md](docs/deploy.md).

```bash
DEPLOY_HOST=ubuntu@<VM_IP> DOMAIN=<домэйн> deploy/deploy.sh   # Git Bash-аас
```

## Командууд

| Команд | Юу хийнэ |
| ------ | -------- |
| `pnpm dev` | Сервер + web (hot reload) |
| `pnpm test` | Бүх тест (shared unit, server integration) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm build` | Web production build |
| `pnpm db:migrate` | Migration ажиллуулах |
| `pnpm content:import` | `server/content/categories.json`-ийг DB рүү импортлох |
| `pnpm --filter @gmr/server db:generate` | Schema өөрчилсний дараа шинэ migration үүсгэх |

Postgres-ийн тестийг ажиллуулах: `TEST_DATABASE_URL=postgres://postgres@localhost:5432/guess_my_rank_test pnpm test`.

## Төлөв (2026-11-07)

| Үе | Төлөв |
| -- | ----- |
| 0 — Суурь | ✅ Monorepo, lint, CI, DB schema + migration, event төрлүүд, [шийдвэрүүд](docs/decisions.md). Staging орчин хийгдээгүй |
| 1 — Өрөө, Lobby | ✅ Тохиргоо, код + урилгын линк, нэгдэх, realtime жагсаалт, Start, гарах, дахин нэгдэх |
| 2 — Ranker | ✅ Ranker мөчлөг, Random category + ≤ 3 refresh, Custom upload (шалгалт, EXIF арилгах), drag-and-drop, Lock |
| 3 — Таах, Reveal | ✅ Хольсон дараалал, нэг удаа Submit, Waiting, оноо, Reveal ✓/✗, 15 сек, Final, хамтарсан ялагч, дахин тоглох |
| 4 — Найдвартай байдал | ✅ 60 сек grace, SKIPPED, DB deadline + restart сэргээлт, Host дуусгах, Ranker/Host disconnect. Жинхэнэ утсаар туршаагүй |
| 5 — Тест, гаргах | 🟡 Custom зураг устгах cron хийгдсэн. Дутуу: Playwright E2E, ачааллын тест, Sentry, production deploy, "Report" товч |
| Контент | 🟡 6 category × 15 placeholder (emoji) зураг. Зорилт: category бүрт ≥ 60 жинхэнэ зураг + лиценз |

Cloudflare R2-ийн driver (`server/src/storage/r2.ts`) бичигдсэн ч жинхэнэ bucket дээр туршаагүй. Локалд зургууд `server/data/uploads`-д хадгалагдана.
