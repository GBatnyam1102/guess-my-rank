# Production deploy

Бүгд үнэгүй, карт шаардахгүй: **web → Vercel**, **тоглоомын сервер → Render (Singapore)**, **Postgres → Neon (Singapore)**, **DNS → Cloudflare**. Код GitHub-ийн private repo-д байна, `main` руу push хийхэд Render, Vercel хоёулаа өөрөө дахин deploy хийнэ. Шийдвэрийн шалтгаан: [decisions.md](decisions.md#deploy-2026-11-07).

```
Утас / хөтөч ──HTTPS──▶ <домэйн>, www.<домэйн>  ▶ Vercel  (Next.js)
             ──WSS────▶ api.<домэйн>             ▶ Render  (Socket.IO сервер, Docker, free) ──▶ Neon Postgres
                                                     (өрөө, тоглогч, Custom зураг)
```

Сервер **яг 1 instance** байх ёстой: өрөө, таймер, bot санах ойд ажиллаж, Postgres-д хадгалагдана. Render-ийн free план нэг instance-тай.

## Тохиргооны утгууд

| Хаана | Нэр | Утга |
| ----- | --- | ---- |
| Render | `DATABASE_URL` | Neon-ий **Direct** (pooling-гүй) connection string |
| Render | `CORS_ORIGINS` | `https://<домэйн>,https://www.<домэйн>` |
| Render | `KEEPALIVE_URL` | `https://api.<домэйн>/health` |
| Render | `STORAGE_DRIVER`, `SWEEP_INTERVAL_MS`, `UPLOAD_SIGNING_SECRET` | `render.yaml` өөрөө тохируулна |
| Vercel | `NEXT_PUBLIC_SERVER_URL` | `https://api.<домэйн>` |

## Нэг удаагийн бэлтгэл

1. **GitHub** — <https://github.com/new>: нэр `guess-my-rank`, **Private**, README болон .gitignore-гүй хоосон repo. Дараа нь кодыг push хийнэ:
   ```bash
   git remote add origin https://github.com/<user>/guess-my-rank.git
   git push -u origin main
   ```
2. **Neon** — <https://neon.com> → GitHub-аар нэвтэрнэ → New project: нэр `guess-my-rank`, Postgres 17, region **AWS Asia Pacific (Singapore)**. Connect товч → **Connection pooling-ийг унтраах** → connection string-ийг хуулна.
3. **Render** — <https://render.com> → GitHub-аар нэвтэрнэ → **New → Blueprint** → `guess-my-rank` repo-г сонгоно (GitHub-д Render-д хандах эрх өгнө). `render.yaml`-ийг уншаад `DATABASE_URL`, `CORS_ORIGINS`, `KEEPALIVE_URL`-ийг асууна, дээрх хүснэгтээр бөглөнө. Deploy дууссаны дараа: service → Settings → **Custom Domains → Add** `api.<домэйн>`.
4. **Vercel** — <https://vercel.com> → GitHub-аар нэвтэрнэ (Hobby) → **Add New → Project** → `guess-my-rank` → **Root Directory: `web`** → Environment Variables-д `NEXT_PUBLIC_SERVER_URL` нэмнэ → Deploy. Дараа нь Settings → **Domains**: `<домэйн>` болон `www.<домэйн>`-ийг нэмнэ.
5. **Cloudflare DNS** — бүх бичлэг **DNS only (саарал үүл)**:

   | Type | Name | Content |
   | ---- | ---- | ------- |
   | CNAME | `api` | Render-ийн өгсөн хаяг (`gmr-server-xxxx.onrender.com`) |
   | A | `@` | Vercel-ийн Domains хуудсанд харуулсан IP |
   | CNAME | `www` | Vercel-ийн харуулсан хаяг |

   Render, Vercel хоёулаа HTTPS гэрчилгээг өөрөө авна. Саарал үүлтэй байх шалтгаан: тэд домэйнийг шууд шалгах шаардлагатай.

## Өдөр тутмын ажил

- **Шинэ хувилбар гаргах:** `git push`. Render зөвхөн `server/`, `shared/`, `Dockerfile`, `pnpm-lock.yaml` өөрчлөгдсөн үед дахин build хийнэ. Vercel `web/` болон түүний хамаарал өөрчлөгдөөгүй бол алгасна.
- **Commit-ын зохиогч:** Vercel Hobby private repo-д зөвхөн эзэмшигчийн commit-ыг deploy хийдэг (бусдынх "Deployment Blocked"). Энэ repo-д `git config user.email 180077973+GBatnyam1102@users.noreply.github.com` (GBatnyam1102-ийн GitHub noreply хаяг) тохируулсан. `Co-Authored-By` мөргүй commit хийнэ.
- **Лог:** Render dashboard → gmr-server → Logs. **Ачаалал:** Neon dashboard → Usage.
- **Шалгах хаяг:** `https://api.<домэйн>/health` → `{"ok":true,"store":"postgres","storage":"db"}`.
- Сервер дахин асахад (deploy, Render-ийн засвар) тоглоомууд DB-ээс сэргэнэ. Deploy хийх үед хуучин, шинэ instance хэдэн секунд зэрэг ажилладаг тул тоглолт явагдаж байх үед deploy хийхгүй байх нь дээр.

## Үнэгүй хязгаарууд

| Үйлчилгээ | Хязгаар | Манай хэрэглээ |
| --------- | ------- | -------------- |
| Render free | 750 цаг/сар, ~512 MB RAM, 0.1 CPU. 15 мин inbound traffic-гүй бол унтдаг. Диск байхгүй | 1 service × 24/7 ≈ 730 цаг. `KEEPALIVE_URL` 10 мин тутам `/health` дуудаж сэрүүн байлгана. Custom зураг Postgres-д хадгалагдана (`STORAGE_DRIVER=db`) |
| Neon free | 100 CU-цаг/сар, 1 GB, 5 GB egress. 5 мин идэвхгүй бол унтдаг | Сул холболтуудыг 60 сек-д хаадаг, цэвэрлэгээ цагт нэг удаа (`SWEEP_INTERVAL_MS`). Сэрэхэд хэдэн зуун мс |
| Vercel Hobby | Хувийн, арилжааны бус төсөлд үнэгүй | Зөвхөн web |

Free серверийн CPU сул тул Custom зураг бүрийг боловсруулахад 1–2 секунд зарцуулагдаж болно.

## Өөр хувилбар: өөрийн VM

`Dockerfile` + `deploy/` (Caddy, Postgres, web, server-ийг нэг Docker Compose-д багтаасан) ямар ч Ubuntu VM дээр ажиллана:

```bash
DEPLOY_HOST=ubuntu@<VM_IP> DOMAIN=<домэйн> deploy/deploy.sh --setup   # анх удаа, Git Bash-аас
```

VM дээр нууц үгс `~/gmr.env`-д хадгалагдана. DNS-д `@`, `www`, `api` гурван A бичлэг нь VM-ийн IP руу заана.
