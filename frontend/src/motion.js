import { useEffect, useState } from 'react';

// True once the element has been on screen, and true from the start where there is
// no IntersectionObserver. A chart section carries it as data-seen, and index.html
// grows its bars from zero the first time it is seen, never again.
//
// Returns [ref, seen]. The ref is a callback ref, so the observer attaches whenever
// the element appears, including sections that only render once their data loads.
export function useSeen() {
  const [el, setEl] = useState(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen || !el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [el, seen]);
  return [setEl, seen];
}
