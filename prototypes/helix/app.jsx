/* Helix — warm, calm agent-run view. Defines window.App.
 * Reads shared fixtures (window.RUNS / EVENTS / PUSHES) and window.I (icons). */
const { useState } = React;

/* Render a fixture title that is either a plain string or an array of typed
 * segments ({ text } | { path } | { hash } | { faint }). */
function Title({ value }) {
  if (typeof value === 'string') return <>{value}</>;
  if (!Array.isArray(value)) return null;
  return (
    <>
      {value.map((seg, i) => {
        if (seg.path) return <span key={i} className="path">{seg.path}</span>;
        if (seg.hash) return <span key={i} className="hash">{seg.hash}</span>;
        if (seg.faint) return <span key={i} className="faint">{seg.faint}</span>;
        return <React.Fragment key={i}>{seg.text}</React.Fragment>;
      })}
    </>
  );
}

function TopBar({ run }) {
  return (
    <div className="topbar">
      <div className="brand">
        <span className="brand-mark" />
        <span className="brand-name">Helix</span>
      </div>

      <div className="topbar__center">
        <span className="pill pill--opus"><span className="dot" />Opus</span>
        <h1>{run.title}</h1>
        <span className="pill pill--waiting"><span className="dot" />Waiting for you</span>
      </div>

      <div className="topbar__right">
        <button className="icon-btn" title="Search">{I.search}</button>
        <button className="icon-btn" title="Theme">{I.sun}</button>
        <button className="btn btn--primary">{I.plus} New run</button>
        <div className="avatar" title="You">RH</div>
      </div>
    </div>
  );
}

function Sidebar({ runs, activeId, setActiveId }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__title">Your runs</span>
        <span className="sidebar__count">{runs.length}</span>
      </div>

      <div className="sidebar__scroll">
        <button className="new-run">
          <span className="plus-circle">{I.plus}</span>
          <span>Start a new run</span>
        </button>

        {runs.map(r => (
          <div key={r.id}
            className={`run ${r.id === activeId ? 'run--active' : ''} ${r.status === 'done' ? 'run--done' : ''}`}
            onClick={() => setActiveId(r.id)}>
            <div className="run__head">
              <span className={`run__dot rs-${r.status}`} />
              <span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{r.model}</span>
            </div>
            <div className="run__title">{r.title}</div>
            <div className="run__meta">{r.time}</div>
          </div>
        ))}
      </div>

      <div className="sidebar__footer">
        <div className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>RH</div>
        <div>
          <div style={{ color: 'var(--fg-0)', fontWeight: 500, fontSize: 13 }}>Rhea H.</div>
          <div style={{ color: 'var(--fg-3)', fontSize: 11 }}>singularity/core</div>
        </div>
      </div>
    </aside>
  );
}

function Event({ e }) {
  return (
    <div className={`event event--${e.kind}`}>
      <div className="event__time">{e.t}</div>
      <div className="event__dot-wrap"><div className="event__dot" /></div>
      <div className="event__body">
        <div className="event__title">
          <Title value={e.title} />
          {e.diff && (
            <span className="diff-pips">
              {e.diff.add ? <span className="add">+{e.diff.add}</span> : null}
              {e.diff.rem ? <span className="rem">−{e.diff.rem}</span> : null}
            </span>
          )}
        </div>
        {e.desc && <div className="event__desc">{e.desc}</div>}
        {e.thinking && (
          <div className="thinking">
            <span className="thinking-label">Thinking</span>
            {e.thinking}
          </div>
        )}
      </div>
    </div>
  );
}

