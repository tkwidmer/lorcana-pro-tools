// Stroke glyphs (24×24 grid, path `d` strings) for each tool in the
// siteSections.js catalog, keyed by the tool's `icon` field. Rendered by
// components/ToolIcon.jsx.
export const TOOL_ICONS = {
  printer: ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v7H6z'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  scroll: ['M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4', 'M19 17V5a2 2 0 0 0-2-2H4', 'M10 7h6', 'M10 11h6'],
  'chart-pie': ['M21.2 15.9A10 10 0 1 1 8 2.8', 'M22 12A10 10 0 0 0 12 2v10z'],
  columns: ['M3 4h7v16H3z', 'M14 4h7v16h-7z', 'M5.5 9h2', 'M16.5 9h2', 'M5.5 13h2', 'M16.5 15h2'],
  palm: ['M12 22V11', 'M12 11C9 6 5 6 3 8', 'M12 11c3-5 7-5 9-3', 'M12 11C11 6 8 3 5 3', 'M12 11c1-5 4-8 7-8', 'M8 22h8'],
  history: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l3 2'],
  'chart-bar': ['M3 3v18h18', 'M8 17v-5', 'M13 17V8', 'M18 17v-8'],
  target: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z', 'M12 12h.01'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
  podium: ['M3 21h18', 'M5 21v-7h4v7', 'M10 21V9h4v12', 'M15 21v-9h4v9'],
  calculator: ['M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M8 6h8v4H8z', 'M8 14h.01', 'M12 14h.01', 'M16 14h.01', 'M8 18h.01', 'M12 18h.01', 'M16 18h.01'],
  trophy: ['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0V4z', 'M17 5h3a3 3 0 0 1-3 4', 'M7 5H4a3 3 0 0 0 3 4'],
  gem: ['M6 3h12l4 6-10 12L2 9z', 'M2 9h20', 'M12 21 8 9l4-6 4 6'],
  store: ['M4 9h16l-1-5H5z', 'M5 9v11h14V9', 'M10 20v-6h4v6'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z'],
  library: ['M4 4h4v16H4z', 'M10 4h4v16h-4z', 'M16 5l3.9-1 3.1 15-3.9 1z'],
  video: ['M3 6h12v12H3z', 'M15 10l6-4v12l-6-4'],
  chat: ['M21 12a8 8 0 0 1-11.8 7L3 21l2-5.5A8 8 0 1 1 21 12z'],
}
