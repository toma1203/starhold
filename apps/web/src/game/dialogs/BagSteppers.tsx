import { RESOURCES } from '@starhold/engine';
import type { Resource, ResourceBag } from '@starhold/engine';
import { useT } from '../../i18n/useT.ts';
import { Button } from '../../ui/Button.tsx';
import { ResourceLabel } from '../ResourceLabel.tsx';
import { resourceName } from '../format.ts';

export interface BagSteppersProps {
  value: ResourceBag;
  canMore: (resource: Resource) => boolean;
  onStep: (resource: Resource, delta: 1 | -1) => void;
}

/** One more / fewer stepper per resource, for choosing a bag of cards. */
export function BagSteppers({ value, canMore, onStep }: BagSteppersProps) {
  const t = useT();
  return (
    <div className="steppers">
      {RESOURCES.map((resource) => {
        const name = resourceName(resource, t);
        return (
          <div key={resource} role="group" aria-label={name} className="stepper">
            <ResourceLabel resource={resource} />
            <Button
              aria-label={t('game.less', { resource: name })}
              disabled={value[resource] <= 0}
              onClick={() => onStep(resource, -1)}
            >
              −
            </Button>
            <span className="stepper-value">{value[resource]}</span>
            <Button
              aria-label={t('game.more', { resource: name })}
              disabled={!canMore(resource)}
              onClick={() => onStep(resource, 1)}
            >
              +
            </Button>
          </div>
        );
      })}
    </div>
  );
}
