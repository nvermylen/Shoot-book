import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptToken, decryptToken, TokenDecryptError, TokenConfigError } from './tokens';

const VALID_KEY = randomBytes(32).toString('base64');

function setKey(key: string | undefined) {
  if (key === undefined) {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.TOKEN_ENCRYPTION_KEY = key;
  }
}

describe('tokens', () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.TOKEN_ENCRYPTION_KEY;
    setKey(VALID_KEY);
  });

  afterEach(() => {
    setKey(originalKey);
  });

  it('roundtrip: encrypt then decrypt returns original plaintext', () => {
    const plaintext = 'ya29.a0AfH6SMBX_oauth_access_token_example';
    const { ciphertext, keyVersion } = encryptToken(plaintext);
    const result = decryptToken(ciphertext, keyVersion);
    expect(result).toBe(plaintext);
  });

  it('fresh IV: same plaintext encrypted twice produces different ciphertext', () => {
    const plaintext = 'identical-token-value';
    const first = encryptToken(plaintext);
    const second = encryptToken(plaintext);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  it('wrong key: decrypt with a different key throws TokenDecryptError', () => {
    const { ciphertext, keyVersion } = encryptToken('secret-token');
    const differentKey = randomBytes(32).toString('base64');
    setKey(differentKey);
    expect(() => decryptToken(ciphertext, keyVersion)).toThrow(TokenDecryptError);
  });

  it('tampered ciphertext: flipping a byte throws TokenDecryptError', () => {
    const { ciphertext, keyVersion } = encryptToken('secret-token');
    const tampered = Buffer.from(ciphertext);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptToken(tampered, keyVersion)).toThrow(TokenDecryptError);
  });

  it('unsupported key version: version 99 throws TokenDecryptError', () => {
    const { ciphertext } = encryptToken('secret-token');
    expect(() => decryptToken(ciphertext, 99)).toThrow(TokenDecryptError);
    expect(() => decryptToken(ciphertext, 99)).toThrow('unsupported key version: 99');
  });

  it('truncated ciphertext: shorter than iv+authTag throws TokenDecryptError', () => {
    const tooShort = Buffer.alloc(27); // 12 + 16 - 1
    expect(() => decryptToken(tooShort, 1)).toThrow(TokenDecryptError);
    expect(() => decryptToken(tooShort, 1)).toThrow('ciphertext too short');
  });

  it('UTF-8 multi-byte preservation: emoji and non-ASCII roundtrip correctly', () => {
    const plaintext = '🔐 Ñoño — 日本語トークン';
    const { ciphertext, keyVersion } = encryptToken(plaintext);
    const result = decryptToken(ciphertext, keyVersion);
    expect(result).toBe(plaintext);
  });

  describe('TokenConfigError', () => {
    it('throws TokenConfigError when TOKEN_ENCRYPTION_KEY is not set', () => {
      setKey(undefined);
      expect(() => encryptToken('anything')).toThrow(TokenConfigError);
      expect(() => encryptToken('anything')).toThrow('TOKEN_ENCRYPTION_KEY is not set');
    });

    it('throws TokenConfigError when key is wrong length', () => {
      setKey(randomBytes(16).toString('base64')); // 16 bytes, not 32
      expect(() => encryptToken('anything')).toThrow(TokenConfigError);
      expect(() => encryptToken('anything')).toThrow('must decode to exactly 32 bytes');
    });
  });
});
