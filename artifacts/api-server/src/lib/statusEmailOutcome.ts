export type StatusEmailOutcome = "sent" | "failed" | "skipped";

// Retry only the audit write, never the email delivery. Keep the original
// delivery result even when persistence fails.
export async function persistEmailOutcomeWithRetry(
  persist: () => Promise<void>,
  onFailure: (error: unknown) => void,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await persist();
      return true;
    } catch (error) {
      if (attempt === 2) onFailure(error);
      else await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  return false;
}

export type StatusEmailOutcomeNote = {
  version: 1;
  statusEventId: number;
  recipient: "agent";
  outcome: StatusEmailOutcome;
  reason: string;
  email: string | null;
  status: string;
};

export function statusEmailOutcomeNote(input: Omit<StatusEmailOutcomeNote, "version" | "recipient">): string {
  if (!Number.isInteger(input.statusEventId) || input.statusEventId <= 0) {
    throw new Error("statusEventId must be a positive integer");
  }
  return JSON.stringify({
    version: 1,
    statusEventId: input.statusEventId,
    recipient: "agent",
    outcome: input.outcome,
    reason: input.reason,
    email: input.email,
    status: input.status,
  } satisfies StatusEmailOutcomeNote);
}

export function finalAgentDeliveryOutcome(input: {
  pdfAvailable: boolean;
  deliveryError?: string | null;
}): Pick<StatusEmailOutcomeNote, "outcome" | "reason"> {
  if (input.deliveryError) {
    return {
      outcome: "failed",
      reason: input.pdfAvailable
        ? `Dërgimi i emailit dështoi: ${input.deliveryError}`
        : `Gjenerimi i PDF-së dështoi dhe dërgimi pa PDF dështoi: ${input.deliveryError}`,
    };
  }
  return {
    outcome: "sent",
    reason: input.pdfAvailable
      ? "Emaili iu dërgua agjentit me PDF"
      : "U dërgua pa PDF sepse gjenerimi i PDF-së dështoi",
  };
}