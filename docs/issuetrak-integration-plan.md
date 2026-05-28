# Issuetrak IT Ticket Creation — Integration Plan

**Status:** Planning only. No code written. No tickets created. Observe-only.  
**Target:** IT Support Agent → `createIssuetrakTicket` tool → real Issuetrak ticket  
**Date:** 2026-05-27

---

## 1. Architecture Overview

```
User message
    │
    ▼
AgentRouter → it_support
    │
    ▼
ITSupportAgent.answer()
    │
    ├─ Detect ticket intent (new keywords: "submit ticket", "open a ticket", "log an issue", etc.)
    │
    ├─ Extract fields from user message (subject, description, location, category, priority)
    │
    ├─ Clarifying question loop (if required fields missing)
    │
    ├─ PHI/password scrub via deIdentifyText()
    │
    ├─ Build confirmation summary → emit to UI
    │
    └─ On user confirmation:
         ToolRegistry.call("createIssuetrakTicket", payload, context)
              │
              └─ IssuetrakClient.createIssue(payload) → POST /api/v1/Issues
                   │
                   └─ Returns ticketId, ticketUrl
    │
    ▼
AgentResponse with ticketId, ticketUrl, workflowMetadata
    │
    ▼
SSE done event → WorkflowPanel renders ticket_creation steps
```

The confirmation step happens **inside the conversation** — the agent returns a "confirmation required" answer with a summary card. The user replies "yes" or "confirm" and the agent proceeds. No modal, no separate UI component required in Phase 1.

---

## 2. Required Environment Variables

| Variable | Purpose | Example |
|---|---|---|
| `ISSUETRAK_BASE_URL` | Full base URL to the Issuetrak instance | `https://helpdesk.stmaryscare.org` |
| `ISSUETRAK_API_KEY` | API key for authentication | `sk_prod_...` |
| `ISSUETRAK_API_VERSION` | API version path segment | `v1` |
| `ISSUETRAK_DEFAULT_QUEUE_ID` | Queue/team ID for IT tickets | `12` |
| `ISSUETRAK_DEFAULT_PRIORITY_ID` | Default priority ID (Normal) | `3` |
| `ISSUETRAK_HIGH_PRIORITY_ID` | Priority ID for urgent/high tickets | `1` |
| `ISSUETRAK_CATEGORY_MAP` | JSON map of friendly → SubtypeID | See §3.3 |
| `ISSUETRAK_SUBMITTER_USER_ID` | Issuetrak user ID for AI-submitted tickets | `999` |
| `ISSUETRAK_ENABLED` | Feature flag, `"true"` to enable | `"false"` (default off) |

All values are injected via `.env.local` (dev) and Vercel/Azure App Service environment config (prod). None are committed to the repo.

---

## 3. Tool Definition: `createIssuetrakTicket`

### 3.1 Tool Registration (toolDefinitions.ts addition)

```typescript
{
  name: "createIssuetrakTicket",
  description: "Create an IT support ticket in Issuetrak on behalf of a staff member.",
  readOnly: false,           // mutating — creates a record
  risk: "medium",
  allowedAgents: ["it_support"],
  allowedRoles: ["staff", "it_staff", "admin"],
  requiresConfirmation: true,  // MUST show summary before executing
  run: createIssuetrakTicketRun,
}
```

### 3.2 Input Shape

```typescript
type CreateIssuetrakTicketInput = {
  subject: string;           // required — 5–120 chars
  description: string;       // required — free text, PHI-scrubbed before this point
  requesterEmail: string;    // required — from identity.email
  requesterName: string;     // from identity.displayName, fallback "St. Mary's Staff"
  locationUnit: string;      // required — e.g. "2nd Floor Nurses Station", "Admin Office"
  category: IssuetrakCategory;  // required — see §3.3
  priority: "normal" | "high" | "urgent";  // default "normal"
  assignedQueueId?: number;  // default ISSUETRAK_DEFAULT_QUEUE_ID
};
```

### 3.3 Category Mapping

The agent maps user-described issues to Issuetrak SubtypeIDs. Initial mapping:

