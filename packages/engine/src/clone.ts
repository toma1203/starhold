// The engine targets plain ES2022 typings (no DOM / @types/node), where `structuredClone` is not
// declared, but every supported runtime (Node 22, modern browsers) provides it.
const runtimeClone = (globalThis as unknown as { structuredClone: <T>(value: T) => T })
  .structuredClone;

/** Deep copy of plain data; the engine's copy-on-write primitive. */
export function clone<T>(value: T): T {
  return runtimeClone(value);
}
