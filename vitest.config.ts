import { defineConfig, configDefaults } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // Parallel work sessions keep extra git checkouts under .claude/worktrees.
    // Without this exclude, vitest collects those checkouts' test files too, so
    // `npm test` double-counts the suite and can fail on another in-flight
    // branch's code (or pass on its stale copy of this one).
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
