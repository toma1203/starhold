type Timer = ReturnType<typeof setTimeout>;

/** One absolute deadline backed by one timer; `deadline` is what clients are shown. */
export class DeadlineTimer {
  deadline: number | null = null;
  private timer: Timer | undefined;

  constructor(private readonly now: () => number) {}

  /** Replaces the deadline (null clears it); `onFire` runs when it is reached. */
  set(deadline: number | null, onFire: () => void): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.deadline = deadline;
    if (deadline !== null) this.timer = setTimeout(onFire, Math.max(0, deadline - this.now()));
  }

  clear(): void {
    this.set(null, () => {});
  }

  /** Call first thing in `onFire`: the timer is spent (the deadline stays until replaced). */
  fired(): void {
    this.timer = undefined;
  }
}
