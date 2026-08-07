import { BrandMark } from './format.jsx';
import { AdminLogin } from './auth.jsx';
import { formatPeriod, isPeriod } from './snapshot.js';

// Page footer — a full-bleed ink band closing the page, with the site's
// oversized lockup anchoring the bottom.
//
// The band is dark in BOTH themes, so it needs its own colour set rather than
// the page tokens: --foot-* in index.html, exactly as the nav band already does
// for the same reason. On the olive page it lands as the third ink surface,
// after the ticker band and the TOTAL HOLDINGS card.
//
// The two dates here are not interchangeable. HOLDINGS are as of NBIM's
// reporting period (31 Dec / 30 Jun); PRICES are as of the day we last fetched
// from Yahoo. See snapshot.js — conflating them is the mistake that file exists
// to prevent, so both are named separately rather than merged into one
// "last updated".
//
// The disclaimer wording is deliberately the same as the static /holdings/
// pages (scripts/build-static.mjs). A visitor who lands on either should read
// the identical caveat.

export function Footer({ positions, period, pricesAsOf }) {
  const holdingsAsOf = isPeriod(period) ? formatPeriod(period, 'long') : null;

  const toTop = () => window.scrollTo({
    top: 0,
    // The reduced-motion rule in index.html only governs CSS-initiated
    // scrolling; a `behavior` passed here would override it.
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });

  return (
    <footer style={{
      background: 'var(--foot-surface)',
      borderTop: '1px solid var(--foot-line)',
      color: 'var(--foot-sub)',
      // AdminLogin styles its link with --accent-text, which in the light theme
      // is olive (#6C8118) — tuned for the cream surface it used to sit on, and
      // under 4.5:1 against this band. Re-pointing the token here fixes it for
      // anything the footer adopts later, without auth.jsx knowing where it is.
      '--accent-text': 'var(--foot-accent)',
    }}>
      <div style={{
        maxWidth: 1680, margin: '0 auto', position: 'relative',
        padding: '0 clamp(20px, 3vw, 44px)',
      }}>
        {/* Wrapper exists to bound the column rules: they trace the four columns
            and the legal text, and stop at the lockup band rather than running
            behind the wordmark. */}
        <div style={{ position: 'relative' }}>
        {/* Column rules. Decorative, and dropped on phones where the columns no
            longer sit on quarters for them to trace. */}
        <div className="r-foot-rules" aria-hidden="true"/>

        <div className="r-foot-cols">
          {/* Statement */}
          <div>
            <p className="display" style={{
              margin: 0, maxWidth: 340,
              fontSize: 'clamp(19px, 1.5vw, 23px)', lineHeight: 1.3,
              letterSpacing: '-0.02em', fontWeight: 500,
              color: 'var(--foot-ink)',
            }}>
              The world&rsquo;s largest sovereign wealth fund, tracked position by position.
            </p>
            <div className="mono" style={{
              marginTop: 20, fontSize: 11, lineHeight: 1.9, color: 'var(--foot-soft)',
            }}>
              {positions.toLocaleString()} positions
              {holdingsAsOf && <><br/>Holdings as of {holdingsAsOf}</>}
              <br/>Prices as of {pricesAsOf}
            </div>
          </div>

          <FooterCol title="Explore">
            <FooterLink href="/holdings/">Browse by sector</FooterLink>
            <FooterLink onClick={toTop}>Back to top</FooterLink>
          </FooterCol>

          <FooterCol title="Data">
            <FooterLink href="https://www.nbim.no/en/responsible-investment/holdings/" external>
              NBIM disclosure
            </FooterLink>
            <FooterLink href="https://finance.yahoo.com" external>Yahoo Finance</FooterLink>
            <FooterLink href="/llms.txt">llms.txt</FooterLink>
          </FooterCol>

          <FooterCol title="About">
            <FooterLink href="https://learnbasecase.com" external>Basecase</FooterLink>
            <FooterLink href="/humans.txt">Colophon</FooterLink>
          </FooterCol>
        </div>

        {/* Provenance and disclaimer */}
        <div style={{
          position: 'relative',
          borderTop: '1px solid var(--foot-line)',
          padding: 'clamp(22px, 2.5vw, 30px) 0',
          fontSize: 12, lineHeight: 1.7, color: 'var(--foot-soft)',
          display: 'grid', gap: 10,
        }}>
          {/* The cap is on the text, not the container: the rule above spans the
              band, but across 1680px these paragraphs would run to ~150
              characters a line — past the point where the eye finds the next. */}
          <p style={legal}>
            Holdings sourced from NBIM&rsquo;s published GPFG equity disclosure, joined
            with market data from Yahoo Finance. USD values are estimated at acquisition
            FX. The dataset is a point-in-time snapshot — not a live feed.
          </p>
          <p style={legal}>
            Sovereign Insights is an independent research tool published by Basecase. It
            is not affiliated with or endorsed by NBIM, Norges Bank, or the Norwegian
            government. Nothing here is investment advice.
          </p>
        </div>
        </div>

        {/* Lockup band — the oversized mark that closes the page. */}
        <div className="r-foot-bar">
          <div className="r-foot-lockup">
            <BrandMark size={56}/>
            <span className="display" style={{
              // 7vw, not 4.6: the lockup is nowrap, and the shallower slope left
              // it 5px off the viewport edge on a 320px screen.
              fontSize: 'clamp(26px, 7vw, 58px)', lineHeight: 0.9,
              letterSpacing: '-0.035em', fontWeight: 600,
              color: 'var(--foot-ink)', whiteSpace: 'nowrap',
            }}>
              Sovereign <span style={{ color: 'var(--foot-accent)' }}>Insights</span>
            </span>
          </div>

          <div className="mono r-foot-meta">
            <span className="r-hide-sm">
              Press <kbd style={kbd}>/</kbd> to search · <kbd style={kbd}>Esc</kbd> to close
              {' · '}
            </span>
            <AdminLogin/>
            <span style={{ display: 'block', marginTop: 8, color: 'var(--foot-soft)' }}>
              © {new Date().getFullYear()} Basecase
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

var legal = { margin: 0, maxWidth: 900 };

// Moved here with the keyboard hints it styles, which were the only thing using it.
var kbd = {
  fontFamily: 'var(--font-mono)',
  padding: '1px 5px',
  border: '1px solid var(--foot-line)',
  borderRadius: 3,
  fontSize: 10,
  color: 'var(--foot-sub)',
};

function FooterCol({ title, children }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 10, color: 'var(--foot-soft)' }}>{title}</div>
      <div style={{ display: 'grid', gap: 14, justifyItems: 'start', marginTop: 26 }}>
        {children}
      </div>
    </div>
  );
}

// One link. Renders as a button when it acts on the page rather than navigating,
// so "Back to top" is reachable by keyboard as the control it actually is.
function FooterLink({ href, children, external, onClick }) {
  const style = {
    padding: 0, border: 'none', background: 'none', textAlign: 'left',
    fontFamily: 'var(--font-display)', fontSize: 15,
    color: 'var(--foot-sub)', textDecoration: 'none', cursor: 'pointer',
  };
  if (!href) return <button className="r-flink" style={style} onClick={onClick}>{children}</button>;
  return (
    <a
      className="r-flink"
      href={href}
      style={style}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}
