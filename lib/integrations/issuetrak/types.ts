export type IssuetrakCategory =
  | "printer"
  | "password_reset"
  | "software"
  | "hardware"
  | "network"
  | "email_outlook"
  | "caretracker"
  | "sigmacare"
  | "sharepoint"
  | "other";

export type IssuetrakPriority = "normal" | "high" | "urgent";

export type CreateIssuetrakTicketInput = {
  subject: string;
  description: string;
  requesterEmail: string;
  requesterName: string;
  locationUnit: string;
  category: IssuetrakCategory;
  priority: IssuetrakPriority;
  assignedQueueId?: number;
};

export type CreateIssuetrakTicketOutput = {
  ticketId: string;
  ticketNumber: string;
  ticketUrl: string;
  status: "created" | "failed" | "dry_run";
  message?: string;
};

export class IssuetrakApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "IssuetrakApiError";
  }
}

export class IssuetrakValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string
  ) {
    super(message);
    this.name = "IssuetrakValidationError";
  }
}
