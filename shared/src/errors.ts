// Error codes travel to the client in acks; messages are shown to players as-is (FR-49).
export const ERROR_MESSAGES = {
  ROOM_NOT_FOUND: 'Өрөө олдсонгүй. Кодоо шалгаад дахин оролдоно уу.',
  ROOM_FULL: 'Өрөө дүүрсэн байна.',
  GAME_ALREADY_STARTED: 'Тоглоом эхэлсэн тул шинээр нэгдэх боломжгүй.',
  INVALID_NICKNAME: 'Нэрээ 1–20 тэмдэгтээр оруулна уу.',
  NICKNAME_TAKEN: 'Энэ нэрийг өрөөнд өөр хүн ашиглаж байна.',
  BOT_ROOM: 'Энэ бол bot-той тоглох өрөө. Өөр хүн нэгдэх боломжгүй.',
  NOT_A_BOT_ROOM: 'Энэ өрөөнд bot нэмэх боломжгүй.',
  BOT_NOT_FOUND: 'Bot олдсонгүй.',
  INVALID_SETTINGS: 'Тоглоомын тохиргоо буруу байна.',
  INVALID_SESSION: 'Таны session хүчингүй болсон. Өрөөнд дахин нэгдэнэ үү.',
  NOT_IN_ROOM: 'Та энэ өрөөнд байхгүй байна.',
  NOT_HOST: 'Зөвхөн Host энэ үйлдлийг хийнэ.',
  NOT_ENOUGH_PLAYERS: 'Эхлүүлэхэд дор хаяж 2 тоглогч хэрэгтэй.',
  NOT_RANKER: 'Энэ round-д та Ranker биш.',
  WRONG_STATE: 'Одоо энэ үйлдлийг хийх боломжгүй.',
  UNKNOWN_CATEGORY: 'Ийм category алга.',
  CATEGORY_TOO_SMALL: 'Энэ category-д хангалттай зураг алга.',
  REFRESH_LIMIT: 'Refresh-ийг 3 удаа л хийнэ.',
  TOO_MANY_IMAGES: 'Тохируулсан тооноос илүү зураг нэмэх боломжгүй.',
  NOT_ENOUGH_IMAGES: 'Бүх зургаа нэмээд дараа нь түгжинэ үү.',
  MISSING_TITLE: 'Зураг бүрт нэр өгнө үү.',
  INVALID_TITLE: 'Зургийн нэр 40 тэмдэгтээс хэтрэхгүй.',
  ITEM_NOT_FOUND: 'Зураг олдсонгүй.',
  INVALID_ORDER: 'Эрэмбэ буруу байна. Бүх зургийг нэг удаа байрлуулна уу.',
  NOT_A_GUESSER: 'Та энэ round-д таах эрхгүй.',
  ALREADY_SUBMITTED: 'Та таамгаа аль хэдийн илгээсэн.',
  GUESS_SKIPPED: 'Хугацаа дууссан тул таны таамгийг алгасав.',
  UPLOAD_INVALID_TYPE: 'Зөвхөн JPG, PNG, WebP эсвэл HEIC зураг оруулна.',
  UPLOAD_TOO_LARGE: 'Зураг 10 MB-аас хэтрэхгүй байх ёстой.',
  UPLOAD_FAILED: 'Зураг оруулж чадсангүй. Дахин оролдоно уу.',
  BAD_REQUEST: 'Хүсэлт буруу байна.',
  INTERNAL: 'Серверт алдаа гарлаа. Дахин оролдоно уу.',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export class GameError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'GameError';
    this.code = code;
  }
}
