import { browser } from 'wxt/browser';
import { mergeAccounts, normalizeUsername, uniqueAccounts } from './diff';
import type {
  Account,
  RelationshipPlatform,
  SnapshotKind,
  StoredRelationshipState,
  StoredRelationshipStates,
} from './types';

const LEGACY_STORAGE_KEY = 'followmirror.relationshipState.v1';
const STORAGE_KEYS: Record<RelationshipPlatform, string> = {
  threads: 'followmirror.relationshipState.v1.threads',
  instagram: 'followmirror.relationshipState.v1.instagram',
};

export const EMPTY_STATE: StoredRelationshipState = createEmptyRelationshipState();

export function createEmptyRelationshipState(): StoredRelationshipState {
  return {
    version: 1,
    following: [],
    followers: [],
    hiddenUsernames: [],
  };
}

export function createEmptyRelationshipStates(): StoredRelationshipStates {
  return {
    threads: createEmptyRelationshipState(),
    instagram: createEmptyRelationshipState(),
  };
}

export async function loadRelationshipStates(
  legacyPlatform: RelationshipPlatform = 'threads',
): Promise<StoredRelationshipStates> {
  const result = (await browser.storage.local.get([
    STORAGE_KEYS.threads,
    STORAGE_KEYS.instagram,
    LEGACY_STORAGE_KEY,
  ])) as Record<string, unknown>;

  const states = createEmptyRelationshipStates();
  const storedThreads = result[STORAGE_KEYS.threads];
  const storedInstagram = result[STORAGE_KEYS.instagram];
  const storedLegacy = result[LEGACY_STORAGE_KEY];

  if (isStoredStateRecord(storedThreads)) {
    states.threads = parseStoredState(storedThreads);
  }

  if (isStoredStateRecord(storedInstagram)) {
    states.instagram = parseStoredState(storedInstagram);
  }

  const hasPlatformState =
    isStoredStateRecord(storedThreads) || isStoredStateRecord(storedInstagram);
  if (!hasPlatformState && isStoredStateRecord(storedLegacy)) {
    const legacyState = parseStoredState(storedLegacy);
    states[detectStatePlatform(legacyState) ?? legacyPlatform] = legacyState;
  }

  return states;
}

export async function saveRelationshipState(
  platform: RelationshipPlatform,
  state: StoredRelationshipState,
): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS[platform]]: {
      ...state,
      following: uniqueAccounts(state.following),
      followers: uniqueAccounts(state.followers),
      hiddenUsernames: uniqueStrings(state.hiddenUsernames),
      updatedAt: Date.now(),
    },
  });
  await browser.storage.local.remove(LEGACY_STORAGE_KEY);
}

export async function resetRelationshipState(
  platform: RelationshipPlatform,
): Promise<StoredRelationshipState> {
  await browser.storage.local.remove([STORAGE_KEYS[platform], LEGACY_STORAGE_KEY]);
  return createEmptyRelationshipState();
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
    return createEmptyRelationshipState();
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

function detectStatePlatform(
  state: StoredRelationshipState,
): RelationshipPlatform | null {
  const urls = [...state.following, ...state.followers].map((account) =>
    account.profileUrl.toLowerCase(),
  );
  const threadsCount = urls.filter((url) => url.includes('threads.net/')).length;
  const instagramCount = urls.filter((url) =>
    url.includes('instagram.com/'),
  ).length;

  if (threadsCount > instagramCount) return 'threads';
  if (instagramCount > threadsCount) return 'instagram';
  return null;
}

function isStoredStateRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.version === 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
