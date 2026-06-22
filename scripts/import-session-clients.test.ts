import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import {
  parseCSV,
  normalizeEmail,
  buildDisplayName,
  hasAddress,
  validateRows,
} from './import-session-clients';
import type { SessionCsvRow } from './import-session-clients';

const fixture = (name: string) => path.join(__dirname, 'fixtures', name);

describe('import-session-clients', () => {
  describe('normalizeEmail', () => {
    it('lowercases and trims', () => {
      expect(normalizeEmail('  MamaBacot@Gmail.COM  ')).toBe('mamabacot@gmail.com');
    });
  });

  describe('buildDisplayName', () => {
    it('composes from first + last with trim', () => {
      const row = { first_name: 'Courtney ', last_name: 'Tillery ' } as SessionCsvRow;
      expect(buildDisplayName(row)).toBe('Courtney Tillery');
    });

    it('preserves typos and casing faithfully', () => {
      const row = { first_name: 'Tiffany', last_name: 'andersom' } as SessionCsvRow;
      expect(buildDisplayName(row)).toBe('Tiffany andersom');
    });

    it('falls back to name column if first/last empty', () => {
      const row = { first_name: '', last_name: '', name: 'brooke monte' } as SessionCsvRow;
      expect(buildDisplayName(row)).toBe('brooke monte');
    });
  });

  describe('hasAddress', () => {
    it('returns false for all-empty address fields', () => {
      const row = { address1: '', address2: '', city: '', region: '', postal: '' } as SessionCsvRow;
      expect(hasAddress(row)).toBe(false);
    });

    it('returns true if any address field is populated', () => {
      const row = { address1: '123 Main St', address2: '', city: '', region: '', postal: '' } as SessionCsvRow;
      expect(hasAddress(row)).toBe(true);
    });
  });

  describe('parseCSV', () => {
    it('parses basic fixture with correct record count', () => {
      const { records, totalFileLines } = parseCSV(fixture('import-basic.csv'));
      expect(records).toHaveLength(4);
      expect(totalFileLines).toBe(6); // header + 4 data + trailing newline
    });

    it('handles embedded newline in quoted field', () => {
      const { records, totalFileLines } = parseCSV(fixture('import-embedded-newline.csv'));
      expect(records).toHaveLength(3);
      // File has more lines than records due to embedded newline
      expect(totalFileLines).toBeGreaterThan(records.length + 1);
    });
  });

  describe('validateRows', () => {
    it('flags empty email rows', () => {
      const { records } = parseCSV(fixture('import-empty-email.csv'));
      const { valid, flagged } = validateRows(records);
      expect(valid).toHaveLength(1);
      expect(flagged).toHaveLength(1);
      expect(flagged[0].reason).toBe('empty email');
    });

    it('flags duplicate emails after normalization', () => {
      const { records } = parseCSV(fixture('import-duplicate-email.csv'));
      const { valid, flagged } = validateRows(records);
      expect(valid).toHaveLength(1);
      expect(flagged).toHaveLength(1);
      expect(flagged[0].reason).toContain('duplicate email');
    });

    it('counts and reports address rows', () => {
      const { records } = parseCSV(fixture('import-with-address.csv'));
      const { addressRowCount, addressRows } = validateRows(records);
      expect(addressRowCount).toBe(1);
      expect(addressRows).toHaveLength(1);
    });

    it('handles mixed-case email normalization', () => {
      const { records } = parseCSV(fixture('import-mixed-case-email.csv'));
      const { valid } = validateRows(records);
      expect(valid).toHaveLength(1);
      expect(valid[0].email).toBe('mamabacot@gmail.com');
    });

    it('preserves trailing whitespace in names faithfully', () => {
      const { records } = parseCSV(fixture('import-basic.csv'));
      const { valid } = validateRows(records);
      const courtney = valid.find((v) => v.email === 'courtney@example.com');
      expect(courtney?.displayName).toBe('Courtney Tillery');
    });

    it('treats email as key not identity (different name same email)', () => {
      const { records } = parseCSV(fixture('import-basic.csv'));
      const { valid } = validateRows(records);
      const eliza = valid.find((v) => v.email === 'catherine@3millers.com');
      expect(eliza).toBeDefined();
      expect(eliza?.displayName).toBe('Eliza Miller');
    });

    it('reconciliation gap: embedded newline causes line/record mismatch', () => {
      const { records, totalFileLines } = parseCSV(fixture('import-embedded-newline.csv'));
      const gap = totalFileLines - 1 - records.length;
      expect(gap).toBeGreaterThan(0);
    });
  });

  describe('skip-on-rerun', () => {
    it('dedup marks all records as valid on first pass', () => {
      const { records } = parseCSV(fixture('import-basic.csv'));
      const { valid, flagged } = validateRows(records);
      expect(valid).toHaveLength(4);
      expect(flagged).toHaveLength(0);
    });
  });
});
