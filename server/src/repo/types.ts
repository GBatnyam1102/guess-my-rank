import type { ContentCategory, RoomState } from '@gmr/shared';

export interface UploadRecord {
  id: string;
  roomId: string;
  roundId: string;
  playerId: string;
  storageKey: string;
  mime: string;
  bytes: number;
  status: 'PENDING' | 'READY';
  createdAt: number;
  expiresAt: number;
}

export interface Repo {
  readonly kind: 'postgres' | 'memory';
  loadContent(): Promise<ContentCategory[]>;
  /** Every stored room; the manager resumes live ones and sweeps expired ones. */
  loadRooms(): Promise<RoomState[]>;
  saveRoom(state: RoomState): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
  createUpload(upload: UploadRecord): Promise<void>;
  getUpload(id: string): Promise<UploadRecord | null>;
  updateUpload(id: string, patch: Partial<Omit<UploadRecord, 'id'>>): Promise<void>;
  deleteUpload(id: string): Promise<void>;
  listExpiredUploads(now: number): Promise<UploadRecord[]>;
  close(): Promise<void>;
}
