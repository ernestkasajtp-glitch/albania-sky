// Passenger / client names use A-Z only; multi-part names may still contain
// spaces, hyphens, apostrophes and dots. Used across booking create/edit forms.
export const NAME_REGEX = /^(?=.*[A-Za-z])[A-Za-z\s'.-]+$/;
export const NAME_ERROR = "Emri duhet të përmbajë vetëm shkronjat A–Z (pa ë/ç ose shkronja të tjera)";

export function isLettersOnly(v: string | null | undefined): boolean {
  return NAME_REGEX.test((v ?? "").trim());
}
