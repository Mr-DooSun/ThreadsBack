import JSZip from 'jszip';
import { normalizeUsername, uniqueAccounts } from './diff';
import type { Account, SnapshotKind } from './types';

export interface ExportParseEntry {
  name: string;
  content: string;
}

export interface ExportSkippedFile {
  name: string;
  reason: string;
}

export type ExportPlatformHint = 'threads' | 'instagram';

export interface ExportParseResult {
  following: Account[];
  followers: Account[];
  recognizedFiles: string[];
  skippedFiles: ExportSkippedFile[];
  platformHints: ExportPlatformHint[];
}

export interface ExportParseOptions {
  preferredPlatform?: ExportPlatformHint;
}

export class ExportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportParseError';
  }
}

const JSON_EXTENSION = /\.json$/i;
const ZIP_EXTENSION = /\.zip$/i;
const HTML_EXTENSION = /\.html?$/i;
const JSON_FILE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;

export async function parseExportFiles(
  files: File[],
  options: ExportParseOptions = {},
): Promise<ExportParseResult> {
  if (files.length === 0) {
    throw new ExportParseError('분석할 ZIP 또는 JSON 파일을 선택해 주세요.');
  }

  const entries: ExportParseEntry[] = [];
  const skippedFiles: ExportSkippedFile[] = [];

  for (const file of files) {
    if (ZIP_EXTENSION.test(file.name)) {
      const zipResult = await readZipEntries(file);
      entries.push(...zipResult.entries);
      skippedFiles.push(...zipResult.skippedFiles);
      continue;
    }

    if (JSON_EXTENSION.test(file.name)) {
      if (file.size > JSON_FILE_SIZE_LIMIT_BYTES) {
        skippedFiles.push({
          name: file.name,
          reason:
            'JSON 파일이 100MB를 넘어 브라우저에서 안전하게 처리하지 않았습니다. 팔로워/팔로잉 항목만 다시 내려받아 주세요.',
        });
        continue;
      }

      entries.push({
        name: file.name,
        content: await file.text(),
      });
      continue;
    }

    if (HTML_EXTENSION.test(file.name)) {
      skippedFiles.push({
        name: file.name,
        reason: 'HTML export는 v1에서 지원하지 않습니다. JSON 형식으로 다시 요청해 주세요.',
      });
      continue;
    }

    skippedFiles.push({
      name: file.name,
      reason: '지원하지 않는 파일 형식입니다.',
    });
  }

  return parseExportEntries(entries, skippedFiles, options);
}