| Friendly Label | Maps To | SubtypeID (configure) |
|---|---|---|
| `printer` | Printer / Scanner / Copier | TBD |
| `password_reset` | Account / Password Reset | TBD |
| `software` | Software / Application Issue | TBD |
| `hardware` | Hardware / Device Issue | TBD |
| `network` | Network / Wi-Fi / Connectivity | TBD |
| `email_outlook` | Email / Outlook / Teams | TBD |
| `caretracker` | CareTracker Issue | TBD |
| `sigmacare` | SigmaCare Issue | TBD |
| `sharepoint` | SharePoint / OneDrive | TBD |
| `other` | General IT Request | TBD |

SubtypeIDs must be confirmed against the actual St. Mary's Issuetrak instance before go-live. They will be stored in `ISSUETRAK_CATEGORY_MAP` as a JSON string:
```
ISSUETRAK_CATEGORY_MAP={"printer":14,"password_reset":7,"software":3,...}
```

### 3.4 Output Shape

```typescript
type CreateIssuetrakTicketOutput = {
  ticketId: string;
  ticketNumber: string;    // human-readable, e.g. "INC-4821"
  ticketUrl: string;       // direct link to ticket in Issuetrak
  status: "created" | "failed";
  issuetrakRawResponse?: unknown;  // stored in audit only, not surfaced to UI
};
```

---

## 4. Issuetrak API Integration

### 4.1 Authentication

Issuetrak API v1 uses a static API key passed as a header:

```
X-IssueTrak-API-Key: {ISSUETRAK_API_KEY}
Content-Type: application/json
```

No OAuth, no session cookie. Key must be generated in Issuetrak Admin → API Keys.

### 4.2 Create Issue Endpoint

```
POST {ISSUETRAK_BASE_URL}/api/v1/Issues
```

Minimum required body (fields confirmed from Issuetrak v1 docs):

```json
{
  "Subject": "Printer not working — 2nd Floor",
  "IssueDescription": "The printer near the nurses station is showing an error...",
  "SubmitterID": 999,
  "SubtypeID": 14,
  "PriorityID": 3,
  "SendEmailNotification": false,
  "CustomFields": [
    { "FieldName": "SubmitterEmail", "Value": "jsmith@stmaryscare.org" },
    { "FieldName": "Location",       "Value": "2nd Floor Nurses Station" },
    { "FieldName": "SubmittedVia",   "Value": "AI Workforce" }
  ]
}
```

Success response: HTTP 201 with body `{ "IssueID": 4821, "IssueNumber": "INC-4821" }`

### 4.3 IssuetrakClient (new file: `lib/integrations/issuetrak/client.ts`)

Responsibilities:
- Hold base URL + API key
- Expose `createIssue(input)` → `Promise<CreateIssuetrakTicketOutput>`
- Map friendly input shape → Issuetrak API body shape
- Map Issuetrak response → output shape
- Throw typed errors (`IssuetrakApiError`) for non-2xx responses
- Never log raw request bodies (PHI risk)
- Log only: ticketId, status code, category, priority (to audit)

### 4.4 Category Resolution (new file: `lib/integrations/issuetrak/categoryResolver.ts`)

The `ITSupportAgent` or the `createIssuetrakTicket` tool runner calls `resolveCategory(userDescription)` which:
1. Checks for exact keyword matches from IT_KEYWORDS list
2. If ambiguous, defaults to `"other"`
3. Returns `{ label, subtypeId }`

---

## 5. Required Ticket Fields and Clarifying Question Flow

### 5.1 Field Extraction Strategy

The `ITSupportAgent` will use a lightweight field extractor (GPT-4o-mini prompt, not a full RAG call) to pull structured fields from the user's free-text request. This happens before calling the tool.

Fields and extraction rules:

| Field | Source | Fallback |
|---|---|---|
| `subject` | AI-extracted from message | "IT Support Request" |
| `description` | Full cleaned user message | required |
| `requesterEmail` | `identity.email` | **block — must ask** |
| `requesterName` | `identity.displayName` | "St. Mary's Staff" |
| `locationUnit` | AI-extracted from message | **ask if missing** |
| `category` | AI-extracted via keyword match | `"other"` |
| `priority` | AI-extracted ("urgent", "ASAP", "emergency") | `"normal"` |

