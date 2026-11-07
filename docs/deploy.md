# Production deploy

Бүх зүйл нэг үнэгүй Oracle Cloud VM (Tokyo) дээр Docker Compose-оор ажиллана. Шийдвэрийн шалтгааныг [decisions.md](decisions.md#deploy-2026-11-07) хэсгээс харна уу.

```
Утас / хөтөч ──HTTPS──▶ Oracle VM (Ubuntu, Docker)
                         caddy :80/:443   (Let's Encrypt гэрчилгээг өөрөө авч, сунгана)
                          ├─ <домэйн>         ▶ web    (Next.js standalone, :3000)
                          ├─ www.<домэйн>     ▶ <домэйн> руу redirect
                          └─ api.<домэйн>     ▶ server (Socket.IO + upload, :4000) ▶ postgres :5432
```

| Файл | Юу хийнэ |
| ---- | -------- |
| `Dockerfile` | `server`, `web` гэсэн 2 image. Web-ийн `NEXT_PUBLIC_SERVER_URL` build хийх үед image-д шингэнэ |
| `deploy/compose.yml` | postgres, server, web, caddy. Volume: `pgdata`, `uploads`, `caddy_data` |
| `deploy/Caddyfile` | HTTPS, домэйн → service |
| `deploy/vm-setup.sh` | Шинэ VM-д нэг удаа: Docker, 80/443 порт, жижиг VM-д swap |
| `deploy/deploy.sh` | Локал кодыг VM руу хуулж, image build хийгээд асаана |
| `deploy/remote.sh` | VM дээр: `~/gmr.env` нууц үгсийг (анх удаа) үүсгэх, `compose up`, health хүлээх |

Сервер **яг 1 instance** байх ёстой: өрөө, таймер, bot санах ойд ажиллана (Postgres-д хадгалагдаж, restart-ын дараа сэргэнэ).

## Нэг удаагийн бэлтгэл (таны хийх алхмууд)

1. **Oracle Cloud бүртгэл** — <https://signup.cloud.oracle.com>.
   - **Country/Territory = Mongolia**. Нэр, хаяг нь картын эзэмшигчийн мэдээлэлтэй таарах ёстой, эс бөгөөс картын шалгалт "transaction failed" болно.
   - **Home Region = Japan East (Tokyo)**. Энэ бол серверийн байршил, дараа нь өөрчлөх боломжгүй.
   - Картаас ~$1 түр хаадаг (authorization hold). Энэ нь жинхэнэ гүйлгээ биш, банк хэдэн хоногийн дотор өөрөө чөлөөлнө.
2. **VM үүсгэх** — Compute → Instances → Create instance:
   - Image: **Canonical Ubuntu 24.04**
   - Shape: **Ampere VM.Standard.A1.Flex**, 2 OCPU, 12 GB (Always Free-д нийт 4 OCPU / 24 GB багтана). "Out of capacity" гарвал өөр Availability Domain сонгох эсвэл хэдэн цагийн дараа дахин оролдоно. Хамгийн сүүлийн сонголт бол **VM.Standard.E2.1.Micro** (1 GB, удаан build).
   - Networking: "Assign a public IPv4 address" сонгосон байна.
   - SSH keys: **Paste public keys** → `C:\Users\Administrator\.ssh\gmr_oracle.pub`-ийн агуулга.
3. **Порт нээх** — Networking → Virtual Cloud Networks → тухайн VCN → Subnet → Default Security List → **Add Ingress Rules**: Source CIDR `0.0.0.0/0`, IP Protocol TCP, Destination Port Range `80,443`.
4. **Cloudflare DNS** — домэйны DNS хэсэгт гурван `A` бичлэг нэмнэ. Утга нь VM-ийн public IP, **Proxy status: DNS only (саарал үүл)**:

   | Type | Name | Content | Proxy |
   | ---- | ---- | ------- | ----- |
   | A | `@` | VM IP | DNS only |
   | A | `www` | VM IP | DNS only |
   | A | `api` | VM IP | DNS only |

   Саарал үүл байх шалтгаан: Caddy Let's Encrypt-ээс гэрчилгээ авахдаа шууд VM рүү холбогдох шаардлагатай.

5. (Зөвлөмж) **Pay As You Go руу шилжүүлэх** — Billing → Upgrade. Always Free нөөцөөс хэтрэхгүй бол төлбөр гарахгүй. Free горимд 7 хоног бараг ачаалалгүй байсан VM-ийг Oracle буцааж авч болдог, PAYG-д тийм эрсдэл байхгүй.

## Deploy хийх

Git Bash-аас (repo-ийн root дээр):

```bash
# Анх удаа: Docker суулгаж, порт нээгээд deploy хийнэ
DEPLOY_HOST=ubuntu@<VM_IP> DOMAIN=<домэйн> deploy/deploy.sh --setup

# Дараагийн удаа (код өөрчилсний дараа)
DEPLOY_HOST=ubuntu@<VM_IP> DOMAIN=<домэйн> deploy/deploy.sh
```

Script нь эх кодыг (`node_modules`, `.env`, `server/data`-аас бусад) VM-ийн `~/gmr` руу хуулж, image-уудыг VM дээр build хийнэ. Сервер, web хоёр healthy болтол хүлээнэ. Шалгах хаяг: `https://api.<домэйн>/health`.

## VM дээрх ажил

```bash
ssh -i ~/.ssh/gmr_oracle ubuntu@<VM_IP>
cd ~/gmr
alias dc='docker compose -f deploy/compose.yml --env-file ~/gmr.env'

dc ps                      # төлөв
dc logs -f server          # серверийн лог (JSON мөрүүд)
dc restart server          # сервер дахин асаах (тоглоомууд DB-ээс сэргэнэ)
docker exec gmr-postgres-1 pg_dump -U gmr guess_my_rank > ~/backup-$(date +%F).sql   # DB нөөц
```

- Нууц үгс `~/gmr.env`-д байна (`POSTGRES_PASSWORD`, `UPLOAD_SIGNING_SECRET`). Энэ файлыг устгаж болохгүй: Postgres-ийн өгөгдөл анх үүссэн нууц үгээрээ ажилладаг.
- Custom зургууд `uploads` volume-д хадгалагдана. Тоглоом дууссанаас 24 цагийн дараа устна.
- Лог файл бүр 20 MB × 5 хүртэл хадгалагдаж, хуучин нь автоматаар устна.
