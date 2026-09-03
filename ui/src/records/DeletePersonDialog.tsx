// Person deletion confirmation (FR-026, spec dependency #4). States BOTH consequences: the person
// is retired rather than erased, and their case links are removed with them.

export type DeletePersonDialogProps = {
  onConfirm: () => void;
  onCancel: () => void;
};

export function DeletePersonDialog({ onConfirm, onCancel }: DeletePersonDialogProps) {
  return (
    <div role="alertdialog" aria-label="Retire this person" aria-modal="true">
      <p>Retiring this person does two things, in one step:</p>
      <ul>
        <li>The person is retired, not erased — they disappear from every listing and rule match.</li>
        <li>Every link between this person and a case is removed.</li>
      </ul>
      <button type="button" onClick={onConfirm}>
        Retire the person and remove their links
      </button>{' '}
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
