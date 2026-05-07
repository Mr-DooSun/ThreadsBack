import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  ExportParseError,
  parseExportEntries,
  parseExportFiles,
} from './exportParser';

function relationshipEntry(username: string, href = `https://www.instagram.com/${username}`) {
  return {
    title: '',
    media_list_data: [],
    string_list_data: [
      {
        href,
        value: username,
        timestamp: 1_700_000_000,
      },
    ],
  };
}

describe('export parser', () => {
  it('parses a single followers json file', () => {
    const result = parseExportEntries([
      {
        name: 'connections/followers_and_following/followers_1.json',
        content: JSON.stringify([
          relationshipEntry('alpha'),
          relationshipEntry('beta'),
        ]),
      },
    ]);

    expect(result.followers.map((account) => account.username)).toEqual([
      'alpha',
      'beta',
    ]);
    expect(result.following).toEqual([]);
  });

  it('parses a single following json file', () => {
    const result = parseExportEntries([
      {
        name: 'connections/followers_and_following/following.json',
        content: JSON.stringify({
          relationships_following: [
            relationshipEntry('alpha'),
            relationshipEntry('beta'),
          ],
        }),
      },
    ]);

    expect(result.following.map((account) => account.username)).toEqual([
      'alpha',
      'beta',
    ]);
    expect(result.followers).toEqual([]);
  });

  it('merges multiple follower shards and removes duplicates', () => {
    const result = parseExportEntries([
      {
        name: 'followers_1.json',
        content: JSON.stringify([relationshipEntry('alpha')]),
      },
      {
        name: 'followers_2.json',
        content: JSON.stringify([relationshipEntry('alpha'), relationshipEntry('beta')]),
      },
    ]);

    expect(result.followers.map((account) => account.username)).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('throws for unrecognized json files', () => {
    expect(() =>
      parseExportEntries([
        {
          name: 'profile.json',
          content: JSON.stringify({ profile: { username: 'alpha' } }),
        },
      ]),
    ).toThrow(ExportParseError);
  });

  it('returns a clear error for html-only exports', () => {
    expect(() =>
      parseExportEntries([
        {
          name: 'followers.html',
          content: '<html></html>',
        },
      ]),
    ).toThrow('JSON 형식의 공식 export 파일인지 확인해 주세요');
  });

  it('parses zip files from browser File input', async () => {
    const zip = new JSZip();
    zip.file(
      'connections/followers_and_following/followers_1.json',
      JSON.stringify([relationshipEntry('alpha')]),
    );
    zip.file(
      'connections/followers_and_following/following.json',
      JSON.stringify({
        relationships_following: [relationshipEntry('beta')],
      }),
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([blob], 'instagram-export.zip', {
      type: 'application/zip',
    });

    const result = await parseExportFiles([file]);

    expect(result.followers.map((account) => account.username)).toEqual(['alpha']);
    expect(result.following.map((account) => account.username)).toEqual(['beta']);
  });

  it('handles a large generated export', () => {
    const following = Array.from({ length: 10_000 }, (_, index) =>
      relationshipEntry(`user_${index}`),
    );
    const followers = Array.from({ length: 9_500 }, (_, index) =>
      relationshipEntry(`user_${index}`),
    );

    const result = parseExportEntries([
      {
        name: 'following.json',
        content: JSON.stringify({ relationships_following: following }),
      },
      {
        name: 'followers_1.json',
        content: JSON.stringify(followers),
      },
    ]);

    expect(result.following).toHaveLength(10_000);
    expect(result.followers).toHaveLength(9_500);
  });
});
