/** Text accepted by pdf-lib's standard WinAnsi fonts, including the euro sign. */
export function reportPdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/→/g, "->").replace(/←/g, "<-")
    .replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF\u20AC]/g, "?");
}