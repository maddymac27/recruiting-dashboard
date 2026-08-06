// ---------------------------------------------------------------------------
// D3-05 REVISION (post D3-02 real-template fix): the original D3-05 policy
// ("a real-world event date is required, never defaulted to the message's
// received time") turned out to be unsatisfiable against real mail — direct
// inspection of all 33 real Workday/SmartRecruiters/Ashby dead-letter rows
// in this user's inbox found ZERO with an explicit calendar date anywhere in
// the body. The user has since REVISED the policy: prefer an explicit date
// when the email has one; otherwise fall back to the message's received
// time. Rationale: an ATS confirmation/rejection email arrives essentially
// the moment the status changes, so received-time is a faithful proxy for
// the real event date, and manually dating every confirmation was rejected
// as too high-effort (violates the project's "low ongoing effort"
// constraint). This is now the correct, intentional behavior — using
// received-time here is NOT a D3-05 violation.
// ---------------------------------------------------------------------------

/**
 * Shared by every sender parser (D3-02): resolves the final `occurredAt` for
 * a parsed result. An explicit date extracted from the email body always
 * wins when present and parses to a valid `Date`; otherwise falls back to
 * the message's own received time (`ParsedMessage.date` — sourced from the
 * RFC822 `Date:` header via mailparser in `fetchParsedMessage`, effectively
 * equivalent to Gmail's `internalDate` for this purpose).
 */
export function resolveOccurredAt(explicitDateText: string | null, receivedAt: Date): Date {
  if (explicitDateText) {
    const explicit = new Date(explicitDateText);
    if (!Number.isNaN(explicit.getTime())) return explicit;
  }
  return receivedAt;
}
