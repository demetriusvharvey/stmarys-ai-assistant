import type { IssuetrakCategory } from "./types";

const CATEGORY_KEYWORDS: Record<IssuetrakCategory, string[]> = {
  printer: ["printer", "scanner", "copier", "print", "fax"],
  password_reset: ["password", "passwd", "reset password", "locked out", "can't log in", "login issue", "account locked"],
  software: ["software", "application", "app", "program", "install", "uninstall", "update", "crash", "error message", "not working"],
  hardware: ["hardware", "computer", "laptop", "desktop", "monitor", "screen", "keyboard", "mouse", "device", "broken", "won't turn on", "won't start"],
  network: ["network", "wifi", "wi-fi", "internet", "connection", "connected", "ethernet", "vpn", "slow internet", "no internet"],
  email_outlook: ["email", "outlook", "teams", "calendar", "mailbox", "inbox", "onedrive"],
  caretracker: ["caretracker", "care tracker"],
  sigmacare: ["sigmacare", "sigma care", "sigma"],
  sharepoint: ["sharepoint", "share point", "onedrive", "one drive"],
  other: [],
};

export type CategoryResolution = {
  category: IssuetrakCategory;
  label: string;
  subtypeId: number;
};

const CATEGORY_LABELS: Record<IssuetrakCategory, string> = {
  printer: "Printer / Scanner / Copier",
  password_reset: "Account / Password Reset",
  software: "Software / Application Issue",
  hardware: "Hardware / Device Issue",
  network: "Network / Wi-Fi / Connectivity",
  email_outlook: "Email / Outlook / Teams",
  caretracker: "CareTracker Issue",
  sigmacare: "SigmaCare Issue",
  sharepoint: "SharePoint / OneDrive",
  other: "General IT Request",
};

function getCategoryMap(): Record<IssuetrakCategory, number> {
  const raw = process.env.ISSUETRAK_CATEGORY_MAP;
  if (!raw) {
    return {
      printer: 0, password_reset: 0, software: 0, hardware: 0,
      network: 0, email_outlook: 0, caretracker: 0, sigmacare: 0,
      sharepoint: 0, other: 0,
    };
  }
  try {
    return JSON.parse(raw) as Record<IssuetrakCategory, number>;
  } catch {
    return {
      printer: 0, password_reset: 0, software: 0, hardware: 0,
      network: 0, email_outlook: 0, caretracker: 0, sigmacare: 0,
      sharepoint: 0, other: 0,
    };
  }
}

export function resolveCategory(text: string): CategoryResolution {
  const lower = text.toLowerCase();
  const map = getCategoryMap();

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [IssuetrakCategory, string[]][]) {
    if (cat === "other") continue;
    if (keywords.some((kw) => lower.includes(kw))) {
      return { category: cat, label: CATEGORY_LABELS[cat], subtypeId: map[cat] };
    }
  }

  return { category: "other", label: CATEGORY_LABELS.other, subtypeId: map.other };
}

export function getCategoryLabel(cat: IssuetrakCategory): string {
  return CATEGORY_LABELS[cat] ?? "General IT Request";
}
