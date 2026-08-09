# MFA onboarding (pilot admins) — B3

Two-factor authentication (MFA) is **optional by default**. For a security pilot, turn it **required** so admins cannot use the dashboard with password alone.

## What pilots see

1. Sign in with email + password.
2. If MFA is already on → enter the email/SMS code (existing flow).
3. If MFA is **required** but not set up yet → they get a session limited to **Account & Security**, with a banner: *MFA is required*.
4. They choose **Email** or **SMS**, enter the code, MFA turns on.
5. Next login always challenges with a code. They cannot disable MFA while policy applies.

## Railway variables (admin-dashboard service)

**Option A — require MFA for every tenant admin (simplest for a single-pilot deploy):**

```
MFA_REQUIRED=true
```

**Option B — require MFA only for the pilot tenant UUID:**

```
MFA_REQUIRED_TENANT_IDS=YOUR-PILOT-TENANT-UUID
```

**Optional — also require for super_admin when global flag is on:**

```
MFA_REQUIRED=true
MFA_REQUIRED_FOR_SUPER_ADMIN=true
```

Also ensure codes can be delivered:

- **Email MFA:** `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (same as callout email)
- **SMS MFA:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` or messaging service SID

Redeploy after changing variables.

## Day-0 checklist (copy into pilot packet)

- [ ] Set `MFA_REQUIRED=true` **or** `MFA_REQUIRED_TENANT_IDS=<pilot uuid>` on Railway
- [ ] Confirm SMTP and/or Twilio work (send a test MFA setup code)
- [ ] Each pilot admin: Login → Account → enable MFA (email recommended)
- [ ] Confirm second login prompts for a code
- [ ] Confirm Disable MFA is hidden / rejected for those accounts

## API behavior (for support)

| Situation | Behavior |
|-----------|----------|
| Policy on, MFA off | `GET /me` → `mfa_required: true`, `requiresMfaSetup: true`. Other admin APIs → `403` `MFA_SETUP_REQUIRED` except `/me`, `/mfa/setup`, `/mfa/verify-setup`, `/change-password` |
| Policy on, MFA on | Normal login + MFA challenge; disable blocked with `403 MFA_REQUIRED` |
| Policy off | Unchanged optional MFA |

## Finding the pilot tenant UUID

Admin UI → Super Admin → tenant list, or SQL:

```sql
SELECT id, name FROM tenants ORDER BY name;
```
