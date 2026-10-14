import type { ErrClass } from "./types.js";

const CLASS_BY_ERROR_NAME: Record<string, ErrClass> = {
  AbortError: "timeout",
  TimeoutError: "timeout",
  ThrottlingException: "throttled",
  TooManyRequestsException: "throttled",
  AccessDeniedException: "auth",
  UnrecognizedClientException: "auth",
  ExpiredTokenException: "auth",
  CredentialsProviderError: "auth",
};

const NETWORK_CODE = /^(?:E[A-Z]+|UND_ERR_\w+)$/;

export function classifyError(error: unknown): ErrClass {
  if (!(error instanceof Error)) return "other";
  const byName = CLASS_BY_ERROR_NAME[error.name];
  if (byName !== undefined) return byName;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  return NETWORK_CODE.test(code) ? "network" : "other";
}
