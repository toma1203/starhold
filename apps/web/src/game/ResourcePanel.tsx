import { RESOURCES } from '@starhold/engine';
import type { ResourceBag } from '@starhold/engine';
import { ResourceLabel } from './ResourceLabel.tsx';

/** The viewer's hand: one icon and count per resource. */
export function ResourcePanel({ hand }: { hand: ResourceBag | null }) {
  if (hand === null) return null;
  return (
    <ul className="resource-panel">
      {RESOURCES.map((resource) => (
        <li key={resource} className="resource-item">
          <ResourceLabel resource={resource} showName={false} />
          <span className="resource-count">{hand[resource]}</span>
        </li>
      ))}
    </ul>
  );
}
