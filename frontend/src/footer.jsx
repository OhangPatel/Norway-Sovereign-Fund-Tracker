import { AdminLogin } from './auth.jsx';
import { formatPeriod, isPeriod, periodLabel } from './snapshot.js';
import { changesHash } from './router.js';

// Page footer: the hero's composition, closing the page. The statement sits on the
// ledger's closing photograph with the snapshot's record beside it in glass, then the
// remaining links, the provenance and disclaimer, and the site's name set as wide as
// the column with the same photograph inside its letters.
//
// On the dashboard it rises onto that photograph (onPhoto, .r-foot.on-band); on the
// What-changed page, which has no closing photograph, it sits on the slate.
//
// It follows the page's own tokens in both themes: the old ink band carried a
// --foot-* set because it stayed dark on the light theme, which this does not.
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

const NBIM = { label: 'NBIM disclosure', href: 'https://www.nbim.no/en/responsible-investment/holdings/', external: true };
const YAHOO = { label: 'Yahoo Finance', href: 'https://finance.yahoo.com', external: true };

export function Footer({ positions, period, pricesAsOf, hasChanges, onPhoto }) {
  const holdingsAsOf = isPeriod(period) ? formatPeriod(period, 'long') : null;

  const toTop = () => window.scrollTo({
    top: 0,
    // The reduced-motion rule in index.html only governs CSS-initiated
    // scrolling; a `behavior` passed here would override it.
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });

  const facts = [
    { label: 'Positions', value: positions.toLocaleString() },
    holdingsAsOf && { label: 'Holdings as of', value: holdingsAsOf },
    { label: 'Prices as of', value: pricesAsOf },
  ].filter(Boolean);

  return (
    <footer className={onPhoto ? 'r-foot on-band' : 'r-foot'}>
      <div className="r-foot-wrap">
        <div className="r-foot-stage">
          <div className={onPhoto ? 'on-photo' : undefined}>
            <p className="r-foot-head">The world&rsquo;s largest sovereign wealth fund, tracked position by position.</p>
            <div className="r-foot-actions">
              {hasChanges && isPeriod(period) && (
                <FooterLink className="r-foot-pill" href={changesHash(period)}>What changed in {periodLabel(period)}</FooterLink>
              )}
              <FooterLink className="r-foot-pill" href="/holdings/">Browse by sector</FooterLink>
              <FooterLink className="r-foot-pill" onClick={toTop}>Back to top</FooterLink>
            </div>
          </div>

          <div className="glass r-foot-record">
            <h2 className="r-foot-title">This snapshot</h2>
            <ul className="r-foot-rows">
              {facts.map(f => (
                <li key={f.label}><span>{f.label}</span><span className="r-foot-val">{f.value}</span></li>
              ))}
              <li><span>Holdings source</span><FooterLink className="r-foot-link" {...NBIM}>{NBIM.label}</FooterLink></li>
              <li><span>Market data</span><FooterLink className="r-foot-link" {...YAHOO}>{YAHOO.label}</FooterLink></li>
            </ul>
          </div>
        </div>

        <div className="r-foot-bar">
          <nav aria-label="Footer" className="r-foot-inline">
            <FooterLink className="r-foot-inline-link" href="https://learnbasecase.com" external>Basecase</FooterLink>
          </nav>
          <span className="r-foot-meta">
            <span>© {new Date().getFullYear()} Basecase</span>
            <AdminLogin/>
          </span>
        </div>

        {/* Provenance and disclaimer. */}
        <div className="r-foot-legal">
          <p>
            Holdings sourced from NBIM&rsquo;s published GPFG equity disclosure, joined
            with market data from Yahoo Finance. USD values are estimated at acquisition
            FX. The dataset is a point-in-time snapshot, not a live feed.
          </p>
          <p>
            Sovereign Insights is an independent research tool published by Basecase. It
            is not affiliated with or endorsed by NBIM, Norges Bank, or the Norwegian
            government. Nothing here is investment advice.
          </p>
          {/* CC BY-SA asks for the credit, the licence and a note of any change,
              wherever the pictures show; the edited versions carry the same licences. */}
          <p data-credits>
            Photographs by Ximonic (Simo Räsänen), Wikimedia Commons, edited (mist added, extended):{' '}
            <a href="https://commons.wikimedia.org/wiki/File:Hus%C3%B8y_during_overcast_sunset_in_Senja,_Troms_og_Finnmark,_Norway,_2022_August.jpg"
              target="_blank" rel="noopener noreferrer">Husøy, Senja</a> (<a href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>) and{' '}
            <a href="https://commons.wikimedia.org/wiki/File:Cirrus_front_over_Austnesfjorden,_Austv%C3%A5g%C3%B8ya,_Lofoten,_Norway,_2015_April.jpg"
              target="_blank" rel="noopener noreferrer">Austnesfjorden, Lofoten</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/"
              target="_blank" rel="noopener noreferrer">CC BY-SA 3.0</a>).
          </p>
        </div>

        {/* The closing wordmark, sized in container units to fill the column at every
            width, the closing photograph inside its letters. Decorative: the name is
            in the top bar, so it is hidden from screen readers. */}
        <div className="r-foot-word" aria-hidden="true">
          <span className="r-foot-word-text">Sovereign Insights</span>
        </div>
      </div>
    </footer>
  );
}

// One link. Renders as a button when it acts on the page rather than navigating,
// so "Back to top" is reachable by keyboard as the control it actually is.
function FooterLink({ href, children, external, onClick, className }) {
  if (!href) return <button type="button" className={className} onClick={onClick}>{children}</button>;
  return (
    <a className={className} href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  );
}
