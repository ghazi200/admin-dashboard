# Legal pack (B4) — ABE Guard / ABE Security

**Status:** Draft for pilot / security questionnaire. **Not legal advice.** Have counsel review before customer signature or public “final” branding.

## Public pages (live on admin API host)

Base: `https://<your-admin-railway-host>/legal/`

| Page | URL |
|------|-----|
| Index | `/legal/` |
| Privacy Policy | `/legal/privacy` |
| Terms of Service | `/legal/terms` |
| SMS & Voice Consent | `/legal/messaging-consent` (also `/consent/sms`) |

Example production:

- https://admin-dashboard-production-2596.up.railway.app/legal/privacy  
- https://admin-dashboard-production-2596.up.railway.app/legal/terms  
- https://admin-dashboard-production-2596.up.railway.app/legal/messaging-consent  

## Internal drafts (this folder)

| Document | File | Use |
|----------|------|-----|
| Master Service Agreement (pilot) | `MSA_DRAFT.md` | Attach to 30–60 day pilot; counsel edit |
| Data Processing Agreement | `DPA_DRAFT.md` | Processor terms for customer personal data |
| A2P / Twilio messaging ops | `A2P_MESSAGING_CONSENT_OPS.md` | Internal checklist for SMS compliance |

## Before first external send

1. Replace placeholder emails (`@abessecurity.example`) and `[STATE]` / entity name on HTML + drafts.  
2. Confirm SMTP/Twilio and guard `communications_consent` flow.  
3. Lawyer review of MSA/DPA/Privacy/Terms.  
4. Paste public Privacy + ToS URLs into security questionnaires.
