/**
 * MedlinePlus Health Topics API (NIH/NLM)
 * Free API — no key required
 * Returns plain-language health information from the National Library of Medicine
 * Docs: https://medlineplus.gov/connect/service.html
 */

const BASE = "https://connect.medlineplus.gov/application";

export type MedlinePlusResult = {
  title: string;
  summary: string;
  url: string;
  source: string;
};

export async function searchHealthTopic(query: string): Promise<MedlinePlusResult | null> {
  try {
    const params = new URLSearchParams({
      mainSearchCriteria_v_c: query,
      knowledgeResponseType: "application/json",
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      feed?: {
        entry?: Array<{
          title?: { _value?: string };
          summary?: { _value?: string };
          link?: Array<{ href?: string }>;
        }>;
      };
    };

    const entry = data.feed?.entry?.[0];
    if (!entry) return null;

    return {
      title: entry.title?._value ?? query,
      summary: (entry.summary?._value ?? "").replace(/<[^>]*>/g, "").slice(0, 800),
      url: entry.link?.[0]?.href ?? "",
      source: "MedlinePlus (National Library of Medicine / NIH)",
    };
  } catch {
    return null;
  }
}

/**
 * NLM RxNorm API — drug name normalization and interaction checking
 * Docs: https://rxnav.nlm.nih.gov/
 */

export type RxNormDrug = {
  rxcui: string;
  name: string;
};

export async function lookupDrugRxNorm(drugName: string): Promise<RxNormDrug | null> {
  try {
    const encoded = encodeURIComponent(drugName);
    const res = await fetch(
      `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encoded}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      drugGroup?: {
        conceptGroup?: Array<{
          conceptProperties?: Array<{ rxcui: string; name: string }>;
        }>;
      };
    };

    for (const group of data.drugGroup?.conceptGroup ?? []) {
      const prop = group.conceptProperties?.[0];
      if (prop) return { rxcui: prop.rxcui, name: prop.name };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getDrugInteractions(rxcui: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://rxnav.nlm.nih.gov/REST/interaction/interaction.json?rxcui=${rxcui}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];

    const data = await res.json() as {
      interactionTypeGroup?: Array<{
        interactionType?: Array<{
          interactionPair?: Array<{
            description?: string;
            interactionConcept?: Array<{ minConceptItem?: { name?: string } }>;
          }>;
        }>;
      }>;
    };

    const interactions: string[] = [];
    for (const group of data.interactionTypeGroup ?? []) {
      for (const type of group.interactionType ?? []) {
        for (const pair of type.interactionPair ?? []) {
          if (pair.description) {
            interactions.push(pair.description);
          }
        }
      }
    }
    return interactions.slice(0, 5);
  } catch {
    return [];
  }
}
