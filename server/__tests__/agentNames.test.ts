import { describe, expect, it } from 'vitest';

import {
  agentIdentity,
  agentLabel,
  directoryIdentity,
  MAX_AGENT_NAME_LENGTH,
  MAX_AGENT_NAMES,
  normalizeAgentName,
  parseAgentNames,
  withAgentName,
} from '../../core/src/agentNames.js';

describe('agentIdentity', () => {
  it('keys a teammate by its CLI name', () => {
    expect(agentIdentity({ agentName: 'dados-codigo', directoryName: 'Dados' })).toBe(
      'dados-codigo',
    );
  });

  it('keys a lead by its Directory', () => {
    expect(agentIdentity({ directoryName: 'Dados' })).toBe('dir:Dados');
  });

  it('is null when the agent carries nothing stable', () => {
    expect(agentIdentity({})).toBeNull();
    expect(agentIdentity({ agentName: '   ', directoryName: '  ' })).toBeNull();
  });

  it('agrees with directoryIdentity for the same Directory', () => {
    expect(agentIdentity({ directoryName: 'Dados' })).toBe(directoryIdentity('Dados'));
    expect(directoryIdentity('  ')).toBeNull();
  });
});

describe('normalizeAgentName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeAgentName('  Head   de  Dados ')).toBe('Head de Dados');
  });

  it('cuts to the maximum length', () => {
    expect(normalizeAgentName('x'.repeat(MAX_AGENT_NAME_LENGTH + 10))).toHaveLength(
      MAX_AGENT_NAME_LENGTH,
    );
  });

  it('rejects what is not a usable name', () => {
    expect(normalizeAgentName('')).toBeNull();
    expect(normalizeAgentName('   ')).toBeNull();
    expect(normalizeAgentName(42)).toBeNull();
    expect(normalizeAgentName(undefined)).toBeNull();
  });
});

describe('parseAgentNames', () => {
  it('keeps usable pairs and drops the rest', () => {
    expect(
      parseAgentNames({
        'dir:Dados': ' Lemmy ',
        'dados-codigo': 'Código',
        'dados-dqa': '',
        'dados-infra': 17,
        '  ': 'sem identidade',
      }),
    ).toEqual({ 'dir:Dados': 'Lemmy', 'dados-codigo': 'Código' });
  });

  it('degrades to no names for input that is not an object', () => {
    expect(parseAgentNames(null)).toEqual({});
    expect(parseAgentNames('Lemmy')).toEqual({});
    expect(parseAgentNames(['Lemmy'])).toEqual({});
  });

  it('caps a file that would grow without bound', () => {
    const huge: Record<string, string> = {};
    for (let i = 0; i < MAX_AGENT_NAMES + 25; i += 1) huge[`agent-${i}`] = `Nome ${i}`;
    expect(Object.keys(parseAgentNames(huge))).toHaveLength(MAX_AGENT_NAMES);
  });
});

describe('withAgentName', () => {
  it('adds a name without touching the input map', () => {
    const before = { 'dados-codigo': 'Código' };
    const after = withAgentName(before, 'dir:Dados', 'Lemmy');
    expect(after).toEqual({ 'dados-codigo': 'Código', 'dir:Dados': 'Lemmy' });
    expect(before).toEqual({ 'dados-codigo': 'Código' });
  });

  it('deletes the entry when the name is cleared', () => {
    expect(withAgentName({ 'dir:Dados': 'Lemmy' }, 'dir:Dados', '')).toEqual({});
    expect(withAgentName({ 'dir:Dados': 'Lemmy' }, 'dir:Dados', '   ')).toEqual({});
  });

  it('returns the same map when nothing changes, so the caller can skip a write', () => {
    const names = { 'dir:Dados': 'Lemmy' };
    expect(withAgentName(names, 'dir:Dados', 'Lemmy')).toBe(names);
    expect(withAgentName(names, 'dados-dqa', '')).toBe(names);
    expect(withAgentName(names, '  ', 'Nome')).toBe(names);
  });

  it('refuses a new entry once the cap is reached but still edits existing ones', () => {
    const full: Record<string, string> = {};
    for (let i = 0; i < MAX_AGENT_NAMES; i += 1) full[`agent-${i}`] = `Nome ${i}`;
    expect(withAgentName(full, 'agent-novo', 'Tarde')).toBe(full);
    expect(withAgentName(full, 'agent-0', 'Trocado')['agent-0']).toBe('Trocado');
  });
});

describe('agentLabel', () => {
  const names = { 'dir:Dados': 'Lemmy', 'dados-codigo': 'Código' };

  it('prefers the user name over LEAD', () => {
    expect(agentLabel(names, { directoryName: 'Dados', isTeamLead: true }, 'LEAD')).toBe('Lemmy');
  });

  it('prefers the user name over the CLI name', () => {
    expect(agentLabel(names, { agentName: 'dados-codigo', directoryName: 'Dados' }, 'LEAD')).toBe(
      'Código',
    );
  });

  it('falls back to the CLI name for an unnamed teammate', () => {
    expect(agentLabel(names, { agentName: 'dados-dqa', directoryName: 'Dados' }, 'LEAD')).toBe(
      'dados-dqa',
    );
  });

  it('falls back to LEAD for an unnamed lead, and to nothing otherwise', () => {
    expect(agentLabel({}, { directoryName: 'Outro', isTeamLead: true }, 'LEAD')).toBe('LEAD');
    expect(agentLabel({}, { directoryName: 'Outro' }, 'LEAD')).toBeNull();
    expect(agentLabel({}, {}, 'LEAD')).toBeNull();
  });

  it('never gives a module its lead name through the Directory', () => {
    // Every teammate of Dados shares the lead's Directory; only the lead is Lemmy.
    expect(agentLabel(names, { agentName: 'dados-dqa', directoryName: 'Dados' }, 'LEAD')).not.toBe(
      'Lemmy',
    );
  });
});
