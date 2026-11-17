# NNN Lease Generator

A web app for the Listing Broker to generate, customize and route Triple Net leases for the Roger B. Chaffee Memorial Blvd. property. It stores everything in **Egnyte** and hands off to **DocuSign through Egnyte**.

**The 4-step wizard**

1. **Suite & Template.** Pick a suite from the master Excel list in `/Config`. The app fills in the street number, square feet and proportionate share (sq ft ÷ 159,600), then routes to **Lease CD (Shipping Docks, Buildings C & D)** or **Lease AB (Overhead Doors, Buildings A & B)** using the lease-type column. The column may say `CD`/`AB` (current labels) or the older `A`/`B`; the template files keep their original names (`Template_A_Shipping_Docks.docx` = Lease CD, `Template_B_Overhead_Doors.docx` = Lease AB).
2. **Tenant documents.** Choose **Renewal** (the app reads the existing lease from `Current Leases`) or **New Tenant** (an LOI or application from `Pending Deals`, or a file dragged in from your computer). Claude extracts the terms.
3. **Review & customize.** Edit any field next to a live clause preview. The app calculates monthly/annual rent, NNN additional rent (sq ft × rate ÷ 12), the total monthly payment, the term dates, the renewal option, 0–2 guarantors and the custom provisions.
4. **Generate & send.** The app merges the data into the template, converts it to PDF and saves both to `Draft Leases`. From there you can download it, upload an edited .docx, email it for review, or use **Open File in Egnyte to Send via DocuSign**.

The **dashboard** lists every deal. **Sync / File Executed Copy**, and the Egnyte webhook, file signed PDFs into `Executed New Leases` and email everyone a copy.

---

## 1. Try it locally (demo mode, about 2 minutes)

