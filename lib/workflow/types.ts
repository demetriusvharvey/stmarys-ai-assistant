export type WorkflowStepStatus = "completed" | "warning" | "pending";

export type WorkflowStep = {
  name: string;
  label: string;
  status: WorkflowStepStatus;
  icon: "check" | "warning" | "pending";
};

export type WorkflowMetadata = {
  workflowId: string;
  workflowType: "document_creation";
  status: "completed";
  agentDisplayName: string;
  steps: WorkflowStep[];
};
