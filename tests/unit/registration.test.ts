import { describe, expect, it } from "vitest";
import { invitationRequiredFor, normalizeRegistrationMode } from "../../src/shared/registration";

describe("registration mode", () => {
  it("defaults missing or unknown settings to open registration", () => {
    expect(normalizeRegistrationMode(undefined)).toBe("OPEN");
    expect(normalizeRegistrationMode("unexpected")).toBe("OPEN");
    expect(invitationRequiredFor(normalizeRegistrationMode(null))).toBe(false);
  });

  it("requires an invitation only when explicitly configured", () => {
    const mode = normalizeRegistrationMode(" invite_only ");
    expect(mode).toBe("INVITE_ONLY");
    expect(invitationRequiredFor(mode)).toBe(true);
  });
});
