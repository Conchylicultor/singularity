/* Mist panes — flush / floating / soft-tray surface explorations of one
   conversation layout. Defines window.App.

   The classic arrangement (Rail · Sidebar · Main) stays put; only the
   surface/shape of the panes changes between the three "pane" looks.
   A small in-canvas switcher (bottom-right) lets you flip between them —
   the host app owns Focus/Compare/scaling, so there is no harness chrome here. */

const PANES = [
  { id: "flush", name: "Flush",     blurb: "Edge-to-edge · hairlines" },
  { id: "float", name: "Floating",  blurb: "Rounded cards · shadow" },
  { id: "soft",  name: "Soft tray", blurb: "Raised rounded trays" },
];

/* tiny diagram of each pane design for the switcher */
function PaneMini({ id }) {
  if (id === "float") return (
    <span className="pm pm-float"><span className="a" /><span className="b" /></span>
  );
  if (id === "soft") return (
    <span className="pm pm-soft">
      <span className="a"><i /><i /></span>
      <span className="b"><i /><i /></span>
    </span>
  );
  return <span className="pm pm-flush"><span className="a" /><span className="b" /></span>;
}

function PaneSwitch({ pane, onPick }) {
  return (
    <div className="pane-switch">
      {PANES.map((p) => (
        <button key={p.id}
          className={"ps-btn" + (pane === p.id ? " active" : "")}
          onClick={() => onPick(p.id)}
          title={p.blurb}>
          <PaneMini id={p.id} />{p.name}
        </button>
      ))}
    </div>
  );
}

function App() {
  const [pane, setPane] = React.useState("flush");
  const [selected, setSelected] = React.useState("w2");
  const [tab, setTab] = React.useState("Queue");
  const [messages, setMessages] = React.useState([]);

  // Re-swap lucide placeholders after every render (state changes add new ones).
  React.useEffect(() => {
    if (window.lucide) window.lucide.createIcons();
  });

  return (
    <div className={"app theme-mist pane-" + pane}>
      <Rail />
      <Sidebar selected={selected} onSelect={setSelected} tab={tab} onTab={setTab} />
      <div className="main">
        <TopBar />
        <SubHeader title="Remove colors from avatar icons in conversation list" />
        <Toolbar />
        <Thread messages={messages} />
        <Composer onSend={(m) => setMessages((xs) => [...xs, m])} />
      </div>
      <PaneSwitch pane={pane} onPick={setPane} />
    </div>
  );
}

window.App = App;