### 5.2 Clarifying Question Flow

The agent checks for missing required fields before proceeding. It asks **one question at a time**, not all at once.

```
Priority order of clarifying questions:
1. "What's your email address?" (only if identity.email is null)
2. "Which location or unit are you in?" (if locationUnit is empty)
3. "Can you describe what's happening in a bit more detail?" (if description < 20 chars)
```

If all required fields are present, skip directly to step 6 (confirmation).

The agent will NOT ask for:
- Category (auto-detected)
- Priority (auto-detected, defaults to normal)
- Queue (always uses default IT queue)

### 5.3 Conversation State

The `ITSupportAgent` will maintain a partial ticket state across conversation turns using the `conversationHistory` already present in `AgentRequest`. It reads prior turns to recover already-provided field values rather than re-asking.

---

## 6. Human Confirmation Step

Before calling the tool, the agent returns a **confirmation answer** (no tool call yet). The answer includes a structured summary rendered as a pre-submit card.

### 6.1 Confirmation Answer Format

The agent returns this as its `answer` string (rendered via ReactMarkdown in the UI):

```markdown
## Ticket Ready to Submit

Here's what will be submitted to IT:

| Field | Value |
|---|---|
| **Subject** | Printer not working — 2nd Floor |
| **Description** | The printer near the nurses station is showing "Paper Jam" but the paper tray is empty. This has been happening since this morning. |
| **Submitted by** | Jane Smith (jsmith@stmaryscare.org) |
| **Location** | 2nd Floor Nurses Station |
| **Category** | Printer / Scanner |
| **Priority** | Normal |
| **Queue** | IT Support |

Reply **yes** or **confirm** to submit, or tell me what to change.
```

### 6.2 Confirmation Detection

In the next user turn, `ITSupportAgent` checks if the message is a confirmation:
- Positive: "yes", "confirm", "go ahead", "submit it", "looks good", "ok", "correct"
- Negative: "no", "cancel", "stop", "change", "wrong", "edit"
- Ambiguous: re-ask

On positive confirmation, the agent calls `ToolRegistry.call("createIssuetrakTicket", ...)`.

### 6.3 Conversation State for Confirmation

The partial ticket payload is re-derived from conversation history on each turn (no server-side session). The field extractor re-runs over all prior turns to reconstruct the full payload. This avoids the need for any database session state in Phase 1.

---

## 7. Workflow Metadata: `ticket_creation`

### 7.1 New Workflow Type

`lib/workflow/types.ts` — add:
```typescript
export type WorkflowMetadata = {
  workflowId: string;
  workflowType: "document_creation" | "ticket_creation";  // extended
  ...
};
```

### 7.2 Workflow Steps for Ticket Creation

| Step name | Label | Status |
|---|---|---|
| `request_received` | Request received | completed |
| `issue_summarized` | Issue summarized | completed |
| `details_collected` | Details collected | completed |
| `confirmation_required` | Confirmation required before submitting | warning |
| `ticket_created` | Ticket created in Issuetrak | completed (or pending) |
| `delivered` | Ticket number delivered | completed |

The `confirmation_required` step renders as a warning (amber ⚠) identical to `review_required` in the document workflow. Once the user confirms and the ticket is created, a follow-up message replaces `confirmation_required` with `completed` and `ticket_created` with the ticket number.

### 7.3 Factory Function

New file: `lib/workflow/ticketCreation.ts`

```typescript
export function buildTicketCreationWorkflow(
  agentDisplayName: string,
  phase: "confirmation" | "created",
  ticketNumber?: string
): WorkflowMetadata
```

Phase `"confirmation"` → `ticket_created` step is pending.  
Phase `"created"` → all steps completed, `ticket_created` label becomes `"Ticket ${ticketNumber} created"`.

---

## 8. Permissions

### 8.1 Role Matrix

