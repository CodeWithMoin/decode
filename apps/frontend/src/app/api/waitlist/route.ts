import { appendFile, mkdir } from "node:fs/promises";
import { NextResponse } from "next/server";

/**
 * Waitlist capture. With Resend configured (RESEND_API_KEY +
 * RESEND_AUDIENCE_ID) the contact lands in that audience; without keys —
 * local dev — the email appends to .data/waitlist.txt so a signup is never
 * silently dropped. Duplicates are a success either way: telling a visitor
 * "you already signed up" leaks who has.
 */
export async function POST(request: Request) {
  let email = "";
  try {
    const body: unknown = await request.json();
    email = String((body as { email?: string }).email ?? "").trim().toLowerCase();
  } catch {
    // fall through to the shared validation below
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, message: "That doesn’t look like an email address." },
      { status: 400 },
    );
  }

  const key = process.env.RESEND_API_KEY;
  const audience = process.env.RESEND_AUDIENCE_ID;
  try {
    if (key && audience) {
      const response = await fetch(`https://api.resend.com/audiences/${audience}/contacts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, unsubscribed: false }),
      });
      // 409 = already on the list, which is a success from the visitor's side.
      if (!response.ok && response.status !== 409) {
        throw new Error(`resend responded ${response.status}`);
      }
    } else {
      await mkdir(".data", { recursive: true });
      await appendFile(".data/waitlist.txt", `${new Date().toISOString()} ${email}\n`);
    }
  } catch {
    return NextResponse.json(
      { ok: false, message: "We couldn’t save that just now. Please try again." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
