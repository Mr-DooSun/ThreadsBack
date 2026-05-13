import { browser } from 'wxt/browser';
import { mergeAccounts, normalizeUsername, uniqueAccounts } from './diff';
import type { Account, SnapshotKind, StoredRelationshipState } from './types';

const STORAGE_KEY = 'followmirror.relationshipState.v1';

export const EMPTY_STATE: StoredRelationshipState = {
  version: 1,
  following: [],
  followers: [],
  hiddenUsernames: [],
};

export async function loadRelationshipState(): Promise<StoredRelationshipState> {
  const result = (await browser.storage.local.get(STORAGE_KEY)) as Record<
    string,
    unknown
  >;

  return parseStoredState(result[STORAGE_KEY]);
}

export async function saveRelationshipState(
  state: StoredRelationshipState,
): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEY]: {
      ...state,
      following: uniqueAccounts(state.following),
      followers: uniqueAccounts(state.followers),
      hiddenUsernames: uniqueStrings(state.hiddenUsernames),
      updatedAt: Date.now(),
    },
  });
}

export async function resetRelationshipState(): Promise<StoredRelationshipState> {
  await browser.storage.local.remove(STORAGE_KEY);
  return { ...EMPTY_STATE };
}

export function mergeSnapshotAccounts(
  state: StoredRelationshipState,
  kind: SnapshotKind,
  accounts: Account[],
): StoredRelationshipState {
  return {
    ...state,
    [kind]: mergeAccounts(state[kind], accounts),
    updatedAt: Date.now(),
  };
}

export function replaceSnapshotAccounts(
  state: StoredRelationshipState,
  updates: Partial<Record<SnapshotKind, Account[]>>,
): StoredRelationshipState {
  return {
    ...state,
    following: updates.following
      ? uniqueAccounts(updates.following)
      : state.following,
    followers: updates.followers
      ? uniqueAccounts(updates.followers)
      : state.followers,
    updatedAt: Date.now(),
  };
}

export function clearSnapshotKind(
  state: StoredRelationshipState,
  kind: SnapshotKind,
): StoredRelationshipState {
  return {
    ...state,
    [kind]: [],
    updatedAt: Date.now(),
  };
}

export function toggleReviewedUsername(
  state: StoredRelationshipState,
  username: string,
): StoredRelationshipState {
  const normalized = normalizeUsername(username);
  const values = new Set(state.hiddenUsernames.map(normalizeUsername));

  if (values.has(normalized)) {
    values.delete(normalized);
  } else {
    values.add(normalized);
  }

  return {
    ...state,
    hiddenUsernames: [...values].sort(),
    updatedAt: Date.now(),
  };
}

function parseStoredState(value: unknown): StoredRelationshipState {
  if (!isRecord(value) || value.version !== 1) {
    return { ...EMPTY_STATE };
  }

  return {
    version: 1,
    following: parseAccounts(value.following),
    followers: parseAccounts(value.followers),
    hiddenUsernames: parseStrings(value.hiddenUsernames),
    updatedAt:
      typeof value.updatedAt === 'number' ? value.updatedAt : undefined,
  };
}

function parseAccounts(value: unknown): Account[] {
  if (!Array.isArray(value)) return [];

  return uniqueAccounts(
    value.filter(isRecord).flatMap((item) => {
      if (typeof item.username !== 'string') return [];
      if (typeof item.profileUrl !== 'string') return [];

      return {
        username: normalizeUsername(item.username),
        displayName:
          typeof item.displayName === 'string' ? item.displayName : '',
        avatarUrl: typeof item.avatarUrl === 'string' ? item.avatarUrl : undefined,
        profileUrl: item.profileUrl,
        firstSeenAt:
          typeof item.firstSeenAt === 'number' ? item.firstSeenAt : Date.now(),
        hidden: typeof item.hidden === 'boolean' ? item.hidden : undefined,
      };
    }),
  );
}

function parseStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((item): item is string => typeof item === 'string'));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(normalizeUsername).filter(Boolean))].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
