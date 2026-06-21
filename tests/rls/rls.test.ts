import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHarness, type TestHarness } from './setup';

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
}, 30_000);

afterAll(async () => {
  if (h) await h.cleanup();
}, 30_000);

// ============================================================
// lead — full pattern (read + insert + update + delete)
// ============================================================

describe('lead RLS', () => {
  let leadIdA: string;

  it('A can insert a lead with own photographer_id', async () => {
    const { data, error } = await h.photographerA
      .from('lead')
      .insert({
        photographer_id: h.userIdA,
        display_name: 'Test Lead A',
        email: 'lead-a@test.local',
        source: 'web_form',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    leadIdA = data!.id;
  });

  it('A can read own lead (positive control)', async () => {
    const { data } = await h.photographerA
      .from('lead')
      .select('*')
      .eq('id', leadIdA)
      .single();

    expect(data).not.toBeNull();
    expect(data!.id).toBe(leadIdA);
  });

  it('B cannot read A\'s lead', async () => {
    const { data } = await h.photographerB
      .from('lead')
      .select('*')
      .eq('id', leadIdA)
      .maybeSingle();

    expect(data).toBeNull();
  });

  it('B cannot insert a lead with A\'s photographer_id', async () => {
    const { error } = await h.photographerB
      .from('lead')
      .insert({
        photographer_id: h.userIdA,
        display_name: 'Injected Lead',
        email: 'injected@test.local',
        source: 'web_form',
      });

    expect(error).not.toBeNull();
  });

  it('A can update own lead (positive control)', async () => {
    const { error } = await h.photographerA
      .from('lead')
      .update({ intent_summary: 'updated by A' })
      .eq('id', leadIdA);

    expect(error).toBeNull();
  });

  it('B cannot update A\'s lead', async () => {
    const { data } = await h.photographerB
      .from('lead')
      .update({ intent_summary: 'hacked by B' })
      .eq('id', leadIdA)
      .select();

    expect(data).toHaveLength(0);
  });

  it('B cannot delete A\'s lead', async () => {
    const { data } = await h.photographerB
      .from('lead')
      .delete()
      .eq('id', leadIdA)
      .select();

    expect(data).toHaveLength(0);
  });

  it('A\'s lead still exists after B\'s delete attempt (positive control)', async () => {
    const { data } = await h.photographerA
      .from('lead')
      .select('*')
      .eq('id', leadIdA)
      .single();

    expect(data).not.toBeNull();
  });
});

// ============================================================
// client — full pattern (read + insert + update + delete)
// ============================================================

describe('client RLS', () => {
  let clientIdA: string;

  it('A can insert a client with own photographer_id', async () => {
    const { data, error } = await h.photographerA
      .from('client')
      .insert({
        photographer_id: h.userIdA,
        display_name: 'Test Client A',
        email: 'client-a@test.local',
        source: 'manual',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    clientIdA = data!.id;
  });

  it('A can read own client (positive control)', async () => {
    const { data } = await h.photographerA
      .from('client')
      .select('*')
      .eq('id', clientIdA)
      .single();

    expect(data).not.toBeNull();
    expect(data!.id).toBe(clientIdA);
  });

  it('B cannot read A\'s client', async () => {
    const { data } = await h.photographerB
      .from('client')
      .select('*')
      .eq('id', clientIdA)
      .maybeSingle();

    expect(data).toBeNull();
  });

  it('B cannot insert a client with A\'s photographer_id', async () => {
    const { error } = await h.photographerB
      .from('client')
      .insert({
        photographer_id: h.userIdA,
        display_name: 'Injected Client',
        email: 'injected@test.local',
        source: 'manual',
      });

    expect(error).not.toBeNull();
  });

  it('A can update own client (positive control)', async () => {
    const { error } = await h.photographerA
      .from('client')
      .update({ notes: 'updated by A' })
      .eq('id', clientIdA);

    expect(error).toBeNull();
  });

  it('B cannot update A\'s client', async () => {
    const { data } = await h.photographerB
      .from('client')
      .update({ notes: 'hacked by B' })
      .eq('id', clientIdA)
      .select();

    expect(data).toHaveLength(0);
  });

  it('B cannot delete A\'s client', async () => {
    const { data } = await h.photographerB
      .from('client')
      .delete()
      .eq('id', clientIdA)
      .select();

    expect(data).toHaveLength(0);
  });

  it('A\'s client still exists after B\'s delete attempt (positive control)', async () => {
    const { data } = await h.photographerA
      .from('client')
      .select('*')
      .eq('id', clientIdA)
      .single();

    expect(data).not.toBeNull();
  });
});

// ============================================================
// booking — full pattern (requires client + package as FK deps)
// ============================================================

describe('booking RLS', () => {
  let clientIdA: string;
  let packageIdA: string;
  let bookingIdA: string;

  beforeAll(async () => {
    const { data: client, error: clientErr } = await h.photographerA
      .from('client')
      .insert({
        photographer_id: h.userIdA,
        display_name: 'Booking Test Client',
        email: 'booking-client@test.local',
        source: 'manual',
      })
      .select()
      .single();
    if (clientErr) throw new Error(`Booking setup — client: ${clientErr.message}`);
    clientIdA = client!.id;

    const { data: pkg, error: pkgErr } = await h.photographerA
      .from('package')
      .insert({
        photographer_id: h.userIdA,
        name: 'Booking Test Package',
        price_cents: 20000,
        deposit_cents: 5000,
        session_type: 'senior',
        included_locations_count: 1,
        delivery_count: 25,
      })
      .select()
      .single();
    if (pkgErr) throw new Error(`Booking setup — package: ${pkgErr.message}`);
    packageIdA = pkg!.id;
  });

  it('A can insert a booking with own photographer_id', async () => {
    const { data, error } = await h.photographerA
      .from('booking')
      .insert({
        photographer_id: h.userIdA,
        client_id: clientIdA,
        package_id: packageIdA,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    bookingIdA = data!.id;
  });

  it('A can read own booking (positive control)', async () => {
    const { data } = await h.photographerA
      .from('booking')
      .select('*')
      .eq('id', bookingIdA)
      .single();

    expect(data).not.toBeNull();
    expect(data!.id).toBe(bookingIdA);
  });

  it('B cannot read A\'s booking', async () => {
    const { data } = await h.photographerB
      .from('booking')
      .select('*')
      .eq('id', bookingIdA)
      .maybeSingle();

    expect(data).toBeNull();
  });

  it('B cannot insert a booking with A\'s photographer_id', async () => {
    const { error } = await h.photographerB
      .from('booking')
      .insert({
        photographer_id: h.userIdA,
        client_id: clientIdA,
        package_id: packageIdA,
      });

    expect(error).not.toBeNull();
  });

  it('A can update own booking (positive control)', async () => {
    const { error } = await h.photographerA
      .from('booking')
      .update({ notes: 'updated by A' })
      .eq('id', bookingIdA);

    expect(error).toBeNull();
  });

  it('B cannot update A\'s booking', async () => {
    const { data } = await h.photographerB
      .from('booking')
      .update({ notes: 'hacked by B' })
      .eq('id', bookingIdA)
      .select();

    expect(data).toHaveLength(0);
  });

  it('B cannot delete A\'s booking', async () => {
    const { data } = await h.photographerB
      .from('booking')
      .delete()
      .eq('id', bookingIdA)
      .select();

    expect(data).toHaveLength(0);
  });

  it('A\'s booking still exists after B\'s delete attempt (positive control)', async () => {
    const { data } = await h.photographerA
      .from('booking')
      .select('*')
      .eq('id', bookingIdA)
      .single();

    expect(data).not.toBeNull();
  });
});

// ============================================================
// package — full pattern
// ============================================================

describe('package RLS', () => {
  let packageIdA: string;

  it('A can insert a package with own photographer_id', async () => {
    const { data, error } = await h.photographerA
      .from('package')
      .insert({
        photographer_id: h.userIdA,
        name: 'RLS Test Package',
        price_cents: 30000,
        deposit_cents: 10000,
        session_type: 'family',
        included_locations_count: 2,
        delivery_count: 50,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    packageIdA = data!.id;
  });

  it('A can read own package (positive control)', async () => {
    const { data } = await h.photographerA
      .from('package')
      .select('*')
      .eq('id', packageIdA)
      .single();

    expect(data).not.toBeNull();
  });

  it('B cannot read A\'s package', async () => {
    const { data } = await h.photographerB
      .from('package')
      .select('*')
      .eq('id', packageIdA)
      .maybeSingle();

    expect(data).toBeNull();
  });

  it('B cannot insert a package with A\'s photographer_id', async () => {
    const { error } = await h.photographerB
      .from('package')
      .insert({
        photographer_id: h.userIdA,
        name: 'Injected Package',
        price_cents: 10000,
        deposit_cents: 5000,
        session_type: 'senior',
        included_locations_count: 1,
        delivery_count: 10,
      });

    expect(error).not.toBeNull();
  });

  it('B cannot update A\'s package', async () => {
    const { data } = await h.photographerB
      .from('package')
      .update({ name: 'hacked' })
      .eq('id', packageIdA)
      .select();

    expect(data).toHaveLength(0);
  });

  it('B cannot delete A\'s package', async () => {
    const { data } = await h.photographerB
      .from('package')
      .delete()
      .eq('id', packageIdA)
      .select();

    expect(data).toHaveLength(0);
  });
});

// ============================================================
// location — full pattern
// ============================================================

describe('location RLS', () => {
  let locationIdA: string;

  it('A can insert a location with own photographer_id', async () => {
    const { data, error } = await h.photographerA
      .from('location')
      .insert({
        photographer_id: h.userIdA,
        name: 'RLS Test Location',
        category: 'downtown',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    locationIdA = data!.id;
  });

  it('A can read own location (positive control)', async () => {
    const { data } = await h.photographerA
      .from('location')
      .select('*')
      .eq('id', locationIdA)
      .single();

    expect(data).not.toBeNull();
  });

  it('B cannot read A\'s location', async () => {
    const { data } = await h.photographerB
      .from('location')
      .select('*')
      .eq('id', locationIdA)
      .maybeSingle();

    expect(data).toBeNull();
  });

  it('B cannot insert a location with A\'s photographer_id', async () => {
    const { error } = await h.photographerB
      .from('location')
      .insert({
        photographer_id: h.userIdA,
        name: 'Injected Location',
        category: 'studio',
      });

    expect(error).not.toBeNull();
  });

  it('B cannot update A\'s location', async () => {
    const { data } = await h.photographerB
      .from('location')
      .update({ name: 'hacked' })
      .eq('id', locationIdA)
      .select();

    expect(data).toHaveLength(0);
  });

  it('B cannot delete A\'s location', async () => {
    const { data } = await h.photographerB
      .from('location')
      .delete()
      .eq('id', locationIdA)
      .select();

    expect(data).toHaveLength(0);
  });
});

// ============================================================
// comm_sequence — full pattern
// ============================================================

describe('comm_sequence RLS', () => {
  let seqIdA: string;

  it('A can insert a comm_sequence with own photographer_id', async () => {
    const { data, error } = await h.photographerA
      .from('comm_sequence')
      .insert({
        photographer_id: h.userIdA,
        name: 'RLS Test Sequence',
        trigger_event: 'booking.created',
        steps: JSON.stringify([{ delay: 0, action: 'send_email' }]),
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    seqIdA = data!.id;
  });

  it('A can read own comm_sequence (positive control)', async () => {
    const { data } = await h.photographerA
      .from('comm_sequence')
      .select('*')
      .eq('id', seqIdA)
      .single();

    expect(data).not.toBeNull();
  });

  it('B cannot read A\'s comm_sequence', async () => {
    const { data } = await h.photographerB
      .from('comm_sequence')
      .select('*')
      .eq('id', seqIdA)
      .maybeSingle();

    expect(data).toBeNull();
  });

  it('B cannot insert a comm_sequence with A\'s photographer_id', async () => {
    const { error } = await h.photographerB
      .from('comm_sequence')
      .insert({
        photographer_id: h.userIdA,
        name: 'Injected Sequence',
        trigger_event: 'booking.created',
        steps: JSON.stringify([]),
      });

    expect(error).not.toBeNull();
  });

  it('B cannot update A\'s comm_sequence', async () => {
    const { data } = await h.photographerB
      .from('comm_sequence')
      .update({ name: 'hacked' })
      .eq('id', seqIdA)
      .select();

    expect(data).toHaveLength(0);
  });

  it('B cannot delete A\'s comm_sequence', async () => {
    const { data } = await h.photographerB
      .from('comm_sequence')
      .delete()
      .eq('id', seqIdA)
      .select();

    expect(data).toHaveLength(0);
  });
});

// ============================================================
// comm_log — append-only (read + insert only, no update/delete tests)
// ============================================================

describe('comm_log RLS (append-only)', () => {
  let commLogIdA: string;

  it('A can insert a comm_log with own photographer_id', async () => {
    const { data, error } = await h.photographerA
      .from('comm_log')
      .insert({
        photographer_id: h.userIdA,
        direction: 'outbound',
        channel: 'email',
        subject: 'RLS test',
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    commLogIdA = data!.id;
  });

  it('A can read own comm_log (positive control)', async () => {
    const { data } = await h.photographerA
      .from('comm_log')
      .select('*')
      .eq('id', commLogIdA)
      .single();

    expect(data).not.toBeNull();
    expect(data!.id).toBe(commLogIdA);
  });

  it('B cannot read A\'s comm_log', async () => {
    const { data } = await h.photographerB
      .from('comm_log')
      .select('*')
      .eq('id', commLogIdA)
      .maybeSingle();

    expect(data).toBeNull();
  });

  it('B cannot insert a comm_log with A\'s photographer_id', async () => {
    const { error } = await h.photographerB
      .from('comm_log')
      .insert({
        photographer_id: h.userIdA,
        direction: 'outbound',
        channel: 'email',
        subject: 'injected',
        sent_at: new Date().toISOString(),
      });

    expect(error).not.toBeNull();
  });
});

// ============================================================
// agent_tool_call_log — append-only (read + insert only)
// ============================================================

describe('agent_tool_call_log RLS (append-only)', () => {
  let logIdA: string;

  it('A can insert a tool call log with own photographer_id', async () => {
    const { data, error } = await h.photographerA
      .from('agent_tool_call_log')
      .insert({
        photographer_id: h.userIdA,
        agent_id: 'lead',
        tool_name: 'lens.create_lead',
        input_hash: 'abc123',
        status: 'ok',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    logIdA = data!.id;
  });

  it('A can read own tool call log (positive control)', async () => {
    const { data } = await h.photographerA
      .from('agent_tool_call_log')
      .select('*')
      .eq('id', logIdA)
      .single();

    expect(data).not.toBeNull();
  });

  it('B cannot read A\'s tool call log', async () => {
    const { data } = await h.photographerB
      .from('agent_tool_call_log')
      .select('*')
      .eq('id', logIdA)
      .maybeSingle();

    expect(data).toBeNull();
  });

  it('B cannot insert a tool call log with A\'s photographer_id', async () => {
    const { error } = await h.photographerB
      .from('agent_tool_call_log')
      .insert({
        photographer_id: h.userIdA,
        agent_id: 'lead',
        tool_name: 'lens.create_lead',
        input_hash: 'injected',
        status: 'ok',
      });

    expect(error).not.toBeNull();
  });
});

// ============================================================
// domain_event_log — append-only (read + insert only)
// ============================================================

describe('domain_event_log RLS (append-only)', () => {
  let eventIdA: string;

  it('A can insert a domain event with own photographer_id', async () => {
    const { data, error } = await h.photographerA
      .from('domain_event_log')
      .insert({
        photographer_id: h.userIdA,
        type: 'lead.created',
        payload: { lead_id: 'test' },
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    eventIdA = data!.id;
  });

  it('A can read own domain event (positive control)', async () => {
    const { data } = await h.photographerA
      .from('domain_event_log')
      .select('*')
      .eq('id', eventIdA)
      .single();

    expect(data).not.toBeNull();
  });

  it('B cannot read A\'s domain event', async () => {
    const { data } = await h.photographerB
      .from('domain_event_log')
      .select('*')
      .eq('id', eventIdA)
      .maybeSingle();

    expect(data).toBeNull();
  });

  it('B cannot insert a domain event with A\'s photographer_id', async () => {
    const { error } = await h.photographerB
      .from('domain_event_log')
      .insert({
        photographer_id: h.userIdA,
        type: 'lead.created',
        payload: { lead_id: 'injected' },
      });

    expect(error).not.toBeNull();
  });
});