| Role | Can request ticket creation | Can view ticket status | Can update/triage tickets | Can configure category maps |
|---|---|---|---|---|
| `staff` | ✓ (own requests only) | own tickets only | ✗ | ✗ |
| `it_staff` | ✓ | all tickets | ✓ | ✗ |
| `admin` | ✓ | all tickets | ✓ | ✓ |
| `service` | ✗ | ✗ | ✗ | ✗ |

### 8.2 Tool Permission Rules

```typescript
{
  name: "createIssuetrakTicket",
  allowedAgents: ["it_support"],
  allowedRoles: ["staff", "it_staff", "admin"],
  requiresConfirmation: true,
  readOnly: false,
  risk: "medium",
}
```

`service` accounts (bot-to-bot calls) are **not** permitted to create tickets — they have no requester context.

### 8.3 Observe-Only Mode (Phase 1)

The tool is registered with `observeOnly: true` (same as all current tools). In observe-only mode:
- Permission decision is evaluated and logged
- `wouldAllow` is recorded for shadow analysis
- The tool's `run()` function returns a **dry-run stub** (no real API call)
- Audit log records `observe_only_pass` with the would-have-been payload

Enforcement is turned on by setting `observeOnly: false` on the `createIssuetrakTicket` tool definition and toggling `ISSUETRAK_ENABLED=true`.

### 8.4 Confirmation Gate in Enforcement Mode

When enforcement is active, `ToolRegistry.call()` will check `requiresConfirmation: true` and **block execution** if no confirmation token is present in the context. The confirmation token is a short-lived hash generated when the agent produces the confirmation answer, passed back to the API when the user replies "yes". This prevents replay or bypassing the confirmation step via direct API calls.

---

## 9. PHI and Safety Rules

### 9.1 PHI Scrubbing (before tool call)

All ticket fields are passed through `deIdentifyText()` from `lib/phi/deidentify.ts` before being sent to the Issuetrak API.

Scrubbing happens at two layers:
1. **Agent layer** — before building the confirmation summary (so user sees the scrubbed version)
2. **Tool layer** — as a second pass inside `createIssuetrakTicketRun()` before the HTTP request

Fields scrubbed: subject, description.  
Fields NOT scrubbed: requesterEmail (legitimate identity), locationUnit (not PHI).

### 9.2 Resident Name / Room Number Blocking

The `deIdentifyText()` function already redacts `room: [REDACTED]` and `resident: [REDACTED]` patterns. The IT Support Agent will additionally prompt (in its system prompt) to never include resident names or room numbers in ticket descriptions.

### 9.3 Password Blocking

The subject and description fields are scanned for password patterns before the ticket is created:

```typescript
const PASSWORD_PATTERN = /\b(password|passwd|pw|pin)\s*[=:\-]?\s*\S+/gi;
```

If matched, the field value is replaced with `[PASSWORD REDACTED]` and a warning is added to the audit log. The confirmation summary shown to the user will also display a warning: "⚠ A possible password was detected and removed from this ticket."

### 9.4 No PHI in Ticket Body Policy

The IT Support Agent system prompt will include an explicit instruction:
> "Never include resident names, room numbers, diagnoses, medications, dates of birth, or any patient/resident-specific clinical information in an Issuetrak ticket. IT tickets are not clinical records."

### 9.5 Audit Log

Every `createIssuetrakTicket` tool call writes to `audit_logs` with:
- `action: "tool_call_issuetrak_create"`
- `metadata.ticketId` (on success)
- `metadata.phiFindings` (count of redactions)
- `metadata.passwordRedacted: true/false`
- `metadata.decision` (observe_only_pass / allowed / denied)
- `metadata.wouldAllow`
- `metadata.requesterEmail` (scrubbed to [EMAIL] by safeMetadata)

---

## 10. Error Handling

