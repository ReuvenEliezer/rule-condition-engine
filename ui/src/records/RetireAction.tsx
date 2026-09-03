// Present the retirement route (FR-025, FR-026, FR-027). A DELETION_NOT_SUPPORTED becomes an
// OFFERED action — close by status, disable by flag — never an error the user must interpret.
// Persons and links are genuinely deleted, behind a confirmation that states both consequences.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { byResource } from '../api/resources';
import { ApiFailure } from '../api/client';
import { useAnnounce } from '../ui/LiveRegion';
import { FailureBanner } from '../ui/FailureBanner';
import type { ResourceConfig } from './resourceConfig';
import { DeletePersonDialog } from './DeletePersonDialog';
import { UnlinkDialog } from './UnlinkDialog';

export type RetireActionProps = {
  config: ResourceConfig;
  recordId: string;
  onRetired: () => void;
  currentForm: Record<string, unknown>;
  onFormChange: (name: string, value: unknown) => void;
};

export function RetireAction({ config, recordId, onRetired, currentForm, onFormChange }: RetireActionProps) {
  const announce = useAnnounce();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [failure, setFailure] = useState<ApiFailure['failure'] | null>(null);

  const genuinelyDeletes = config.retirement.kind === 'delete';

  const doDelete = async () => {
    setFailure(null);
    try {
      await byResource[config.resource].remove(recordId);
      announce('Record retired.');
      await queryClient.invalidateQueries();
      onRetired();
    } catch (e) {
      if (!(e instanceof ApiFailure)) throw e;
      setFailure(e.failure);
    }
  };

  if (config.retirement.kind === 'offered') {
    const { via, explain } = config.retirement;
    return (
      <div>
        <p>{explain}</p>
        {via === 'status' ? (
          <button type="button" onClick={() => onFormChange('status', 'CLOSED')} disabled={currentForm.status === 'CLOSED'}>
            Set status to CLOSED
          </button>
        ) : (
          <button type="button" onClick={() => onFormChange('enabled', false)} disabled={currentForm.enabled === false}>
            Disable this rule
          </button>
        )}
        <p>
          <small>Then save your changes above.</small>
        </p>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setDialog(true)}>
        {config.retirement.confirm === 'person' ? 'Retire this person…' : 'Remove this link…'}
      </button>
      {dialog && genuinelyDeletes && config.retirement.confirm === 'person' && (
        <DeletePersonDialog onConfirm={() => void doDelete()} onCancel={() => setDialog(false)} />
      )}
      {dialog && genuinelyDeletes && config.retirement.confirm === 'link' && (
        <UnlinkDialog onConfirm={() => void doDelete()} onCancel={() => setDialog(false)} />
      )}
      {failure && <FailureBanner failure={failure} />}
    </div>
  );
}
