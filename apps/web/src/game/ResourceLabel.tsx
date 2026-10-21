import type { Resource } from '@starhold/engine';
import { spaceTheme } from '@starhold/theme-space';
import { useT } from '../i18n/useT.ts';

/** A resource's icon in its colour next to its name; the name can be kept for screen readers only. */
export function ResourceLabel({
  resource,
  showName = true,
}: {
  resource: Resource;
  showName?: boolean;
}) {
  const t = useT();
  const { Icon, color, labelKey } = spaceTheme.resources[resource];
  return (
    <span className="resource-label">
      <span className="resource-icon" style={{ color }}>
        <Icon size={20} />
      </span>
      <span className={showName ? undefined : 'sr-only'}>{t(labelKey)}</span>
    </span>
  );
}
