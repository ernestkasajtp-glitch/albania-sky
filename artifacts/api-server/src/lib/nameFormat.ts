// Normalizim i shkronjave kapitale për emrat e pasagjerëve.
//
// Rregulla (ndryshon VETËM shkronjat kapitale, jo karaktere/hapësira të tjera):
//   - Emri  -> çdo fjalë me shkronjën e parë të madhe, pjesa tjetër e vogël ("Emer", "Emer Emer")
//   - Mbiemri -> të gjitha shkronjat e mëdha ("MBIEMER", "MBIEMER MBIEMER")
//
// Përfundimi:
//   "emer mbiemer"          -> "Emer MBIEMER"
//   "emer emer mbiemer"     -> "Emer Emer MBIEMER" (2 emra)
//   "emer mbiemer mbiemer"  -> "Emer MBIEMER MBIEMER" (2 mbiemra)

function titleCaseSegments(s: string): string {
  // Ndan duke ruajtur ndarësit (hapësirë, vizë, apostrof) që struktura të mos prishet.
  return s.split(/([\s\-'])/).map((part) => {
    if (part === "" || /^[\s\-']$/.test(part)) return part;
    return part.charAt(0).toLocaleUpperCase() + part.slice(1).toLocaleLowerCase();
  }).join("");
}

export function normalizeFirstName(value: string | null | undefined): string {
  if (value == null) return "";
  // Ndryshon VETËM shkronjat kapitale — ruan hapësirat/karakteret e tjera siç janë.
  return titleCaseSegments(value);
}

export function normalizeLastName(value: string | null | undefined): string {
  if (value == null) return "";
  // Ndryshon VETËM shkronjat kapitale — ruan hapësirat/karakteret e tjera siç janë.
  return value.toLocaleUpperCase();
}

// Kthen një kopje të objektit me firstName/lastName të normalizuar (nëse ekzistojnë).
// Lë çdo fushë tjetër të paprekur.
export function normalizePassengerNames<T extends { firstName?: any; lastName?: any }>(p: T): T {
  const out: any = { ...p };
  if ("firstName" in out && out.firstName != null) out.firstName = normalizeFirstName(out.firstName);
  if ("lastName" in out && out.lastName != null) out.lastName = normalizeLastName(out.lastName);
  return out;
}
