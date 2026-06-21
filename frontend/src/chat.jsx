import React from 'react';
import { Icon } from './format.jsx';

// The chatbot backend runs as its own service (see /chatbot folder). The API key
// is held server-side there — it is never entered in, or stored by, the browser.
// In production, point this at your deployed chatbot URL via VITE_CHAT_API.
export var CHAT_API = import.meta.env.VITE_CHAT_API || 'http://127.0.0.1:8001';

var GREETING = {
  role: 'model',
  text: "Hi! I'm your Sovereign Insights assistant. Ask me about companies, sectors, or valuation metrics like P/E and market cap.",
};

export function ChatWidget() {
  var [open, setOpen] = React.useState(false);
  var [available, setAvailable] = React.useState(null); // null = unknown, then bool
  var [remaining, setRemaining] = React.useState(null);
  var [messages, setMessages] = React.useState([GREETING]);
  var [input, setInput] = React.useState('');
  var [busy, setBusy] = React.useState(false);
  var [offline, setOffline] = React.useState(false);
  var scrollRef = React.useRef(null);

  function refreshHealth() {
    fetch(CHAT_API + '/api/chat/health')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        setOffline(false);
        setAvailable(!!d.key_configured);
        setRemaining(d.requests_remaining_today);
      })
      .catch(function () { setOffline(true); });
  }

  // Check backend status the first time the panel opens.
  React.useEffect(function () {
    if (open && available === null) refreshHealth();
  }, [open]);

  // Keep the message list pinned to the latest.
  React.useEffect(function () {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open]);

  function send() {
    var text = input.trim();
    if (!text || busy || !available) return;

    var history = messages
      .filter(function (m) { return m !== GREETING; })
      .slice(-10)
      .map(function (m) { return { role: m.role, text: m.text }; });

    var next = messages.concat([{ role: 'user', text: text }]);
    setMessages(next);
    setInput('');
    setBusy(true);

    fetch(CHAT_API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          setMessages(function (m) { return m.concat([{ role: 'model', text: '⚠️ ' + (res.d.error || 'Something went wrong.') }]); });
          return;
        }
        if (typeof res.d.requests_remaining_today === 'number') setRemaining(res.d.requests_remaining_today);
        setMessages(function (m) { return m.concat([{ role: 'model', text: res.d.reply }]); });
      })
      .catch(function () {
        setMessages(function (m) { return m.concat([{ role: 'model', text: '⚠️ Cannot reach the assistant right now. Please try again later.' }]); });
      })
      .finally(function () { setBusy(false); });
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  var statusText = offline
    ? 'assistant offline'
    : available === false
      ? 'assistant unavailable'
      : available
        ? 'Gemini · ' + (remaining == null ? '' : remaining + ' left today')
        : 'connecting…';

  // ── Launcher button (collapsed) ──────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={function () { setOpen(true); }}
        title="Open assistant"
        style={{
          position: 'fixed', right: 24, bottom: 24, zIndex: 1000,
          width: 54, height: 54, borderRadius: '50%',
          background: 'var(--accent)', color: 'var(--feature-ink, #08080A)',
          border: '1px solid var(--line)', cursor: 'pointer',
          display: 'grid', placeItems: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,.18)',
        }}
      >
        <Icon name="sparkle" size={22} color="#1B1A17" />
      </button>
    );
  }

  // ── Open panel ───────────────────────────────────────────────────────────
  return (
    <div
      className="card"
      style={{
        position: 'fixed', right: 24, bottom: 24, zIndex: 1000,
        width: 'min(380px, calc(100vw - 48px))',
        height: 'min(620px, calc(100vh - 48px))',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 16px 48px rgba(0,0,0,.24)', animation: 'rise .2s ease-out',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '13px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--accent)' }}>
          <Icon name="sparkle" size={16} color="#1B1A17" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink)' }}>Assistant</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--soft)' }}>{statusText}</div>
        </div>
        <IconButton title="Close" onClick={function () { setOpen(false); }}>
          <Icon name="x" size={16} />
        </IconButton>
      </div>

      {/* Unavailable / offline notice */}
      {(offline || available === false) && (
        <div className="mono" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--row-hover)', fontSize: 10.5, color: 'var(--soft)', lineHeight: 1.5 }}>
          {offline
            ? 'Cannot reach the assistant service right now. Please try again later.'
            : "The assistant is temporarily unavailable. Please try again later."}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map(function (m, i) {
          var isUser = m.role === 'user';
          return (
            <div key={i} style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <div style={{
                padding: '9px 12px', borderRadius: 13,
                borderBottomRightRadius: isUser ? 4 : 13,
                borderBottomLeftRadius: isUser ? 13 : 4,
                background: isUser ? 'var(--accent)' : 'var(--row-hover)',
                color: isUser ? '#1B1A17' : 'var(--ink)',
                border: isUser ? 'none' : '1px solid var(--line)',
                fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{m.text}</div>
            </div>
          );
        })}
        {busy && (
          <div style={{ alignSelf: 'flex-start' }}>
            <div className="mono" style={{ padding: '9px 12px', borderRadius: 13, background: 'var(--row-hover)', border: '1px solid var(--line)', color: 'var(--soft)', fontSize: 12 }}>thinking…</div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div style={{ padding: 12, borderTop: '1px solid var(--line)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={function (e) { setInput(e.target.value); }}
          onKeyDown={onKeyDown}
          placeholder={available ? 'Ask something…' : 'Assistant unavailable'}
          rows={1}
          disabled={busy || !available}
          style={{
            flex: 1, resize: 'none', maxHeight: 96, padding: '9px 11px', borderRadius: 11,
            border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)',
            fontFamily: 'var(--font-display)', fontSize: 13, lineHeight: 1.4,
          }}
        />
        <button onClick={send} disabled={busy || !input.trim() || !available} title="Send" style={{
          ...primaryBtn, width: 40, height: 40, padding: 0, display: 'grid', placeItems: 'center',
          opacity: busy || !input.trim() || !available ? 0.5 : 1, cursor: busy || !input.trim() || !available ? 'not-allowed' : 'pointer',
        }}>
          <Icon name="arrow-up" size={17} color="#1B1A17" />
        </button>
      </div>
    </div>
  );
}

var primaryBtn = {
  background: 'var(--accent)', color: '#1B1A17', border: 'none', borderRadius: 10,
  padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', flexShrink: 0,
};

function IconButton({ children, onClick, title }) {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        display: 'grid', placeItems: 'center', cursor: 'pointer',
        background: 'transparent', border: '1px solid var(--line)', color: 'var(--ink)',
      }}
      onMouseEnter={function (e) { e.currentTarget.style.background = 'var(--row-hover)'; }}
      onMouseLeave={function (e) { e.currentTarget.style.background = 'transparent'; }}
    >{children}</button>
  );
}
