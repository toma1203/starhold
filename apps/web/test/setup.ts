import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

// jsdom has no PointerEvent; this minimal stand-in carries the fields the map's gestures read.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventStandIn extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  window.PointerEvent = PointerEventStandIn as unknown as typeof PointerEvent;
}
