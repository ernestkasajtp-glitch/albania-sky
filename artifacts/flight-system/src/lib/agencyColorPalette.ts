// Eight color families, each ordered from light to dark (64 unique presets).
const families = [
  { name: "E kuqe", colors: ["#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d"] },
  { name: "Portokalli", colors: ["#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12"] },
  { name: "Qelibar", colors: ["#fde68a", "#fcd34d", "#fbbf24", "#f59e0b", "#d97706", "#b45309", "#92400e", "#78350f"] },
  { name: "Jeshile", colors: ["#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d", "#166534", "#14532d"] },
  { name: "Petrol", colors: ["#a5f3fc", "#67e8f9", "#22d3ee", "#06b6d4", "#0891b2", "#0e7490", "#155e75", "#164e63"] },
  { name: "Blu", colors: ["#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a"] },
  { name: "Vjollcë", colors: ["#e9d5ff", "#d8b4fe", "#c084fc", "#a855f7", "#9333ea", "#7e22ce", "#6b21a8", "#581c87"] },
  { name: "Gri", colors: ["#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b", "#0f172a"] },
];

export const AGENCY_COLOR_PRESETS = families.flatMap(({ name, colors }) =>
  colors.map((color, index) => ({ color, label: `${name} ${index + 1}` })),
);