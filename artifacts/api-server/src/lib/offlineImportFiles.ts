/** These contain baggage details, not flight/booking rows. Keep them on SFTP:
 * skipping a companion file must never destroy recovery data.
 */
export function isOfflineLuggageFile(name: string): boolean {
  return /^luggages_[^/\\]+\.csv$/i.test(name);
}

export function isOfflineLuggageError(error: string): boolean {
  // Import errors start with the original filename, then ":" or " [reference]".
  const fileName = error.split(/:|\s+\[/, 1)[0].trim();
  return isOfflineLuggageFile(fileName);
}