| Error Scenario | Behavior |
|---|---|
| Issuetrak API unreachable (timeout/5xx) | Agent responds: "I wasn't able to reach the IT ticketing system. Please submit your request directly at [helpdesk URL] or call the IT helpdesk." |
| 401 Unauthorized (bad API key) | Logged as `issuetrak_auth_failure`. Agent: "There was an issue authenticating with the ticketing system. IT has been notified." (does not expose key or error detail) |
| 400 Bad Request (invalid SubtypeID etc.) | Logged with raw Issuetrak error body (audit only). Agent: "The ticket couldn't be created due to a configuration issue. Please contact IT directly." |
| 429 Rate Limited | Retry once after 2 seconds. If still 429, same user-facing message as 5xx. |
| `ISSUETRAK_ENABLED` is `"false"` | Tool's `run()` returns a dry-run stub: `{ status: "dry_run", message: "Issuetrak integration not yet enabled." }`. No HTTP call made. |
| Missing required field at tool call time | Tool validates input and throws `IssuetrakValidationError` before making any HTTP call. Agent re-asks the missing field. |
| PHI detected in description | Field is scrubbed, warning added to audit. Ticket proceeds with redacted content. |
| Password detected in description | Field is scrubbed, confirmation summary shows ⚠ warning. Ticket proceeds. |

All `IssuetrakApiError` instances are caught by the agent, never surfaced raw to the user.

---

## 11. New Files Required

```
lib/
  integrations/
    issuetrak/
      client.ts             ← IssuetrakClient class (HTTP calls)
      categoryResolver.ts   ← maps keywords → SubtypeID
      types.ts              ← IssuetrakTicketInput, IssuetrakApiError, etc.
  workflow/
    ticketCreation.ts       ← buildTicketCreationWorkflow() factory
lib/tools/
  toolDefinitions.ts        ← add createIssuetrakTicket entry (existing file)
  types.ts                  ← add "createIssuetrakTicket" to ToolName union
lib/agents/agents/
  ITSupportAgent.ts         ← rewrite to support intent detection + clarifying loop
lib/workflow/
  types.ts                  ← extend workflowType union to include "ticket_creation"
```

No new API routes needed in Phase 1. The existing `/api/chat/stream` and `/api/ai-tools/answer-question` routes handle everything through the agent pipeline.

---

## 12. Implementation Phases

### Phase 1 — Foundation (observe-only, no real tickets)

1. Add `"createIssuetrakTicket"` to `ToolName` union in `lib/tools/types.ts`
2. Create `lib/integrations/issuetrak/types.ts` (input/output shapes, error class)
3. Create `lib/integrations/issuetrak/client.ts` (stub HTTP client, feature-flagged)
4. Create `lib/integrations/issuetrak/categoryResolver.ts`
5. Add `createIssuetrakTicket` to `toolDefinitions.ts` with stub `run()` (dry-run)
6. Extend `WorkflowMetadata.workflowType` to include `"ticket_creation"`
7. Create `lib/workflow/ticketCreation.ts` factory
8. Rewrite `ITSupportAgent.ts`:
   - Add ticket intent detection keywords
   - Add field extractor (GPT-4o-mini)
   - Add clarifying question loop
   - Add PHI/password scrub
   - Add confirmation answer generation
   - Add confirmation detection
   - Wire `ToolRegistry.call("createIssuetrakTicket", ...)`
9. Wire `workflow` into SSE done event for `it_support` + `createIssuetrakTicket`
10. TypeCheck: `npx tsc --noEmit`
11. Commit: `feat: add createIssuetrakTicket tool (observe-only)`

### Phase 2 — Real API, Dry-Run Mode

1. Deploy with `ISSUETRAK_ENABLED=false`
2. Implement `IssuetrakClient.createIssue()` with real HTTP call
3. Confirm Issuetrak SubtypeIDs, QueueIDs, PriorityIDs with IT admin
4. Populate `ISSUETRAK_CATEGORY_MAP` in environment config
5. Manual test: trigger tool, inspect audit log, verify `wouldAllow: true`
6. Commit: `feat: implement IssuetrakClient HTTP integration`

### Phase 3 — Shadow Mode (API calls, results discarded)

