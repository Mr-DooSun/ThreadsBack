import { describe, expect, it } from 'vitest';
import { analyzeRelationships, mergeAccounts, normalizeUsername } from './diff';
import type { Account, StoredRelationshipState } from './types';

const account = (username: string): Account => ({
  username,
  displayName: username,
  profileUrl: `https://www.threads.net/@${username.replace(/^@/, '')}`,
  firstSeenAt: 1,
});

describe('relationship diff', () => {
  it('normalizes usernames', () => {
    expect(normalizeUsername('@OpenAI')).toBe('openai');
  });

  it('merges accounts by username', () => {
    expect(mergeAccounts([account('@OpenAI')], [account('openai')])).toHaveLength(1);
  });

  it('calculates following minus followers', () => {
    const state: StoredRelationshipState = {
      version: 1,
      following: [account('alpha'), account('beta'), account('gamma')],
      followers: [account('beta')],
      keptUsernames: ['gamma'],
      hiddenUsernames: ['alpha'],
    };

    const analysis = analyzeRelationships(state);

    expect(analysis.notFollowingBack.map((item) => item.username)).toEqual([
      'alpha',
      'gamma',
    ]);
    expect(analysis.reviewAccounts).toHaveLength(0);
    expect(analysis.keptAccounts.map((item) => item.username)).toEqual(['gamma']);
    expect(analysis.hiddenCount).toBe(1);
  });
});
