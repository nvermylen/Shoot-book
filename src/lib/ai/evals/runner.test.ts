import { describe, it, expect } from 'vitest';
import { runFixture, runEvalSuite, formatReport } from './runner';
import { fixture as passingFixture } from './fixtures/_synthetic_passing.fixture';
import { fixture as failingFixture } from './fixtures/_synthetic_failing.fixture';
import type { Fixture } from './types';

describe('eval runner', () => {
  describe('runFixture', () => {
    it('passes when mockOutput matches expected', () => {
      const result = runFixture(passingFixture);

      expect(result.passed).toBe(true);
      expect(result.fixtureId).toBe('synthetic-passing');
      expect(result.diff).toBeUndefined();
    });

    it('fails with diff when mockOutput text differs', () => {
      const result = runFixture(failingFixture);

      expect(result.passed).toBe(false);
      expect(result.fixtureId).toBe('synthetic-failing');
      expect(result.diff).toBeDefined();
      expect(result.diff).toContain('Expected response');
      expect(result.diff).toContain('Different response');
    });

    it('fails when stopReason differs', () => {
      const fixture: Fixture = {
        id: 'stop-reason-mismatch',
        agentId: 'lead',
        description: 'stopReason mismatch',
        input: { messages: [{ role: 'user', content: 'Hello' }] },
        expected: {
          content: [{ type: 'text', text: 'Hello' }],
          stopReason: 'end_turn',
        },
        mockOutput: {
          content: [{ type: 'text', text: 'Hello' }],
          stopReason: 'tool_use',
        },
      };

      const result = runFixture(fixture);

      expect(result.passed).toBe(false);
      expect(result.diff).toContain('stopReason');
      expect(result.diff).toContain('end_turn');
      expect(result.diff).toContain('tool_use');
    });

    it('fails when content block count differs', () => {
      const fixture: Fixture = {
        id: 'block-count-mismatch',
        agentId: 'lead',
        description: 'block count mismatch',
        input: { messages: [{ role: 'user', content: 'Hello' }] },
        expected: {
          content: [
            { type: 'text', text: 'One' },
            { type: 'text', text: 'Two' },
          ],
          stopReason: 'end_turn',
        },
        mockOutput: {
          content: [{ type: 'text', text: 'One' }],
          stopReason: 'end_turn',
        },
      };

      const result = runFixture(fixture);

      expect(result.passed).toBe(false);
      expect(result.diff).toContain('2 block(s)');
      expect(result.diff).toContain('1');
    });

    it('compares content blocks by value, not reference', () => {
      const fixture: Fixture = {
        id: 'value-equality',
        agentId: 'lead',
        description: 'value equality check',
        input: { messages: [{ role: 'user', content: 'Hello' }] },
        expected: {
          content: [{ type: 'text', text: 'Same' }],
          stopReason: 'end_turn',
        },
        mockOutput: {
          content: [{ type: 'text', text: 'Same' }],
          stopReason: 'end_turn',
        },
      };

      const result = runFixture(fixture);
      expect(result.passed).toBe(true);
    });
  });

  describe('runEvalSuite', () => {
    it('reports correct totals with mixed results', () => {
      const report = runEvalSuite([passingFixture, failingFixture]);

      expect(report.total).toBe(2);
      expect(report.passed).toBe(1);
      expect(report.failed).toBe(1);
      expect(report.results).toHaveLength(2);
    });

    it('reports all passing when all fixtures match', () => {
      const report = runEvalSuite([passingFixture]);

      expect(report.total).toBe(1);
      expect(report.passed).toBe(1);
      expect(report.failed).toBe(0);
    });

    it('reports all failing when no fixtures match', () => {
      const report = runEvalSuite([failingFixture]);

      expect(report.total).toBe(1);
      expect(report.passed).toBe(0);
      expect(report.failed).toBe(1);
    });

    it('handles empty fixture list', () => {
      const report = runEvalSuite([]);

      expect(report.total).toBe(0);
      expect(report.passed).toBe(0);
      expect(report.failed).toBe(0);
      expect(report.results).toHaveLength(0);
    });
  });

  describe('formatReport', () => {
    it('shows PASS marker for passing fixtures', () => {
      const report = runEvalSuite([passingFixture]);
      const output = formatReport(report);

      expect(output).toContain('PASS');
      expect(output).toContain('synthetic-passing');
      expect(output).toContain('1/1 passed, 0 failed');
    });

    it('shows FAIL marker and diff for failing fixtures', () => {
      const report = runEvalSuite([failingFixture]);
      const output = formatReport(report);

      expect(output).toContain('FAIL');
      expect(output).toContain('synthetic-failing');
      expect(output).toContain('Expected response');
      expect(output).toContain('Different response');
      expect(output).toContain('0/1 passed, 1 failed');
    });

    it('includes summary line with mixed results', () => {
      const report = runEvalSuite([passingFixture, failingFixture]);
      const output = formatReport(report);

      expect(output).toContain('1/2 passed, 1 failed');
    });
  });
});
