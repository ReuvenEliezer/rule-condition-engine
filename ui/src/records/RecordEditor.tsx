// The generic detail/edit form (FR-020, FR-023, FR-024, FR-029, FR-030, SC-005).
//
//   - Submits ONLY the resource's declared writable fields, adding no field of its own — an
//     unrecognised field is a 400, not an ignore.
//   - Every update carries `id` and the `version` read with the record; server-owned fields
//     (authorship, timing, version) render non-editable.
//   - On CONCURRENT_MODIFICATION: every unsaved edit is preserved, the situation is explained, and
//     re-reading the current record is OFFERED, never performed silently.
//   - VALIDATION_FAILED detail is split on "; " and each part bound to its input (contract §5.2).

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { byResource } from '../api/resources';
import { qk } from '../api/queries';
import { ApiFailure } from '../api/client';
import { FailureBanner } from '../ui/FailureBanner';
import { useAnnounce } from '../ui/LiveRegion';
import { Button } from '../ui/components/Button';
import { Input } from '../ui/components/Input';
import { Select } from '../ui/components/Select';
import { cn } from '../lib/cn';
import type { ResourceConfig, WritableField } from './resourceConfig';
import { RetireAction } from './RetireAction';
import { HistoryLink } from '../audit/HistoryLink';

export type RecordEditorProps = {
  config: ResourceConfig;
  /** null ⇒ create mode */
  recordId: string | null;
  onSaved: (id: string) => void;
  onDeleted: () => void;
};

type FormState = Record<string, unknown>;

type QkKey = 'persons' | 'cases' | 'rules' | 'personCases';
const keyFor = (r: ResourceConfig['resource']): QkKey => (r === 'person-cases' ? 'personCases' : r);

/** Safe stringification for values whose static type is `unknown`. */
const str = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  return JSON.stringify(v) ?? '';
};

