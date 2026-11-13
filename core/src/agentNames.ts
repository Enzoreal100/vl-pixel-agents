/**
 * Custom display names for agents, chosen by the user in the office.
 *
 * The office draws an agent's role label from its CLI identity: a teammate
 * wears its `agentName` (Claude's `agent_type`, e.g. `dados-codigo`), a lead
 * wears the constant `LEAD`. Neither is the user's own word for it, and a
 * team of modules wants both: "Lemmy" over the lead of the Dados module,
 * "Código" over `dados-codigo`.
 *
 * The map is keyed by IDENTITY, never by agent id or session: ids are per
 * process and sessions are per run, so either would lose every name the next
 * morning. An identity is stable across runs AND across machines, which is
 * what lets the map travel in a synced repo (see `agentNamesFilePath` in the
 * server): a cloned config gives a new laptop the same office.
 *
 * Two identity forms, in the order the office resolves them:
 *   - `<agentName>`      a teammate or sub-agent, by its CLI agent type.
 *   - `dir:<directory>`  an agent with no CLI name — the lead — by the
 *                        Directory it was launched in.
 *
 * DOM-free and transport-free on purpose: the server persists it, the webview
 * draws it, and both agree by importing this one module.
 */

/** The prefix of a Directory-keyed identity. */
const DIR_PREFIX = 'dir:';

/** Longest a custom name may be. Long enough for "Head de Dados", short
 *  enough that the label never outgrows the character under it. */
export const MAX_AGENT_NAME_LENGTH = 24;

/** How many names one office may keep. A generous ceiling, not a budget: it
 *  only exists so a malformed file can't grow the config without bound. */
export const MAX_AGENT_NAMES = 200;

/** Custom names by identity. */
export type AgentNames = Record<string, string>;

/** What an agent must tell us to be named. Both fields optional: an agent
 *  that has neither cannot be named, and says so by resolving to null. */
export interface AgentIdentityParts {
  /** The CLI's own name for the agent (Claude: `agent_type`). */
  agentName?: string;
  /** The Directory it was launched in. */
  directoryName?: string;
}

/**
 * The identity a custom name is stored under, or null when the agent carries
 * nothing stable to key on (an adopted session outside every Directory).
 *
 * `agentName` wins over the Directory because it is the more specific of the
 * two: every teammate of a module shares its lead's Directory, so keying them
 * by Directory would give the whole module one name.
 */
export function agentIdentity(parts: AgentIdentityParts): string | null {
  const name = parts.agentName?.trim();
  if (name) return name;
  const dir = parts.directoryName?.trim();
  if (dir) return `${DIR_PREFIX}${dir}`;
  return null;
}

/** The identity for a Directory, for callers that have only that (the
 *  Directory modal offers a name for the lead before one ever runs). */
export function directoryIdentity(directoryName: string): string | null {
  const dir = directoryName.trim();
  return dir ? `${DIR_PREFIX}${dir}` : null;
}

/**
 * One name as it will be stored: trimmed, collapsed to single spaces, cut to
 * MAX_AGENT_NAME_LENGTH. Returns null for a value that isn't a usable name —
 * the caller stores nothing and the agent falls back to its CLI label.
 *
 * Whitespace is collapsed rather than rejected because the name is drawn in a
 * pixel font over a character: a run of spaces reads as a gap, not a word.
 */
export function normalizeAgentName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return name.slice(0, MAX_AGENT_NAME_LENGTH);
}

/**
 * Coerce untrusted JSON into an AgentNames map, dropping every entry that
 * isn't a usable identity/name pair and capping the result. Returns `{}` for
 * input that isn't an object, so a corrupt file degrades to "no custom names"
 * instead of failing a load.
 */
export function parseAgentNames(raw: unknown): AgentNames {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: AgentNames = {};
  let kept = 0;
  for (const [identity, value] of Object.entries(raw as Record<string, unknown>)) {
    if (kept >= MAX_AGENT_NAMES) break;
    if (!identity.trim()) continue;
    const name = normalizeAgentName(value);
    if (!name) continue;
    out[identity] = name;
    kept += 1;
  }
  return out;
}

/**
 * Apply one edit to the map, returning a NEW map. An empty or unusable name
 * DELETES the entry, which is how the UI clears a name: the field is emptied
 * and the agent goes back to wearing its CLI label.
 *
 * Returns the map unchanged (by reference) when the edit changes nothing, so
 * a caller can skip a write.
 */
export function withAgentName(names: AgentNames, identity: string, raw: unknown): AgentNames {
  const key = identity.trim();
  if (!key) return names;
  const name = normalizeAgentName(raw);
  if (!name) {
    if (!(key in names)) return names;
    const next = { ...names };
    delete next[key];
    return next;
  }
  if (names[key] === name) return names;
  if (!(key in names) && Object.keys(names).length >= MAX_AGENT_NAMES) return names;
  return { ...names, [key]: name };
}

/**
 * The label to draw over an agent, or null for none.
 *
 * This is the one place the precedence lives, so the office and any other
 * reader agree: the user's own name first, then the CLI's name for a
 * teammate, then `LEAD` for a lead, then nothing. `leadLabel` is passed in
 * rather than hard-coded so the webview keeps owning its copy.
 */
export function agentLabel(
  names: AgentNames,
  parts: AgentIdentityParts & { isTeamLead?: boolean },
  leadLabel: string,
): string | null {
  const identity = agentIdentity(parts);
  const custom = identity ? names[identity] : undefined;
  if (custom) return custom;
  if (parts.agentName?.trim()) return parts.agentName.trim();
  return parts.isTeamLead ? leadLabel : null;
}
