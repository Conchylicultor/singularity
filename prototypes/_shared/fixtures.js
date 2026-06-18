/* Shared fake data for prototypes — exposes window.RUNS / EVENTS / PUSHES.
 *
 * Loaded as a PLAIN <script> (no Babel), so this file must be pure JS — no JSX.
 * Rich event titles are encoded as arrays of typed segments
 *   { text } | { path } | { hash } | { faint }
 * which a prototype renders into spans however it likes (see helix/app.jsx).
 */

window.RUNS = [
  { id: 'r-01', title: 'Add JSONL viewer plugin to the conversation toolbar', status: 'waiting', model: 'opus', active: true, time: 'about an hour ago' },
  { id: 'r-02', title: 'Break down global event streams by conversation', status: 'running', model: 'sonnet', time: '2 hours ago' },
  { id: 'r-03', title: 'Design an event-driven API with layered replay', status: 'done', model: 'opus', time: 'yesterday' },
  { id: 'r-04', title: 'Update URL when a conversation opens in a new tab', status: 'done', model: 'sonnet', time: 'yesterday' },
  { id: 'r-05', title: 'Add a resume button after idle timeout', status: 'failed', model: 'sonnet', time: '2 days ago' },
  { id: 'r-06', title: 'Warm-cache build for the plugin server', status: 'done', model: 'opus', time: '3 days ago' },
];

window.EVENTS = [
  { t: '11:02', kind: 'reason', title: 'Planning the approach',
    thinking: "The cross-plugin import is the only thing blocking the purity check. I'll move the shared types into a protocol module and route everything through the plugin server. Clean boundary, same behaviour." },

  { t: '11:03', kind: 'create',
    title: [{ text: 'Created nine files under ' }, { path: 'plugins/jsonl-viewer' }],
    desc: 'Server entry, event parser, three web components, viewer views, research notes.',
    diff: { add: 476, rem: 0 } },

  { t: '11:04', kind: 'push',
    title: [{ text: 'Pushed ' }, { hash: 'f1a8888' }, { text: ' — Add JSONL viewer plugin' }],
    desc: 'Nine files · +476 −0 · sent to main' },

  { t: '11:04', kind: 'fail', title: 'One check failed — boundary purity',
    desc: 'Cross-plugin import bypassed the conversations server. Expected.' },

  { t: '11:06', kind: 'reason', title: 'Fixing the boundary',
    thinking: "Route findTranscriptPath through @plugins/conversations and re-export the shared protocol. Two small edits, nothing surprising." },

  { t: '11:06', kind: 'push',
    title: [{ text: 'Pushed ' }, { hash: '3b6c030' }, { text: ' — Fix boundary violation' }],
    desc: 'Two files · +9 −3 · sent to main' },

  { t: '11:07', kind: 'check', title: 'All checks passed',
    desc: 'Purity, typecheck, and 482 unit tests — clean.' },

  { t: '11:08', kind: 'done', title: 'Waiting on your review',
    desc: 'Nothing else queued. I’ve been resting for a minute or two.' },
];

window.PUSHES = [
  { hash: '3b6c030', msg: 'Fix boundary violation in jsonl-viewer', time: 'Today · 11:06' },
  { hash: 'f1a8888', msg: 'Add JSONL viewer plugin', time: 'Today · 11:04' },
];
