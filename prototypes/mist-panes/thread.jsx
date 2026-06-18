/* Main column: top bar, sub-header, toolbar, conversation thread, composer.
   Exposes TopBar, SubHeader, Toolbar, Thread, Composer, Split. */

function TopBar() {
  return (
    <div className="topbar">
      <div className="icon-btn"><Ic name="panel-left" /></div>
      <div className="crumb"><span className="dot" />singularity</div>
      <div className="seg-pill"><span className="dot" />Build</div>
      <div className="grow" />
      <div className="icon-btn"><Ic name="bell" /></div>
      <div className="icon-btn"><Ic name="pen-line" /></div>
      <div className="icon-btn"><Ic name="camera" /></div>
      <div className="icon-btn"><Ic name="sun" /></div>
      <div className="icon-btn"><Ic name="pencil" /></div>
      <button className="improve"><Ic name="sparkles" />Improve</button>
    </div>
  );
}

function SubHeader({ title }) {
  return (
    <div className="subhead">
      <h1>{title}</h1>
      <span className="tag">Feature (small)</span>
      <div className="stepper">
        <i className="done" /><span className="bar done" />
        <i className="done" /><span className="bar done" />
        <i className="now" /><span className="bar" />
        <i /><span className="stepper-label">Implementation</span>
      </div>
      <div className="grow" />
      <span className="chip">Opus 4.8</span>
      <span className="chip live">Working</span>
    </div>
  );
}

function Toolbar() {
  return (
    <div className="toolbar">
      <div className="tool"><span className="ic"><Ic name="layout-panel-left" /></span>1</div>
      <div className="tool"><span className="ic"><Ic name="folder" /></span></div>
      <div className="tool"><span className="ic"><Ic name="message-square" /></span>0</div>
      <div className="tool"><span className="ic"><Ic name="git-branch" /></span><Ic name="arrow-up" />0</div>
      <div className="tool"><span className="ic"><Ic name="git-commit-horizontal" /></span>43</div>
      <div className="sep" />
      <div className="tool"><span className="ic"><Ic name="rocket" /></span></div>
      <div className="tool"><span className="ic"><Ic name="activity" /></span></div>
      <div className="tool"><span className="ic"><Ic name="list-checks" /></span><span className="b" /></div>
      <div className="tool"><span className="ic"><Ic name="square-terminal" /></span></div>
      <div className="tool"><span className="ic"><Ic name="code-xml" /></span></div>
      <div className="sep" />
      <div className="tool"><span className="ic"><Ic name="file-diff" /></span>3
        <span className="diff"><span className="add">+6</span> <span className="del">−8</span></span>
      </div>
      <div className="tool plugins"><span className="ic"><Ic name="plug" /></span>3 plugins</div>
    </div>
  );
}

