/* Far-left rail + conversation sidebar. Exposes Rail, Sidebar, Conv, Dots. */

const RAIL_ICONS = [
  { name: "messages-square", active: true },
  { name: "bug" },
  { name: "cloud" },
  { name: "folder" },
  { name: "house" },
  { name: "file-text" },
  { name: "book-open" },
  { name: "puzzle" },
];

const NAV = [
  { name: "Agents", icon: "bot" },
  { name: "Accounts", icon: "key-round" },
  { name: "Explorer", icon: "compass" },
  { name: "Config", icon: "sliders-horizontal" },
];

const QUEUE = [
  { id: "q1", title: "Fix app UI structure and styling", icon: "factory", av: "var(--green)", dots: [1,0,0,0,0], time: "11m ago" },
  { id: "q2", title: "Add icon selector primitive co…", icon: "shapes", av: "var(--muted)", dim: true, dots: [], time: "11m ago", q: true },
  { id: "q3", title: "Design prompt-form step type …", icon: "star", av: "var(--amber)", dots: [1,0,0,0], time: "7d ago" },
  { id: "q4", title: "Rebase branch to head", icon: "circle-help", av: "var(--blue)", dots: [1,1,1,0], time: "6d ago", badge: 2 },
  { id: "q5", title: "Evaluate sync API design with …", icon: "factory", av: "var(--green)", dots: [1,1,1,1], time: "44d ago" },
  { id: "q6", title: "Investigate app performance b…", icon: "factory", av: "var(--green)", dots: [1,1,0,0], time: "2d ago" },
];

const WORKING = [
  { id: "w1", title: "Add alias/synonym search…", icon: "search", av: "var(--muted)", dim: true, dots: [], time: "10m ago", q: true },
  { id: "w2", title: "Remove colors from avata…", icon: "star", av: "var(--amber)", dots: [1,1,1,0], time: "11m ago", glass: true, active: true },
  { id: "w3", title: "Fix nested button footgun i…", icon: "sparkles", av: "var(--violet)", dots: [1,1,1,0], time: "3h ago", up: true },
  { id: "w4", title: "Hardcode reorderable con…", icon: "star", av: "var(--amber)", dots: [1,1,0,0], time: "58m ago" },
  { id: "w5", title: "Remove legacy raw-fetch …", icon: "factory", av: "var(--green)", dots: [1,1,1,0], time: "14h ago", glass: true },
];

function Dots({ dots, q }) {
  if (q) return <span className="dots"><i className="q" /></span>;
  if (!dots || !dots.length) return null;
  return (
    <span className="dots">
      {dots.map((d, i) => <i key={i} className={d ? "on" : ""} />)}
    </span>
  );
}

function Conv({ c, active, onClick }) {
  return (
    <div className={"conv" + (c.dim ? " dim" : "") + (active ? " active" : "")} onClick={onClick}>
      <div className="avatar" style={{ "--av": c.av }}><Ic name={c.icon} /></div>
      <div className="conv-body">
        <div className="conv-title">{c.title}</div>
        <div className="conv-meta">
          <Dots dots={c.dots} q={c.q} />
          {c.glass && <span className="hourglass"><Ic name="hourglass" /></span>}
          {c.up && <span style={{ color: "var(--muted)", fontSize: 13 }}><Ic name="upload" /></span>}
          <span className="conv-time">{c.time}</span>
        </div>
      </div>
      {c.badge && <span className="pill-badge">{c.badge}</span>}
    </div>
  );
}

function Rail() {
  return (
    <div className="rail">
      <div className="mark"><Ic name="orbit" /></div>
      {RAIL_ICONS.map((r, i) => (
        <div key={i} className={"rail-btn" + (r.active ? " active" : "")}><Ic name={r.name} /></div>
      ))}
      <div className="spacer" />
      <div className="rail-btn"><Ic name="git-branch" /></div>
    </div>
  );
}

function Sidebar({ selected, onSelect, tab, onTab }) {
  const [navActive, setNavActive] = React.useState(null);
  const [qOpen, setQOpen] = React.useState(true);
  const [wOpen, setWOpen] = React.useState(true);

  return (
    <div className="sidebar">
      <div className="brand">
        <div className="logo"><Ic name="orbit" /></div>
        <div className="name">Singularity</div>
      </div>

      <div className="nav">
        {NAV.map((n) => (
          <div key={n.name}
               className={"nav-item" + (navActive === n.name ? " active" : "")}
               onClick={() => setNavActive(n.name)}>
            <span className="ic"><Ic name={n.icon} /></span>{n.name}
          </div>
        ))}
      </div>

      <div className="sb-divider" />

      <div className="section-head">
        <span className="ic"><Ic name="messages-square" /></span>
        Conversations
        <span className="chev"><Ic name="chevron-down" /></span>
      </div>

      <div className="model-row">
        <div className="model-pick"><span className="dot" />Opus 4.8<span className="chev"><Ic name="chevron-down" /></span></div>
        <div className="run-btn"><Ic name="play" /></div>
      </div>

      <div className="tabs">
        {[["Queue","list-ordered"],["Grouped","boxes"],["History","history"]].map(([t,ic]) => (
          <div key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => onTab(t)}>
            <span className="ic"><Ic name={ic} /></span>{t}
          </div>
        ))}
      </div>

      <div className="conv-scroll">
        <div className="group">
          <div className={"group-head" + (qOpen ? "" : " collapsed")} onClick={() => setQOpen(!qOpen)}>
            <span className="chev"><Ic name="chevron-down" /></span>Queue
            <span className="count">{QUEUE.length}</span>
          </div>
          {qOpen && QUEUE.map((c) => (
            <Conv key={c.id} c={c} active={selected === c.id} onClick={() => onSelect(c.id)} />
          ))}
        </div>

        <div className="group">
          <div className={"group-head" + (wOpen ? "" : " collapsed")} onClick={() => setWOpen(!wOpen)}>
            <span className="chev"><Ic name="chevron-down" /></span>Working
            <span className="count">{WORKING.length}</span>
          </div>
          {wOpen && WORKING.map((c) => (
            <Conv key={c.id} c={c} active={selected === c.id} onClick={() => onSelect(c.id)} />
          ))}
        </div>
      </div>

      <div className="sb-foot">
        <div className="nav-item"><span className="ic"><Ic name="sparkles" /></span>Stats</div>
        <div className="nav-item"><span className="ic"><Ic name="square-check-big" /></span>Tasks</div>
      </div>
    </div>
  );
}

Object.assign(window, { Rail, Sidebar, Conv, Dots, QUEUE, WORKING });
