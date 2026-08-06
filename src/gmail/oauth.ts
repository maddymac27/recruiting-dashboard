import "server-only";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { google, type gmail_v1 } from "googleapis";

// `google.auth.OAuth2` (not a direct `google-auth-library` import) is used
// deliberately — `googleapis`'s `google.gmail()` factory expects an `auth`
// client built from its OWN nested `google-auth-library` copy
// (`googleapis-common/node_modules/google-auth-library`), which is a
// separately-typed class from the top-level hoisted `google-auth-library`
// package. Importing `OAuth2Client` directly from `google-auth-library`
// produces a structurally-incompatible type for `google.gmail({ auth })`.
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

import { dashboardMode } from "@/db/client";

// Server-only OAuth module for the one-time "Connect Gmail" flow (ING-01).
// This is the ONLY place that reads the OAuth client credentials or the
// stored refresh token — never in the client bundle (T-03-02), never in the
// SQLite DB (T-03-01). Every exported function either no-ops or throws when
// dashboardMode !== "real" (T-03-05) — callers (connectGmailAction, the
// OAuth callback route, and layout.tsx's hasStoredToken() read) still gate
// explicitly too, but this module never trusts a caller to remember.

const SECRETS_DIR = path.join(process.cwd(), ".secrets");
const TOKEN_PATH = path.join(SECRETS_DIR, "gmail-token.json");

// Loopback redirect for a Desktop-app OAuth client (RESEARCH Pattern 1).
// Google's authorization server validates loopback redirect_uris by
// scheme+host only for "Desktop app" client types — the exact port/path
// below does not need to appear in the downloaded client JSON's
// redirect_uris array.
const REDIRECT_URI = "http://localhost:3000/api/auth/google/callback";

// gmail.readonly ONLY — never a broader mail scope (T-03-EoP).
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

interface StoredToken {
  refresh_token: string;
}

/** Fail loud with a clear, actionable error rather than defaulting/guessing. */
function readClientCredentials(): ClientCredentials {
  if (!existsSync(SECRETS_DIR)) {
    throw new Error(
      `Gmail OAuth client credentials not found: ${SECRETS_DIR} does not exist. ` +
        "Download the Desktop-app OAuth client JSON from Google Cloud Console and save it under .secrets/.",
    );
  }

  const candidate = readdirSync(SECRETS_DIR).find(
    (file) => file.startsWith("client_secret") && file.endsWith(".json"),
  );
  if (!candidate) {
    throw new Error(
      `No Gmail OAuth client credentials file found in ${SECRETS_DIR} — expected a ` +
        "client_secret*.json file downloaded from Google Cloud Console (Desktop app client type).",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path.join(SECRETS_DIR, candidate), "utf-8"));
  } catch (error) {
    throw new Error(
      `Gmail OAuth client credentials file ${candidate} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const config =
    (parsed as { installed?: unknown; web?: unknown }).installed ??
    (parsed as { installed?: unknown; web?: unknown }).web;
  const clientId = (config as { client_id?: unknown } | undefined)?.client_id;
  const clientSecret = (config as { client_secret?: unknown } | undefined)
    ?.client_secret;

  if (typeof clientId !== "string" || typeof clientSecret !== "string") {
    throw new Error(
      `Gmail OAuth client credentials file ${candidate} is missing client_id/client_secret ` +
        '(expected an "installed" or "web" client JSON downloaded from Google Cloud Console).',
    );
  }

  return { clientId, clientSecret };
}

function readTokenFile(): StoredToken | null {
  if (!existsSync(TOKEN_PATH)) return null;

  try {
    const parsed = JSON.parse(readFileSync(TOKEN_PATH, "utf-8")) as {
      refresh_token?: unknown;
    };
    if (typeof parsed.refresh_token !== "string" || parsed.refresh_token.length === 0) {
      return null;
    }
    return { refresh_token: parsed.refresh_token };
  } catch {
    // Corrupt/partial token file reads as "not connected" — fail loud
    // happens at the next connect attempt, not here.
    return null;
  }
}

function writeToken(token: StoredToken): void {
  // .secrets/ is gitignored (verified in .gitignore) and never written to
  // the SQLite file — this is the ONLY location the refresh token is ever
  // persisted (T-03-01).
  writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2), { mode: 0o600 });
}

function assertRealMode(fnName: string): void {
  if (dashboardMode !== "real") {
    throw new Error(`${fnName} is unavailable in demo mode.`);
  }
}

/** Constructs an OAuth2Client from the `.secrets/` client JSON. Registers a
 *  `tokens` listener so a rotated refresh_token (rare, but possible per
 *  RESEARCH Pattern 2) is re-persisted automatically. */
export function getOAuth2Client(): OAuth2Client {
  assertRealMode("getOAuth2Client");

  const { clientId, clientSecret } = readClientCredentials();
  const client = new google.auth.OAuth2({
    clientId,
    clientSecret,
    redirectUri: REDIRECT_URI,
  });

  const stored = readTokenFile();
  if (stored) {
    client.setCredentials({ refresh_token: stored.refresh_token });
  }

  client.on("tokens", (tokens) => {
    if (tokens.refresh_token) {
      writeToken({ refresh_token: tokens.refresh_token });
    }
  });

  return client;
}

/** Generates the one-time consent URL. `access_type: "offline"` +
 *  `prompt: "consent"` guarantees a refresh_token is issued (RESEARCH
 *  Pattern 1 / Assumption A4). */
export function getConsentUrl(): string {
  assertRealMode("getConsentUrl");

  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

/** Exchanges the OAuth `code` for tokens and persists the refresh token.
 *  Refuses to re-run if a token already exists (T-03-06) — the callback
 *  route also checks this before calling exchangeCode, but this function
 *  never trusts the caller alone. */
export async function exchangeCode(code: string): Promise<void> {
  assertRealMode("exchangeCode");

  if (hasStoredToken()) {
    throw new Error(
      "Gmail is already connected — refusing to re-exchange an OAuth code.",
    );
  }

  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh_token. Revoke this app's access at " +
        "https://myaccount.google.com/permissions and try connecting again.",
    );
  }

  writeToken({ refresh_token: tokens.refresh_token });
}

/** Whether a refresh token is currently stored. No-ops (returns false) in
 *  demo mode rather than throwing — layout.tsx calls this unconditionally
 *  to compute `isConnected` regardless of dashboardMode. */
export function hasStoredToken(): boolean {
  if (dashboardMode !== "real") return false;
  return readTokenFile() !== null;
}

/** Returns an authenticated gmail('v1') client built from the stored
 *  refresh token. Used by later ingestion plans (fetch/sync). */
export function getAuthedGmailClient(): gmail_v1.Gmail {
  assertRealMode("getAuthedGmailClient");

  const stored = readTokenFile();
  if (!stored) {
    throw new Error(
      "Gmail is not connected — no refresh token stored. Connect Gmail first.",
    );
  }

  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: stored.refresh_token });
  return google.gmail({ version: "v1", auth: client });
}
