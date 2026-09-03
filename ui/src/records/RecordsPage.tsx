// The uniform record surface (US3). List → open → edit/create → retire, identical across the four
// record types apart from the fields (FR-020).

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { RESOURCE_CONFIGS } from './configs';
import { RecordList } from './RecordList';
import { RecordEditor } from './RecordEditor';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/components/Button';
import { Card } from '../ui/components/Card';

export type RecordsResource = 'persons' | 'cases' | 'rules' | 'person-cases';

export function RecordsPage({ resource }: { resource: RecordsResource }) {
  const config = RESOURCE_CONFIGS[resource];
  const routeParams = useParams<{ id: string }>();
  const [selected, setSelected] = useState<{ id: string | null } | null>(
    routeParams.id ? { id: routeParams.id } : null,
  );

  if (!selected) {
    return (
      <RecordList
        config={config}
        onOpen={(id) => setSelected({ id })}
        onCreate={config.creatable ? () => setSelected({ id: null }) : undefined}
      />
    );
  }

  const singular = resource.replace(/s$/, '').replace(/-/g, ' ');

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => setSelected(null)}>
        <ArrowLeft className="size-4" aria-hidden />
        Back to {config.title.toLowerCase()}
      </Button>
      <PageHeader
        eyebrow={config.title}
        title={selected.id === null ? `New ${singular}` : `Edit ${singular}`}
      />
      <Card className="p-6">
        <RecordEditor
          config={config}
          recordId={selected.id}
          onSaved={(id) => setSelected({ id })}
          onDeleted={() => setSelected(null)}
        />
      </Card>
    </div>
  );
}
