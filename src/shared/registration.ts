export type RegistrationMode = "OPEN" | "INVITE_ONLY";

export function normalizeRegistrationMode(value: string | null | undefined): RegistrationMode {
  return value?.trim().toUpperCase() === "INVITE_ONLY" ? "INVITE_ONLY" : "OPEN";
}

export function invitationRequiredFor(mode: RegistrationMode): boolean {
  return mode === "INVITE_ONLY";
}
