import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppSetting } from '../../entities/app-setting.entity';

/** M10 起 schema 版本；破坏性清理旧 Job / drama / scenes / shots */
export const SCHEMA_VERSION = 10;
const SCHEMA_KEY = 'schemaVersion';

const DEAD_JOB_KINDS = [
  'shot_generate',
  'tts_generate',
  'music_generate',
  'chapter_storyboard_generate',
  'chapter_video_generate',
  'chapter_scene_generate',
  'character_portrait_generate',
  'image_generate',
  'video_generate',
];

type AssetRow = { id: string; type: string; meta: string | Record<string, unknown> | null };

@Injectable()
export class SchemaMigrateService implements OnModuleInit {
  private readonly logger = new Logger(SchemaMigrateService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(AppSetting) private readonly settings: Repository<AppSetting>,
  ) {}

  async onModuleInit() {
    try {
      await this.migrate();
    } catch (e: any) {
      this.logger.error(`Schema migrate failed: ${e?.message || e}`);
    }
    try {
      await this.rewriteLegacyFileOssUrls();
    } catch (e: any) {
      this.logger.error(`FileOSS→MinIO URL rewrite failed: ${e?.message || e}`);
    }
  }

  private async currentVersion(): Promise<number> {
    const row = await this.settings.findOne({ where: { key: SCHEMA_KEY } });
    const n = Number(row?.value);
    return Number.isFinite(n) ? n : 0;
  }

  private async setVersion(v: number) {
    let row = await this.settings.findOne({ where: { key: SCHEMA_KEY } });
    if (!row) {
      row = this.settings.create({ key: SCHEMA_KEY, value: String(v) });
    } else {
      row.value = String(v);
    }
    await this.settings.save(row);
  }

