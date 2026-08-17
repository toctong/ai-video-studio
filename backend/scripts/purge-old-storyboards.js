/**
 * 清理旧版章节分镜图 / 章成片，并清空 shots，便于按「每镜首尾帧」新模型重来。
 * 保留：定妆 character_ref、封面 cover、大纲 script、画风 style 等。
 * 同时删除 uploads 下已无资产引用的孤儿文件。
 *
 * 用法（在 backend 目录）: node scripts/purge-old-storyboards.js
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'data', 'ai-video-studio.db');
const uploads = path.join(root, 'data', 'uploads', 'projects');

if (!fs.existsSync(dbPath)) {
  console.error('DB not found:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

function unlinkQuiet(filePath) {
  const p = String(filePath || '').trim();
  if (!p || !fs.existsSync(p)) return false;
  try {
    fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

const storyboards = db.prepare("SELECT id, filePath, name FROM assets WHERE type = 'storyboard'").all();
const videos = db
  .prepare(
    `SELECT id, filePath, name
     FROM assets
     WHERE type = 'video'
       AND (
         CAST(meta AS TEXT) LIKE '%chapter_video%'
         OR CAST(meta AS TEXT) LIKE '%shot_video%'
         OR name LIKE '%章成片%'
         OR name LIKE '%镜头视频%'
       )`,
  )
  .all();

const shotCount = db.prepare('SELECT COUNT(*) AS c FROM shots').get().c;

console.log(`Found storyboard assets: ${storyboards.length}`);
console.log(`Found chapter/shot video assets: ${videos.length}`);
console.log(`Found shots rows: ${shotCount}`);

const tx = db.transaction(() => {
  let filesRemoved = 0;
  for (const a of [...storyboards, ...videos]) {
    if (unlinkQuiet(a.filePath)) filesRemoved += 1;
  }

  const delAsset = db.prepare('DELETE FROM assets WHERE id = ?');
  for (const id of [...storyboards, ...videos].map((a) => a.id)) delAsset.run(id);

  db.prepare('DELETE FROM shots').run();

  return { filesRemoved, assetsRemoved: storyboards.length + videos.length };
});

const result = tx();

const referenced = new Set(
  db
    .prepare('SELECT filePath FROM assets')
    .all()
    .map((r) => String(r.filePath || '').trim().replace(/\\/g, '/').toLowerCase())
    .filter(Boolean),
);

let orphanRemoved = 0;
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      walk(abs);
      continue;
    }
    const key = abs.replace(/\\/g, '/').toLowerCase();
    if (referenced.has(key)) continue;
    if (unlinkQuiet(abs)) orphanRemoved += 1;
  }
}
walk(uploads);

db.close();

console.log('Done.');
console.log(`  files unlinked: ${result.filesRemoved}`);
console.log(`  asset rows deleted: ${result.assetsRemoved}`);
console.log(`  shots cleared: ${shotCount}`);
console.log(`  orphan uploads removed: ${orphanRemoved}`);
console.log('请到「章节分镜」按新流程重新生成（拆镜 + 每镜首尾帧）。');
