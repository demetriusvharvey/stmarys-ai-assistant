/**
 * OpenFDA Drug Information Client
 * Free API — no key required
 * Docs: https://open.fda.gov/apis/drug/
 */

const BASE = "https://api.fda.gov/drug";

export type DrugLabel = {
  brand_name?: string[];
  generic_name?: string[];
  purpose?: string[];
  indications_and_usage?: string[];
  warnings?: string[];
  dosage_and_administration?: string[];
  drug_interactions?: string[];
  contraindications?: string[];
  adverse_reactions?: string[];
  storage_and_handling?: string[];
};

export type DrugSearchResult = {
  name: string;
  genericName: string;
  purpose: string;
  usage: string;
  warnings: string;
  dosage: string;
  interactions: string;
  contraindications: string;
  adverseReactions: string;
  source: string;
};

function first(arr?: string[]): string {
  return arr?.[0]?.trim() ?? "";
}

function truncate(text: string, max = 500): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export async function searchDrug(query: string): Promise<DrugSearchResult | null> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `${BASE}/label.json?search=openfda.brand_name:"${encoded}"+openfda.generic_name:"${encoded}"&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!res.ok) {
      // Fallback: broader search
      const fallback = await fetch(
        `${BASE}/label.json?search=${encoded}&limit=1`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!fallback.ok) return null;
      const fb = await fallback.json() as { results?: DrugLabel[] };
      if (!fb.results?.length) return null;
      return formatResult(fb.results[0]);
    }

    const data = await res.json() as { results?: DrugLabel[] };
    if (!data.results?.length) return null;
    return formatResult(data.results[0]);
  } catch {
    return null;
  }
}

function formatResult(label: DrugLabel): DrugSearchResult {
  return {
    name: first(label.brand_name),
    genericName: first(label.generic_name),
    purpose: truncate(first(label.purpose)),
    usage: truncate(first(label.indications_and_usage)),
    warnings: truncate(first(label.warnings)),
    dosage: truncate(first(label.dosage_and_administration)),
    interactions: truncate(first(label.drug_interactions)),
    contraindications: truncate(first(label.contraindications)),
    adverseReactions: truncate(first(label.adverse_reactions)),
    source: "OpenFDA (FDA Drug Label Database)",
  };
}

export async function searchDrugRecalls(drugName: string): Promise<string[]> {
  try {
    const encoded = encodeURIComponent(drugName);
    const res = await fetch(
      `https://api.fda.gov/drug/enforcement.json?search=product_description:${encoded}&limit=3`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as { results?: { product_description: string; reason_for_recall: string; recall_initiation_date: string }[] };
    return (data.results || []).map(r =>
      `• ${r.product_description} — ${r.reason_for_recall} (${r.recall_initiation_date?.slice(0, 4) ?? ""})`
    );
  } catch {
    return [];
  }
}