export function RecordEditor({ config, recordId, onSaved, onDeleted }: RecordEditorProps) {
  const announce = useAnnounce();
  const queryClient = useQueryClient();
  const creating = recordId === null;

  const query = useQuery({
    queryKey: qk[keyFor(config.resource)].detail(recordId ?? 'new'),
    queryFn: ({ signal }) => byResource[config.resource].get(recordId as string, signal),
    enabled: !creating,
  });

  const [form, setForm] = useState<FormState>(config.createDefaults);
  const [dirty, setDirty] = useState(false);
  const [failure, setFailure] = useState<ApiFailure['failure'] | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);

  // Seed the form from the loaded record ONCE — a re-read only happens when the user asks.
  useEffect(() => {
    if (query.data && !dirty) {
      const seeded: FormState = {};
      for (const f of config.writableFields) seeded[f.name] = query.data[f.name];
      setForm(seeded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const version = query.data?.version as number | undefined;

  const localErrors = useMemo(() => validateLocally(config.writableFields, form), [config.writableFields, form]);

  const setField = (name: string, value: unknown) => {
    setDirty(true);
    setForm((f) => ({ ...f, [name]: value }));
  };

  const save = async () => {
    setFailure(null);
    setFieldErrors({});
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      announce('Some fields need attention.', 'assertive');
      return;
    }
    setSaving(true);
    try {
      const body: FormState = {};
      for (const f of config.writableFields) body[f.name] = form[f.name];
      if (!creating) {
        body.id = recordId;
        body.version = version; // the version read with the record (FR-023)
      }
      const { detail } = await byResource[config.resource].save(body);
      setDirty(false);
      setConflict(false);
      announce('Saved.');
      await queryClient.invalidateQueries({ queryKey: qk[keyFor(config.resource)].detail(String(detail.id)) });
      onSaved(String(detail.id));
    } catch (e) {
      if (!(e instanceof ApiFailure)) throw e;
      if (e.failure.kind === 'refusal' && e.failure.code === 'CONCURRENT_MODIFICATION') {
        setConflict(true); // keep every unsaved edit; offer a re-read below
        announce('This record changed underneath you. Your edits are kept.', 'assertive');
      } else if (e.failure.kind === 'refusal' && e.failure.code === 'VALIDATION_FAILED') {
        setFieldErrors(splitValidation(e.failure.message, config.writableFields));
        announce('Some fields were rejected.', 'assertive');
      } else {
        setFailure(e.failure);
        announce('Could not save.', 'assertive');
      }
    } finally {
      setSaving(false);
    }
  };

  const reReadNow = async () => {
    setConflict(false);
    setDirty(false);
    await query.refetch();
    announce('Reloaded the current record. Re-apply your changes.');
  };

  if (!creating && query.isLoading) return <p>Loading…</p>;
  if (!creating && query.isError) {
    const f = query.error instanceof ApiFailure ? query.error.failure : { kind: 'transport' as const, cause: 'x' };
    return <FailureBanner failure={f} onRetry={() => void query.refetch()} />;
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {config.writableFields.map((f) => (
          <FieldInput
            key={f.name}
            field={f}
            value={form[f.name]}
            error={fieldErrors[f.name]}
            onChange={setField}
          />
        ))}
      </div>

      {!creating && query.data && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-400">
          <p className="mb-1 font-medium uppercase tracking-wide text-slate-400">Server-owned — not editable</p>
          <p>Version {str(query.data.version)}</p>
          {'createdBy' in query.data && (
            <p>
              Created by {str(query.data.createdBy)} at {str(query.data.createdAt ?? query.data.openedAt)}
            </p>
          )}
          {'updatedBy' in query.data && (
            <p>
              Updated by {str(query.data.updatedBy)} at {str(query.data.updatedAt)}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : creating ? 'Create' : 'Save changes'}
        </Button>
      </div>

      {conflict && (
        <div
          role="alert"
          className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <p className="mb-2">
            This record changed in the service since you opened it. Your edits are still here and were
            not sent.
          </p>
          <Button size="sm" variant="secondary" onClick={() => void reReadNow()}>
            Reload the current record (discards your edits)
          </Button>
        </div>
      )}

      {failure && <FailureBanner failure={failure} />}

      {!creating && recordId && (
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <RetireAction
            config={config}
            recordId={recordId}
            onRetired={onDeleted}
            currentForm={form}
            onFormChange={setField}
          />
          <HistoryLink recordType={config.resource} recordId={recordId} />
        </div>
      )}
    </form>
  );
}

// ---- field input ----------------------------------------------------------------------------

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: WritableField;
  value: unknown;
  error: string | undefined;
  onChange: (name: string, value: unknown) => void;
}) {
  const errId = `${field.name}-error`;
  const common = {
    id: field.name,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errId : undefined,
  };
  const isCheckbox = field.kind === 'boolean';
  return (
    <div className={cn('min-w-0', isCheckbox && 'sm:col-span-2')}>
      <div className="mb-1.5 flex items-center gap-0.5">
        <label htmlFor={field.name} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {field.label}
        </label>
        {field.required && (
          <span className="text-rose-500" aria-hidden>
            *
          </span>
        )}
      </div>
      {field.kind === 'enum' ? (
        <Select
          {...common}
          className="w-full"
          value={str(value)}
          onChange={(e) => onChange(field.name, e.target.value)}
        >
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : isCheckbox ? (
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            {...common}
            type="checkbox"
            className="size-4 rounded border-slate-300 text-brand-600 focus-visible:ring-brand-500/40 dark:border-slate-600 dark:bg-slate-800"
            checked={Boolean(value)}
            onChange={(e) => onChange(field.name, e.target.checked)}
          />
          {value ? 'Yes' : 'No'}
        </label>
      ) : field.kind === 'number' ? (
        <Input
          {...common}
          type="number"
          value={str(value)}
          onChange={(e) => onChange(field.name, e.target.value === '' ? null : Number(e.target.value))}
        />
      ) : (
        <Input
          {...common}
          type="text"
          value={str(value)}
          onChange={(e) => onChange(field.name, field.nullable && e.target.value === '' ? null : e.target.value)}
        />
      )}
      {error && (
        <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400" id={errId}>
          {error}
        </span>
      )}
    </div>
  );
}

// ---- validation helpers ---------------------------------------------------------------------

export function validateLocally(fields: readonly WritableField[], form: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = form[f.name];
    if (f.required && (v === null || v === undefined || str(v).trim() === '')) {
      out[f.name] = `${f.label} is required.`;
      continue;
    }
    if (f.kind === 'number' && typeof v === 'number') {
      if (f.min !== undefined && v < f.min) out[f.name] = `${f.label} must be at least ${f.min}.`;
      if (f.max !== undefined && v > f.max) out[f.name] = `${f.label} must be at most ${f.max}.`;
    }
    if (f.maxLength !== undefined && typeof v === 'string' && v.length > f.maxLength) {
      out[f.name] = `${f.label} must be ${f.maxLength} characters or fewer.`;
    }
  }
  return out;
}

export function splitValidation(message: string, fields: readonly WritableField[]): Record<string, string> {
  const parts = message.split('; ').map((s) => s.trim()).filter(Boolean);
  const out: Record<string, string> = {};
  for (const part of parts) {
    const field = fields.find((f) => part.toLowerCase().startsWith(f.name.toLowerCase()));
    if (field) out[field.name] = part;
    else out.__form = out.__form ? `${out.__form}; ${part}` : part;
  }
  return out;
}
