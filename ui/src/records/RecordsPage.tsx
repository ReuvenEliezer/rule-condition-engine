// Placeholder shell for the uniform record surface — filled in by User Story 3 (T061–T074).
export type RecordsResource = 'persons' | 'cases' | 'rules' | 'person-cases';

export function RecordsPage({ resource }: { resource: RecordsResource }) {
  return (
    <section>
      <h2>{resource}</h2>
      <p>The uniform record surface for {resource} is delivered in User Story 3.</p>
    </section>
  );
}
