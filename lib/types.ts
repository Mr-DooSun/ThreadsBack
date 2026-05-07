export type SnapshotKind = 'following' | 'followers';

export interface Account {
  username: string;
  displayName: string;
  avatarUrl?: string;
  profileUrl: string;
  firstSeenAt: number;
  hidden?: boolean;
  kept?: boolean;
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
  keptAccounts: Account[];
  hiddenCount: number;
}

export interface StoredRelationshipState {
  version: 1;
  following: Account[];
  followers: Account[];
  keptUsernames: string[];
  hiddenUsernames: string[];
  updatedAt?: number;
}
