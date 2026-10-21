import { useId, useState } from 'react';
import type { ReactNode } from 'react';

export interface SheetTab {
  id: string;
  label: string;
  content: ReactNode;
}

/** Phone layout: tabs along the bottom; tapping the open tab again folds the sheet away. */
export function BottomSheet({ tabs }: { tabs: SheetTab[] }) {
  const base = useId();
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const [open, setOpen] = useState(true);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <div className="bottom-sheet">
      <div role="tablist" className="sheet-tabs">
        {tabs.map((tab) => {
          const selected = tab.id === current?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              className="btn btn-ghost"
              aria-selected={selected}
              aria-expanded={selected ? open : false}
              aria-controls={`${base}-panel`}
              onClick={() => {
                if (selected) setOpen((o) => !o);
                else {
                  setActive(tab.id);
                  setOpen(true);
                }
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {open && current && (
        <div
          role="tabpanel"
          id={`${base}-panel`}
          aria-labelledby={`${base}-tab-${current.id}`}
          className="sheet-panel"
        >
          {current.content}
        </div>
      )}
    </div>
  );
}
