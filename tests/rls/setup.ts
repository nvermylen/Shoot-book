import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.test' });

const url = process.env.TEST_SUPABASE_URL;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  throw new Error(
    'Missing TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, or TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test',
  );
}

export interface TestHarness {
  admin: SupabaseClient;
  photographerA: SupabaseClient;
  photographerB: SupabaseClient;
  userIdA: string;
  userIdB: string;
  cleanup: () => Promise<void>;
}

export async function createTestHarness(): Promise<TestHarness> {
  const admin = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = Date.now();

  const { data: userAData, error: userAError } =
    await admin.auth.admin.createUser({
      email: `rls-test-a-${suffix}@test.local`,
      password: 'test-password-a-secure',
      email_confirm: true,
    });
  if (userAError) throw new Error(`Failed to create user A: ${userAError.message}`);

  const { data: userBData, error: userBError } =
    await admin.auth.admin.createUser({
      email: `rls-test-b-${suffix}@test.local`,
      password: 'test-password-b-secure',
      email_confirm: true,
    });
  if (userBError) throw new Error(`Failed to create user B: ${userBError.message}`);

  const userIdA = userAData.user.id;
  const userIdB = userBData.user.id;

  const clientA = createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInAError } = await clientA.auth.signInWithPassword({
    email: `rls-test-a-${suffix}@test.local`,
    password: 'test-password-a-secure',
  });
  if (signInAError) throw new Error(`Failed to sign in user A: ${signInAError.message}`);

  const clientB = createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInBError } = await clientB.auth.signInWithPassword({
    email: `rls-test-b-${suffix}@test.local`,
    password: 'test-password-b-secure',
  });
  if (signInBError) throw new Error(`Failed to sign in user B: ${signInBError.message}`);

  const { error: photoAError } = await admin.from('photographer').insert({
    id: userIdA,
    business_name: 'Test Studio A',
    display_name: 'Photographer A',
    timezone: 'America/Chicago',
  });
  if (photoAError) throw new Error(`Failed to seed photographer A: ${photoAError.message}`);

  const { error: photoBError } = await admin.from('photographer').insert({
    id: userIdB,
    business_name: 'Test Studio B',
    display_name: 'Photographer B',
    timezone: 'America/Chicago',
  });
  if (photoBError) throw new Error(`Failed to seed photographer B: ${photoBError.message}`);

  const cleanup = async () => {
    const tables = [
      'domain_event_log',
      'agent_tool_call_log',
      'comm_log',
      'booking_location',
      'contract',
      'booking',
      'comm_sequence_state',
      'comm_sequence',
      'package',
      'location',
      'lead',
      'client',
      'photographer',
    ];
    for (const table of tables) {
      await admin
        .from(table)
        .delete()
        .or(`photographer_id.eq.${userIdA},photographer_id.eq.${userIdB}`);
    }
    // photographer table uses id, not photographer_id
    await admin.from('photographer').delete().eq('id', userIdA);
    await admin.from('photographer').delete().eq('id', userIdB);
    await admin.auth.admin.deleteUser(userIdA);
    await admin.auth.admin.deleteUser(userIdB);
  };

  return {
    admin,
    photographerA: clientA,
    photographerB: clientB,
    userIdA,
    userIdB,
    cleanup,
  };
}
