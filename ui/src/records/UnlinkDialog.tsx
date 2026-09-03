// Link removal confirmation (FR-027). States that ONLY the link is removed and neither the person
// nor the case is affected.

export type UnlinkDialogProps = {
  onConfirm: () => void;
  onCancel: () => void;
};

export function UnlinkDialog({ onConfirm, onCancel }: UnlinkDialogProps) {
  return (
    <div role="alertdialog" aria-label="Remove this link" aria-modal="true">
      <p>
        This removes only the link between the person and the case. Neither the person nor the case
        is changed or deleted.
      </p>
      <button type="button" onClick={onConfirm}>
        Remove the link
      </button>{' '}
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
