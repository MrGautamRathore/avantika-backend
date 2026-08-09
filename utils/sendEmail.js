const nodemailer = require('nodemailer');

/**
 * Avantika Travels — sendEmail utility
 * -------------------------------------
 * Fixes vs the old version:
 *   1. `retries` was used but never declared as a parameter -> ReferenceError on failure.
 *   2. Transporter was re-created on every single call -> slow + Gmail sometimes
 *      throttles/flags rapid new-connection bursts. Now cached (singleton).
 *   3. `from` must match (or be closely tied to) the authenticated Gmail account,
 *      otherwise Gmail silently rewrites it or the mail gets flagged as spam.
 *      A display name is fine — the address itself should be your Gmail login.
 *   4. Always send BOTH text and html. Mail sent with only an HTML part
 *      (no text alternative) is one of the more common reasons Gmail scores
 *      an email as spam.
 *
 * Gmail SMTP + spam-folder checklist (do this once, outside the code):
 *   - Use a Google Workspace address if possible (e.g. bookings@avantikatravels.com)
 *     instead of a personal @gmail.com — it looks far more legitimate to spam filters.
 *   - Turn on 2-Step Verification on the sending Gmail account, then create an
 *     "App Password" (Google Account -> Security -> App passwords) and put THAT
 *     in EMAIL_PASSWORD. Never use your real Gmail login password.
 *   - EMAIL_FROM should be the SAME address as EMAIL_USERNAME. Gmail SMTP does
 *     not allow sending "as" an arbitrary from-address unless it's an alias
 *     you've verified inside Gmail settings.
 *   - If you own a domain, set up SPF + DKIM + DMARC DNS records for it — this
 *     is the single biggest factor in avoiding spam once volume grows.
 *   - Avoid spam trigger words in subject lines ("FREE", "!!!", ALL CAPS).
 *   - Don't send too many emails back-to-back from a brand-new Gmail account;
 *     reputation warms up over the first 1-2 weeks.
 */

// Logo sent as an inline (CID) attachment on every email instead of a
// remote <img src> URL. This fixes two things at once:
//   1. Gmail/Outlook block remote images by default for new senders, so the
//      logo often doesn't render — CID images show up immediately.
//   2. One less external fetch at render time = a small positive signal
//      for spam filters (fewer "phone home" requests inside the email).
// nodemailer supports `path` as a remote URL and fetches it automatically
// during send, so no need to bundle the image file locally.
const LOGO_CID = 'avantika-logo';
const LOGO_URL = process.env.LOGO_URL || 'https://www.avantikatravels.com/icon.jpg';

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  if (process.env.NODE_ENV === 'production') {
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD // Gmail App Password, not your login password
      },
      pool: true,              // reuse a small pool of connections instead of
                                // opening a brand-new TLS handshake every send
      maxConnections: 3,
      connectionTimeout: 15000, // ms to wait for the TLS handshake to complete
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  } else {
    // Mailtrap (or any dev SMTP sandbox) for local/dev testing
    cachedTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.mailtrap.io',
      port: Number(process.env.EMAIL_PORT) || 2525,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  return cachedTransporter;
}

// crude HTML -> text fallback so we never send an HTML-only email
function htmlToText(html = '') {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {Object} options
 * @param {string} options.email    recipient address
 * @param {string} options.subject  subject line
 * @param {string} [options.message] plain-text body (auto-derived from html if omitted)
 * @param {string} [options.html]   html body
 * @param {number} [retries]        internal retry counter, don't pass manually
 */
const sendEmail = async (options, retries = 2) => {
  const fromName = process.env.EMAIL_FROM_NAME || 'Avantika Travels';
  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME;

  const mailOptions = {
    from: `"${fromName}" <${fromAddress}>`,
    to: options.email,
    subject: options.subject,
    text: options.message || htmlToText(options.html),
    html: options.html,
    // Only attach the logo when the template actually references cid:avantika-logo
    attachments: options.html && options.html.includes(`cid:${LOGO_CID}`)
      ? [{ filename: 'logo.jpg', path: LOGO_URL, cid: LOGO_CID, contentDisposition: 'inline' }]
      : (options.attachments || [])
  };

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error.message);

    if (retries > 0) {
      console.log(`Retrying email to ${options.email}... (${retries} attempts left)`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return sendEmail(options, retries - 1);
    }

    // Don't crash the caller (booking/contact save should still succeed even
    // if the notification email fails) — throw so the caller can decide,
    // but callers below wrap this in try/catch and only log it.
    throw new Error(`Email could not be sent: ${error.message}`);
  }
};

module.exports = sendEmail;