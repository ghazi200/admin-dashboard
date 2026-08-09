# A2P / Twilio messaging consent — ops note (B4)

Internal checklist so outbound SMS/voice stays aligned with Twilio A2P and carrier expectations.

## Public consent documentation

| Item | URL |
|------|-----|
| Consent policy page | `{PUBLIC_BASE_URL}/legal/messaging-consent` |
| Short redirect | `{PUBLIC_BASE_URL}/consent/sms` |
| Privacy | `{PUBLIC_BASE_URL}/legal/privacy` |
| Terms | `{PUBLIC_BASE_URL}/legal/terms` |

Set on Railway (admin service):

```
PUBLIC_BASE_URL=https://admin-dashboard-production-2596.up.railway.app
```

## Product controls (already in code)

1. Admin → Guards → **communications consent** checkbox before SMS/voice.  
2. Outbound callout SMS/voice **skipped** if `communications_consent` is false (`guardCalloutOutbound.service.js`).  
3. SMS body includes **Reply STOP to opt out.**  
4. Optional: append consent URL when enabled:

```
CALLOUT_SMS_INCLUDE_CONSENT_LINK=true
```

(Uses `PUBLIC_BASE_URL` + `/consent/sms`.)

5. Contact preferences (email/sms/phone/in_app) further gate channels.

## Twilio / A2P campaign answers (copy/paste starters)

- **Use case:** Account notifications / workforce staffing (shift callouts), not marketing.  
- **Opt-in:** Collected in employer’s admin dashboard (and/or app) with express consent language; documented at `/legal/messaging-consent`.  
- **Opt-out:** STOP / HELP supported; consent revocable via supervisor.  
- **Sample message:** See messaging-consent page (“ABE callout … Reply STOP to opt out”).  
- **Privacy policy URL:** `/legal/privacy` on the public admin host.

## Ops do’s and don’ts

- Do keep `PUBLIC_BASE_URL` as the **public https** admin URL (same host Twilio hits for voice TwiML).  
- Do not SMS guards who never consented.  
- Do not use the callout number for promotional blasts.  
- Do re-verify consent if you import guards via CSV later (set consent explicitly).  
- Do store/update `consent_at` / `consent_source` when available on the guard record.

## Support script

If a guard texts STOP: confirm Twilio Advanced Opt-Out (or Messaging Service) is configured; mark consent false in Admin → Guards if needed; tell the guard their supervisor can re-enable only with new opt-in.
