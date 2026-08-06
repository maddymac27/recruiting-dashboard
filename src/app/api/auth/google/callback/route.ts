import { NextResponse, type NextRequest } from "next/server";

import { dashboardMode } from "@/db/client";
import { exchangeCode, hasStoredToken } from "@/gmail/oauth";

// GET Route Handler — Google redirects here after consent with a `?code=`
// query param (RESEARCH Pattern 1). A Route Handler is required (not a
// Server Action) because Google needs a GET-able URL to redirect to.
export async function GET(request: NextRequest) {
  if (dashboardMode !== "real") {
    return new Response("Gmail sync is unavailable in demo mode.", {
      status: 403,
    });
  }

  // Refuse to re-exchange a code if a refresh token already exists
  // (T-03-06) — prevents a stray/replayed callback hit from silently
  // re-running the flow.
  if (hasStoredToken()) {
    return new Response(
      "Gmail is already connected. Delete .secrets/gmail-token.json first if you need to re-authorize.",
      { status: 409 },
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return new Response("Missing OAuth code parameter.", { status: 400 });
  }

  try {
    await exchangeCode(code);
  } catch (error) {
    console.error("Gmail OAuth exchange failed:", error);
    return new Response(
      "Couldn't connect your Gmail account. Check your credentials and try again.",
      { status: 500 },
    );
  }

  return NextResponse.redirect(new URL("/", request.url));
}