1. Set `ISSUETRAK_ENABLED=true` on staging only
2. IT Support Agent calls real API but **deletes the created ticket immediately**
3. Validate: correct SubtypeID, correct queue, correct requester, PHI scrubbing working
4. Review 20–30 shadow tickets with IT admin
5. Fix category mapping gaps
6. Commit: `feat: enable Issuetrak shadow mode on staging`

### Phase 4 — Soft Launch (real tickets, IT staff only)

1. Enable real ticket creation for `it_staff` and `admin` roles only
2. IT staff use the assistant to test ticket creation end-to-end
3. Verify Issuetrak notification emails fire correctly
4. Confirm ticket URLs are correct and accessible
5. Commit: `feat: enable Issuetrak ticket creation for IT staff`

### Phase 5 — General Staff Rollout

1. Enable `staff` role in `allowedRoles`
2. Disable `observeOnly` in ToolRegistry for this tool
3. Enable confirmation token enforcement
4. Announce to staff via Teams
5. Monitor audit logs for PHI findings, error rates, drop-off in clarifying loop
6. Commit: `feat: enable Issuetrak ticket creation for all staff`

---

## 13. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Issuetrak SubtypeID / QueueID values unknown | High | Medium | Phase 2: confirm with IT admin before any API calls |
| Issuetrak API auth method differs from v1 docs (HMAC vs key) | Medium | Medium | Phase 2: test auth in sandbox environment |
| Staff include PHI in ticket description | High | High | Double-pass deIdentifyText + system prompt instruction + audit monitoring |
| Staff include passwords in description | Medium | High | PASSWORD_PATTERN regex block + warning in confirmation |
| Clarifying question loop frustrates users | Medium | Medium | Limit to max 2 questions; auto-default remaining fields |
| Ticket submitted before user finishes describing issue | Low | Medium | Confirmation step is mandatory; no bypass path |
| Issuetrak rate limit on busy days | Low | Low | Retry logic + fallback message |
| Ticket created but confirmation token mismatch (Phase 5) | Low | Medium | Token validation in ToolRegistry enforcement layer |
| AI misclassifies category → ticket lands in wrong queue | Medium | Low | Default queue catches all; IT can re-triage; review in shadow phase |
| `conversationHistory` too long → field extractor misreads prior turn | Low | Low | Field extractor prompt explicitly anchors to most recent user turn |

---

## 14. Config Reference (Summary)

```env
# .env.local (dev) / Vercel env (prod)
ISSUETRAK_BASE_URL=https://helpdesk.stmaryscare.org
ISSUETRAK_API_KEY=<from Issuetrak Admin → API Keys>
ISSUETRAK_API_VERSION=v1
ISSUETRAK_DEFAULT_QUEUE_ID=<confirm with IT admin>
ISSUETRAK_DEFAULT_PRIORITY_ID=<confirm with IT admin>
ISSUETRAK_HIGH_PRIORITY_ID=<confirm with IT admin>
ISSUETRAK_SUBMITTER_USER_ID=<system/bot user ID in Issuetrak>
ISSUETRAK_CATEGORY_MAP={"printer":0,"password_reset":0,"software":0,"hardware":0,"network":0,"email_outlook":0,"caretracker":0,"sigmacare":0,"sharepoint":0,"other":0}
ISSUETRAK_ENABLED=false
```

All IDs are `0` as placeholders until confirmed in Phase 2.

---

## 15. Open Questions (requires IT admin input)

1. What is the St. Mary's Issuetrak instance URL?
2. Is the API version v1 or v2? (v2 uses Bearer token auth — slightly different header)
3. What SubtypeIDs exist for the relevant categories?
4. What QueueID should AI-submitted tickets land in?
5. What PriorityIDs exist? (1 = urgent, 2 = high, 3 = normal — or different?)
6. Should there be a dedicated Issuetrak "bot" user (SubmitterID) for AI-created tickets?
7. Should AI-submitted tickets be tagged or flagged differently from human-submitted ones?
8. What is the IT helpdesk fallback URL to show users when the API fails?
9. Are there required custom fields beyond Subject, Description, SubtypeID?
10. Does the Issuetrak instance have sandbox/test mode for Phase 3 shadow testing?
