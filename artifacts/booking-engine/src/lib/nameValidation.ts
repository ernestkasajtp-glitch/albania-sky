// Passenger / client names use A-Z only; multi-part names may still contain
// spaces, hyphens, apostrophes and dots.
export const NAME_REGEX = /^(?=.*[A-Za-z])[A-Za-z\s'.-]+$/;

export function isLettersOnly(v: string | null | undefined): boolean {
  return NAME_REGEX.test((v ?? "").trim());
}