You need Node.js 20 or newer. For PDF previews, also install [LibreOffice](https://www.libreoffice.org/download/).

```bash
npm install
npm run dev          # http://localhost:3000
```

If `EGNYTE_CLIENT_ID` is not set, the app runs in **demo mode**. It skips login and reads and writes the local `demo-data/Leasing App` folder, which holds your GRCC workbook, the tagged templates, a sample LOI (Unit 3568) and a sample existing lease (Unit 3504). AI extraction also needs `ANTHROPIC_API_KEY` set in `.env.local`.

To test filing: generate a draft, copy its PDF in `demo-data/Leasing App/Draft Leases` to a name ending in `- Signed.pdf`, then click **Sync / File Executed Copy**.

---

## 2. Egnyte folder setup

The app works inside one root folder. The default is `/Shared/Documents/LEASING APP`; change it with `EGNYTE_ROOT`.

| Folder (inside the root) | Used for |
|---|---|
| `Config/` | Master workbook (`GRCC_Lease_Structure.xlsx`). The app also saves `_column-mapping.json` here. |
| `TEMPLATES/Tagged/Template_A_Shipping_Docks.docx` | Tagged Template A (path set by `TEMPLATE_A_PATH`) |
| `TEMPLATES/Tagged/Template_B_Overhead_Doors.docx` | Tagged Template B (path set by `TEMPLATE_B_PATH`) |
| `Current Leases/` | Executed leases, used for renewals |
| `Pending Deals (LOIs & Applications)/` | Incoming LOIs and tenant applications |
| `Draft Leases/` | Drafts the app creates (`Unit X - Tenant - Draft.docx/.pdf`) and the `_lease-app-data/` deal records |
| `Executed New Leases/` | `Unit X - Tenant - EXECUTED.pdf` |

Create any missing folders and upload the GRCC workbook to `Config`. Folder names are set by the `FOLDER_*` variables. `.env.example` and `render.yaml` already match your folders: `CONFIG`, `CURRENT LEASES`, `PENDING Deals LOIs & Applications`, `DRAFT LEASES`, `EXECUTED NEW LEASES`.

**Workbook columns.** The app finds the header row by itself (row 3 in your file) and maps `UNIT`, `TENANT`, `AREA` and `Lease A or B`. Rows that don't start with a number, such as the total row, are skipped. "VACANT", and any tenant entry starting with "LANDLORD" (e.g. "LANDLORD SOLAR STORAGE"), count as no current tenant; landlord-use suites are shown as "Landlord use · available". The street number is the first number in the unit, so "3506, 3508A" becomes 3506. If your headers change, use **Settings → Edit column mapping** (or the button in Step 1).

---

## 3. Egnyte OAuth (sign-in)

Brokers sign in with their own Egnyte account through the OAuth 2.0 Authorization Code flow. Sign-in goes to `https://gtmoran.egnyte.com`, so only users in your Egnyte domain can sign in. For an extra check, set `ALLOWED_EMAIL_DOMAINS`.

1. Go to <https://developers.egnyte.com>, sign in and **register an application key**.
2. Use the key type that supports the **Authorization Code** flow. If Egnyte only gives you an "internal" key (resource-owner/password flow), email `api-support@egnyte.com` and ask for Authorization Code access for your domain.
3. Set **Registered OAuth Redirect URI** to `https://YOUR-APP-URL/api/auth/callback`. Egnyte requires HTTPS, so use your Render URL or custom domain, not localhost.
4. Request the scopes `Egnyte.filesystem`, `Egnyte.user` and `Egnyte.webhooks`.
5. Put the **key** in `EGNYTE_CLIENT_ID` and the **secret** in `EGNYTE_CLIENT_SECRET`, and set `EGNYTE_DOMAIN=gtmoran`.

Egnyte API keys have rate limits (queries per second and per day). The app retries automatically when it's throttled. If several brokers use it heavily, ask Egnyte to raise the limits.

---

## 4. Anthropic API key (AI extraction)

1. Create a key at <https://console.anthropic.com> → **API Keys**.
2. Set `ANTHROPIC_API_KEY`. The model defaults to `claude-sonnet-5-5`. (The originally specified `claude-sonnet-4-20250514` was retired on June 15, 2026, and calls to it now fail.)

PDFs (including scans), Word files and photos are sent to Claude as they are. Claude returns structured terms through a forced tool call. For **renewals**, the app proposes the new commencement date as the day after the old lease ends, and the new rent as the final-year rent plus the escalation rate. You can edit all of it in Step 3.

---

## 5. Email

| `EMAIL_PROVIDER` | Setup |
|---|---|
| `resend` | Create a key at resend.com, verify your sending domain, and set `RESEND_API_KEY` and `EMAIL_FROM`. |
| `smtp` | For Microsoft 365: `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, plus `SMTP_USER`/`SMTP_PASS` (SMTP AUTH must be allowed for the mailbox). |
| `none` | The **Email draft** button opens your own email app (mailto) instead. Attach the downloaded PDF yourself. |

Draft emails go to the people you tick (Landlord `STucker@bradleyco.com`, Tenant, Tenant's broker, or anyone else). The signed-in broker is copied. Executed copies go to the landlord, the tenant, the tenant's broker and the broker who created the draft.

---

## 6. DocuSign through Egnyte

1. After generating, click **Open File in Egnyte to Send via DocuSign**. This opens the draft PDF in Egnyte.
2. In Egnyte, use the DocuSign integration to send it. Set the routing order to **Tenant = 1, Landlord = 2**, then guarantors as 3 and 4.
3. The templates contain white (invisible) anchor text: `\s1\ \d1\` (Tenant), `\s2\ \d2\` (Landlord), `\s3\ \d3\` and `\s4\ \d4\` (Guarantors). Use DocuSign **auto-place / anchor tags** to put signature and date fields on them.

**Filing the signed copy.** When DocuSign saves the completed PDF back into `Draft Leases`, any PDF there whose name matches `EXECUTED_FILE_PATTERN` (default `signed|completed|executed|docusign`) is copied to `Executed New Leases/Unit X - Tenant - EXECUTED.pdf` and emailed to everyone. This happens through:

- the **Sync / File Executed Copy** button on the dashboard, any time; or
- **automatically**, through the Egnyte webhook:
  1. Set `WEBHOOK_AUTH_SECRET` (Render can generate it).
  2. Sign in, open **Settings → Show my Egnyte token**, and paste the token into `EGNYTE_SERVICE_TOKEN`. The webhook has no user session, so it acts as this account. Use an account that can read and write the LEASING APP folders.
  3. Redeploy, then click **Settings → Register webhook**. Egnyte will then POST `fs:add_file` events for `Draft Leases` to `/api/webhooks/egnyte`.

Check what your DocuSign integration names the completed file. If it doesn't contain one of the pattern words, change `EXECUTED_FILE_PATTERN`.

---

## 7. Deploy on Render

1. Push this folder to a GitHub repository.
2. In Render, choose **New → Blueprint** and pick the repo. `render.yaml` creates a Docker web service with LibreOffice and Calibri-compatible fonts (Carlito), so the PDFs match Word's layout.
3. Fill in the variables marked `sync: false`. At minimum set `APP_URL`, `EGNYTE_CLIENT_ID`, `EGNYTE_CLIENT_SECRET` and `ANTHROPIC_API_KEY`. `SESSION_SECRET` and `WEBHOOK_AUTH_SECRET` are generated for you.
4. Use the **Starter** plan or higher, because LibreOffice needs more memory than the free plan offers.
5. When it's live, set `APP_URL` to the Render URL (for example `https://nnn-lease-app.onrender.com`). Add `https://nnn-lease-app.onrender.com/api/auth/callback` as the Egnyte redirect URI.

## 8. Custom subdomain (e.g. `leases.yourdomain.com`)

1. In Render, go to **Settings → Custom Domains → Add** and enter `leases.yourdomain.com`.
2. At your DNS provider, add a **CNAME** record from `leases` to the `*.onrender.com` host Render shows you. Render issues the HTTPS certificate automatically.
3. Change `APP_URL` to `https://leases.yourdomain.com` and redeploy.
4. Update the Egnyte key's redirect URI to `https://leases.yourdomain.com/api/auth/callback`.
5. If you set up the webhook, click **Register webhook** again so Egnyte calls the new URL.

---

## Templates and merge tags

Both templates use the same tags. Values are `{{FIELD}}`; conditional sections are `{#SECTION}…{/SECTION}`. The app converts these for docxtemplater before merging (`lib/merge.ts`). A conditional section's tags sit on their own lines, so the whole block, including its automatic number, disappears when the section is turned off.

`{{EFFECTIVE_DATE}} {{TERM_MONTHS}} {{TERM_MONTHS_WORDS}} {{COMMENCEMENT_DATE}} {{TERMINATION_DATE}} {{ANNIVERSARY_DATE}} {{FIRST_ESCALATION_DATE}} {{LAST_ESCALATION_DATE}} {{BUILDING_STREET_NUMBER}} {{SUITE_NUMBER}} {{RENTABLE_SQ_FT}} {{PROPORTIONATE_SHARE}} {{TENANT_LEGAL_NAME}} {{TENANT_NOTICE_ADDRESS}} {{TENANT_EMAIL}} {{TENANT_SIGNER_NAME}} {{TENANT_SIGNER_TITLE}} {{SOLE_PROP_BUSINESS_NAME}} {{SOLE_PROP_BUSINESS_TYPE}} {{LANDLORD_SIGNER_NAME}} {{LANDLORD_SIGNER_TITLE}} {{INITIAL_ANNUAL_RENT}} {{INITIAL_MONTHLY_RENT}} {{ESCALATION_RATE}} {{ESTIMATED_MONTHLY_ADDITIONAL_RENT}} {{ESTIMATED_ANNUAL_ADDITIONAL_RENT}} {{NNN_RATE}} {{NNN_YEAR}} {{TOTAL_INITIAL_MONTHLY_PAYMENT}} {{SECURITY_DEPOSIT}} {{RENEWAL_YEARS}} {{RENEWAL_START_DATE}} {{CUSTOM_PROVISIONS}} {{GUARANTOR_1_NAME}} {{GUARANTOR_1_ADDRESS}} {{GUARANTOR_2_NAME}} {{GUARANTOR_2_ADDRESS}}`

Sections: `IS_MID_MONTH_START` (set automatically when the Commencement Date isn't the 1st), `HAS_ESCALATION` / `ESC_NONE` / `ESC_ONE` / `ESC_MULTI` (set from how many Rent increases fall within the Term), `HAS_RENEWAL_OPTION` (Clause 3 also uses the inverted form `{^HAS_RENEWAL_OPTION}…{/HAS_RENEWAL_OPTION}` for the no-option wording), `HAS_CUSTOM_PROVISIONS`, `HAS_GUARANTORS`, `HAS_SECOND_GUARANTOR`, `IS_INDIVIDUAL_TENANT` (adds Exhibit A, the notarized Sworn Statement of Business Purpose referenced in Section 38).

The templates already contain `$` and `%`, so the app sends plain numbers (`36,000.00`, `3`). Exhibit A prints only when “Tenant is an individual / sole proprietor” is switched on in Step 3; a missing business name or guarantor address prints as a blank line to fill in by hand.

**Signatures and guaranty.** With guarantors, a full Guaranty paragraph starts on its own page (consent to renewals, amendments, holdover and assignment; guaranty of payment, not just collection; waiver of notice and suretyship defenses), followed by a signature line (DocuSign anchors `\s3\`/`\d3\`, `\s4\`/`\d4\`), printed name and address for each guarantor. Exhibit A is signed by hand before a notary and is not part of the DocuSign routing.

**Term dates (Clause 2).** The Term is always in months, written in words and digits ("thirty-six (36) months"). For a lease starting on the 1st, the Termination Date is the commencement date + months − 1 day, and the Anniversary Date is the commencement day. For a mid-month start, the Term also includes the partial first month: the months count from the 1st of the next month, the Anniversary Date is that 1st, and Clause 2 adds the mid-month sentence. In both cases the first escalation is one year after the first full month begins. Any of these dates can be overridden in Step 3.

**Rent escalation wording.** The app counts the escalation dates (first escalation, then every 12 months) that fall on or before the Termination Date. Clauses 2, 3, 4(a), 4(d) and 5 then use the matching wording: no increase (Base Rent fixed; Clause 5 points to Sections 3 and 28), exactly one increase (stated with its date), or two or more (each year, with the first and final dates). Clause 28 sets holdover rent at 150% of the Base Rent plus all Additional Rent (including PM).

## Project layout

```
app/                Pages (dashboard, wizard, settings, login) and API routes
app/api/            auth · suites · files · extract · generate · drafts · email · sync · webhooks
components/         UI: wizard steps, dashboard, settings, column-mapping modal
lib/                config, Egnyte client + local demo storage, Excel parsing, AI extraction,
                    merge, PDF conversion, deal records, executed-lease filing, email
demo-data/          Local stand-in for the Egnyte LEASING APP folder (demo mode)
Dockerfile, render.yaml, .env.example
```
