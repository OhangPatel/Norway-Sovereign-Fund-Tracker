// The classic design (the site before the Dusk redesign), frozen on the `classic`
// branch and deployed beside this one at /classic/ for a comparison period.
//
// One date retires it in two places: this hides the switch, and
// .github/workflows/deploy-frontend.yml stops building /classic/ on the same day.
// Change both together. After it passes, this file, the switch in topbar.jsx, the
// workflow steps and the `classic` branch can all be deleted.
export const CLASSIC_UNTIL = '2026-12-01';

export const classicOffered = () => new Date().toISOString().slice(0, 10) < CLASSIC_UNTIL;

// Out through the switching screen (public/boot.js), which the browser keeps on
// screen until the classic page paints.
export function goClassic() {
  if (window.__bootLeave) window.__bootLeave('/classic/');
  else window.location.href = '/classic/';
}
