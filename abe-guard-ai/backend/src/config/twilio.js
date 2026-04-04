// Lazy Twilio REST client — avoids crashing when package or env is missing.
function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    return require("twilio")(sid, token);
  } catch (e) {
    console.warn("Twilio package not installed; run: npm install twilio");
    return null;
  }
}

module.exports = { getTwilioClient };
