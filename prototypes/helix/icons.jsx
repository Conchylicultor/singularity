/* Helix inline SVG icons — exposes window.I (a map of ready-to-render elements). */
const Icon = ({ d, size }) => (
  <svg className="icon" viewBox="0 0 24 24" style={size ? { width: size, height: size } : null}>
    {Array.isArray(d) ? d.map((dd, i) => <path key={i} d={dd} />) : <path d={d} />}
  </svg>
);

window.I = {
  plus:     <Icon d={["M12 5v14", "M5 12h14"]} />,
  close:    <Icon d={["M18 6L6 18", "M6 6l12 12"]} />,
  send:     <Icon d={["M4 12h16", "M14 6l6 6-6 6"]} />,
  sparkle:  <Icon d={["M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"]} />,
  sun:      <Icon d={["M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4", "M12 8a4 4 0 100 8 4 4 0 000-8z"]} />,
  user:     <Icon d={["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2", "M12 11a4 4 0 100-8 4 4 0 000 8z"]} />,
  search:   <Icon d={["M11 4a7 7 0 100 14 7 7 0 000-14z", "M16 16l5 5"]} />,
  external: <Icon d={["M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6", "M15 3h6v6", "M10 14L21 3"]} />,
  file:     <Icon d={["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z", "M14 2v6h6"]} />,
  check:    <Icon d="M20 6L9 17l-5-5" />,
  chevron:  <Icon d="M9 6l6 6-6 6" />,
  more:     <Icon d={["M5 12h.01", "M12 12h.01", "M19 12h.01"]} />,
  pause:    <Icon d={["M6 4h4v16H6z", "M14 4h4v16h-4z"]} />,
  play:     <Icon d="M5 3l14 9-14 9V3z" />,
  branch:   <Icon d={["M6 3v12", "M18 9a9 9 0 01-9 9", "M6 21a2 2 0 100-4 2 2 0 000 4z", "M6 5a2 2 0 100-4 2 2 0 000 4z", "M18 9a2 2 0 100-4 2 2 0 000 4z"]} />,
  attach:   <Icon d="M21 11l-8.5 8.5a5 5 0 11-7-7L14 4a3 3 0 114 4l-8.5 8.5a1 1 0 11-1.4-1.4L15 8" />,
};
