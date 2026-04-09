import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || "Atlas <noreply@yourdomain.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function layout(content: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0d111c;font-family:'Manrope',system-ui,sans-serif">
  <div style="max-width:520px;margin:40px auto;padding:32px;background:#131928;border:1px solid rgba(255,255,255,0.08);border-radius:16px">
    <div style="margin-bottom:24px">
      <span style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.02em">Atlas</span>
      <span style="display:inline-block;margin-left:8px;padding:2px 8px;font-size:9px;font-weight:700;letter-spacing:0.1em;color:#22d3ee;border:1px solid rgba(34,211,238,0.3);border-radius:999px;background:rgba(34,211,238,0.1)">BETA</span>
    </div>
    ${content}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:rgba(255,255,255,0.25)">
      &copy; 2026 Atlas Job OS
    </div>
  </div>
</body>
</html>`;
}

function ctaButton(text: string, href: string) {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:linear-gradient(to right,#06b6d4,#0891b2);color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:12px">${text}</a>`;
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Welcome to Atlas Beta!",
      html: layout(`
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#fff">Welcome aboard, ${name}!</h1>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.6)">
          You've secured one of the first 50 beta spots on Atlas — the AI agent that finds, scores, and lands your next job.
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.6)">
          Upload your CV, set your preferences, and let Atlas do the heavy lifting.
        </p>
        ${ctaButton("Sign In to Atlas", `${APP_URL}/login`)}
      `),
    });
  } catch (error) {
    console.error("[email] Failed to send welcome email:", error);
  }
}

export async function sendWaitlistEmail(to: string, name: string): Promise<void> {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "You're on the Atlas Waitlist",
      html: layout(`
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#fff">Thanks for signing up, ${name}!</h1>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.6)">
          All 50 beta spots are currently taken, but you're on the waitlist. We'll email you the moment a spot opens up or we expand access.
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.6)">
          Sit tight — you're closer than you think.
        </p>
      `),
    });
  } catch (error) {
    console.error("[email] Failed to send waitlist email:", error);
  }
}

export async function sendApprovedEmail(to: string, name: string): Promise<void> {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "You've Been Approved for Atlas!",
      html: layout(`
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#fff">Great news, ${name}!</h1>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.6)">
          Your Atlas account has been approved. You now have full access to the beta — upload your CV, search jobs, and let Atlas handle the rest.
        </p>
        ${ctaButton("Sign In to Atlas", `${APP_URL}/login`)}
      `),
    });
  } catch (error) {
    console.error("[email] Failed to send approved email:", error);
  }
}
