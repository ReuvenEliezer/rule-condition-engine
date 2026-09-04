// Up/down reordering within a group (FR-021, FR-024).
//
// Both controls are always PRESENT and merely disabled at the ends. Removing them instead would
// make the row's control set change as a child moves, so the buttons would shift under the pointer
// and the tab order would change between otherwise identical rows.
//
// Deliberately not drag-and-drop: it is out of scope, it needs a dependency, and it would still
// need exactly this keyboard equivalent to satisfy FR-044.

import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '../../ui/components/Button';

export type MoveControlsProps = {
  /** 1-based position, used only for the accessible names */
  position: number;
  total: number;
  /** what is being moved, e.g. "condition 2" — makes each control's name unambiguous */
  label: string;
  onMove: (delta: -1 | 1) => void;
};

export function MoveControls({ position, total, label, onMove }: MoveControlsProps) {
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Move ${label} up`}
        disabled={position <= 1}
        onClick={() => onMove(-1)}
      >
        <ArrowUp className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Move ${label} down`}
        disabled={position >= total}
        onClick={() => onMove(1)}
      >
        <ArrowDown className="size-4" aria-hidden />
      </Button>
    </span>
  );
}
