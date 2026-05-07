#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FOLLOWING_COUNT = Number(process.argv[2] ?? 200);
const MUTUAL_COUNT = Number(process.argv[3] ?? 80);

if (MUTUAL_COUNT > FOLLOWING_COUNT) {
  console.error('mutual count must be <= following count');
  process.exit(1);
}

const baseTimestamp = 1704067200;

function entry(username, offsetDays) {
  return {
    title: '',
    media_list_data: [],
    string_list_data: [
      {
        href: `https://www.instagram.com/${username}`,
        value: username,
        timestamp: baseTimestamp + offsetDays * 86400,
      },
    ],
  };
}

const following = Array.from({ length: FOLLOWING_COUNT }, (_, i) =>
  entry(`large_user_${String(i).padStart(4, '0')}`, i),
);

const followers = following.slice(0, MUTUAL_COUNT);

const outDir = join(__dirname, 'large');
mkdirSync(outDir, { recursive: true });

writeFileSync(
  join(outDir, 'following.json'),
  JSON.stringify({ relationships_following: following }, null, 2),
);
writeFileSync(
  join(outDir, 'followers_1.json'),
  JSON.stringify(followers, null, 2),
);

const reviewCount = FOLLOWING_COUNT - MUTUAL_COUNT;
console.log(`generated fixtures/large/`);
console.log(`  following.json    ${FOLLOWING_COUNT.toLocaleString()} accounts`);
console.log(`  followers_1.json  ${MUTUAL_COUNT.toLocaleString()} accounts`);
console.log(`  expected review:  ${reviewCount.toLocaleString()} accounts`);
