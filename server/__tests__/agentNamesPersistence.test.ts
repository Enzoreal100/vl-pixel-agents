import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  agentNamesFilePath,
  agentNamesMessage,
  readAgentNames,
  saveAgentName,
  writeAgentNames,
} from '../src/agentNamesPersistence.js';
import { AGENT_NAMES_FILE_NAME, AGENT_NAMES_PATH_ENV } from '../src/constants.js';

let dir: string;
/** An env that points the names file at this test's temp dir. */
let env: NodeJS.ProcessEnv;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-names-'));
  env = { [AGENT_NAMES_PATH_ENV]: dir };
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('agentNamesFilePath', () => {
  it('defaults to the persistence dir in the home directory', () => {
    const file = agentNamesFilePath({});
    expect(file.startsWith(os.homedir())).toBe(true);
    expect(path.basename(file)).toBe(AGENT_NAMES_FILE_NAME);
  });

  it('takes a directory override and puts the file inside it', () => {
    expect(agentNamesFilePath(env)).toBe(path.join(dir, AGENT_NAMES_FILE_NAME));
  });

  it('takes a .json override as the file itself', () => {
    const target = path.join(dir, 'empresa', 'nomes.json');
    expect(agentNamesFilePath({ [AGENT_NAMES_PATH_ENV]: target })).toBe(path.resolve(target));
  });

  it('ignores a blank override', () => {
    expect(agentNamesFilePath({ [AGENT_NAMES_PATH_ENV]: '   ' })).toBe(agentNamesFilePath({}));
  });
});

describe('read and write', () => {
  it('reads back what it wrote', () => {
    expect(writeAgentNames({ 'dir:Dados': 'Lemmy' }, env)).toBe(true);
    expect(readAgentNames(env)).toEqual({ 'dir:Dados': 'Lemmy' });
  });

  it('creates the directory when the override points at a missing one', () => {
    const nested = { [AGENT_NAMES_PATH_ENV]: path.join(dir, 'a', 'b') };
    expect(writeAgentNames({ 'dados-dqa': 'DQA' }, nested)).toBe(true);
    expect(readAgentNames(nested)).toEqual({ 'dados-dqa': 'DQA' });
  });

  it('has no names when there is no file', () => {
    expect(readAgentNames(env)).toEqual({});
  });

  it('degrades to no names for a corrupt file instead of throwing', () => {
    fs.writeFileSync(path.join(dir, AGENT_NAMES_FILE_NAME), '{ not json', 'utf-8');
    expect(readAgentNames(env)).toEqual({});
  });

  it('drops unusable entries on the way in', () => {
    fs.writeFileSync(
      path.join(dir, AGENT_NAMES_FILE_NAME),
      JSON.stringify({ 'dir:Dados': 'Lemmy', 'dados-dqa': 42 }),
      'utf-8',
    );
    expect(readAgentNames(env)).toEqual({ 'dir:Dados': 'Lemmy' });
  });

  it('leaves no temp file behind', () => {
    writeAgentNames({ 'dir:Dados': 'Lemmy' }, env);
    expect(fs.readdirSync(dir)).toEqual([AGENT_NAMES_FILE_NAME]);
  });
});

describe('saveAgentName', () => {
  it('adds a name and persists it', () => {
    expect(saveAgentName('dir:Dados', 'Lemmy', env)).toEqual({ 'dir:Dados': 'Lemmy' });
    expect(readAgentNames(env)).toEqual({ 'dir:Dados': 'Lemmy' });
  });

  it('normalizes before storing', () => {
    expect(saveAgentName('dados-codigo', '  Código  ', env)).toEqual({ 'dados-codigo': 'Código' });
  });

  it('clears a name when given an empty one', () => {
    saveAgentName('dir:Dados', 'Lemmy', env);
    expect(saveAgentName('dir:Dados', '', env)).toEqual({});
    expect(readAgentNames(env)).toEqual({});
  });

  it('keeps the other names when one changes', () => {
    saveAgentName('dir:Dados', 'Lemmy', env);
    saveAgentName('dados-dqa', 'DQA', env);
    expect(saveAgentName('dir:Dados', 'Head de Dados', env)).toEqual({
      'dir:Dados': 'Head de Dados',
      'dados-dqa': 'DQA',
    });
  });

  it('writes nothing when the name is already what was asked for', () => {
    saveAgentName('dir:Dados', 'Lemmy', env);
    const file = path.join(dir, AGENT_NAMES_FILE_NAME);
    const before = fs.statSync(file).mtimeMs;
    expect(saveAgentName('dir:Dados', 'Lemmy', env)).toEqual({ 'dir:Dados': 'Lemmy' });
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });
});

describe('agentNamesMessage', () => {
  it('carries the stored names', () => {
    saveAgentName('dir:Dados', 'Lemmy', env);
    expect(agentNamesMessage(env)).toEqual({
      type: 'agentNamesLoaded',
      names: { 'dir:Dados': 'Lemmy' },
    });
  });
});

describe('carrying the names to another machine', () => {
  it('a copied file gives a fresh install the same names', () => {
    // The point of the override: the file lives in a synced repo, so another
    // computer that clones it opens the office already knowing the names.
    saveAgentName('dir:Dados', 'Lemmy', env);
    saveAgentName('dados-codigo', 'Código', env);

    const outro = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-names-outro-'));
    try {
      fs.copyFileSync(
        path.join(dir, AGENT_NAMES_FILE_NAME),
        path.join(outro, AGENT_NAMES_FILE_NAME),
      );
      expect(readAgentNames({ [AGENT_NAMES_PATH_ENV]: outro })).toEqual({
        'dir:Dados': 'Lemmy',
        'dados-codigo': 'Código',
      });
    } finally {
      fs.rmSync(outro, { recursive: true, force: true });
    }
  });
});
