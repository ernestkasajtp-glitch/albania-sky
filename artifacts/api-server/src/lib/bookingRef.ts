const DEFAULT_BOOKING_REF_RETRY_LIMIT = 25;

export function createBookingRef(): string {
  const digits = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join("");
  return `KTF${digits}`;
}

export function isBookingRefConflict(error: unknown): boolean {
  const cause = (error as any)?.cause ?? error;
  return cause?.code === "23505" && cause?.constraint === "bookings_booking_ref_unique";
}

export async function insertWithUniqueBookingRef<T>(
  insert: (bookingRef: string) => Promise<T>,
  createRef: () => string = createBookingRef,
  retryLimit = DEFAULT_BOOKING_REF_RETRY_LIMIT,
): Promise<T | undefined> {
  for (let attempt = 0; attempt < retryLimit; attempt++) {
    const bookingRef = createRef();
    try {
      return await insert(bookingRef);
    } catch (error) {
      if (!isBookingRefConflict(error)) throw error;
    }
  }
  return undefined;
}