function Thread({ messages }) {
  const [reminderOpen, setReminderOpen] = React.useState(false);
  return (
    <div className="thread" data-thread>
      <div className="thread-inner">
        <div className="msg-user">Remove the colors in the avatar icons displayed in the conversation list</div>

        <div className="msg-block">
          <div className="bullet">
            <span className="dot"><Ic name="dot" size={16} /></span>
            <div>
              <code className="path">plugins/agents/web/components/agent-avatar-row.tsx</code>{" "}
              — pass <code className="kw">colorless</code>; dropped <code className="tok">color</code> / <code className="tok">fallbackKey</code>.
            </div>
          </div>
          <p>
            Both <code>Item.Avatar</code> contributors (non-agent category avatars and agent avatars) now render colorless,
            covering every surface that lists conversations. The change is scoped to these contributors, so other avatar
            usages (agent detail, category toolbar pills) keep their colors. Deployed to{" "}
            <a href="#">att-1781010506-shuc.localhost:9000</a>.
          </p>
        </div>

        <div className="msg-block wrap-note">
          <p style={{ color: "var(--text)", fontWeight: 600 }}>Please wrap up this conversation:</p>
          <ol>
            <li>Push this branch to main using the CLI.</li>
            <li>Then call exactly one MCP tool to signal the outcome:
              <ul style={{ margin: "6px 0", paddingLeft: 18, listStyle: "none" }}>
                <li>— <code className="kw">exit_clean</code> — everything went smoothly, nothing I need to know. The conversation will close automatically.</li>
                <li>— <code className="kw">flag_raise(&#123; reason &#125;)</code> — something needs my attention (caveats, partial outcomes, follow-ups, skipped work, or the push didn't land). Use <code>reason</code> for short bullets.</li>
              </ul>
            </li>
            <li>Write your final wrap-up message, including summary, issues encountered, existing caveats, follow-ups.</li>
          </ol>
        </div>

        <div className="collapsible" onClick={() => setReminderOpen(!reminderOpen)}>
          <span className="chev" style={{ transform: reminderOpen ? "rotate(90deg)" : "none" }}><Ic name="chevron-right" /></span>
          Task Reminder (no tasks)
        </div>

        <div className="msg-assistant">I'll commit and push the branch to main using the CLI.</div>

        <div className="tool-card">
          <span className="badge">Bash</span>
          <span className="label">Commit and push branch to main</span>
          <span className="more"><Ic name="ellipsis" /></span>
        </div>

        {messages.map((m, i) => (
          <div key={i} className="msg-user sent">{m}</div>
        ))}

        <div className="working">
          <span className="pulse"><i /><i /><i /></span>
          Working for 33s
        </div>

        <div className="ctx-meta"><b>76k</b> ctx · <b>11k</b> out</div>

        <div className="alert">
          <span className="ic"><Ic name="hourglass" /></span>
          Push queued — waiting for lock
          <span className="grow" />
          <span className="more">+2 others 0:28 <Ic name="chevron-down" size={13} /></span>
        </div>
      </div>
    </div>
  );
}

function Composer({ onSend }) {
  const [val, setVal] = React.useState("");
  const ref = React.useRef(null);
  const send = () => { const v = val.trim(); if (!v) return; onSend(v); setVal(""); if (ref.current) ref.current.style.height = "24px"; };
  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  const grow = (e) => { setVal(e.target.value); e.target.style.height = "24px"; e.target.style.height = e.target.scrollHeight + "px"; };

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="input-box">
          <textarea ref={ref} rows={1} value={val} onChange={grow} onKeyDown={onKey}
            placeholder="Send a message — Enter to send, Shift+Enter for newline" />
          <div className="compose-actions">
            <div className="foot-mini"><Ic name="share" /></div>
            <Split label="Question only" icon="message-circle-question" />
            <Split label="Sonnet" icon="pen-line" />
            <Split label="Go" icon="pen-line" />
            <Split label="Rebase" icon="pen-line" />
            <div className="foot-mini"><Ic name="pencil" /></div>
            <div className="grow" />
            <button className="stop-btn" onClick={send}><Ic name="square" />Stop</button>
            <div className="mic-btn"><Ic name="mic" /></div>
          </div>
        </div>
        <div className="compose-foot">
          <span className="foot-pill"><Ic name="git-branch" />Branch</span>
          <span className="foot-mini"><Ic name="arrow-left" /></span>
          <span className="foot-mini"><Ic name="link" /></span>
          <span className="foot-mini"><Ic name="arrow-right" /></span>
          <span className="foot-mini"><Ic name="arrow-up-down" /></span>
          <span className="foot-pill"><span style={{ width: 7, height: 7, borderRadius: 9, background: "var(--accent)" }} />Opus 4.8 <Ic name="chevron-down" size={13} /></span>
          <span className="foot-mini" style={{ color: "var(--accent)" }}><Ic name="play" /></span>
          <span className="foot-mini"><Ic name="sticky-note" /></span>
        </div>
      </div>
    </div>
  );
}

function Split({ label, icon }) {
  return (
    <div className="split">
      <div className="main-b"><Ic name={icon} />{label}</div>
      <div className="arr"><Ic name="chevron-right" size={13} /></div>
    </div>
  );
}

Object.assign(window, { TopBar, SubHeader, Toolbar, Thread, Composer, Split });
