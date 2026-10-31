// Validim moshe sipas datëlindjes, llogaritur në DATËN E FLUTURIMIT:
//  - foshnjë (infant): nën 2 vjeç, dhe pa datë në të ardhmen
//  - fëmijë (child): 2 deri në 11 vjeç
// VETËM në frontend (forma) — API i partnerëve dhe importi CP nuk preken.
export function dobAgeError(
  type: string,
  dob: string | null | undefined,
  departureDate?: string | null,
): string | null {
  if (!dob || (type !== "child" && type !== "infant")) return null;
  const b = new Date(dob + "T00:00:00");
  if (isNaN(b.getTime())) return null;
  if (b.getTime() > Date.now()) return "Datëlindja s'mund të jetë në të ardhmen";
  const refStr = departureDate || new Date().toISOString().slice(0, 10);
  const ref = new Date(refStr + "T00:00:00");
  if (isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age--;
  if (type === "infant" && age >= 2)
    return "Foshnja duhet të jetë nën 2 vjeç në datën e fluturimit";
  if (type === "child" && (age < 2 || age > 11))
    return "Fëmija duhet të jetë 2–11 vjeç në datën e fluturimit";
  return null;
}
