import { useEffect, useState } from 'react';

function read(query: string, fallback: boolean): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback;
}

/** Whether a media query matches, kept up to date. `fallback` is used where matchMedia is missing. */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const [matches, setMatches] = useState(() => read(query, fallback));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}
