/**
 * Avantika Travels — Email Templates
 * -----------------------------------
 * All templates use inline CSS (no external stylesheets, no <style> blocks
 * relying on classes) because Gmail strips a lot of <style> based CSS and
 * inline CSS is what renders most reliably across Gmail/Outlook/Yahoo.
 *
 * Anti-spam notes baked into these templates:
 *  - Real, readable plain-text alternative is generated alongside (see sendEmail.js)
 *  - No excessive caps, no "FREE", "!!!", spammy words
 *  - Single clear call-to-action, real footer with business name + address line
 *  - Consistent "from name" (set in sendEmail.js) so Gmail builds sender reputation
 */

const SITE_NAME = 'Avantika Travels';
const SITE_URL = process.env.SITE_URL || 'https://www.avantikatravels.com';
const BRAND_COLOR = '#c0392b'; // warm travel red — change to your brand color
const BRAND_DARK = '#1a1a1a';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || ''; // e.g. 919876543210 (with country code, no +)

// Logo is sent as a CID (inline) attachment by sendEmail.js, not fetched
// remotely by the email client — this is what "avantika-logo" refers to.
const LOGO_CID = 'avantika-logo';

// ---------- Shared wrapper ----------
function wrapper({ title, preheader, bodyHtml }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${preheader || ''}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eeeeee;">

          <!-- Header -->
          <tr>
            <td style="background:${BRAND_DARK};padding:24px 32px;text-align:center;">
              <img src="cid:${LOGO_CID}" alt="${SITE_NAME}" style="height:44px;margin-bottom:4px;" />
              <div style="color:#ffffff;font-size:13px;letter-spacing:1px;opacity:0.75;margin-top:6px;">
                ${SITE_NAME.toUpperCase()}
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #eeeeee;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;color:#999999;">
                ${SITE_NAME} • <a href="${SITE_URL}" style="color:#999999;text-decoration:underline;">${SITE_URL.replace('https://', '')}</a>
              </p>
              <p style="margin:0;font-size:11px;color:#bbbbbb;">
                You are receiving this email because of an action taken on ${SITE_NAME}. If this wasn't you, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function pillStatus(text, color = BRAND_COLOR) {
  return `<span style="display:inline-block;background:${color}1a;color:${color};font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;">${text}</span>`;
}

function infoRow(label, value) {
  if (value === undefined || value === null || value === '') return '';
  return `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#888888;width:40%;">${label}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#222222;font-weight:500;">${value}</td>
    </tr>`;
}

function whatsappBlock() {
  if (!WHATSAPP_NUMBER) return '';
  const waLink = `https://wa.me/${WHATSAPP_NUMBER}`;
  return `
    <div style="margin-top:20px;padding:16px;background:#eefaf1;border-left:3px solid #25D366;border-radius:4px;">
      <p style="margin:0 0 10px 0;font-size:13px;color:#2c5c3f;line-height:1.6;">
        For any further details or confirmation, we'll continue on WhatsApp — feel free to message us anytime at
        <strong>+${WHATSAPP_NUMBER}</strong>.
      </p>
      <a href="${waLink}" style="display:inline-block;padding:10px 20px;font-size:13px;font-weight:600;color:#ffffff;background:#25D366;border-radius:6px;text-decoration:none;">
        Message us on WhatsApp
      </a>
    </div>`;
}

function button(url, label) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:8px;background:${BRAND_COLOR};">
        <a href="${url}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

// =====================================================================
// 1. NEW CONTACT INQUIRY — sent to ADMIN
// =====================================================================
function newInquiryAdminTemplate(contact) {
  const bodyHtml = `
    <div style="margin-bottom:16px;">${pillStatus('New Inquiry')}</div>
    <h2 style="margin:0 0 8px 0;font-size:20px;color:${BRAND_DARK};">You've got a new website inquiry</h2>
    <p style="margin:0 0 20px 0;font-size:14px;color:#666666;line-height:1.6;">
      Someone just filled out the contact form on ${SITE_NAME}. Details below.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${infoRow('Name', contact.name)}
      ${infoRow('Email', contact.email)}
      ${infoRow('Phone', contact.phone)}
      ${infoRow('Subject', contact.subject)}
    </table>
    <div style="margin-top:20px;padding:16px;background:#faf7f2;border-left:3px solid ${BRAND_COLOR};border-radius:4px;">
      <p style="margin:0;font-size:14px;color:#444444;line-height:1.6;white-space:pre-wrap;">${contact.message}</p>
    </div>
    ${button(`mailto:${contact.email}`, 'Reply to ' + contact.name)}
    <p style="margin:0;font-size:13px;color:#999999;">Try to respond within 24 hours — quick replies convert better.</p>
  `;
  return wrapper({
    title: `New Inquiry — ${contact.name}`,
    preheader: `New inquiry from ${contact.name}: ${contact.subject}`,
    bodyHtml
  });
}

