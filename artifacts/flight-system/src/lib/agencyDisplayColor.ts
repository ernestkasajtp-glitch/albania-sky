import type { CSSProperties } from "react";

export function agencyColorStyle(color: unknown): CSSProperties | undefined {
  // Colors are optional and never affect reports, stored booking values or PDFs.
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
    ? { color, backgroundImage: "none" }
    : undefined;
}

export function agencyColorMap(agents: readonly { id: number; displayColor?: string | null }[]) {
  return new Map(agents.map(agent => [agent.id, agencyColorStyle(agent.displayColor)]));
}