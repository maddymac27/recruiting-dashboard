import type { ParsedEmailResult } from "@/db/validation";

import type { ParsedMessage } from "../types";
import { parseAshby } from "./ashby";
import { parseSmartRecruiters } from "./smartrecruiters";
import { parseWorkday } from "./workday";

export type SenderParser = (msg: ParsedMessage) => ParsedEmailResult | null;

function extractDomain(from: string): string {
  const match = from.match(/@([^\s>]+)/);
  return match ? match[1].toLowerCase() : "";
}

// Domain-suffix -> parser map. All three confirmed real senders (03-03
// real-inbox sampling: Workday/SmartRecruiters/Ashby; Handshake dropped,
// never referenced) now have live parsers. Any other domain present in the
// targeted sender query but without a parser entry here — or any domain not
// in KNOWN_SENDER_DOMAINS at all — correctly returns null from
// dispatchParser, routing to dead-letter/review rather than being dropped.
const PARSERS_BY_DOMAIN_SUFFIX: ReadonlyArray<{ suffix: string; parser: SenderParser }> = [
  { suffix: "myworkday.com", parser: parseWorkday },
  { suffix: "smartrecruiters.com", parser: parseSmartRecruiters },
  { suffix: "ashbyhq.com", parser: parseAshby },
];

/** Routes a message's From address to its sender-specific parser by domain
 *  suffix (handles Workday's multi-tenant local-part variance). Returns
 *  `null` for any unrecognized or unimplemented-parser domain. */
export function dispatchParser(from: string): SenderParser | null {
  const domain = extractDomain(from);
  if (!domain) return null;

  const match = PARSERS_BY_DOMAIN_SUFFIX.find(({ suffix }) => domain.endsWith(suffix));
  return match ? match.parser : null;
}
