export const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
export const AUDIO_URL_TTL_MS = 60 * 60 * 1000;

export type PresignedPut = {
  url: string;
  // The browser must send these with the PUT; the signature covers them.
  headers: Record<string, string>;
  expiresAt: Date;
};

export type PresignedGet = { url: string; expiresAt: Date };

export type StorageDriver = {
  presignPut(input: {
    key: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<PresignedPut>;
  presignGet(key: string): Promise<PresignedGet>;
  // null when the object doesn't exist.
  headSize(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
  // Server-side transfers for the transcode worker; both stream through a local file.
  download(key: string, filePath: string): Promise<void>;
  upload(input: {
    key: string;
    filePath: string;
    contentType: string;
  }): Promise<void>;
};

export type Storage = Omit<StorageDriver, 'delete'> & {
  // Best effort: callers run it after a DB commit, so it logs failures instead of throwing.
  deleteMany(keys: string[]): Promise<void>;
};

export function storageKey(userId: string, format: string): string {
  return `users/${userId}/${crypto.randomUUID()}.${format}`;
}
