"use client";

import { useMemo, useState } from "react";
import {
  agentRegistry,
  departmentLabels,
  departmentOrder,
  type AgentRegistryItem,
  type AgentRiskLevel,
} from "@/lib/agents/agentRegistry";

const DEPT_ICONS: Record<string, string> = {
  general: "🔍",
  hr: "👥",
  it: "🖥",
  leadership: "📊",
  operations: "⚙",
};

function riskBadge(level: AgentRiskLevel) {
  if (level === "High") return "bg-red-50 text-red-700 ring-1 ring-red-200";
  if (level === "Medium") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {active && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${active ? "bg-emerald-500" : "bg-slate-300"}`} />
    </span>
  );
}

function AgentRow({ agent, onSelect }: { agent: AgentRegistryItem; onSelect: (a: AgentRegistryItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(agent)}
      className="group flex w-full items-center gap-4 rounded-xl border border-transparent px-4 py-3.5 text-left transition hover:border-[#e5e7eb] hover:bg-white hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1f5f9] text-xl ring-1 ring-[#e5e7eb]">
        {agent.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusDot active={agent.implemented} />
          <span className="text-sm font-semibold text-[#0f172a]">{agent.displayName}</span>
          {!agent.implemented && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Planned</span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-[#64748b]">{agent.purpose}</p>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${riskBadge(agent.riskLevel)}`}>
          {agent.riskLevel} risk
        </span>
        <span className="text-[11px] text-[#94a3b8] opacity-0 transition group-hover:opacity-100">View →</span>
      </div>
    </button>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#94a3b8]">{label}</p>
      <p className="mt-2 text-3xl font-bold text-[#0f172a]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[#64748b]">{sub}</p>}
    </div>
  );
}

function DetailItem({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">{label}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[#334155]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f766e]" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AgentDirectoryPage() {
  const [selected, setSelected] = useState<AgentRegistryItem | null>(null);

  const stats = useMemo(() => ({
    active: agentRegistry.filter(a => a.implemented).length,
    planned: agentRegistry.filter(a => !a.implemented).length,
    departments: departmentOrder.length,
    totalWorkflows: agentRegistry.reduce((n, a) => n + a.workflows.length, 0),
  }), []);

  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#0f172a]">
      {/* Header */}
      <div className="border-b border-[#e5e7eb] bg-white px-6 py-5 shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#0f766e]">St. Mary's AI Workforce</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0f172a]">Command Center</h1>
          </div>
          <a
            href="/"
            className="rounded-full bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59]"
          >
            ← Back to chat
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Active agents" value={stats.active} sub="Live in production" />
          <StatCard label="Planned agents" value={stats.planned} sub="On the roadmap" />
          <StatCard label="Departments" value={stats.departments} sub="Areas of coverage" />
          <StatCard label="Workflows" value={stats.totalWorkflows} sub="Supported task types" />
        </div>

        {/* Agent roster by department */}
        <div className="mt-8 space-y-6">
          {departmentOrder.map(dept => {
            const agents = agentRegistry.filter(a => a.department === dept);
            const activeCount = agents.filter(a => a.implemented).length;
            return (
              <div key={dept} className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc]">
                {/* Dept header */}
                <div className="flex items-center gap-3 border-b border-[#e5e7eb] px-5 py-4">
                  <span className="text-xl">{DEPT_ICONS[dept]}</span>
                  <div className="flex-1">
                    <h2 className="text-sm font-bold text-[#0f172a]">{departmentLabels[dept]}</h2>
                    <p className="text-[11px] text-[#64748b]">
                      {activeCount} of {agents.length} agents active
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusDot active={activeCount > 0} />
                    <span className="text-[11px] font-medium text-[#64748b]">
                      {activeCount > 0 ? "Operational" : "Planned"}
                    </span>
                  </div>
                </div>
                {/* Agent rows */}
                <div className="divide-y divide-[#f1f5f9] px-2 py-2">
                  {agents.map(agent => (
                    <AgentRow key={agent.name} agent={agent} onSelect={setSelected} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-[#e5e7eb] bg-white shadow-2xl">
            {/* Drawer header */}
            <div className="flex items-start gap-4 border-b border-[#f1f5f9] bg-[#f8fafc] px-6 py-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm ring-1 ring-[#e5e7eb]">
                {selected.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold text-[#0f172a]">{selected.displayName}</h3>
                  <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${selected.implemented ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    <StatusDot active={selected.implemented} />
                    {selected.implemented ? "Active" : "Planned"}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${riskBadge(selected.riskLevel)}`}>
                    {selected.riskLevel} risk
                  </span>
                </div>
                <p className="mt-0.5 text-xs font-medium text-[#64748b]">{selected.departmentLabel}</p>
                <p className="mt-2 text-sm leading-6 text-[#475569]">{selected.purpose}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#94a3b8] transition hover:bg-white hover:text-[#0f172a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Drawer body */}
            <div className="max-h-[calc(90vh-150px)] overflow-y-auto px-6 py-5">
              <div className="grid gap-6 sm:grid-cols-2">
                <DetailItem label="What it does" items={selected.responsibilities} />
                <DetailItem label="Try asking" items={selected.examplePrompts} />
                <DetailItem label="Tasks" items={selected.tasks} />
                <DetailItem label="Data sources" items={selected.sources} />
                <DetailItem label="Workflows" items={selected.workflows} />
                <DetailItem label="Safety controls" items={selected.safetyNotes} />
              </div>

              <div className="mt-6 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-4 text-sm text-[#475569]">
                <span className="font-semibold text-[#0f172a]">Status: </span>
                {selected.implemented
                  ? "Live — this agent is active in the AI Workforce and handles real staff requests."
                  : "Planned — this agent is on the St. Mary's AI roadmap and will be deployed in a future phase."}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
