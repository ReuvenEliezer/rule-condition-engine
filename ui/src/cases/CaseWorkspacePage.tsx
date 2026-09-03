import { useParams } from 'react-router-dom';
import { CaseWorkspace } from './CaseWorkspace';

export function CaseWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <p>No case selected.</p>;
  return <CaseWorkspace caseId={id} />;
}
