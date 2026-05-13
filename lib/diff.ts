import type {
  Account,
  RelationshipAnalysis,
  StoredRelationshipState,
} from './types';

export function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase();
}

export function uniqueAccounts(accounts: Account[]): Account[] {
  const byUsername = new Map<string, Account>();

  for (const account of accounts) {
    const username = normalizeUsername(account.username);

    if (!username) continue;

    const existing = byUsername.get(username);
    if (!existing) {
      byUsername.set(username, { ...account, username });
      continue;
    }

    byUsername.set(username, {
      ...existing,
      displayName: existing.displayName || account.displayName,
      avatarUrl: existing.avatarUrl || account.avatarUrl,
      profileUrl: existing.profileUrl || account.profileUrl,
      firstSeenAt: Math.min(existing.firstSeenAt, account.firstSeenAt),
      hidden: existing.hidden || account.hidden,
    });
  }

  return [...byUsername.values()].sort((a, b) =>
    a.username.localeCompare(b.username),
  );
}

export function mergeAccounts(
  existingAccounts: Account[],
  incomingAccounts: Account[],
): Account[] {
  return uniqueAccounts([...existingAccounts, ...incomingAccounts]);
}

export function analyzeRelationships(
  state: StoredRelationshipState,
): RelationshipAnalysis {
  const followerUsernames = new Set(
    state.followers.map((account) => normalizeUsername(account.username)),
  );
  const hiddenUsernames = new Set(state.hiddenUsernames.map(normalizeUsername));

  const notFollowingBack = uniqueAccounts(state.following)
    .filter((account) => !followerUsernames.has(normalizeUsername(account.username)))
    .map((account) => {
      const username = normalizeUsername(account.username);
      return {
        ...account,
        hidden: hiddenUsernames.has(username),
      };
    });

  const reviewAccounts = notFollowingBack.filter((account) => !account.hidden);
  const hiddenCount = notFollowingBack.filter((account) => account.hidden).length;

  return {
    timestamp: Date.now(),
    followingCount: uniqueAccounts(state.following).length,
    followerCount: uniqueAccounts(state.followers).length,
    notFollowingBack,
    reviewAccounts,
    hiddenCount,
  };
}
