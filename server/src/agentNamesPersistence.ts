import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentNames } from '../../core/src/agentNames.js';
import { parseAgentNames, withAgentName } from '../../core/src/agentNames.js';
import { AGENT_NAMES_FILE_NAME, AGENT_NAMES_PATH_ENV, PIXEL_AGENTS_DIR } from './constants.js';

/**
 * The ONE owner of the agent-names file, for both surfaces.
 *
 * It sits beside the other persistence modules but keeps its own file rather
 * than a key of config.json, for one reason: of everything under
 * ~/.pixel-agents, the names are the part a user wants on their next machine.
 * Alone in a file, the file can live in a synced folder or a git repo —
 * `PIXEL_AGENTS_NAMES_PATH` points here at it — and a reinstall or a new
 * laptop opens the office already knowing who everyone is.
 *
 * Every read degrades to "no custom names": an unreadable or corrupt file
 * must never stop an office from opening, since a missing name costs nothing
 * (the agent wears its CLI label) while a failed boot costs everything.
 */

/** Where the names live. `PIXEL_AGENTS_NAMES_PATH` wins: a path ending in
 *  `.json` IS the file, any other path is the directory holding it. */
export function agentNamesFilePath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[AGENT_NAMES_PATH_ENV]?.trim();
  if (override) {
    return override.toLowerCase().endsWith('.json')
      ? path.resolve(override)
      : path.join(path.resolve(override), AGENT_NAMES_FILE_NAME);
  }
  return path.join(os.homedir(), PIXEL_AGENTS_DIR, AGENT_NAMES_FILE_NAME);
}

/** The names as stored, or `{}` when there is no usable file. Never throws. */
export function readAgentNames(env?: NodeJS.ProcessEnv): AgentNames {
  const file = agentNamesFilePath(env);
  try {
    if (!fs.existsSync(file)) return {};
    return parseAgentNames(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch (err) {
    console.warn(`[Pixel Agents] Could not read agent names from ${file}:`, err);
    return {};
  }
}

/**
 * Write the whole map, atomically (tmp + rename), creating the directory if
 * it is missing. Returns false when the write failed — the caller still has
 * the in-memory map, so the office stays correct until the next restart and
 * the user hears about it instead of losing the rename silently.
 */
export function writeAgentNames(names: AgentNames, env?: NodeJS.ProcessEnv): boolean {
  const file = agentNamesFilePath(env);
  const tmp = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(names, null, 2)}\n`, 'utf-8');
    fs.renameSync(tmp, file);
    return true;
  } catch (err) {
    console.error(`[Pixel Agents] Could not write agent names to ${file}:`, err);
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // The temp file is litter, not a failure worth reporting over the one above.
    }
    return false;
  }
}

/**
 * Apply one rename and persist it. Returns the map to broadcast, which is the
 * stored one on success and the attempted one when the write failed (the
 * office already shows it; a refused broadcast would make the UI lie about
 * what it just did in the other direction).
 */
export function saveAgentName(
  identity: string,
  name: unknown,
  env?: NodeJS.ProcessEnv,
): AgentNames {
  const current = readAgentNames(env);
  const next = withAgentName(current, identity, name);
  if (next === current) return current;
  writeAgentNames(next, env);
  return next;
}

/** The message that tells a client every name. */
export function agentNamesMessage(env?: NodeJS.ProcessEnv) {
  return { type: 'agentNamesLoaded', names: readAgentNames(env) } as const;
}
