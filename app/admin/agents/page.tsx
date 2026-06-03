"use client";

import { useMemo, useState } from "react";
import {
  agentRegistry,
  departmentLabels,
  departmentOrder,
  type AgentRegistryItem,
  type AgentRiskLevel,
} from "@/lib/agents/agentRegistry";

function riskClass(riskLevel: AgentRiskLevel) {
  if (riskLevel === "High") return "bg-red-50 text-red-700 ring-red-100";
  if (riskLevel === "Medium") return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-emerald-50 text-emerald-700 ring-emerald-100";
}

function statusClass(implemented: boolean) {
  return implemented
    ? "bg-[#e6f4f1] text-[#0f766e] ring-[#b8dfd8]"
    : "bg-slate-100 text-slate-600 ring-slate-200";
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-[#0f172a]">{value}</p>
    </div>
  );
}

function AgentCard({
  agent,
  onSelect,
}: {
  agent: AgentRegistryItem;
  onSelect: (agent: AgentRegistryItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(agent)}
      className="group flex h-full flex-col rounded-2xl border border-[#e5e7eb] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#cbd5e1] hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f8fafc] text-2xl ring-1 ring-[#e5e7eb]">
          {agent.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-[#0f172a]">
              {agent.displayName}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusClass(
                agent.implemented
              )}`}
            >
              {agent.implemented ? "Active" : "Future"}
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-[#64748b]">
            {agent.departmentLabel}
          </p>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-[#475569]">
        {agent.purpose}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${riskClass(
            agent.riskLevel
          )}`}
        >
          {agent.riskLevel} risk
        </span>
        <span className="rounded-full bg-[#f8fafc] px-2.5 py-1 text-[11px] font-medium text-[#64748b] ring-1 ring-[#e5e7eb]">
          {agent.workflows.length} workflows
        </span>
        <span className="rounded-full bg-[#f8fafc] px-2.5 py-1 text-[11px] font-medium text-[#64748b] ring-1 ring-[#e5e7eb]">
          {agent.tools.length} tools
        </span>
      </div>

      <div className="mt-5 grid gap-3 text-xs">
        <div>
          <p className="font-semibold uppercase tracking-wide text-[#94a3b8]">Tasks</p>
          <p className="mt-1 line-clamp-2 leading-5 text-[#475569]">
            {agent.tasks.join(", ")}
          </p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-[#94a3b8]">
            Sources
          </p>
          <p className="mt-1 line-clamp-2 leading-5 text-[#475569]">
            {agent.sources.join(", ")}
          </p>
        </div>
      </div>

      <span className="mt-5 text-xs font-semibold text-[#0f766e] opacity-0 transition group-hover:opacity-100">
        View profile
      </span>
    </button>
  );
}

function DetailSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
      <h4 className="text-sm font-semibold text-[#0f172a]">{title}</h4>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-6 text-[#475569]">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f766e]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AgentDirectoryPage() {
  const [selectedAgent, setSelectedAgent] = useState<AgentRegistryItem | null>(null);

  const summary = useMemo(
    () => ({
      active: agentRegistry.filter((agent) => agent.implemented).length,
      future: agentRegistry.filter((agent) => !agent.implemented).length,
      departments: departmentOrder.length,
      workflows: agentRegistry.reduce((sum, agent) => sum + agent.workflows.length, 0),
    }),
    []
  );

  return (
    <main className="min-h-screen bg-[#f8faf9] px-4 py-8 text-[#0f172a] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-3xl border border-[#e5e7eb] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">
            St. Mary&apos;s AI Workforce
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                AI Workforce Agent Directory
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#64748b]">
                Review available AI agents, their responsibilities, supported tasks,
                data sources, and workflow capabilities.
              </p>
            </div>
            <a
              href="/"
              className="inline-flex w-fit rounded-full bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59]"
            >
              Back to chat
            </a>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Active agents" value={summary.active} />
          <SummaryCard label="Future agents" value={summary.future} />
          <SummaryCard label="Departments" value={summary.departments} />
          <SummaryCard label="Supported workflows" value={summary.workflows} />
        </section>

        <div className="mt-8 space-y-8">
          {departmentOrder.map((department) => {
            const agents = agentRegistry.filter(
              (agent) => agent.department === department
            );

            return (
              <section key={department}>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#0f172a]">
                      {departmentLabels[department]}
                    </h2>
                    <p className="mt-1 text-sm text-[#64748b]">
                      {agents.length} {agents.length === 1 ? "agent" : "agents"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {agents.map((agent) => (
                    <AgentCard
                      key={agent.name}
                      agent={agent}
                      onSelect={setSelectedAgent}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0f172a]/35 p-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-[#e5e7eb] bg-white shadow-2xl">
            <div className="flex items-start gap-5 border-b border-[#e5e7eb] bg-[#f8fafc] p-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm ring-1 ring-[#e5e7eb]">
                {selectedAgent.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-2xl font-semibold text-[#0f172a]">
                    {selectedAgent.displayName}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass(
                      selectedAgent.implemented
                    )}`}
                  >
                    {selectedAgent.status}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${riskClass(
                      selectedAgent.riskLevel
                    )}`}
                  >
                    {selectedAgent.riskLevel} risk
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-[#64748b]">
                  {selectedAgent.departmentLabel}
                </p>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-[#475569]">
                  {selectedAgent.purpose}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#64748b] transition hover:bg-white hover:text-[#0f172a]"
                aria-label="Close agent profile"
              >
                ×
              </button>
            </div>

            <div className="max-h-[calc(88vh-132px)] overflow-y-auto p-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <DetailSection
                  title="Primary responsibilities"
                  items={selectedAgent.responsibilities}
                />
                <DetailSection
                  title="Example prompts"
                  items={selectedAgent.examplePrompts}
                />
                <DetailSection title="Tasks it can perform" items={selectedAgent.tasks} />
                <DetailSection title="Sources it uses" items={selectedAgent.sources} />
                <DetailSection
                  title="Tools and workflows"
                  items={[...selectedAgent.tools, ...selectedAgent.workflows]}
                />
                <DetailSection
                  title="Risk and safety notes"
                  items={selectedAgent.safetyNotes}
                />
              </div>

              <section className="mt-4 rounded-2xl border border-[#e5e7eb] bg-white p-4">
                <h4 className="text-sm font-semibold text-[#0f172a]">
                  Current implementation status
                </h4>
                <p className="mt-2 text-sm leading-6 text-[#475569]">
                  {selectedAgent.implemented
                    ? "This agent is currently implemented in the AgentRouter and can be selected by live chat routing."
                    : "This is a planned future agent. It appears in the directory so leadership can see the intended AI workforce roadmap."}
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
