import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const CURRENT_KEY_VERSION = 1;

export class TokenDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenDecryptError';
  }
}

export class TokenConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenConfigError';
  }
}

function getKeyForVersion(version: number): Buffer {
  if (version !== CURRENT_KEY_VERSION) {
    throw new TokenDecryptError(
      `unsupported key version: ${version}`
    );
  }

  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new TokenConfigError('TOKEN_ENCRYPTION_KEY is not set');
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new TokenConfigError('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }

  return key;
}

export function encryptToken(plaintext: string): {
  ciphertext: Buffer;
  keyVersion: number;
} {
  const key = getKeyForVersion(CURRENT_KEY_VERSION);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Wire format: [iv (12)] [authTag (16)] [ciphertext (...)]
  const result = Buffer.concat([iv, authTag, encrypted]);

  return { ciphertext: result, keyVersion: CURRENT_KEY_VERSION };
}

export function decryptToken(ciphertext: Buffer, keyVersion: number): string {
  const key = getKeyForVersion(keyVersion);

  if (ciphertext.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new TokenDecryptError('ciphertext too short');
  }

  const iv = ciphertext.subarray(0, IV_LENGTH);
  const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    throw new TokenDecryptError('decryption failed');
  }
}
