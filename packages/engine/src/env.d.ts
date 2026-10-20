// The engine targets plain ES2022 (no DOM / Node typings) but runs where structuredClone exists
// (Node 22 and every supported browser).
declare function structuredClone<T>(value: T): T;
