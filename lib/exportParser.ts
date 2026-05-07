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

export interface ExportParseResult {
  following: Account[];
  followers: Account[];
  recognizedFiles: string[];
  skippedFiles: ExportSkippedFile[];
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
const EXPORT_FILE_SIZE_LIMIT_BYTES = 50 * 1024 * 1024;

export async function parseExportFiles(files: File[]): Promise<ExportParseResult> {
  if (files.length === 0) {
    throw new ExportParseError('분석할 ZIP 또는 JSON 파일을 선택해 주세요.');
  }

  const entries: ExportParseEntry[] = [];
  const skippedFiles: ExportSkippedFile[] = [];

  for (const file of files) {
    if (file.size > EXPORT_FILE_SIZE_LIMIT_BYTES) {
      skippedFiles.push({
        name: file.name,
        reason: '파일이 50MB를 넘어 건너뛰었습니다.',
      });
      continue;
    }

    if (ZIP_EXTENSION.test(file.name)) {
      entries.push(...(await readZipEntries(file)));
      continue;
    }

    if (JSON_EXTENSION.test(file.name)) {
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

  return parseExportEntries(entries, skippedFiles);
}

export function parseExportEntries(
  entries: ExportParseEntry[],
  initialSkippedFiles: ExportSkippedFile[] = [],
): ExportParseResult {
  if (entries.length === 0 && initialSkippedFiles.length > 0) {
    throw new ExportParseError(initialSkippedFiles[0].reason);
  }

  const following: Account[] = [];
  const followers: Account[] = [];
  const recognizedFiles = new Set<string>();
  const skippedFiles = [...initialSkippedFiles];

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

    for (const kind of kinds) {
      const accounts = extractAccounts(parsed.value, kind);
      if (accounts.length === 0) continue;

      recognizedAny = true;
      recognizedFiles.add(entry.name);

      if (kind === 'following') {
        following.push(...accounts);
      } else {
        followers.push(...accounts);
      }
    }

    if (!recognizedAny) {
      skippedFiles.push({
        name: entry.name,
        reason: '계정 목록을 찾지 못했습니다.',
      });
    }
  }

  const result: ExportParseResult = {
    following: uniqueAccounts(following),
    followers: uniqueAccounts(followers),
    recognizedFiles: [...recognizedFiles].sort(),
    skippedFiles,
  };

  if (result.following.length === 0 && result.followers.length === 0) {
    throw new ExportParseError(
      '팔로워/팔로잉 데이터를 찾지 못했습니다. JSON 형식의 공식 export 파일인지 확인해 주세요.',
    );
  }

  return result;
}

async function readZipEntries(file: File): Promise<ExportParseEntry[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries: ExportParseEntry[] = [];

  for (const [name, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    if (!JSON_EXTENSION.test(name) && !HTML_EXTENSION.test(name)) continue;

    entries.push({
      name,
      content: await zipEntry.async('string'),
    });
  }

  return entries;
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
    if ('relationships_following' in value) kinds.add('following');
    if (Object.keys(value).some((key) => /^followers?_\d+$/i.test(key))) {
      kinds.add('followers');
    }
    if ('relationships_followers' in value) kinds.add('followers');
  }

  return [...kinds];
}

function extractAccounts(value: unknown, kind: SnapshotKind): Account[] {
  const relationshipItems = extractRelationshipItems(value, kind);
  const accounts: Account[] = [];

  for (const item of relationshipItems) {
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
          : buildProfileUrl(username);

      accounts.push({
        username,
        displayName: '',
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
    const direct = value.relationships_following;
    return Array.isArray(direct) ? direct : [];
  }

  const followersItems: unknown[] = [];
  const direct = value.relationships_followers;
  if (Array.isArray(direct)) followersItems.push(...direct);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (/^followers?_\d+$/i.test(key) && Array.isArray(nestedValue)) {
      followersItems.push(...nestedValue);
    }
  }

  return followersItems;
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

function buildProfileUrl(username: string): string {
  return `https://www.instagram.com/${normalizeUsername(username)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
