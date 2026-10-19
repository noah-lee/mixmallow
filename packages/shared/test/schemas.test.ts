import { describe, expect, it } from 'vitest';
import {
  authProviderSchema,
  createNoteBodySchema,
  createUploadBodySchema,
  fileExtension,
  MAX_FILE_BYTES,
  meResponseSchema,
  NAME_MAX,
  nameFromFileName,
  renameBodySchema,
  updateNoteBodySchema,
} from '../src/schemas.ts';

const validMe = {
  id: '3f0c8f4e-8f3c-4a8e-9f57-2b1d1c1a6e01',
  email: 'ada@example.com',
  name: 'Ada',
  picture: null,
};

describe('meResponseSchema', () => {
  it('accepts a valid response', () => {
    expect(meResponseSchema.parse(validMe)).toEqual(validMe);
  });

  it.each([
    ['a non-uuid id', { id: 'not-a-uuid' }],
    ['an invalid email', { email: 'nope' }],
    ['a non-url picture', { picture: 'avatar.png' }],
    ['a missing email', { email: undefined }],
  ])('rejects %s', (_label, patch) => {
    expect(meResponseSchema.safeParse({ ...validMe, ...patch }).success).toBe(
      false,
    );
  });
});

describe('authProviderSchema', () => {
  it('accepts known providers only', () => {
    expect(authProviderSchema.safeParse('google').success).toBe(true);
    expect(authProviderSchema.safeParse('github').success).toBe(false);
  });
});

describe('fileExtension', () => {
  it.each([
    ['Mix.WAV', 'wav'],
    ['song.final.mp3', 'mp3'],
    ['noext', ''],
    ['trailing.', ''],
  ])('%s → %j', (fileName, ext) => {
    expect(fileExtension(fileName)).toBe(ext);
  });
});

describe('nameFromFileName', () => {
  it('drops the extension and trims', () => {
    expect(nameFromFileName('  Midnight Drive .wav')).toBe('Midnight Drive');
  });

  it('keeps inner dots', () => {
    expect(nameFromFileName('v1.2 mix.flac')).toBe('v1.2 mix');
  });

  it('cuts long names to the name limit', () => {
    expect(nameFromFileName(`${'a'.repeat(150)}.mp3`)).toHaveLength(NAME_MAX);
  });

  it('falls back to Untitled for an empty base name', () => {
    expect(nameFromFileName('.wav')).toBe('Untitled');
    expect(nameFromFileName('   .wav')).toBe('Untitled');
  });
});

describe('renameBodySchema', () => {
  it('trims the name', () => {
    expect(renameBodySchema.parse({ name: '  Demo  ' })).toEqual({
      name: 'Demo',
    });
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['too long', 'a'.repeat(NAME_MAX + 1)],
  ])('rejects a %s name', (_label, name) => {
    expect(renameBodySchema.safeParse({ name }).success).toBe(false);
  });
});

describe('createUploadBodySchema', () => {
  const valid = { fileName: 'Mix.wav', sizeBytes: 1024 };

  it.each(['a.wav', 'a.MP3', 'a.flac', 'a.aac', 'a.m4a'])(
    'accepts %s',
    (fileName) => {
      expect(
        createUploadBodySchema.safeParse({ ...valid, fileName }).success,
      ).toBe(true);
    },
  );

  it.each(['a.mp4', 'a.txt', 'wav'])('rejects %s', (fileName) => {
    const result = createUploadBodySchema.safeParse({ ...valid, fileName });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['fileName']);
  });

  it('allows exactly the max file size and rejects one byte more', () => {
    expect(
      createUploadBodySchema.safeParse({ ...valid, sizeBytes: MAX_FILE_BYTES })
        .success,
    ).toBe(true);
    expect(
      createUploadBodySchema.safeParse({
        ...valid,
        sizeBytes: MAX_FILE_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  it('rejects a non-uuid projectId', () => {
    expect(
      createUploadBodySchema.safeParse({ ...valid, projectId: 'p1' }).success,
    ).toBe(false);
  });
});

describe('note bodies', () => {
  it('trims note text and rejects blank text', () => {
    expect(
      createNoteBodySchema.parse({ timestampMs: 0, text: ' Hi ' }).text,
    ).toBe('Hi');
    expect(
      createNoteBodySchema.safeParse({ timestampMs: 0, text: '  ' }).success,
    ).toBe(false);
  });

  it('requires at least one field on update', () => {
    expect(updateNoteBodySchema.safeParse({}).success).toBe(false);
    expect(updateNoteBodySchema.safeParse({ done: false }).success).toBe(true);
  });
});