function Workspace({ run, events }) {
  const [text, setText] = useState('');

  return (
    <main className="workspace">
      <div className="ws__scroll">
        <div className="ws__hero">
          <div className="ws__hero-kicker">
            <div className="breadcrumb">
              <a href="#">singularity</a>
              <span className="sep">/</span>
              <a href="#">runs</a>
              <span className="sep">/</span>
              <span style={{ color: 'var(--fg-0)' }}>#182</span>
            </div>
          </div>
          <h1>{run.title}</h1>
          <div className="ws__hero-meta">
            <span className="pill pill--waiting"><span className="dot" />Waiting for you</span>
            <span className="pill pill--opus"><span className="dot" />Opus</span>
            <span className="sep">·</span>
            <span>Started about an hour ago</span>
            <span className="sep">·</span>
            <span>Two pushes to main</span>
          </div>
        </div>

        <div className="timeline">
          <div className="day-header">
            <span className="day-header__label">Today</span>
            <span className="day-header__line" />
          </div>

          {events.map((e, i) => <Event key={i} e={e} />)}

          <div className="live-cursor">
            <span className="live-cursor__pulse" />
            <div className="live-cursor__text">
              <span style={{ color: 'var(--fg-0)', fontWeight: 500 }}>Resting.</span> Pick an action below or send a note — I'll pick it right up.
            </div>
            <div className="live-cursor__meta">108.3k / 200k tokens</div>
          </div>
        </div>
      </div>

      <div className="ws__actions">
        <button className="chip-action chip-action--primary">
          {I.play} Resume this run
        </button>
        <button className="chip-action">
          {I.branch} Fork into a new branch
        </button>
        <button className="chip-action">
          <span className="dot" style={{ background: 'var(--sky)' }} />
          Hand off to Sonnet
        </button>
        <button className="chip-action">
          {I.pause} Hold until morning
        </button>
        <button className="chip-action" style={{ color: 'var(--rose-ink)' }}>
          {I.close} Drop run
        </button>
      </div>

      <div className="composer">
        <div className="composer__box">
          <textarea
            className="composer__textarea"
            placeholder="Reply, redirect, or just say 'looks great'…"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={1}
          />
          <button className="btn btn--ghost" style={{ padding: 10 }}>{I.attach}</button>
          <button className="btn btn--primary" style={{ padding: '10px 14px' }}>{I.send} Send</button>
        </div>
      </div>
    </main>
  );
}

function Detail({ run, pushes, status, setStatus }) {
  const [note, setNote] = useState('');
  return (
    <aside className="detail">
      <div className="detail__head">
        <span className="detail__head-title">Run details</span>
        <button className="icon-btn">{I.more}</button>
      </div>

      <div className="detail__scroll">
        <div className="section">
          <div className="section__label">What should happen next?</div>
          <div className="status-segments">
            {[
              { id: 'review', label: 'Review' },
              { id: 'hold', label: 'Hold' },
              { id: 'drop', label: 'Drop' },
            ].map(s => (
              <button key={s.id}
                className={`status-seg ${status === s.id ? 'status-seg--active' : ''}`}
                onClick={() => setStatus(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="section__label">A note to the agent</div>
          <div className="note-box">
            <textarea
              placeholder="Tell Helix anything — context, preferences, things to avoid…"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <div className="note-box__foot">
              <button className="mini-btn">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sky)' }} />
                Send to Sonnet
              </button>
              <button className="mini-btn" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderColor: 'transparent' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--violet)' }} />
                Send to Opus
              </button>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section__label">Progress</div>
          <div className="progress">
            <div className="seg seg--ok" />
            <div className="seg seg--ok" />
            <div className="seg seg--ok" />
            <div className="seg seg--err" />
            <div className="seg seg--ok" />
            <div className="seg seg--ok" />
            <div className="seg seg--ok" />
            <div className="seg" />
          </div>
          <div className="progress__labels">
            <span>7 of 8 steps</span>
            <span>~4m left</span>
          </div>
        </div>

        <div className="section">
          <div className="section__label">Pushes to main</div>
          {pushes.map(p => (
            <div key={p.hash} className="push-row">
              <span className="push-row__hash">{p.hash.slice(0, 7)}</span>
              <span className="push-row__msg">{p.msg}</span>
              <span className="push-row__time">{p.time}</span>
            </div>
          ))}
        </div>

        <div className="section">
          <div className="section__label">This attempt</div>
          <div className="attempt">
            <div className="attempt__head">
              <span className="attempt__title">Second try — after the purity fix</span>
              <span className="attempt__time">02:22</span>
            </div>
            <div className="attempt__body">
              <span className="pill pill--waiting"><span className="dot" />Waiting for review</span>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section__label">Context</div>
          <div style={{
            background: 'var(--bg-2)', borderRadius: 12, padding: '14px 16px',
            display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 8, columnGap: 12,
            fontSize: 13
          }}>
            <span style={{ color: 'var(--fg-2)' }}>Tokens</span>
            <span style={{ color: 'var(--fg-0)' }}>108,255 <span style={{ color: 'var(--fg-3)' }}>/ 200,000</span></span>
            <span style={{ color: 'var(--fg-2)' }}>Model</span>
            <span style={{ color: 'var(--fg-0)' }}>Opus · latest</span>
            <span style={{ color: 'var(--fg-2)' }}>Started</span>
            <span style={{ color: 'var(--fg-0)' }}>02:22 · today</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function App() {
  const [activeId, setActiveId] = useState('r-01');
  const [status, setStatus] = useState('review');

  const run = RUNS.find(r => r.id === activeId) || RUNS[0];

  return (
    <div className="app">
      <TopBar run={run} />
      <Sidebar runs={RUNS} activeId={activeId} setActiveId={setActiveId} />
      <Workspace run={run} events={EVENTS} />
      <Detail run={run} pushes={PUSHES} status={status} setStatus={setStatus} />
    </div>
  );
}

window.App = App;
