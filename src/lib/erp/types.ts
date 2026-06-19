import type { PostgrestError } from '@supabase/postgrest-js';

export type ErpErrorCode =
  | 'not_found'
  | 'rls_denied'
  | 'db_error'
  | 'validation_error';

export interface ErpError {
  code: ErpErrorCode;
  detail: string;
}

export type ErpResult<T> =
  | { data: T; error: null; warning?: string }
  | { data: null; error: ErpError; warning?: undefined };

export function toErpError(error: PostgrestError): ErpError {
  if (
    error.code === '42501' ||
    error.message.includes('row-level security')
  ) {
    return { code: 'rls_denied', detail: error.message };
  }
  return { code: 'db_error', detail: error.message };
}

export function notFound(entity: string, id: string): ErpError {
  return { code: 'not_found', detail: `${entity} ${id} not found` };
}

export function validationError(detail: string): ErpError {
  return { code: 'validation_error', detail };
}
