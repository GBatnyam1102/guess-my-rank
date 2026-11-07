# Дэлгэцүүд

Төлөвлөгөөний Үе 0-ийн wireframe-ийн оронд дэлгэц бүрийг шууд хэрэгжүүлсэн. Доорх хүснэгт дэлгэц бүр аль файлд, ямар FR-ийг хамардгийг харуулна.

| Дэлгэц | Хэн харна | Файл | FR |
| ------ | --------- | ---- | -- |
| Нүүр | Бүгд | `web/app/page.tsx` | — |
| New Game | Host | `web/components/NewGame.tsx` | FR-01–07, өрөөний төрөл (найзууд / bot) |
| Join | Тоглогч | `web/components/JoinGame.tsx` | FR-08–10, 14 |
| Lobby | Бүгд | `web/components/screens/Lobby.tsx` | FR-08, 11–13, 45; bot нэмэх/хасах |
| Category | Ranker | `screens/RankerPhase.tsx → CategoryPicker` | FR-17, 18 |
| Upload | Ranker (Custom) | `screens/RankerPhase.tsx → CustomRanking` | FR-19, 20, 48, 61 |
| Ranking | Ranker (Random) | `screens/RankerPhase.tsx → RandomRanking` | FR-21–24, 50, 51, 65 |
| "X эрэмбэлж байна" | Бусад | `screens/RankerPhase.tsx → WaitingForRanker` | FR-52 |
| Guessing | Guesser | `screens/GuessPhase.tsx → Guessing` | FR-25–29, 54, 55, 66 |
| Waiting | Илгээсэн Guesser, Ranker | `screens/GuessPhase.tsx → WaitingForGuesses` | FR-30, 31, 67 |
| Reveal | Бүгд | `screens/Results.tsx → Reveal`, `components/RevealBoard.tsx` | FR-36–41, 56–60, 68, 69 |
| Round алгассан | Бүгд | `screens/Results.tsx → SkippedRound` | Q-2 |
| Final | Бүгд | `screens/Results.tsx → Final` | FR-42–44 |

Бүх тоглоомын дэлгэцийн дээд хэсэгт `GameHeader` (round, Ranker, цэс: оноо, Host-д "Тоглоомыг дуусгах" FR-47, "Гарах" FR-45) байна.
Холболт тасарвал доод талд шар мөр гарна; сервер талын алдаа toast-оор харагдана (FR-49).

Drag-and-drop (`web/components/items.tsx → RankList`): ⠿ бариулаар чирэх (touch, mouse), ▲▼ товч, Tab + Space + сумаар keyboard (NFR-09).
Зураг дээр дарахад нэр, мэдээлэл, эх сурвалж нээгдэнэ (FR-65).

Харагдац: цайвар/бараан theme (`web/lib/theme.ts`, `web/components/theme.tsx`, өнгө нь `web/app/globals.css`-ийн token-ууд).
Animation: `motion` сан (`web/components/motion.tsx`) — дэлгэц хооронд шилжих, dialog/toast гулсах, жагсаалт дахь мөрүүд байраа солих, оноо тоолох, ялагчийн confetti; CSS animation (`animate-rise`, `animate-tick` …) `globals.css`-д. Утасны "Reduce motion" тохиргоог хүндэтгэнэ.

Reveal нэг дэлгэцэнд багтана (хуудас доош гүйлгэгдэхгүй): дээр нэг мөр оноо + таймер, дунд нь харьцуулах хүснэгт (`RevealBoard`), доор нь "Нийт оноо" тусдаа хүснэгт (`ScoreTable`, дэлгэцийн ~24%, тоглогч олон бол дотроо гүйлгэгдэнэ).
Харьцуулах хүснэгт: зүүн талд Ranker-ийн зөв эрэмбэ тогтмол (sticky), баруун талд Guesser бүр нэг багана ("Та" эхэнд, бусад нь оноогоор). Мөр бүр нэг байрлал тул зөв хариутай шууд харьцуулна. Зургийн хэмжээ боломжит өндөрт тааруулж (40–64 px) өөрчлөгдөнө; багтахгүй бол (10 зураг, жижиг утас) зөвхөн хүснэгт дотроо гүйлгэгдэнэ. Тоглогч олон бол баганууд хажуу тийш гүйлгэгдэнэ, цөөн бол бүтэн өргөнийг дүүргэнэ.
