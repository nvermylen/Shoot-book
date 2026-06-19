import { runEvalSuite, formatReport } from './runner';
import { fixture as syntheticPassing } from './fixtures/_synthetic_passing.fixture';

const fixtures = [syntheticPassing];

const report = runEvalSuite(fixtures);
console.log(formatReport(report));

process.exit(report.failed > 0 ? 1 : 0);
