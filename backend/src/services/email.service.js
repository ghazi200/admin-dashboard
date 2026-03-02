const nodemailer = require("nodemailer");

/**
 * Email Service
 * Handles sending emails for scheduled reports
 */

let transporter = null;

/**
 * Initialize email transporter
 */
function initEmailTransporter() {
  // Check if email is configured
  const emailConfig = {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };

  // Only initialize if credentials are provided
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    console.warn("⚠️  Email not configured. Set SMTP_USER and SMTP_PASS in .env to enable email sending.");
    return null;
  }

  try {
    transporter = nodemailer.createTransport(emailConfig);
    console.log("✅ Email transporter initialized");
    return transporter;
  } catch (error) {
    console.error("❌ Error initializing email transporter:", error);
    return null;
  }
}

/**
 * Send email with report attachments
 */
async function sendReportEmail(options) {
  const { to, subject, text, html, attachments } = options;

  if (!transporter) {
    transporter = initEmailTransporter();
  }

  if (!transporter) {
    console.warn("⚠️  Email transporter not available. Skipping email send.");
    return { success: false, error: "Email not configured" };
  }

  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject: subject || "Scheduled Report",
      text: text,
      html: html || text,
      attachments: attachments || [],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${to}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send scheduled report email with attachments
 */
async function sendScheduledReportEmail(scheduled, reportData, fileBuffers, exportFormats) {
  const recipients = scheduled.email_recipients || [];
  if (recipients.length === 0) {
    return { success: false, error: "No recipients specified" };
  }

  // Prepare attachments
  const attachments = [];
  for (const format of exportFormats) {
    if (fileBuffers[format]) {
      attachments.push({
        filename: `${scheduled.name.replace(/[^a-z0-9]/gi, "_")}.${format}`,
        content: fileBuffers[format],
      });
    }
  }

  if (attachments.length === 0) {
    console.warn("⚠️  No report files to attach. Skipping email.");
    return { success: false, error: "No report files generated" };
  }

  const subject = scheduled.email_subject || `Scheduled Report: ${scheduled.name}`;
  const text = scheduled.email_message || `Please find attached the scheduled report: ${scheduled.name}`;

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Scheduled Report: ${scheduled.name}</h2>
      <p>${text}</p>
      <p><strong>Report Period:</strong> ${new Date(reportData.period.startDate).toLocaleDateString()} - ${new Date(reportData.period.endDate).toLocaleDateString()}</p>
      <p><strong>Generated:</strong> ${new Date(reportData.generatedAt).toLocaleString()}</p>
      <p>Please find the report attached in ${exportFormats.join(", ")} format(s).</p>
      <hr>
      <p style="color: #666; font-size: 12px;">This is an automated email from the Admin Dashboard Report Builder.</p>
    </div>
  `;

  return await sendReportEmail({
    to: recipients,
    subject,
    text,
    html,
    attachments,
  });
}

module.exports = {
  initEmailTransporter,
  sendReportEmail,
  sendScheduledReportEmail,
};
