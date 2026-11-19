// Server-side configuration, read from environment variables.
// Every value has a sensible default so `npm run dev` works in demo mode.

const env = (k: string, d = "") => (process.env[k] ?? d).trim();
const DEMO = env("DEMO_MODE", "") === "true" || !env("EGNYTE_CLIENT_ID");

export const config = {
  appUrl: env("APP_URL", "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: env("SESSION_SECRET", "dev-only-insecure-secret-change-me-please-32chars"),

  /** DEMO_MODE=true uses ./demo-data instead of Egnyte and skips login. */
  demoMode: DEMO,

  egnyte: {
    domain: env("EGNYTE_DOMAIN", "gtmoran"),
    clientId: env("EGNYTE_CLIENT_ID"),
    clientSecret: env("EGNYTE_CLIENT_SECRET"),
    scopes: env("EGNYTE_SCOPES", "Egnyte.filesystem Egnyte.user Egnyte.webhooks"),
    /** Long-lived token used by the webhook (no user session there). */
    serviceToken: env("EGNYTE_SERVICE_TOKEN"),
    /** Optional: only these email domains may sign in (comma separated). */
    allowedEmailDomains: env("ALLOWED_EMAIL_DOMAINS")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  },

  // Defaults match the real Egnyte folders (Y:\Shared\Documents\LEASING APP); demo mode
  // uses the sample folder names inside ./demo-data. Any of these can be overridden in .env.
  folders: {
    /** Egnyte path of the "Leasing App" root folder. */
    root: env("EGNYTE_ROOT", "/Shared/Documents/LEASING APP").replace(/\/$/, ""),
    config: env("FOLDER_CONFIG", DEMO ? "Config" : "CONFIG"),
    currentLeases: env("FOLDER_CURRENT_LEASES", DEMO ? "Current Leases" : "CURRENT LEASES"),
    pendingDeals: env("FOLDER_PENDING_DEALS", DEMO ? "Pending Deals (LOIs & Applications)" : "PENDING Deals LOIs & Applications"),
    drafts: env("FOLDER_DRAFTS", DEMO ? "Draft Leases" : "DRAFT LEASES"),
    executed: env("FOLDER_EXECUTED", DEMO ? "Executed New Leases" : "EXECUTED NEW LEASES"),
  },

  templates: {
    A: env("TEMPLATE_A_PATH", DEMO ? "Templates/Template_A_Shipping_Docks.docx" : "TEMPLATES/Tagged/Template_A_Shipping_Docks.docx"),
    B: env("TEMPLATE_B_PATH", DEMO ? "Templates/Template_B_Overhead_Doors.docx" : "TEMPLATES/Tagged/Template_B_Overhead_Doors.docx"),
  },

  /** Optional exact file name of the master workbook inside the Config folder. */
  configWorkbook: env("CONFIG_WORKBOOK"),

  lease: {
    totalBuildingSqFt: Number(env("TOTAL_BUILDING_SQFT", "159600")),
    defaultNnnRate: Number(env("DEFAULT_NNN_RATE", "2.65")),
    /** Landlord's address offered on the "Email draft for review" screen (optional). */
    landlordReviewEmail: env("LANDLORD_REVIEW_EMAIL"),
    landlordSignerName: env("LANDLORD_SIGNER_NAME"),
    landlordSignerTitle: env("LANDLORD_SIGNER_TITLE"),
    /** Default email for the Landlord signer in "Send for signature". */
    landlordSignerEmail: env("LANDLORD_SIGNER_EMAIL"),
    /** Property management: receive fully executed copies only (never drafts). */
    propertyManagerEmails: env("PROPERTY_MANAGER_EMAILS", "STucker@bradleyco.com,cbix@bradleyco.com")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    /** Extra recipients for tenant-application alerts (the broker who made the link always gets one). */
    applicationAlertEmails: env("APPLICATION_ALERT_EMAILS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },

  anthropic: {
    apiKey: env("ANTHROPIC_API_KEY"),
    // claude-sonnet-4-20250514 was retired on June 15, 2026; claude-sonnet-5-5 is its replacement.
    model: env("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
  },

  email: {
    provider: env("EMAIL_PROVIDER", "none") as "resend" | "smtp" | "none",
    from: env("EMAIL_FROM"),
    resendApiKey: env("RESEND_API_KEY"),
    smtp: {
      host: env("SMTP_HOST"),
      port: Number(env("SMTP_PORT", "587")),
      user: env("SMTP_USER"),
      pass: env("SMTP_PASS"),
      secure: env("SMTP_SECURE", "") === "true",
    },
  },

  webhookSecret: env("WEBHOOK_AUTH_SECRET"),
  /** Regex (case-insensitive) that marks a PDF in Draft Leases as the signed copy. */
  executedPattern: env("EXECUTED_FILE_PATTERN", "signed|completed|executed|docusign"),
  libreOfficePath: env("LIBREOFFICE_PATH"),
};

export function folderPath(key: keyof Omit<typeof config.folders, "root">): string {
  return `${config.folders.root}/${config.folders[key]}`;
}

export function rootPath(rel: string): string {
  return rel.startsWith("/") ? rel : `${config.folders.root}/${rel}`;
}

/** Folder (inside Draft Leases) holding the JSON record for each deal. */
export const META_FOLDER = "_lease-app-data";

/** True when `p` is a path inside the Leasing App root with no "." / ".." segments. */
export function isInsideRoot(p: string): boolean {
  if (!p.startsWith(config.folders.root + "/")) return false;
  return !p.split("/").some((seg) => seg === ".." || seg === ".");
}
