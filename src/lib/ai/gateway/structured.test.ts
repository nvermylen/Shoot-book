import { describe, it, expect } from 'vitest';
import { extractJsonText } from './structured';

describe('extractJsonText', () => {
  it('passes plain JSON through unchanged', () => {
    expect(extractJsonText('{"a":1}')).toBe('{"a":1}');
  });

  it('strips a ```json fence', () => {
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips a bare ``` fence', () => {
    expect(extractJsonText('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('tolerates surrounding whitespace', () => {
    expect(extractJsonText('  \n```json\n{"a": [1, 2]}\n```\n  ')).toBe('{"a": [1, 2]}');
  });

  it('does not touch text that merely contains a fence', () => {
    const mixed = 'Here you go:\n```json\n{"a":1}\n```';
    expect(extractJsonText(mixed)).toBe(mixed.trim());
  });
});
