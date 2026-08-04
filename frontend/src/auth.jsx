import React from 'react';
import { createClient } from '@supabase/supabase-js';
import { Icon } from './format.jsx';

// Admin sign-in via Supabase's Google OAuth provider.
//
// SCOPE — read this before trusting it with anything.
// This gates the admin UI in the browser and nothing else. Everything here runs on the
// user's machine with a public anon key, so a determined visitor can flip the session
// check in devtools and reveal the admin controls. That is acceptable ONLY because the
// pipeline endpoints are gated server-side on PIPELINE_ADMIN_TOKEN (backend/app/main.py),
// which the browser never holds. Revealing the buttons does not authorise the calls.
// If the backend ever accepts this session as authorisation, it must verify the JWT
// itself against Supabase and re-check the allow-list server-side. Never trust the email
// below as proof of anything on the server.

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null when the env vars are absent so a build without Supabase configured still works
// (the button renders disabled rather than the whole app throwing at import).
export const supabase = URL && ANON
  ? createClient(URL, ANON, {
      auth: {
        // PKCE returns ?code= in the query string. The implicit flow puts the token in
        // the URL hash, which would collide with in-page anchors and is less safe.
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

// Comma-separated allow-list. An empty list denies everyone: an unset var must not mean
// "anyone with a Google account is an admin".
const ADMINS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email) {
  return !!email && ADMINS.includes(email.toLowerCase());
}

/** Live Supabase session, or null. Also surfaces an OAuth error from the redirect. */
export function useSession() {
  const [session, setSession] = React.useState(null);
  // Auth state only exists in the browser and arrives asynchronously. Until the first
  // event lands we must not decide the user is signed out, or the admin UI flashes away
  // on every reload.
  const [ready, setReady] = React.useState(!supabase);
  // A failed sign-in comes back as query params; without surfacing them the user is
  // bounced home and it looks like nothing happened. Read once during the initial render
  // rather than in an effect — the value is fixed for the life of the page, and setting
  // it from an effect body would trigger a cascading re-render.
  const [error] = React.useState(() => {
    const q = new URLSearchParams(window.location.search);
    return q.get('error_description') || q.get('error') || '';
  });

  React.useEffect(() => {
    // Strip the error params so a reload doesn't resurrect the message. Mutating history
    // is an external-system update, which is what effects are for.
    if (error) {
      const q = new URLSearchParams(window.location.search);
      q.delete('error_description'); q.delete('error'); q.delete('error_code');
      const qs = q.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
    }
    if (!supabase) return;
    // Fires INITIAL_SESSION immediately on subscribe, so no separate getSession() call.
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
    // `error` is set once during the initial render and never changes, so this still
    // runs exactly once; it is listed only to satisfy exhaustive-deps.
  }, [error]);

  return { session, ready, error, isAdmin: isAdminEmail(session?.user?.email) };
}

/** Footer sign-in control. Shows who is signed in, and why access was refused. */
export function AdminLogin() {
  const { session, ready, error, isAdmin } = useSession();
  const [busy, setBusy] = React.useState(false);

  const signIn = async () => {
    if (!supabase) return;
    setBusy(true);
    // Hash-free redirect: Supabase reads the PKCE ?code= from the query string.
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (e) setBusy(false);  // On success the page navigates away, so no reset needed.
  };

  const link = {
    background: 'none', border: 'none', padding: 0,
    font: 'inherit', color: 'var(--accent-text)',
    textDecoration: 'underline', cursor: 'pointer',
  };

  if (!supabase) {
    return <span title="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable">Admin sign-in unavailable</span>;
  }

  if (!ready) return <span>·</span>;

  if (session) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {isAdmin
          ? <Icon name="check" size={11} color="var(--accent-text)" />
          : null}
        <span title={session.user.email}>
          {isAdmin ? 'Admin' : 'Signed in — not an admin'}
        </span>
        <button style={link} onClick={() => supabase.auth.signOut()}>Sign out</button>
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {error && <span style={{ color: 'var(--danger, #d66)' }} title={error}>Sign-in failed</span>}
      <button style={link} onClick={signIn} disabled={busy}>
        {busy ? 'Redirecting…' : 'Admin sign in with Google'}
      </button>
    </span>
  );
}
