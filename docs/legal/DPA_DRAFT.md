# Data Processing Agreement — DRAFT

**DRAFT — FOR COUNSEL REVIEW. NOT AN EXECUTED CONTRACT.**  
Attach as Exhibit A to the MSA / pilot form.

**Controller:** Customer (security company / employer using ABE Guard)  
**Processor:** ABE Security (“Processor”)  
**Subject matter:** Hosting and processing of workforce scheduling and communications data in the ABE Guard platform  
**Duration:** Term of the MSA / pilot plus deletion/return period  

---

## 1. Roles

Customer determines the purposes and means of processing Personal Data in the Service (Controller). Processor processes Personal Data only on documented instructions from Customer (including configuration in the Service and this DPA), unless required by law.

## 2. Categories of data subjects & data

- **Data subjects:** Customer’s employees/contractors (guards), admins/supervisors, and message participants.  
- **Personal data:** Identifiers (name, email, phone), account credentials (hashed), scheduling/timekeeping, callout/swap records, messages, consent/preference flags, approximate location if used for sites/geofencing, technical logs.  
- **Special categories:** Not intended. Customer will not upload health/PHI or other special-category data unless a separate BAA/HIPAA agreement is executed.

## 3. Processor obligations

Processor will:

1. Process Personal Data only for providing, securing, and supporting the Service.  
2. Ensure persons authorized to process Personal Data are bound by confidentiality.  
3. Implement appropriate technical and organizational measures (TLS, access control, password hashing, tenant isolation, optional admin MFA, backups).  
4. Engage sub-processors (hosting, SMS/voice, email, AI APIs) under written terms imposing data protection obligations no less protective than this DPA; maintain a reasonable list on request.  
5. Assist Customer with data subject requests, security incidents, and DPIAs where reasonably feasible given the nature of processing.  
6. Delete or return Personal Data after the MSA ends, subject to legal retention and backup cycles.  
7. Make available information reasonably necessary to demonstrate compliance (e.g. questionnaire responses, high-level security summary). Formal audits by mutual agreement and not more than annually.

## 4. Customer instructions & compliance

Customer is responsible for the lawfulness of Personal Data uploaded to the Service, worker notices/consents (including SMS/voice), and admin user permissions within its tenant.

## 5. International transfers

Personal Data may be processed in the United States (or other regions used by sub-processors). Where required, parties will use appropriate transfer mechanisms (e.g. SCCs) as advised by counsel.

## 6. Security incidents

Processor will notify Customer without undue delay after becoming aware of a Personal Data breach affecting Customer’s tenant, and provide information reasonably available to help Customer meet legal duties.

## 7. Sub-processors (illustrative)

May include: cloud host (e.g. Railway/Vercel), managed Postgres, Redis, Twilio (SMS/voice), email SMTP provider, OpenAI and/or DeepSeek (AI features when enabled). Customer authorizes these categories; Processor will notify of material changes when practicable.

## 8. Order of precedence

If this DPA conflicts with the MSA on data protection, this DPA controls for that topic.

---

**Controller:** _________________________ Date: _______  
**Processor:** _________________________ Date: _______
