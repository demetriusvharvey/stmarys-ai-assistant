export type DeidentifyResult = {
  cleanText: string;
  findings: {
    type: string;
    count: number;
  }[];
};

const PHI_PATTERNS: { type: string; regex: RegExp; replacement: string }[] = [
  {
    type: "email",
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[EMAIL]",
  },
  {
    type: "phone",
    regex: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[PHONE]",
  },
  {
    type: "ssn",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[SSN]",
  },
  {
    type: "date_of_birth",
    regex: /\b(?:DOB|D\.O\.B\.|Date of Birth)\s*[:\-]?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,
    replacement: "[DOB]",
  },
  {
    type: "mrn",
    regex: /\b(?:MRN|Medical Record Number|Resident ID|Patient ID|Client ID)\s*[:\-#]?\s*[A-Z0-9-]{3,}\b/gi,
    replacement: "[ID]",
  },
  {
    type: "address",
    regex:
      /\b\d{1,6}\s+[A-Za-z0-9\s.'-]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Circle|Cir|Court|Ct|Boulevard|Blvd)\b/gi,
    replacement: "[ADDRESS]",
  },
];

export function deIdentifyText(input: string): DeidentifyResult {
  let cleanText = input || "";
  const findingsMap = new Map<string, number>();

  for (const pattern of PHI_PATTERNS) {
    let count = 0;

    cleanText = cleanText.replace(pattern.regex, () => {
      count++;
      return pattern.replacement;
    });

    if (count > 0) {
      findingsMap.set(pattern.type, (findingsMap.get(pattern.type) || 0) + count);
    }
  }

  cleanText = cleanText
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, "[DATE]")
    .replace(/\s{3,}/g, " ")
    .trim();

  return {
    cleanText,
    findings: Array.from(findingsMap.entries()).map(([type, count]) => ({
      type,
      count,
    })),
  };
}

export function sanitizeFilenameForLogs(filename: string): string {
  return (filename || "Unknown file")
    .replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, "[NAME]")
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, "[DATE]")
    .replace(/\b(?:MRN|Resident ID|Patient ID|Client ID)[\s:_-]*[A-Z0-9-]+/gi, "[ID]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]");
}

export function sanitizeErrorMessage(message: string): string {
  return sanitizeFilenameForLogs(message || "Failed to process file")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "[PHONE]");
}