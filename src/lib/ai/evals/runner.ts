import type { Fixture, EvalResult, EvalReport, EvalExpected } from './types';

function compare(
  expected: EvalExpected,
  actual: EvalExpected,
): { passed: boolean; diff?: string } {
  if (expected.stopReason !== actual.stopReason) {
    return {
      passed: false,
      diff: `stopReason: expected "${expected.stopReason}", got "${actual.stopReason}"`,
    };
  }

  if (expected.content.length !== actual.content.length) {
    return {
      passed: false,
      diff: `content: expected ${expected.content.length} block(s), got ${actual.content.length}`,
    };
  }

  for (let i = 0; i < expected.content.length; i++) {
    const exp = expected.content[i]!;
    const act = actual.content[i]!;
    const expJson = JSON.stringify(exp);
    const actJson = JSON.stringify(act);
    if (expJson !== actJson) {
      return {
        passed: false,
        diff: `content[${i}]:\n  expected: ${expJson}\n  actual:   ${actJson}`,
      };
    }
  }

  return { passed: true };
}

export function runFixture(fixture: Fixture): EvalResult {
  try {
    const actual = fixture.mockOutput;
    const { passed, diff } = compare(fixture.expected, actual);

    return {
      fixtureId: fixture.id,
      agentId: fixture.agentId,
      promptVersion: fixture.promptVersion,
      timestamp: new Date().toISOString(),
      passed,
      expected: fixture.expected,
      actual,
      ...(diff && { diff }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      fixtureId: fixture.id,
      agentId: fixture.agentId,
      promptVersion: fixture.promptVersion ?? 'unknown',
      timestamp: new Date().toISOString(),
      passed: false,
      expected: fixture.expected ?? { content: [], stopReason: '' },
      actual: fixture.mockOutput ?? { content: [], stopReason: '' },
      diff: `fixture error: ${message}`,
    };
  }
}

export function runEvalSuite(fixtures: Fixture[]): EvalReport {
  const results = fixtures.map(runFixture);
  const passed = results.filter((r) => r.passed).length;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function formatReport(report: EvalReport): string {
  const lines: string[] = [];

  for (const result of report.results) {
    const marker = result.passed ? 'PASS' : 'FAIL';
    lines.push(
      `  ${marker}  ${result.fixtureId}  [${result.agentId}@${result.promptVersion}]`,
    );
    if (result.diff) {
      for (const diffLine of result.diff.split('\n')) {
        lines.push(`        ${diffLine}`);
      }
    }
  }

  lines.push('');
  lines.push(
    `  ${report.passed}/${report.total} passed, ${report.failed} failed`,
  );

  return lines.join('\n');
}
