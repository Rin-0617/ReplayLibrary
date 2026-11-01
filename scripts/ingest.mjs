// Discord の共有チャンネルから、ReplayToolbox が投稿した匿名化済みリプレイを取り込む。
// 新規メッセージ（前回カーソル以降）だけを見て、.dat 添付を pending/ に落とし、index.json を更新する。
// .dat 本体は git にはコミットせず、後続ステップで「リリースのアセット」としてアップロードする
// （git 肥大を避け、GitHub の100MB push 制限も回避する。1アセット最大2GB）。
// bot トークンはこのスクリプトには埋め込まず、環境変数（Actions シークレット）から読む。
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL = process.env.CHANNEL_ID;
if (!TOKEN || !CHANNEL) {
  console.error('Missing DISCORD_BOT_TOKEN or CHANNEL_ID');
  process.exit(1);
}

const OWNER = 'Rin-0617';
const REPO = 'ReplayLibrary';
const TAG = 'library';
// .dat はこの固定リリース（tag=library）のアセットになる。URL は予測可能。
const ASSET_BASE = `https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/`;

const ROOT = process.cwd();
const PENDING = path.join(ROOT, 'pending');       // アップロード待ち（git 管理外）
const INDEX_PATH = path.join(ROOT, 'index.json');
const CURSOR_PATH = path.join(ROOT, '.cursor');
fs.mkdirSync(PENDING, { recursive: true });

const index = fs.existsSync(INDEX_PATH) ? JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')) : [];
const known = new Set(index.map((e) => e.id));
const startCursor = fs.existsSync(CURSOR_PATH) ? fs.readFileSync(CURSOR_PATH, 'utf8').trim() : '0';

const API = 'https://discord.com/api/v10';
const headers = { Authorization: `Bot ${TOKEN}` };

// Discord の id は Snowflake（単調増加）なので BigInt で比較する。
const maxId = (a, b) => (BigInt(a) > BigInt(b) ? a : b);

async function fetchAfter(after) {
  const url = `${API}/channels/${CHANNEL}/messages?limit=100&after=${after}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Discord messages ${res.status}: ${await res.text()}`);
  return res.json(); // newest-first
}

// 共有メッセージ本文（ReplayToolbox が生成する形式）からメタを取り出す。
//   **極○○討滅戦**（変換）
//   録画日時: 2026/10/26 21:30 ／ ビルド 14155597
//   共有者: `a1b2c3d4` ／ 共有ID: `9f3e21bc`
//   ※匿名化済み
function parseMeta(content) {
  const meta = {};
  let m;
  if ((m = content.match(/\*\*(.+?)\*\*（(.+?)）/))) { meta.content = m[1].trim(); meta.kind = m[2].trim(); }
  if ((m = content.match(/録画日時:\s*(.+?)\s*／\s*ビルド\s*(\d+)/))) { meta.recordedAt = m[1].trim(); meta.build = Number(m[2]); }
  if ((m = content.match(/共有ID:\s*`([^`]+)`/))) { meta.id = m[1].trim(); }
  if ((m = content.match(/共有者:\s*`([^`]+)`/))) { meta.sharer = m[1].trim(); }
  return meta;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`attachment ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// --- 新規メッセージを集める（after でページング） ---------------------------
const fresh = [];
let after = startCursor;
for (let page = 0; page < 50; page++) {
  const batch = await fetchAfter(after);
  if (batch.length === 0) break;
  fresh.push(...batch);
  after = batch.reduce((acc, msg) => maxId(acc, msg.id), after);
  if (batch.length < 100) break;
}

fresh.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)); // 古い順

let added = 0;
let cursor = startCursor;
for (const msg of fresh) {
  cursor = maxId(cursor, msg.id);
  const dat = (msg.attachments || []).find((a) => (a.filename || '').toLowerCase().endsWith('.dat'));
  if (!dat) continue;

  const meta = parseMeta(msg.content || '');
  if (!meta.id) continue;          // ReplayToolbox 由来でない投稿は無視
  if (known.has(meta.id)) continue; // 既出はスキップ

  let bytes;
  try {
    bytes = await download(dat.url);
  } catch (e) {
    console.error(`skip ${meta.id}: ${e.message}`);
    continue;
  }

  fs.writeFileSync(path.join(PENDING, `${meta.id}.dat`), bytes); // アップロード待ち
  index.push({
    id: meta.id,
    content: meta.content ?? '',
    kind: meta.kind ?? '',
    recordedAt: meta.recordedAt ?? '',
    build: meta.build ?? 0,
    sharer: meta.sharer ?? '',
    url: `${ASSET_BASE}${meta.id}.dat`,
    size: bytes.length,
    uploadedAt: new Date().toISOString(),
  });
  known.add(meta.id);
  added++;
  console.log(`+ ${meta.id} (${meta.content} / ${meta.kind}) ${bytes.length}B`);
}

index.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1)); // 新しい順
fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n');
fs.writeFileSync(CURSOR_PATH, cursor + '\n');

console.log(`done: +${added} new, ${index.length} total, cursor=${cursor}`);
