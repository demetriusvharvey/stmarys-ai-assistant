import type {
  CreateIssuetrakTicketInput,
  CreateIssuetrakTicketOutput,
} from "./types";
import { IssuetrakApiError, IssuetrakValidationError } from "./types";
import { resolveCategory } from "./categoryResolver";

const PASSWORD_PATTERN = /\b(password|passwd|pw|pin)\s*[=:\-]?\s*\S+/gi;

function scrubPasswords(text: string): { scrubbed: string; found: boolean } {
  let found = false;
  const scrubbed = text.replace(PASSWORD_PATTERN, () => {
    found = true;
    return "[PASSWORD REDACTED]";
  });
  return { scrubbed, found };
}

function validateInput(input: CreateIssuetrakTicketInput): void {
  if (!input.subject || input.subject.trim().length < 5) {
    throw new IssuetrakValidationError("Subject must be at least 5 characters.", "subject");
  }
  if (!input.description || input.description.trim().length < 10) {
    throw new IssuetrakValidationError("Description must be at least 10 characters.", "description");
  }
  if (!input.requesterEmail) {
    throw new IssuetrakValidationError("Requester email is required.", "requesterEmail");
  }
  if (!input.locationUnit || input.locationUnit.trim().length < 2) {
    throw new IssuetrakValidationError("Location/unit is required.", "locationUnit");
  }
}

export class IssuetrakClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiVersion: string;
  private readonly defaultQueueId: number;
  private readonly defaultPriorityId: number;
  private readonly highPriorityId: number;
  private readonly submitterUserId: number;

  constructor() {
    this.baseUrl = process.env.ISSUETRAK_BASE_URL ?? "";
    this.apiKey = process.env.ISSUETRAK_API_KEY ?? "";
    this.apiVersion = process.env.ISSUETRAK_API_VERSION ?? "v1";
    this.defaultQueueId = parseInt(process.env.ISSUETRAK_DEFAULT_QUEUE_ID ?? "0", 10);
    this.defaultPriorityId = parseInt(process.env.ISSUETRAK_DEFAULT_PRIORITY_ID ?? "3", 10);
    this.highPriorityId = parseInt(process.env.ISSUETRAK_HIGH_PRIORITY_ID ?? "1", 10);
    this.submitterUserId = parseInt(process.env.ISSUETRAK_SUBMITTER_USER_ID ?? "0", 10);
  }

  private isEnabled(): boolean {
    return process.env.ISSUETRAK_ENABLED === "true";
  }

  private getPriorityId(priority: CreateIssuetrakTicketInput["priority"]): number {
    if (priority === "urgent" || priority === "high") return this.highPriorityId;
    return this.defaultPriorityId;
  }

  async createIssue(input: CreateIssuetrakTicketInput): Promise<CreateIssuetrakTicketOutput> {
    validateInput(input);

    // Scrub passwords from subject and description
    const { scrubbed: cleanSubject, found: pwInSubject } = scrubPasswords(input.subject);
    const { scrubbed: cleanDesc, found: pwInDesc } = scrubPasswords(input.description);
    if (pwInSubject || pwInDesc) {
      console.warn("[IssuetrakClient] Password pattern detected and redacted from ticket fields.");
    }

    const categoryResolution = resolveCategory(`${cleanSubject} ${cleanDesc}`);
    const queueId = input.assignedQueueId ?? this.defaultQueueId;
    const priorityId = this.getPriorityId(input.priority);

    // Dry-run mode when feature flag is off
    if (!this.isEnabled()) {
      return {
        ticketId: "dry-run",
        ticketNumber: "DRY-RUN",
        ticketUrl: "#",
        status: "dry_run",
        message: "Issuetrak integration not yet enabled. Ticket would have been submitted.",
      };
    }

    if (!this.baseUrl || !this.apiKey) {
      throw new IssuetrakApiError("Issuetrak is not configured (missing ISSUETRAK_BASE_URL or ISSUETRAK_API_KEY).");
    }

    const body = {
      Subject: cleanSubject.slice(0, 120),
      IssueDescription: cleanDesc,
      SubmitterID: this.submitterUserId,
      SubtypeID: categoryResolution.subtypeId,
      PriorityID: priorityId,
      QueueID: queueId,
      SendEmailNotification: false,
      CustomFields: [
        { FieldName: "SubmitterEmail", Value: input.requesterEmail },
        { FieldName: "SubmitterName",  Value: input.requesterName || "St. Mary's Staff" },
        { FieldName: "Location",       Value: input.locationUnit },
        { FieldName: "SubmittedVia",   Value: "AI Workforce" },
      ],
    };

    let res: Response;
    try {
      res = await fetch(
        `${this.baseUrl}/api/v2/Issues`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        }
      );
    } catch (err) {
      throw new IssuetrakApiError(
        "Unable to reach Issuetrak (network error or timeout).",
        0,
        err
      );
    }

    if (res.status === 429) {
      // Retry once after 2 seconds
      await new Promise((r) => setTimeout(r, 2000));
      res = await fetch(`${this.baseUrl}/api/v2/Issues`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    }

    if (!res.ok) {
      let errorBody: unknown;
      try { errorBody = await res.json(); } catch { errorBody = null; }
      throw new IssuetrakApiError(
        `Issuetrak API error: HTTP ${res.status}`,
        res.status,
        errorBody
      );
    }

    const data = (await res.json()) as { IssueID?: number; IssueNumber?: string };
    const ticketId = String(data.IssueID ?? "unknown");
    const ticketNumber = data.IssueNumber ?? `INC-${ticketId}`;
    const ticketUrl = `${this.baseUrl}/Issues/Detail/${ticketId}`;

    return {
      ticketId,
      ticketNumber,
      ticketUrl,
      status: "created",
    };
  }
}