  private parseMeta(raw: AssetRow['meta']): Record<string, unknown> {
    if (raw && typeof raw === 'object') return { ...(raw as Record<string, unknown>) };
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const v = JSON.parse(raw);
        return v && typeof v === 'object' ? { ...v } : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  /** 资产 meta 补齐 workflowId / productionId / role */
  private async backfillAssetMeta() {
    const wfToProd = new Map<string, string>();
    try {
      const prods: Array<{ id: string; workflowId: string }> = await this.db.query(
        `SELECT id, workflowId FROM productions WHERE workflowId IS NOT NULL AND TRIM(workflowId) != ''`,
      );
      for (const p of prods || []) {
        const wid = String(p.workflowId || '').trim();
        if (wid) wfToProd.set(wid, String(p.id));
      }
    } catch (e: any) {
      this.logger.warn(`productions lookup skipped: ${e?.message || e}`);
    }

    let rows: AssetRow[] = [];
    try {
      rows = await this.db.query(`SELECT id, type, meta FROM assets`);
    } catch (e: any) {
      this.logger.warn(`assets meta backfill skipped: ${e?.message || e}`);
      return;
    }

    let patched = 0;
    for (const row of rows || []) {
      const meta = this.parseMeta(row.meta);
      const type = String(row.type || '');
      const purpose = String(meta.purpose || '');
      const source = String(meta.source || '');
      const workflowId = String(meta.workflowId || '').trim();
      let role = String(meta.role || '').trim();
      let productionId = String(meta.productionId || '').trim();
      let changed = false;

      if (!role) {
        if (purpose === 'cover' || type === 'cover') role = 'cover';
        else if (type === 'script') role = 'script';
        else if (purpose.startsWith('library_shot_')) role = 'library';
        else if (source === 'workflow' || workflowId) role = 'output';
        else if (source === 'workflow-upload') role = 'reference';
        else if (meta.timelineId || purpose === 'subtitle' || type === 'subtitle') role = 'export';
        else if (source === 'extracted' || type === 'character_ref') role = 'reference';
        else role = type === 'image' || type === 'video' ? 'output' : 'reference';
        meta.role = role;
        changed = true;
      }

      if (!('workflowId' in meta)) {
        meta.workflowId = workflowId;
        changed = true;
      }

      if (!productionId && workflowId && wfToProd.has(workflowId)) {
        productionId = wfToProd.get(workflowId)!;
        meta.productionId = productionId;
        changed = true;
      } else if (!('productionId' in meta)) {
        meta.productionId = productionId;
        changed = true;
      }

      if (!changed) continue;
      await this.db.query(`UPDATE assets SET meta = ? WHERE id = ?`, [
        JSON.stringify(meta),
        row.id,
      ]);
      patched += 1;
    }
    this.logger.log(`Asset meta normalized: ${patched}/${rows.length}`);
  }

  private async migrate() {
    const ver = await this.currentVersion();
    if (ver >= SCHEMA_VERSION) {
      this.logger.log(`schema v${ver} ok`);
      return;
    }
    this.logger.warn(`Migrating schema ${ver} → ${SCHEMA_VERSION} (destructive)`);

    await this.db.query('DROP TABLE IF EXISTS scenes');
    await this.db.query('DROP TABLE IF EXISTS shots');

    const kinds = DEAD_JOB_KINDS.map((k) => `'${k}'`).join(',');
    await this.db.query(`DELETE FROM job_runs WHERE kind IN (${kinds})`);

    // 书库项目级旧时间轴（制作单时间轴 productionId 非空）
    await this.db.query(
      `DELETE FROM timelines WHERE productionId IS NULL OR TRIM(productionId) = ''`,
    );

    // 默认漫剧流水线工作流（MySQL：JSON/TEXT 用 CAST(... AS CHAR)）
    const dramaWhere = `CAST(tags AS CHAR) LIKE '%drama_pipeline%'
         OR CAST(graph AS CHAR) LIKE '%drama_pipeline%'
         OR CAST(graph AS CHAR) LIKE '%drama.chapterGenerate%'`;
    try {
      await this.db.query(
        `DELETE FROM workflow_revisions WHERE workflowId IN (SELECT id FROM workflows WHERE ${dramaWhere})`,
      );
      await this.db.query(
        `DELETE FROM workflow_runs WHERE workflowId IN (SELECT id FROM workflows WHERE ${dramaWhere})`,
      );
      await this.db.query(`DELETE FROM workflows WHERE ${dramaWhere}`);
    } catch (e: any) {
      this.logger.warn(`drama workflow cleanup skipped: ${e?.message || e}`);
    }

    // 清空项目上的默认 drama 工作流指针（列可能随后被实体删除）
    try {
      await this.db.query(
        `UPDATE projects SET defaultWorkflowId = '' WHERE defaultWorkflowId IS NOT NULL AND defaultWorkflowId != ''`,
      );
    } catch {
      /* column may already be gone */
    }

    await this.backfillAssetMeta();

    await this.setVersion(SCHEMA_VERSION);
    this.logger.warn(`Schema migrated to v${SCHEMA_VERSION}`);
  }

  /**
   * FileOSS → MinIO：库内历史直链批量改写（去掉 /api/v1，换公网域名）。
   * 桶名与 object key 不变。v2 补上 productions / workflows.thumbUrl 等项目侧字段。
   */
  private async rewriteLegacyFileOssUrls() {
    const FLAG = 'fileOssMinioUrlRewriteV2';
    const flag = await this.settings.findOne({ where: { key: FLAG } });
    if (flag?.value === '1') return;

    const oldPrefix = String(process.env.LEGACY_OSS_PUBLIC_PREFIX || '').trim();
    const newBase = String(process.env.FILE_OSS_BASE_URL || '')
      .trim()
      .replace(/\/+$/, '');
    if (!oldPrefix || !newBase) {
      // 未配置迁移源/目标时跳过，不写 FLAG，待配置后再跑
      this.logger.log(
        '跳过历史 OSS URL 改写：请设置 LEGACY_OSS_PUBLIC_PREFIX 与 FILE_OSS_BASE_URL',
      );
      return;
    }
    const newPrefix = `${newBase}/`;
    const like = `${oldPrefix}%`;
    const likeAny = `%${oldPrefix}%`;

    const runReplace = async (sql: string, params: unknown[]) => {
      try {
        const r = await this.db.query(sql, params);
        return Number((r as any)?.changes ?? (r as any)?.affectedRows ?? 0) || 0;
      } catch (e: any) {
        this.logger.warn(`URL rewrite skip: ${e?.message || e}`);
        return 0;
      }
    };

    const textCol = (table: string, col: string) =>
      runReplace(`UPDATE ${table} SET ${col} = REPLACE(${col}, ?, ?) WHERE ${col} LIKE ?`, [
        oldPrefix,
        newPrefix,
        like,
      ]);

    const jsonCol = (table: string, col: string) =>
      runReplace(
        `UPDATE ${table} SET ${col} = REPLACE(CAST(${col} AS CHAR), ?, ?) WHERE CAST(${col} AS CHAR) LIKE ?`,
        [oldPrefix, newPrefix, likeAny],
      );

    let touched = 0;
    touched += await textCol('assets', 'url');
    touched += await jsonCol('assets', 'meta');
    touched += await textCol('generate_messages', 'mediaUrl');
    touched += await jsonCol('generate_messages', 'prefsJson');

    // 项目列表封面就在这里（上次漏了）
    touched += await textCol('productions', 'thumbUrl');
    touched += await jsonCol('productions', 'meta');

    touched += await textCol('workflows', 'thumbUrl');
    touched += await jsonCol('workflows', 'graph');
    touched += await jsonCol('workflow_revisions', 'graph');
    touched += await jsonCol('workflow_runs', 'nodeStates');
    touched += await jsonCol('workflow_runs', 'inputs');
    touched += await jsonCol('workflow_runs', 'result');
    touched += await jsonCol('workflow_runs', 'graphSnapshot');
    touched += await jsonCol('workflow_runs', 'promptSnapshot');

    touched += await textCol('user_prompts', 'coverUrl');
    touched += await textCol('discover_posts', 'thumbUrl');

    touched += await textCol('shot_library_expands', 'plotGridUrl');
    touched += await textCol('shot_library_expands', 'sceneUrl');
    touched += await jsonCol('shot_library_expands', 'sheetUrls');
    touched += await jsonCol('shot_library_expands', 'portraitUrls');
    touched += await jsonCol('shot_library_expands', 'propUrls');

    let row = flag;
    if (!row) row = this.settings.create({ key: FLAG, value: '1' });
    else row.value = '1';
    await this.settings.save(row);
    // 兼容旧旗标
    const legacy = await this.settings.findOne({ where: { key: 'fileOssMinioUrlRewrite' } });
    if (!legacy) {
      await this.settings.save(this.settings.create({ key: 'fileOssMinioUrlRewrite', value: '1' }));
    } else if (legacy.value !== '1') {
      legacy.value = '1';
      await this.settings.save(legacy);
    }
    this.logger.log(`FileOSS→MinIO URL rewrite v2 done (touched≈${touched})`);
  }
}
