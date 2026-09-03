// Value controls, chosen by operand shape (FR-003, FR-004, FR-007). Numeric operands are
// string-backed and never a JS `number` (research R5). Inverted ranges and blank/duplicate list
// entries are refused inline, mirroring the compact constructors in rule/model/value/.

import { useId } from 'react';
import type { ConditionValue } from '../../../api/tree';
import type { FieldCatalogEntry, OperandShape } from '../../catalog';

export type ValueControlProps = {
  shape: OperandShape;
  value: ConditionValue;
  entry: FieldCatalogEntry;
  onChange: (next: ConditionValue) => void;
  describedById?: string | undefined;
};

export function ValueControl(props: ValueControlProps) {
  switch (props.shape) {
    case 'NONE':
      return null;
    case 'NUMBER':
      return <NumberValueInput {...props} />;
    case 'RANGE':
      return <RangeValueInput {...props} />;
    case 'LIST':
      return <ListValueInput {...props} />;
    case 'ENUM_LIST':
      return <EnumListInput {...props} />;
    case 'ENUM':
      return <EnumValueSelect {...props} />;
    default:
      return <StringValueInput {...props} />;
  }
}

function StringValueInput({ value, onChange, describedById }: ValueControlProps) {
  const v = value.type === 'STRING' ? value.value : '';
  return (
    <input
      type="text"
      aria-label="Value"
      value={v}
      aria-describedby={describedById}
      onChange={(e) => onChange({ type: 'STRING', value: e.target.value })}
    />
  );
}

// String-backed: the raw text is kept verbatim, never parsed to a JS number.
function NumberValueInput({ value, onChange, describedById }: ValueControlProps) {
  const v = value.type === 'NUMBER' ? value.value : '';
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label="Number"
      value={v}
      aria-describedby={describedById}
      onChange={(e) => onChange({ type: 'NUMBER', value: e.target.value })}
    />
  );
}

function RangeValueInput({ value, onChange, describedById }: ValueControlProps) {
  const from = value.type === 'RANGE' ? value.from : '';
  const to = value.type === 'RANGE' ? value.to : '';
  const inverted = from !== '' && to !== '' && Number(from) > Number(to);
  const errId = useId();
  return (
    <span>
      <input
        type="text"
        inputMode="decimal"
        aria-label="From"
        value={from}
        aria-invalid={inverted}
        aria-describedby={inverted ? errId : describedById}
        onChange={(e) => onChange({ type: 'RANGE', from: e.target.value, to })}
      />
      {' – '}
      <input
        type="text"
        inputMode="decimal"
        aria-label="To"
        value={to}
        aria-invalid={inverted}
        aria-describedby={inverted ? errId : describedById}
        onChange={(e) => onChange({ type: 'RANGE', from, to: e.target.value })}
      />
      {inverted && (
        <span className="field-error" id={errId}>
          The lower bound {from} is greater than the upper bound {to}.
        </span>
      )}
    </span>
  );
}

function ListValueInput({ value, onChange, describedById }: ValueControlProps) {
  const values = value.type === 'LIST' ? value.values : [];
  const addFromText = (text: string) => {
    const parts = text
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const merged = [...values];
    for (const p of parts) if (!merged.includes(p)) merged.push(p); // deduplicate on entry
    onChange({ type: 'LIST', values: merged });
  };
  return (
    <span>
      <input
        type="text"
        aria-label="Add value(s), comma-separated"
        aria-describedby={describedById}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addFromText(e.currentTarget.value);
            e.currentTarget.value = '';
          }
        }}
        onBlur={(e) => {
          if (e.target.value.trim()) {
            addFromText(e.target.value);
            e.target.value = '';
          }
        }}
      />
      <ul>
        {values.map((item, i) => (
          <li key={`${item}-${i}`}>
            {item}{' '}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              onClick={() => onChange({ type: 'LIST', values: values.filter((_, j) => j !== i) })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </span>
  );
}

function EnumValueSelect({ value, entry, onChange, describedById }: ValueControlProps) {
  const v = value.type === 'STRING' ? value.value : '';
  const options = entry.enumValues ?? [];
  return (
    <select
      aria-label="Value"
      value={v}
      aria-describedby={describedById}
      onChange={(e) => onChange({ type: 'STRING', value: e.target.value })}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// A closed multi-select over enumValues for IN / NOT_IN on an enum field.
function EnumListInput({ value, entry, onChange, describedById }: ValueControlProps) {
  const values = value.type === 'LIST' ? value.values : [];
  const options = entry.enumValues ?? [];
  const toggle = (o: string) =>
    onChange({
      type: 'LIST',
      values: values.includes(o) ? values.filter((x) => x !== o) : [...values, o],
    });
  return (
    <fieldset aria-describedby={describedById}>
      <legend>Values</legend>
      {options.map((o) => (
        <label key={o}>
          <input type="checkbox" checked={values.includes(o)} onChange={() => toggle(o)} /> {o}
        </label>
      ))}
    </fieldset>
  );
}
