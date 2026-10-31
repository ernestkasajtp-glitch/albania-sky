import { useEffect, useState, type PointerEvent } from "react";

function hsv(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const h = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: (h * 60 + 360) % 360, s: max ? delta / max : 0, v: max };
}
function hex(h: number, s: number, v: number) {
  const f = (n: number) => { const k = (n + h / 60) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, "0"); };
  return `#${f(5)}${f(3)}${f(1)}`.toUpperCase();
}
const clamp = (n: number) => Math.min(1, Math.max(0, n));
export function BannerColorPicker({ value, label, onChange }: { value: string; label: string; onChange: (hex: string) => void }) {
  const [color, setColor] = useState(() => hsv(value));
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
    setColor(old => hex(old.h, old.s, old.v) === value.toUpperCase() ? old : hsv(value));
  }, [value]);
  const change = (next: typeof color) => { setColor(next); onChange(hex(next.h, next.s, next.v)); };
  const pointer = (e: PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointermove" && !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    change({ ...color, s: clamp((e.clientX - rect.left) / rect.width), v: clamp(1 - (e.clientY - rect.top) / rect.height) });
  };
  const valid = /^#[0-9a-f]{6}$/i.test(text);
  return <div>
    <div className="be-label">{label}</div>
    <div role="slider" tabIndex={0} aria-label={`${label}: ngopja dhe ndriçimi; përdor shigjetat`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(color.s * 100)} aria-valuetext={`Ngopja ${Math.round(color.s * 100)}%, ndriçimi ${Math.round(color.v * 100)}%`} className="be-sv" data-testid="picker-saturation-value"
      style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${color.h} 100% 50%))` }}
      onPointerDown={pointer} onPointerMove={pointer} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onKeyDown={e => {
        const step = e.shiftKey ? .1 : .01;
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        change({ ...color, s: clamp(e.key === "Home" ? 0 : e.key === "End" ? 1 : color.s + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0)), v: clamp(color.v + (e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0)) });
      }}><div className="be-sv-cursor" style={{ left: `${color.s * 100}%`, top: `${(1 - color.v) * 100}%` }} /></div>
    <label className="be-label" htmlFor="banner-hue">Nuanca</label>
    <input id="banner-hue" data-testid="picker-hue" className="be-hue" type="range" min={0} max={359} value={Math.round(color.h)} onChange={e => change({ ...color, h: Number(e.target.value) })} />
    <label className="be-label" htmlFor="banner-hex">HEX · #RRGGBB</label>
    <input id="banner-hex" data-testid="picker-hex" type="text" spellCheck={false} maxLength={7} value={text} aria-invalid={!valid} onChange={e => { const next = e.target.value.toUpperCase(); setText(next); if (/^#[0-9A-F]{6}$/.test(next)) { setColor(hsv(next)); onChange(next); } }} onBlur={() => { if (!valid) setText(value); }} />
    {!valid && <p role="alert" className="be-muted">Përdor 6 shifra HEX, p.sh. #BD3348.</p>}
  </div>;
}
