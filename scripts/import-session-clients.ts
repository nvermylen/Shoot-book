import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import * as fs from 'node:fs';
import * as process from 'node:process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionCsvRow {
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postal: string;
  phone: string;
}

interface ImportResult {
  created: number;
  skipped: number;
  flagged: Array<{ row: number; reason: string; data: Partial<SessionCsvRow> }>;
  addressRowCount: number;
  addressRows: number[];
  totalParsed: number;
  totalFileLines: number;
}

// ---------------------------------------------------------------------------
// Parse + validate
// ---------------------------------------------------------------------------

function parseCSV(filePath: string): {
  records: SessionCsvRow[];
  totalFileLines: number;
  parseErrors: Papa.ParseError[];
} {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const totalFileLines = raw.split('\n').length;

  const result = Papa.parse<SessionCsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase(),
  });

  return {
    records: result.data,
    totalFileLines,
    parseErrors: result.errors,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildDisplayName(row: SessionCsvRow): string {
  const first = row.first_name?.trim() ?? '';
  const last = row.last_name?.trim() ?? '';
  const combined = `${first} ${last}`.trim();
  return combined || row.name?.trim() || '';
}

function hasAddress(row: SessionCsvRow): boolean {
  return !!(
    row.address1?.trim() ||
    row.address2?.trim() ||
    row.city?.trim() ||
    row.region?.trim() ||
    row.postal?.trim()
  );
}

function validateRows(records: SessionCsvRow[]): {
  valid: Array<{ index: number; row: SessionCsvRow; email: string; displayName: string }>;
  flagged: ImportResult['flagged'];
  addressRowCount: number;
  addressRows: number[];
} {
  const flagged: ImportResult['flagged'] = [];
  const valid: Array<{ index: number; row: SessionCsvRow; email: string; displayName: string }> = [];
  const seenEmails = new Map<string, number>();
  let addressRowCount = 0;
  const addressRows: number[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const csvRow = i + 2; // 1-indexed, +1 for header

    if (!row.email?.trim()) {
      flagged.push({ row: csvRow, reason: 'empty email', data: { first_name: row.first_name, last_name: row.last_name } });
      continue;
    }

    const email = normalizeEmail(row.email);
    const displayName = buildDisplayName(row);

    if (!displayName) {
      flagged.push({ row: csvRow, reason: 'empty display name (no first_name, last_name, or name)', data: { email: row.email } });
      continue;
    }

    const previousRow = seenEmails.get(email);
    if (previousRow !== undefined) {
      flagged.push({
        row: csvRow,
        reason: `duplicate email "${email}" (first seen at row ${previousRow})`,
        data: { first_name: row.first_name, last_name: row.last_name, email: row.email },
      });
      continue;
    }

    seenEmails.set(email, csvRow);

    if (hasAddress(row)) {
      addressRowCount++;
      addressRows.push(csvRow);
    }

    valid.push({ index: i, row, email, displayName });
  }

  return { valid, flagged, addressRowCount, addressRows };
}

// ---------------------------------------------------------------------------
// Import execution
// ---------------------------------------------------------------------------

async function runImport(
  filePath: string,
  commit: boolean,
): Promise<ImportResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const userEmail = process.env.IMPORT_USER_EMAIL;
  const userPassword = process.env.IMPORT_USER_PASSWORD;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  if (!userEmail || !userPassword) {
    throw new Error('Missing IMPORT_USER_EMAIL or IMPORT_USER_PASSWORD — required for RLS-scoped writes');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: userEmail,
    password: userPassword,
  });
  if (authError) {
    throw new Error(`Auth failed: ${authError.message}`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Authenticated but getUser() returned null');
  }
  const photographerId = user.id;

  // Parse
  const { records, totalFileLines, parseErrors } = parseCSV(filePath);

  if (parseErrors.length > 0) {
    console.error('\n⚠ Parse errors:');
    for (const e of parseErrors) {
      console.error(`  Row ${e.row}: ${e.message}`);
    }
  }

  // Validate
  const { valid, flagged, addressRowCount, addressRows } = validateRows(records);

  // Reconciliation
  const reconciliationGap = totalFileLines - 1 - records.length; // -1 for header
  const hasGap = reconciliationGap !== 0;

  // Check existing clients for skip-on-match
  const { data: existingClients, error: fetchError } = await supabase
    .from('client')
    .select('email')
    .is('deleted_at', null);

  if (fetchError) {
    throw new Error(`Failed to fetch existing clients: ${fetchError.message}`);
  }

  const existingEmails = new Set(
    (existingClients ?? []).map((c: { email: string }) => normalizeEmail(c.email)),
  );

  const toCreate = valid.filter((v) => !existingEmails.has(v.email));
  const toSkip = valid.filter((v) => existingEmails.has(v.email));

  // Report
  console.log('\n=== Import Preview ===');
  console.log(`File: ${filePath}`);
  console.log(`File lines: ${totalFileLines} (including header)`);
  console.log(`Parsed records: ${records.length}`);
  console.log(`Reconciliation: ${hasGap ? `GAP of ${Math.abs(reconciliationGap)} — file lines minus header (${totalFileLines - 1}) ≠ parsed records (${records.length})` : 'match'}`);
  console.log(`\nPhotographer: ${photographerId}`);
  console.log(`Valid records: ${valid.length}`);
  console.log(`Will create: ${toCreate.length}`);
  console.log(`Will skip (existing): ${toSkip.length}`);
  console.log(`Flagged: ${flagged.length}`);

  if (flagged.length > 0) {
    console.log('\nFlagged rows:');
    for (const f of flagged) {
      console.log(`  Row ${f.row}: ${f.reason} — ${JSON.stringify(f.data)}`);
    }
  }

  console.log(`\nAddress data: ${addressRowCount} of ${records.length} rows contain address data that will not be imported (no schema support)${addressRowCount > 0 ? ` — rows: [${addressRows.join(', ')}]` : ''}`);

  if (hasGap) {
    console.log('\n⚠ RECONCILIATION GAP — review before proceeding with --commit');
  }

  if (!commit) {
    console.log('\nDry run complete. No rows written. Use --commit to write.\n');
    return {
      created: 0,
      skipped: toSkip.length,
      flagged,
      addressRowCount,
      addressRows,
      totalParsed: records.length,
      totalFileLines,
    };
  }

  // Commit
  console.log('\n--- Committing ---');
  let created = 0;
  const errors: Array<{ row: number; email: string; error: string }> = [];

  for (const item of toCreate) {
    const { error: insertError } = await supabase
      .from('client')
      .insert({
        photographer_id: photographerId,
        display_name: item.displayName,
        email: item.email,
        phone: item.row.phone?.trim() || null,
        source: 'imported' as const,
      });

    if (insertError) {
      errors.push({ row: item.index + 2, email: item.email, error: insertError.message });
      console.error(`  ✗ Row ${item.index + 2} (${item.email}): ${insertError.message}`);
    } else {
      created++;
    }
  }

  console.log(`\nCommit complete: ${created} created, ${toSkip.length} skipped, ${errors.length} errors`);
  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) {
      console.log(`  Row ${e.row} (${e.email}): ${e.error}`);
    }
  }

  return {
    created,
    skipped: toSkip.length,
    flagged,
    addressRowCount,
    addressRows,
    totalParsed: records.length,
    totalFileLines,
  };
}

// ---------------------------------------------------------------------------
// CLI entry — only runs when invoked directly, not when imported by tests
// ---------------------------------------------------------------------------

export { parseCSV, normalizeEmail, buildDisplayName, hasAddress, validateRows, runImport };
export type { SessionCsvRow, ImportResult };

const isDirectRun = process.argv[1]?.endsWith('import-session-clients.ts');

if (isDirectRun) {
  const args = process.argv.slice(2);
  const commitFlag = args.includes('--commit');
  const csvPath = args.find((a) => !a.startsWith('--'));

  if (!csvPath) {
    console.error('Usage: tsx scripts/import-session-clients.ts <csv-path> [--dry-run|--commit]');
    console.error('  Default is --dry-run (no writes).');
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  runImport(csvPath, commitFlag)
    .then((result) => {
      if (result.flagged.length > 0 && commitFlag) {
        process.exit(2);
      }
    })
    .catch((err) => {
      console.error('\nFatal:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
