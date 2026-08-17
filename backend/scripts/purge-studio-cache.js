/**
 * 工作室优先改革：清理工作室模板/画布运行缓存与镜头库扩写缓存。
 * 不碰小说：projects / chapters / characters / scenes / shots / timelines
 * 以及 assets + uploads/projects/{真实 UUID}/
 *
 * 用法（在 backend 目录）:
 *   node scripts/purge-studio-cache.js
 *   npm run purge:studio
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'data', 'ai-video-studio.db');
const uploadsRoot = path.join(root, 'data', 'uploads', 'projects');
const VIRTUAL_BUCKETS = new Set(['_studio', '_library_shots']);

function rmrf(dir) {
  if (!fs.existsSync(dir)) return { removed: false, files: 0 };
  let files = 0;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else {
        fs.unlinkSync(p);
        files += 1;
      }
    }
  };
  walk(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  return { removed: true, files };
}

function tableExists(db, name) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name);
  return Boolean(row);
}

if (!fs.existsSync(dbPath)) {
  console.error('DB not found:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const before = {
  workflows: tableExists(db, 'workflows')
    ? db.prepare('SELECT COUNT(*) AS c FROM workflows').get().c
    : 0,
  workflow_runs: tableExists(db, 'workflow_runs')
    ? db.prepare('SELECT COUNT(*) AS c FROM workflow_runs').get().c
    : 0,
  shot_library_expands: tableExists(db, 'shot_library_expands')
    ? db.prepare('SELECT COUNT(*) AS c FROM shot_library_expands').get().c
    : 0,
  studio_assets: tableExists(db, 'assets')
    ? db
        .prepare(
          `SELECT COUNT(*) AS c FROM assets WHERE projectId IN ('_studio','_library_shots')`,
        )
        .get().c
    : 0,
};

console.log('Before:', before);

const tx = db.transaction(() => {
  const out = {
    workflows: 0,
    workflow_runs: 0,
    shot_library_expands: 0,
    assets: 0,
    job_runs: 0,
  };

  if (tableExists(db, 'workflow_runs')) {
    const info = db.prepare('DELETE FROM workflow_runs').run();
    out.workflow_runs = info.changes;
  }
  if (tableExists(db, 'workflows')) {
    const info = db.prepare('DELETE FROM workflows').run();
    out.workflows = info.changes;
  }
  if (tableExists(db, 'shot_library_expands')) {
    const info = db.prepare('DELETE FROM shot_library_expands').run();
    out.shot_library_expands = info.changes;
  }
  if (tableExists(db, 'assets')) {
    const info = db
      .prepare(`DELETE FROM assets WHERE projectId IN ('_studio','_library_shots')`)
      .run();
    out.assets = info.changes;
  }
  if (tableExists(db, 'job_runs')) {
    const info = db
      .prepare(
        `DELETE FROM job_runs
         WHERE projectId IN ('_studio','_library_shots','')
            OR (kind = 'workflow_run' AND (projectId LIKE '\\_%' ESCAPE '\\' OR projectId = ''))`,
      )
      .run();
    out.job_runs = info.changes;
  }

  return out;
});

const deleted = tx();
console.log('Deleted rows:', deleted);

const dirStats = {};
for (const bucket of VIRTUAL_BUCKETS) {
  const dir = path.join(uploadsRoot, bucket);
  dirStats[bucket] = rmrf(dir);
}
console.log('Upload dirs cleared:', dirStats);

const templatesDir = path.join(root, 'data', 'workflow-templates');
if (fs.existsSync(templatesDir)) {
  const st = rmrf(templatesDir);
  console.log('workflow-templates cleared:', st);
}

const after = {
  workflows: tableExists(db, 'workflows')
    ? db.prepare('SELECT COUNT(*) AS c FROM workflows').get().c
    : 0,
  workflow_runs: tableExists(db, 'workflow_runs')
    ? db.prepare('SELECT COUNT(*) AS c FROM workflow_runs').get().c
    : 0,
  shot_library_expands: tableExists(db, 'shot_library_expands')
    ? db.prepare('SELECT COUNT(*) AS c FROM shot_library_expands').get().c
    : 0,
  novel_projects: tableExists(db, 'projects')
    ? db.prepare('SELECT COUNT(*) AS c FROM projects').get().c
    : 0,
  novel_assets: tableExists(db, 'assets')
    ? db
        .prepare(
          `SELECT COUNT(*) AS c FROM assets
           WHERE projectId NOT IN ('_studio','_library_shots')
             AND projectId NOT LIKE '\\_%' ESCAPE '\\'`,
        )
        .get().c
    : 0,
};

db.close();
console.log('After:', after);
console.log('Done. Novel projects/assets preserved.');