export function parseExportEntries(
  entries: ExportParseEntry[],
  initialSkippedFiles: ExportSkippedFile[] = [],
  options: ExportParseOptions = {},
): ExportParseResult {
  if (entries.length === 0 && initialSkippedFiles.length > 0) {
    throw new ExportParseError(initialSkippedFiles[0].reason);
  }

  const skippedFiles = [...initialSkippedFiles];
  const recognizedEntries: Array<{
    accounts: Account[];
    kind: SnapshotKind;
    name: string;
    platformHint: ExportPlatformHint | null;
  }> = [];

  for (const entry of entries) {
    if (HTML_EXTENSION.test(entry.name)) {
      skippedFiles.push({
        name: entry.name,
        reason: 'HTML export는 v1에서 지원하지 않습니다. JSON 형식으로 다시 요청해 주세요.',
      });
      continue;
    }

    if (!JSON_EXTENSION.test(entry.name)) {
      skippedFiles.push({
        name: entry.name,
        reason: 'JSON 파일이 아니어서 건너뛰었습니다.',
      });
      continue;
    }

    const parsed = parseJson(entry);
    if (!parsed.ok) {
      skippedFiles.push({
        name: entry.name,
        reason: parsed.error,
      });
      continue;
    }

    const kinds = detectRelationshipKinds(entry.name, parsed.value);
    if (kinds.length === 0) {
      skippedFiles.push({
        name: entry.name,
        reason: '팔로워/팔로잉 데이터로 인식하지 못했습니다.',
      });
      continue;
    }

    let recognizedAny = false;
    const platformHint = detectPlatformHint(entry.name, parsed.value);

    for (const kind of kinds) {
      const accounts = extractAccounts(parsed.value, kind, platformHint);
      if (accounts.length === 0) continue;

      recognizedAny = true;
      recognizedEntries.push({
        accounts,
        kind,
        name: entry.name,
        platformHint,
      });
    }

    if (!recognizedAny) {
      skippedFiles.push({
        name: entry.name,
        reason: '계정 목록을 찾지 못했습니다.',
      });
    }
  }

  const availablePlatformHints = new Set(
    recognizedEntries
      .map((entry) => entry.platformHint)
      .filter((hint): hint is ExportPlatformHint => Boolean(hint)),
  );
  const shouldFilterByPreferredPlatform =
    Boolean(options.preferredPlatform) && availablePlatformHints.size > 1;
  const selectedEntries = shouldFilterByPreferredPlatform
    ? recognizedEntries.filter(
        (entry) => entry.platformHint === options.preferredPlatform,
      )
    : recognizedEntries;

  const following: Account[] = [];
  const followers: Account[] = [];
  const recognizedFiles = new Set<string>();
  const platformHints = new Set<ExportPlatformHint>();

  for (const entry of selectedEntries) {
    recognizedFiles.add(entry.name);
    if (entry.platformHint) platformHints.add(entry.platformHint);

    if (entry.kind === 'following') {
      following.push(...entry.accounts);
    } else {
      followers.push(...entry.accounts);
    }
  }

  const result: ExportParseResult = {
    following: uniqueAccounts(following),
    followers: uniqueAccounts(followers),
    recognizedFiles: [...recognizedFiles].sort(),
    skippedFiles,
    platformHints: [...platformHints].sort(),
  };

  if (result.following.length === 0 && result.followers.length === 0) {
    if (skippedFiles.length > 0) {
      throw new ExportParseError(skippedFiles[0].reason);
    }

    throw new ExportParseError(
      '팔로워/팔로잉 데이터를 찾지 못했습니다. JSON 형식의 공식 export 파일인지 확인해 주세요.',
    );
  }

  return result;
}

async function readZipEntries(file: File): Promise<{
  entries: ExportParseEntry[];
  skippedFiles: ExportSkippedFile[];
}> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    return {
      entries: [],
      skippedFiles: [
        {
          name: file.name,
          reason:
            'ZIP 파일을 열지 못했습니다. 파일이 너무 크거나 손상되었을 수 있습니다. Meta에서 받은 원본 ZIP 파일인지 확인해 주세요.',
        },
      ],
    };
  }

  const entries: ExportParseEntry[] = [];

  for (const [name, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    if (!isRelationshipCandidatePath(name)) continue;

    entries.push({
      name,
      content: await zipEntry.async('string'),
    });
  }

  if (entries.length === 0) {
    return {
      entries,
      skippedFiles: [
        {
          name: file.name,
          reason:
            'ZIP 안에서 Instagram 또는 Threads 팔로워/팔로잉 JSON 파일을 찾지 못했습니다.',
        },
      ],
    };
  }

  return { entries, skippedFiles: [] };
}

function isRelationshipCandidatePath(name: string): boolean {
  const lowerName = name.toLowerCase();
  const basename = lowerName.split('/').at(-1) ?? lowerName;

  if (!JSON_EXTENSION.test(lowerName) && !HTML_EXTENSION.test(lowerName)) {
    return false;
  }

  return (
    /following|relationships_following/.test(basename) ||
    /followers?(_\d+)?\.(json|html?)$/.test(basename) ||
    lowerName.includes('relationships_following') ||
    lowerName.includes('relationships_followers')
  );
}

function parseJson(entry: ExportParseEntry):
  | { ok: true; value: unknown }
  | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(entry.content) as unknown };
  } catch {
    return { ok: false, error: 'JSON을 읽지 못했습니다.' };
  }
}

function detectRelationshipKinds(name: string, value: unknown): SnapshotKind[] {
  const lowerName = name.toLowerCase();
  const basename = lowerName.split('/').at(-1) ?? lowerName;
  const kinds = new Set<SnapshotKind>();

  if (/following|relationships_following/.test(basename)) {
    kinds.add('following');
  }

  if (/followers?(_\d+)?\.json$/.test(basename)) {
    kinds.add('followers');
  }

  if (isRecord(value)) {
    if (Object.keys(value).some(isFollowingRelationshipKey)) {
      kinds.add('following');
    }
    if (Object.keys(value).some((key) => /^followers?_\d+$/i.test(key))) {
      kinds.add('followers');
    }
    if (Object.keys(value).some(isFollowersRelationshipKey)) {
      kinds.add('followers');
    }
  }

  return [...kinds];
}

