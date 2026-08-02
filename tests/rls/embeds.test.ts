import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHarness, type TestHarness } from './setup';
import { listInvoices, listUpcomingBookingsWithoutInvoice } from '@/lib/erp/invoice';
import { listChaseStates } from '@/lib/erp/invoice/chase';

// PostgREST resolves embedded joins at query-planning time against the REAL
// schema — an ambiguous embed (booking↔invoice has three FKs since
// migration_005) errors on every call regardless of data, but only against a
// live database. Unit tests mock the client and can never catch it; this
// suite runs against the test project, so a bare call locks the regression.
// Found in prod during Phase 1 acceptance (payments page hard-failed).

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
}, 30_000);

afterAll(async () => {
  if (h) await h.cleanup();
}, 30_000);

describe('embedded-join queries resolve against the real schema', () => {
  it('listUpcomingBookingsWithoutInvoice embed is unambiguous', async () => {
    const { error } = await listUpcomingBookingsWithoutInvoice(h.photographerA);
    expect(error).toBeNull();
  });

  it('listInvoices embed is unambiguous', async () => {
    const { error } = await listInvoices(h.photographerA);
    expect(error).toBeNull();
  });

  it('listChaseStates embed is unambiguous', async () => {
    const { error } = await listChaseStates(h.photographerA);
    expect(error).toBeNull();
  });
});
