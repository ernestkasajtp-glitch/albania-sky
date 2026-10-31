export type GoogleLookupFailure =
  | "not_configured" | "http_error" | "timeout" | "network_error"
  | "invalid_json" | "provider_error" | "invalid_response" | "unknown";

// Never return upstream bodies, headers, URLs, or arbitrary exception messages:
// they may contain credentials. Diagnostic values come only from this allowlist.
export function googleLookupFailure(error: unknown, stage: "fetch" | "json" | "parse"): GoogleLookupFailure {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  if (stage === "fetch") return "network_error";
  if (stage === "json") return "invalid_json";
  if (error instanceof Error && error.message === "Google search returned an application error") return "provider_error";
  return "invalid_response";
}
