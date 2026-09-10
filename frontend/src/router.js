// The app's routes. There are two.
//
//   #/                        the dashboard
//   #/changes/2026-06-30      what changed in that period, against the one before it
//
// Hash-based on purpose. The site is static files on Hostinger with no rewrite rule, so
// a path route like /changes would 404 the moment someone refreshed or pasted it, and
// the real paths under /holdings/* already belong to the static pages. A hash survives
// a reload, lands in the history (Back works), and can be sent to someone — which is
// the whole point of giving the page a URL rather than a panel.

import React from 'react';

const CHANGES = /^#\/changes(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/;

export const DASHBOARD_HASH = '#/';

export function changesHash(period) {
  return period ? `#/changes/${period}` : '#/changes';
}

export function parseRoute(hash) {
  const m = CHANGES.exec(hash || '');
  if (m) return { name: 'changes', period: m[1] || null };
  return { name: 'dashboard' };
}

export function navigate(hash) {
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}

/** The current route, re-read whenever the hash changes. */
export function useRoute() {
  const [route, setRoute] = React.useState(() => parseRoute(window.location.hash));
  React.useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
