/**
 * Forgot-password support: the branded reset email and the Worker-served reset
 * page (GET /reset-password?token=...). The actual token issue/consume logic is
 * Better Auth's (`POST /api/auth/request-password-reset`, `POST
 * /api/auth/reset-password`); this file only supplies the email + the page.
 *
 * Enumeration: Better Auth answers the request endpoint identically whether or
 * not the email exists, and index.ts hands the email send to `waitUntil` so the
 * response time does not depend on it either.
 */
import { Hono } from 'hono';
import { escapeHtml, publicBaseUrl } from './email';
import { sendEmail } from './reminders';

type AppEnv = { Bindings: Env };

/** Where the app's sign-in screen lives (Expo Router: app/(auth)/sign-in.tsx). */
export const SIGN_IN_DEEP_LINK = 'spotseek://sign-in';
export const RESET_TOKEN_TTL_MINUTES = 60;

// Test-only injection point (same pattern as payments' __setTestStripeConfig):
// the Worker test env has no RESEND_API_KEY binding, and adding a global one
// would make every other suite send real mail.
let testResendKey: string | null = null;
export function __setTestResendKey(key: string | null): void {
  testResendKey = key;
}

export function resetUrl(baseUrl: string | undefined, token: string): string {
  const base = (baseUrl ?? publicBaseUrl()).replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendResetEmail(
  env: Env,
  user: { email: string },
  token: string,
): Promise<void> {
  const apiKey = testResendKey ?? env.RESEND_API_KEY;
  if (!apiKey) {
    // Never log the token/link.
    console.log(`[DEV PASSWORD RESET] to=${user.email} (RESEND_API_KEY not set; no email sent)`);
    return;
  }
  await sendEmail(
    user.email,
    'Reset your password',
    `We got a request to reset the password for your SpotSeek account. Tap the button below to choose a new one. This link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
    apiKey,
    {
      type: 'password_reset',
      baseUrl: publicBaseUrl(env),
      ctaLabel: 'Reset password',
      ctaUrl: resetUrl(publicBaseUrl(env), token),
      footer: "If you didn't ask for this, you can safely ignore this email. Your password won't change.",
    },
  );
}

// ─── Reset page ───────────────────────────────────────────────────────────────
// Same look as the /payments/onboard/* pages (High-Energy Action). The token is
// only ever placed in an HTML-escaped data attribute; the inline script reads
// it from the DOM and holds no secrets.

const PAGE_CSS = `
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0F0F12;color:#fff;font-family:-apple-system,Helvetica,Arial,sans-serif}
  main{width:100%;max-width:420px;border:2px solid #00e5ff;padding:32px 24px}
  h1{margin:0 0 16px;font-size:34px;line-height:1.05;letter-spacing:.02em;text-transform:uppercase;font-weight:900}
  p{margin:0 0 24px;color:#c9c9d1;font-size:16px;line-height:1.5}
  label{display:block;margin:0 0 6px;color:#00e5ff;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
  input{display:block;width:100%;margin:0 0 20px;padding:14px 12px;background:#1a1a20;border:0;border-bottom:2px solid #3a3a44;border-radius:0;color:#fff;font-size:16px}
  input:focus{outline:0;border-bottom-color:#ff5e07}
  button,a.cta{display:block;width:100%;text-align:center;padding:16px;background:#00e5ff;color:#0F0F12;text-decoration:none;text-transform:uppercase;font-weight:800;letter-spacing:.06em;border:0;border-radius:0;box-shadow:4px 4px 0 #fff;font-size:16px;cursor:pointer}
  button:disabled{opacity:.5;cursor:default}
  #msg{min-height:1.5em;margin:0 0 16px;color:#ff5e07;font-size:15px}
  [hidden]{display:none!important}
`;

const PAGE_JS = `
(function(){
  var form=document.getElementById('f');
  if(!form)return;
  var token=form.getAttribute('data-token')||'';
  var msg=document.getElementById('msg');
  var btn=document.getElementById('go');
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var pw=document.getElementById('pw').value;
    var pw2=document.getElementById('pw2').value;
    msg.textContent='';
    if(pw.length<8){msg.textContent=form.getAttribute('data-err-short');return;}
    if(pw!==pw2){msg.textContent=form.getAttribute('data-err-match');return;}
    btn.disabled=true;
    fetch('/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newPassword:pw,token:token})})
      .then(function(r){return r.json().catch(function(){return {};}).then(function(b){return {ok:r.ok,body:b};});})
      .then(function(res){
        if(res.ok){
          document.getElementById('form-state').hidden=true;
          document.getElementById('done-state').hidden=false;
        }else{
          btn.disabled=false;
          msg.textContent=form.getAttribute('data-err-invalid');
        }
      })
      .catch(function(){btn.disabled=false;msg.textContent=form.getAttribute('data-err-network');});
  });
})();
`;

export function resetPasswordPage(token: string | undefined): string {
  const valid = !!token && token.length <= 512;
  const form = valid
    ? `<div id="form-state">
<h1>Choose a new password</h1>
<p>Pick something at least 8 characters long.</p>
<form id="f" novalidate data-token="${escapeHtml(token as string)}"
  data-err-short="Password must be at least 8 characters."
  data-err-match="The two passwords don't match."
  data-err-invalid="This reset link is invalid or has expired. Request a new one from the app."
  data-err-network="Something went wrong. Check your connection and try again.">
<label for="pw">New password</label>
<input id="pw" type="password" autocomplete="new-password" minlength="8" required>
<label for="pw2">Confirm password</label>
<input id="pw2" type="password" autocomplete="new-password" minlength="8" required>
<div id="msg" role="alert"></div>
<button id="go" type="submit">Reset password</button>
</form>
</div>
<div id="done-state" hidden>
<h1>Password updated</h1>
<p>You can now sign in with your new password.</p>
<a class="cta" href="${escapeHtml(SIGN_IN_DEEP_LINK)}">Open SpotSeek</a>
</div>`
    : `<h1>Link invalid</h1>
<p>This password reset link is missing or invalid. Request a new one from the sign-in screen in the SpotSeek app.</p>
<a class="cta" href="${escapeHtml(SIGN_IN_DEEP_LINK)}">Open SpotSeek</a>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>Reset password · SpotSeek</title>
<style>${PAGE_CSS}</style></head>
<body><main>
${form}
</main>${valid ? `<script>${PAGE_JS}</script>` : ''}</body></html>`;
}

export const passwordResetRouter = new Hono<AppEnv>();

passwordResetRouter.get('/reset-password', (c) => {
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
  return c.html(resetPasswordPage(c.req.query('token')));
});
