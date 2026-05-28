import { randomUUID } from "crypto";
import type { WorkflowMetadata, WorkflowStep } from "./types";

export function buildTicketCreationWorkflow(
  agentDisplayName: string,
  phase: "confirmation" | "created",
  ticketNumber?: string
): WorkflowMetadata {
  const steps: WorkflowStep[] = [
    {
      name: "request_received",
      label: "Request received",
      status: "completed",
      icon: "check",
    },
    {
      name: "issue_summarized",
      label: "Issue summarized",
      status: "completed",
      icon: "check",
    },
    {
      name: "details_collected",
      label: "Details collected",
      status: "completed",
      icon: "check",
    },
    {
      name: "confirmation_required",
      label: phase === "confirmation" ? "Confirmation required before submitting" : "Confirmed",
      status: phase === "confirmation" ? "warning" : "completed",
      icon: phase === "confirmation" ? "warning" : "check",
    },
    {
      name: "ticket_created",
      label:
        phase === "created" && ticketNumber
          ? `Ticket ${ticketNumber} created`
          : "Ticket created in Issuetrak",
      status: phase === "created" ? "completed" : "pending",
      icon: phase === "created" ? "check" : "pending",
    },
    {
      name: "delivered",
      label: "Ticket number delivered",
      status: phase === "created" ? "completed" : "pending",
      icon: phase === "created" ? "check" : "pending",
    },
  ];

  return {
    workflowId: randomUUID(),
    workflowType: "ticket_creation",
    status: "completed",
    agentDisplayName,
    steps,
  };
}