// =====================================================================
// 2. NEW BOOKING — sent to ADMIN
// =====================================================================
function newBookingAdminTemplate(booking) {
  const title = booking.packageName || booking.serviceName || 'Custom Inquiry';
  const bodyHtml = `
    <div style="margin-bottom:16px;">${pillStatus('New Booking', '#1e824c')}</div>
    <h2 style="margin:0 0 8px 0;font-size:20px;color:${BRAND_DARK};">New booking received</h2>
    <p style="margin:0 0 20px 0;font-size:14px;color:#666666;line-height:1.6;">
      A new booking just came in for <strong>${title}</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${infoRow('Customer', booking.name)}
      ${infoRow('Email', booking.email)}
      ${infoRow('Phone', booking.phone)}
      ${infoRow('Package', booking.packageName)}
      ${infoRow('Service', booking.serviceName)}
      ${infoRow('Travel Date', booking.travelDate ? new Date(booking.travelDate).toDateString() : '')}
      ${infoRow('No. of People', booking.numberOfPeople)}
      ${infoRow('Pickup', booking.pickupPoints)}
      ${infoRow('Drop', booking.dropPoints)}
      ${infoRow('Total Price', booking.totalPrice ? `₹${booking.totalPrice}` : '')}
      ${infoRow('Advance', booking.advancePayment ? `₹${booking.advancePayment}` : '')}
      ${infoRow('Balance', booking.balancePayment ? `₹${booking.balancePayment}` : '')}
    </table>
    ${booking.specialRequests ? `
    <div style="margin-top:20px;padding:16px;background:#faf7f2;border-left:3px solid ${BRAND_COLOR};border-radius:4px;">
      <p style="margin:0 0 4px 0;font-size:12px;color:#999999;">Special Request</p>
      <p style="margin:0;font-size:14px;color:#444444;line-height:1.6;">${booking.specialRequests}</p>
    </div>` : ''}
    ${button(`${SITE_URL}/admin/bookings`, 'View in Admin Panel')}
  `;
  return wrapper({
    title: `New Booking — ${booking.name}`,
    preheader: `New booking from ${booking.name} for ${title}`,
    bodyHtml
  });
}

// =====================================================================
// 3. BOOKING CONFIRMATION — sent to CUSTOMER
// =====================================================================
function bookingConfirmationUserTemplate(booking) {
  const title = booking.packageName || booking.serviceName || 'Your Trip';
  const bodyHtml = `
    <div style="margin-bottom:16px;">${pillStatus('Booking Received')}</div>
    <h2 style="margin:0 0 8px 0;font-size:20px;color:${BRAND_DARK};">Thanks for booking with us, ${booking.name.split(' ')[0]}! 🎉</h2>
    <p style="margin:0 0 20px 0;font-size:14px;color:#666666;line-height:1.6;">
      We've received your booking for <strong>${title}</strong>. Our team will reach out shortly to confirm the details and next steps.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${infoRow('Package', booking.packageName)}
      ${infoRow('Service', booking.serviceName)}
      ${infoRow('Travel Date', booking.travelDate ? new Date(booking.travelDate).toDateString() : 'To be confirmed')}
      ${infoRow('No. of People', booking.numberOfPeople)}
      ${infoRow('Pickup Point', booking.pickupPoints)}
      ${infoRow('Drop Point', booking.dropPoints)}
      ${infoRow('Total Amount', booking.totalPrice ? `₹${booking.totalPrice}` : '')}
      ${infoRow('Advance Payable', booking.advancePayment ? `₹${booking.advancePayment}` : '')}
      ${infoRow('Balance on Trip', booking.balancePayment ? `₹${booking.balancePayment}` : '')}
    </table>
    ${whatsappBlock()}
    ${button(`${SITE_URL}`, 'Visit Avantika Travels')}
  `;
  return wrapper({
    title: `Booking Confirmation — ${title}`,
    preheader: `Your booking for ${title} has been received.`,
    bodyHtml
  });
}

// =====================================================================
// 4. MONTHLY STATS — sent to ADMIN
// =====================================================================
function monthlyStatsAdminTemplate(stats, comparisonGrowth = {}) {
  const statBlock = (label, value, growthKey) => {
    const growth = comparisonGrowth[growthKey];
    const growthHtml = (growth === undefined || growth === null) ? '' :
      `<div style="font-size:12px;margin-top:4px;color:${growth >= 0 ? '#1e824c' : '#c0392b'};">
        ${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth).toFixed(1)}% vs last month
      </div>`;
    return `
      <td style="padding:14px;text-align:center;border:1px solid #f0f0f0;border-radius:8px;">
        <div style="font-size:24px;font-weight:700;color:${BRAND_DARK};">${value ?? 0}</div>
        <div style="font-size:12px;color:#999999;margin-top:2px;">${label}</div>
        ${growthHtml}
      </td>`;
  };

  const bodyHtml = `
    <div style="margin-bottom:16px;">${pillStatus('Monthly Report')}</div>
    <h2 style="margin:0 0 8px 0;font-size:20px;color:${BRAND_DARK};">Your ${stats.month} performance summary</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#666666;line-height:1.6;">
      Here's how ${SITE_NAME} performed last month, generated automatically so you don't have to check the admin panel.
    </p>

    <table role="presentation" width="100%" cellpadding="6" cellspacing="0">
      <tr>
        ${statBlock('Contacts', stats.totalContacts, 'totalContacts')}
        ${statBlock('Reviews', stats.totalReviews, 'totalReviews')}
      </tr>
      <tr>
        ${statBlock('Active Packages', stats.activePackages, 'activePackages')}
        ${statBlock('Active Places', stats.activePlaces, 'activePlaces')}
      </tr>
      <tr>
        ${statBlock('Published Blogs', stats.publishedBlogs, 'publishedBlogs')}
        ${statBlock('Approved Reviews', stats.approvedReviews, 'approvedReviews')}
      </tr>
      <tr>
        ${statBlock('Responded Contacts', stats.respondedContacts, 'respondedContacts')}
        ${statBlock('Total Packages', stats.totalPackages, 'totalPackages')}
      </tr>
    </table>

    ${button(`${SITE_URL}/admin/dashboard`, 'Open Admin Dashboard')}
  `;
  return wrapper({
    title: `Monthly Report — ${stats.month}`,
    preheader: `Your ${SITE_NAME} monthly report for ${stats.month} is ready.`,
    bodyHtml
  });
}

module.exports = {
  newInquiryAdminTemplate,
  newBookingAdminTemplate,
  bookingConfirmationUserTemplate,
  monthlyStatsAdminTemplate
};