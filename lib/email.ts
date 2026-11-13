export type AuthEmailKind = "verification" | "password-reset";

export function isTransactionalEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export async function sendAuthEmail(input: {
  to: string;
  url: string;
  kind: AuthEmailKind;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("AUTH_EMAIL_PROVIDER_NOT_CONFIGURED");

  const actionUrl = new URL(input.url);
  const configuredOrigin = process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";
  if (actionUrl.origin !== new URL(configuredOrigin).origin) {
    throw new Error("AUTH_EMAIL_LINK_ORIGIN_MISMATCH");
  }

  const isVerification = input.kind === "verification";
  const heading = isVerification ? "Verify your BALMZ AI email" : "Reset your BALMZ AI password";
  const description = isVerification
    ? "Confirm that this email address belongs to you to secure your BALMZ AI account."
    : "A password reset was requested for your BALMZ AI account. Use the button below to choose a new password.";
  const action = isVerification ? "Verify email address" : "Reset password";
  const subject = isVerification ? "Verify your BALMZ AI email address" : "Reset your BALMZ AI password";
  const safeUrl = escapeHtml(actionUrl.toString());
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#080c14;color:#e2e8f0;font-family:Arial,sans-serif">
  <main style="max-width:560px;margin:32px auto;padding:32px;background:#111a28;border:1px solid #263244;border-radius:20px">
    <p style="color:#f97316;font-weight:700;letter-spacing:3px">BALMZ AI</p>
    <h1 style="font-size:24px;color:#fff">${heading}</h1>
    <p style="font-size:15px;line-height:1.7;color:#cbd5e1">${description}</p>
    <p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:14px 20px;border-radius:10px;background:#f97316;color:#17100a;font-weight:700;text-decoration:none">${action}</a></p>
    <p style="font-size:12px;line-height:1.6;color:#94a3b8">This link is time-limited and can be used only for this account action. If you did not request it, you can safely ignore this email.</p>
    <p style="font-size:11px;line-height:1.5;word-break:break-all;color:#64748b">${safeUrl}</p>
  </main>
</body></html>`;
  const text = `${heading}\n\n${description}\n\n${action}: ${actionUrl.toString()}\n\nIf you did not request this, ignore this email.`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "BALMZ-AI/1.0",
    },
    body: JSON.stringify({ from, to: [input.to], subject, html, text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`AUTH_EMAIL_PROVIDER_REJECTED_${response.status}`);
  }
}
