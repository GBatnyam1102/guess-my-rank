// In-memory store for tests and for running without PostgreSQL. Values are stored as
// JSON so callers can never share object references with the "database".
import { CUSTOM_IMAGE_RETENTION_MS, type ContentCategory, type RoomState } from '@gmr/shared';
import type { Repo, UploadRecord } from './types';

export class MemoryRepo implements Repo {
  readonly kind = 'memory' as const;
  private readonly rooms = new Map<string, string>();
  private readonly uploads = new Map<string, UploadRecord>();

  constructor(private readonly content: ContentCategory[]) {}

  async loadContent(): Promise<ContentCategory[]> {
    return structuredClone(this.content);
  }

  async loadRooms(): Promise<RoomState[]> {
    return [...this.rooms.values()].map((json) => JSON.parse(json) as RoomState);
  }

  async saveRoom(state: RoomState): Promise<void> {
    this.rooms.set(state.id, JSON.stringify(state));
    if (state.status === 'FINISHED' && state.finishedAt !== null) {
      const expiresAt = state.finishedAt + CUSTOM_IMAGE_RETENTION_MS;
      for (const u of this.uploads.values()) {
        if (u.roomId === state.id && u.expiresAt > expiresAt) u.expiresAt = expiresAt;
      }
    }
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.rooms.delete(roomId);
  }

  async createUpload(upload: UploadRecord): Promise<void> {
    this.uploads.set(upload.id, { ...upload });
  }

  async getUpload(id: string): Promise<UploadRecord | null> {
    const u = this.uploads.get(id);
    return u ? { ...u } : null;
  }

  async updateUpload(id: string, patch: Partial<Omit<UploadRecord, 'id'>>): Promise<void> {
    const u = this.uploads.get(id);
    if (u) this.uploads.set(id, { ...u, ...patch });
  }

  async deleteUpload(id: string): Promise<void> {
    this.uploads.delete(id);
  }

  async listExpiredUploads(now: number): Promise<UploadRecord[]> {
    return [...this.uploads.values()].filter((u) => u.expiresAt <= now).map((u) => ({ ...u }));
  }

  private readonly blobs = new Map<string, Buffer>();

  async getBlob(key: string): Promise<Buffer | null> {
    const data = this.blobs.get(key);
    return data ? Buffer.from(data) : null;
  }

  async putBlob(key: string, data: Buffer): Promise<void> {
    this.blobs.set(key, Buffer.from(data));
  }

  async deleteBlob(key: string): Promise<void> {
    this.blobs.delete(key);
  }

  /** For tests. */
  get blobCount(): number {
    return this.blobs.size;
  }

  async close(): Promise<void> {}
}