function detectPlatformHint(
  name: string,
  value: unknown,
): ExportPlatformHint | null {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('/threads/') || lowerName.includes('your_threads')) {
    return 'threads';
  }

  if (isRecord(value)) {
    const keys = Object.keys(value).map((key) => key.toLowerCase());
    if (keys.some((key) => key.includes('text_post_app'))) {
      return 'threads';
    }
    if (
      keys.some(
        (key) =>
          key === 'relationships_following' ||
          key === 'relationships_followers' ||
          /^followers?_\d+$/i.test(key),
      )
    ) {
      return 'instagram';
    }
  }

  if (
    lowerName.includes('/connections/') ||
    lowerName.includes('followers_and_following')
  ) {
    return 'instagram';
  }

  return null;
}

function extractAccounts(
  value: unknown,
  kind: SnapshotKind,
  platformHint: ExportPlatformHint | null,
): Account[] {
  const relationshipItems = extractRelationshipItems(value, kind);
  const accounts: Account[] = [];

  for (const item of relationshipItems) {
    const rawDisplayName =
      isRecord(item) && typeof item.title === 'string' ? item.title : '';
    const stringListData = isRecord(item) ? item.string_list_data : undefined;
    if (!Array.isArray(stringListData)) continue;

    for (const data of stringListData) {
      if (!isRecord(data)) continue;

      const rawUsername =
        typeof data.value === 'string' ? data.value : extractUsernameFromHref(data.href);
      const username = normalizeUsername(rawUsername ?? '');
      if (!username) continue;

      const href =
        typeof data.href === 'string' && data.href.trim().length > 0
          ? data.href
          : buildProfileUrl(username, platformHint);

      accounts.push({
        username,
        displayName: normalizeDisplayName(rawDisplayName),
        profileUrl: href,
        firstSeenAt:
          typeof data.timestamp === 'number' ? data.timestamp * 1000 : Date.now(),
      });
    }
  }

  return uniqueAccounts(accounts);
}

function extractRelationshipItems(value: unknown, kind: SnapshotKind): unknown[] {
  if (Array.isArray(value)) return value;

  if (!isRecord(value)) return [];

  if (kind === 'following') {
    return extractArrayItemsByKey(value, isFollowingRelationshipKey);
  }

  return extractArrayItemsByKey(value, isFollowersRelationshipKey);
}

function extractArrayItemsByKey(
  value: Record<string, unknown>,
  keyMatcher: (key: string) => boolean,
): unknown[] {
  const items: unknown[] = [];
  for (const [key, nestedValue] of Object.entries(value)) {
    if (keyMatcher(key) && Array.isArray(nestedValue)) {
      items.push(...nestedValue);
    }
  }
  return items;
}

function isFollowingRelationshipKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return lowerKey === 'following' || lowerKey.endsWith('_following');
}

function isFollowersRelationshipKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return (
    lowerKey === 'followers' ||
    lowerKey.endsWith('_followers') ||
    /^followers?_\d+$/i.test(lowerKey)
  );
}

function extractUsernameFromHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value);
    const lastSegment = url.pathname.split('/').filter(Boolean).at(-1);
    return lastSegment ? normalizeUsername(lastSegment) : null;
  } catch {
    return null;
  }
}

function buildProfileUrl(
  username: string,
  platformHint: ExportPlatformHint | null,
): string {
  const normalizedUsername = normalizeUsername(username);
  return platformHint === 'threads'
    ? `https://www.threads.net/@${normalizedUsername}`
    : `https://www.instagram.com/${normalizedUsername}`;
}

function normalizeDisplayName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  return decodeLatin1Utf8Mojibake(trimmed) ?? trimmed;
}

function decodeLatin1Utf8Mojibake(value: string): string | null {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 255) return null;
    bytes.push(code);
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(bytes),
    );
    const normalized = decoded.trim();
    if (!normalized || normalized === value) return null;
    return hasDecodedUnicodeText(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function hasDecodedUnicodeText(value: string): boolean {
  return /[^\u0000-\u00ff]/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
