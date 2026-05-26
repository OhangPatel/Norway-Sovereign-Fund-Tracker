// Pipeline controls: Fetch Latest Data | Update Metrics & Merge | AI Report (stub)

const PIPELINE_API = 'http://127.0.0.1:8000';

function PipelineControls() {
  const defaultStatus = {
    is_running: false, job_type: null, step: '', progress: 0,
    message: 'Idle', started_at: null, completed_at: null, error: null,
    rate_limit: { metrics_runs_today: 0, max_per_day: 2, can_run: true },
  };

  const [status, setStatus] = React.useState(defaultStatus);
  const [online, setOnline]   = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const prevRunning = React.useRef(false);

  // ── Poll status every 3 s ────────────────────────────────────────────────
  React.useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${PIPELINE_API}/api/pipeline/status`);
        if (!res.ok) return;
        const data = await res.json();
        setStatus(data);
        setOnline(true);
        prevRunning.current = data.is_running;
      } catch {
        setOnline(false);
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  // ── Elapsed counter (runs while job is active) ───────────────────────────
  React.useEffect(() => {
    if (!status.is_running || !status.started_at) return;
    const t0 = new Date(status.started_at).getTime();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status.is_running, status.started_at]);

  const finalElapsed = React.useMemo(() => {
    if (!status.started_at || !status.completed_at) return 0;
    return Math.floor(
      (new Date(status.completed_at).getTime() - new Date(status.started_at).getTime()) / 1000
    );
  }, [status.started_at, status.completed_at]);

  const displayElapsed = status.is_running ? elapsed : finalElapsed;

  // ── Trigger a pipeline job ───────────────────────────────────────────────
  const trigger = async (endpoint) => {
    try {
      const res = await fetch(`${PIPELINE_API}/api/pipeline/${endpoint}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to start pipeline'); return; }
      prevRunning.current = true;
      setElapsed(0);
      setStatus(s => ({
        ...s,
        is_running: true, error: null, progress: 0,
        job_type: endpoint === 'fetch-clean' ? 'fetch_clean' : 'metrics_merge',
        started_at: new Date().toISOString(), completed_at: null,
      }));
    } catch {
      alert('Cannot reach backend at ' + PIPELINE_API + '. Is uvicorn running?');
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const fmtTime = (s) => s >= 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;

  const stepEmoji = (step) => {
    if (!step) return '⚙️';
    if (/launch|browser/i.test(step))      return '🌐';
    if (/navig|cookie/i.test(step))        return '🔗';
    if (/download/i.test(step))            return '📥';
    if (/filter|apply/i.test(step))        return '🔍';
    if (/sav/i.test(step))                 return '💾';
    if (/fetch|batch|yahoo/i.test(step))   return '📡';
    if (/merg|join/i.test(step))           return '🔀';
    if (/done/i.test(step))                return '✅';
    return '⚙️';
  };

  const isRunning = status.is_running;
  const rl        = status.rate_limit;
  const pct       = status.progress;
  const isError   = !!status.error;
  const isDone    = !isRunning && !isError && !!status.completed_at;
  const showBar   = isRunning || isDone || isError;

  const barColor  = isError ? 'var(--neg)' : isDone ? 'var(--pos)' : 'var(--accent)';
  const estLeft   = isRunning && pct > 5 && displayElapsed > 0
    ? Math.max(0, Math.round(((100 - pct) / pct) * displayElapsed))
    : null;

  return (
    <div style={{
      borderBottom: '1px solid var(--hairline)',
      background: 'var(--bg-2)',
    }}>
      <div style={{
        maxWidth: 1680, margin: '0 auto',
        padding: '10px clamp(16px, 3vw, 32px)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>

        {/* ── Button row ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="eyebrow" style={{ flexShrink: 0, fontSize: 10 }}>Data Pipeline</span>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>

            {/* 1 — Fetch & Clean */}
            <PipelineBtn
              disabled={isRunning || !online}
              active={isRunning && status.job_type === 'fetch_clean'}
              onClick={() => trigger('fetch-clean')}
            >
              {isRunning && status.job_type === 'fetch_clean' ? '⏳ Fetching…' : '🌐 Fetch Latest Data'}
            </PipelineBtn>

            {/* 2 — Metrics & Merge */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <PipelineBtn
                disabled={isRunning || !rl.can_run || !online}
                active={isRunning && status.job_type === 'metrics_merge'}
                onClick={() => trigger('metrics-merge')}
              >
                {isRunning && status.job_type === 'metrics_merge' ? '⏳ Updating…' : '📊 Update Metrics & Merge'}
              </PipelineBtn>
              <span className="mono" style={{
                fontSize: 9.5, paddingLeft: 2,
                color: rl.metrics_runs_today >= rl.max_per_day ? 'var(--neg)' : 'var(--muted)',
              }}>
                {rl.metrics_runs_today}/{rl.max_per_day} uses today · resets midnight
              </span>
            </div>

            {/* 3 — AI Report (stub) */}
            <PipelineBtn disabled muted>
              🤖 AI Report &amp; Export
              <span className="mono" style={{
                fontSize: 9, padding: '1px 5px', marginLeft: 4,
                border: '1px solid var(--hairline)', borderRadius: 4,
                color: 'var(--muted-2)',
              }}>soon</span>
            </PipelineBtn>
          </div>

          {/* Right-side status */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {!online && (
              <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
                · backend offline
              </span>
            )}
            {isRunning && (
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                ⏱ {fmtTime(displayElapsed)}
                {estLeft !== null && ` · ~${fmtTime(estLeft)} left`}
              </span>
            )}
            {isDone && displayElapsed > 0 && (
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--pos)' }}>
                ✓ done in {fmtTime(displayElapsed)}
              </span>
            )}
          </div>
        </div>

        {/* ── Progress bar ── */}
        {showBar && (
          <div style={{ animation: 'rise .2s ease-out' }}>

            {/* Step label */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 4, fontSize: 11,
            }}>
              <span style={{ color: isError ? 'var(--neg)' : 'var(--ink-2)' }}>
                {stepEmoji(status.step)}&nbsp;
                {isError ? status.error : (status.step || status.message)}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>
                {pct}%
              </span>
            </div>

            {/* Track */}
            <div style={{
              height: 3, borderRadius: 2,
              background: 'var(--hairline)',
              overflow: 'hidden',
              position: 'relative',
            }}>
              {/* Fill */}
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${pct}%`,
                background: barColor,
                borderRadius: 2,
                transition: 'width .7s ease',
              }}/>
              {/* Shimmer highlight */}
              {isRunning && !isError && (
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${pct * 0.5}%`,
                  width: '20%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent)',
                  animation: 'pipeShimmer 1.6s ease-in-out infinite',
                }}/>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function PipelineBtn({ children, disabled, active, muted, onClick }) {
  const [hover, setHover] = React.useState(false);

  const bg = active
    ? 'color-mix(in oklch, var(--accent) 15%, var(--surface))'
    : hover && !disabled
    ? 'var(--surface-2)'
    : 'var(--surface)';

  const borderColor = active ? 'var(--accent)' : 'var(--hairline)';
  const textColor   = active ? 'var(--accent)'
    : disabled || muted ? 'var(--muted-2)'
    : 'var(--ink-2)';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 11px',
        background: bg,
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-ui)',
        fontSize: 12, fontWeight: 500,
        opacity: disabled && !active ? 0.55 : 1,
        transition: 'all .12s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

window.PipelineControls = PipelineControls;
