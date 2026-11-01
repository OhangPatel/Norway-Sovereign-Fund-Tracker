import { Icon, btn } from './format.jsx';

// This build is the classic design, served at /classic/ beside the new one for a
// comparison period (see the new site's src/classic.js). The way back: the new site
// shows its switching screen on arrival when the URL carries ?from=classic.
export function ClassicSwitch() {
  return (
    <a href="/?from=classic" style={{
      ...btn({ variant: 'primary', shape: 'pill', tone: 'text' }),
      position: 'fixed', left: 24, bottom: 24, zIndex: 1000,
      boxShadow: 'var(--shadow-menu)', textDecoration: 'none',
    }}>
      Switch to the new design
      <Icon name="arrow-right" size={14}/>
    </a>
  );
}
