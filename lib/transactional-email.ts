type RecoveryEmail = { to: string; code: string };

export async function sendPinRecoveryCode({ to, code }: RecoveryEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("Transactional email is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "BALMZ-AI/1.0",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Your BALMZ AI recovery code",
      text: `Your BALMZ AI recovery code is ${code}. It expires in 10 minutes. If you did not request this code, ignore this email.`,
      html: `<main style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><h2>BALMZ AI account recovery</h2><p>Your one-time recovery code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes and can only be used once.</p><p>If you did not request this code, ignore this email.</p></main>`,
    }),
  });

  if (!response.ok) {
    // Do not log recipient addresses, API credentials, or one-time codes.
    throw new Error(`Recovery email provider returned HTTP ${response.status}.`);
  }
}
