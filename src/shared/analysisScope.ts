export type AggregateScopeMode = "elapsed" | "sum";

export interface AggregateScope {
  mode: AggregateScopeMode;
  encounterIds: string[];
}

const PREFIX = "aggregate:";

export function createAggregateScopeId(
  encounterIds: string[],
  mode: AggregateScopeMode,
): string {
  const unique = [...new Set(encounterIds)];
  return `${PREFIX}${mode}:${unique.map(encodeURIComponent).join(",")}`;
}

export function parseAggregateScopeId(scopeId: string): AggregateScope | null {
  if (!scopeId.startsWith(PREFIX)) return null;
  const separator = scopeId.indexOf(":", PREFIX.length);
  if (separator < 0) return null;
  const mode = scopeId.slice(PREFIX.length, separator);
  if (mode !== "elapsed" && mode !== "sum") return null;
  const encodedIds = scopeId.slice(separator + 1);
  if (!encodedIds) return { mode, encounterIds: [] };
  try {
    return {
      mode,
      encounterIds: encodedIds
        .split(",")
        .map(decodeURIComponent)
        .filter(Boolean),
    };
  } catch {
    return null;
  }
}
