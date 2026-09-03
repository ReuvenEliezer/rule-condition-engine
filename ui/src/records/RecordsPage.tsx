// The uniform record surface (US3). List → open → edit/create → retire, identical across the four
// record types apart from the fields (FR-020).

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { RESOURCE_CONFIGS } from './configs';
import { RecordList } from './RecordList';
import { RecordEditor } from './RecordEditor';

export type RecordsResource = 'persons' | 'cases' | 'rules' | 'person-cases';

export function RecordsPage({ resource }: { resource: RecordsResource }) {
  const config = RESOURCE_CONFIGS[resource];
  const routeParams = useParams<{ id: string }>();
  const [selected, setSelected] = useState<{ id: string | null } | null>(
    routeParams.id ? { id: routeParams.id } : null,
  );

  return (
    <section>
      <h2>{config.title}</h2>
      {selected ? (
        <div>
          <button type="button" onClick={() => setSelected(null)}>
            ← Back to the list
          </button>
          <h3>{selected.id === null ? `New ${resource.replace(/s$/, '')}` : `Edit ${resource.replace(/s$/, '')}`}</h3>
          <RecordEditor
            config={config}
            recordId={selected.id}
            onSaved={(id) => setSelected({ id })}
            onDeleted={() => setSelected(null)}
          />
        </div>
      ) : (
        <RecordList
          config={config}
          onOpen={(id) => setSelected({ id })}
          onCreate={config.creatable ? () => setSelected({ id: null }) : undefined}
        />
      )}
    </section>
  );
}
