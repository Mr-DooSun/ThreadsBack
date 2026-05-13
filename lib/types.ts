export type SnapshotKind = 'following' | 'followers';
export type RelationshipPlatform = 'threads' | 'instagram';

export interface Account {
  username: string;
  displayName: string;
  avatarUrl?: string;
  profileUrl: string;
  firstSeenAt: number;
  hidden?: boolean;
}

export interface RelationshipSnapshot {
  timestamp: number;
  following: Account[];
  followers: Account[];
}

export interface RelationshipAnalysis {
  timestamp: number;
  followingCount: number;
  followerCount: number;
  notFollowingBack: Account[];
  reviewAccounts: Account[];
  hiddenCount: number;
}

export interface StoredRelationshipState {
  version: 1;
  following: Account[];
  followers: Account[];
  hiddenUsernames: string[];
  updatedAt?: number;
}

export type StoredRelationshipStates = Record<
  RelationshipPlatform,
  StoredRelationshipState
>;
