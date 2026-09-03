// Start-up catalog validation (spec dependency #2, field-catalog §4).
//
// Compare the client catalog's logicalName set to GET /api/v1/rules/fields for SET EQUALITY. A
// mismatch is a blocking configuration error that names the offending field and blocks the rule
// builder SPECIFICALLY — browsing, running existing rules and the audit trail stay usable. A
// failed request is a retryable transport failure, distinguished from a mismatch (FR-040).

import { queryableFields } from '../api/rules';
import { isApiFailure } from '../api/client';
import { CATALOG_FIELD_NAMES } from './catalog';

export type CatalogValidation =
  | { status: 'ok' }
  | {
      status: 'mismatch';
      /** published by the server, missing from the client catalog */
      serverOnly: string[];
      /** in the client catalog, no longer published by the server */
      catalogOnly: string[];
      message: string;
    }
  | { status: 'transport'; message: string };

export function compareFieldSets(serverFields: readonly string[]): CatalogValidation {
  const server = new Set(serverFields);
  const catalog = new Set(CATALOG_FIELD_NAMES);

  const serverOnly = [...server].filter((f) => !catalog.has(f)).sort();
  const catalogOnly = [...catalog].filter((f) => !server.has(f)).sort();

  if (serverOnly.length === 0 && catalogOnly.length === 0) return { status: 'ok' };

  const parts: string[] = [];
  if (serverOnly.length) parts.push(`the service publishes ${serverOnly.join(', ')}, which this interface does not recognise`);
  if (catalogOnly.length) parts.push(`this interface expects ${catalogOnly.join(', ')}, which the service no longer publishes`);

  return {
    status: 'mismatch',
    serverOnly,
    catalogOnly,
    message: `The rule builder is unavailable: its field catalog is out of date with the service — ${parts.join('; ')}. Browsing, running existing rules and the audit trail are unaffected.`,
  };
}

export async function validateCatalog(signal?: AbortSignal): Promise<CatalogValidation> {
  try {
    const fields = await queryableFields(signal);
    return compareFieldSets(fields);
  } catch (e) {
    if (isApiFailure(e) && e.failure.kind === 'transport') {
      return { status: 'transport', message: 'Could not reach the service to check the rule field catalog.' };
    }
    return {
      status: 'transport',
      message: 'The rule field catalog check failed unexpectedly.',
    };
  }
}
