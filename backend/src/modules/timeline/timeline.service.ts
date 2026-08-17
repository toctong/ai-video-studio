import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { spawn } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { Timeline } from '../../entities/timeline.entity';
import { AssetsService } from '../assets/assets.service';
import { Asset } from '../../entities/asset.entity';

@Injectable()
export class TimelineService {
  constructor(
    @InjectRepository(Timeline) private readonly timelines: Repository<Timeline>,
    private readonly assets: AssetsService,
  ) {}

  async getByProject(projectId: string) {
    let t = await this.timelines.findOne({
      where: { projectId, productionId: '' },
    });
    if (!t) {
      // 兼容旧数据（无 productionId 列前创建的行）
      t = await this.timelines.findOne({ where: { projectId } });
    }
    if (!t) {
      t = await this.timelines.save(
        this.timelines.create({
          projectId,
          productionId: '',
          name: '主时间轴',
          data: { fps: 24, width: 1280, height: 720, tracks: [] },
        }),
      );
    }
    return t;
  }

  async update(projectId: string, data: Timeline['data'], name?: string) {
    const t = await this.getByProject(projectId);
    t.data = data;
    if (name) t.name = name;
    return this.timelines.save(t);
  }

  private runFfmpeg(args: string[]) {
    return new Promise<void>((resolve, reject) => {
      const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', (d) => (err += d.toString()));
      p.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(err.slice(-2000) || `ffmpeg exit ${code}`));
      });
    });
  }

  async exportWithFfmpeg(projectId: string, timelineId?: string): Promise<Asset> {
    const t = timelineId
      ? await this.timelines.findOne({ where: { id: timelineId } })
      : await this.getByProject(projectId);
    if (!t) throw new NotFoundException('时间轴不存在');

    const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'data', 'uploads');
    const workDir = join(uploadDir, 'projects', projectId, 'export-work');
    if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

    const videoTrack = t.data.tracks.find((tr) => tr.type === 'video');
    const clips = videoTrack?.clips || [];
    const listFile = join(workDir, 'concat.txt');
    const lines: string[] = [];

    if (clips.length === 0) {
      // 无视频时生成纯色占位 + 字幕预览轨
      const color = join(workDir, 'color.mp4');
      const duration = Math.max(
        4,
        ...t.data.tracks.flatMap((tr) => tr.clips.map((c) => c.start + c.duration)),
        8,
      );
      await this.runFfmpeg([
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=black:s=${t.data.width}x${t.data.height}:d=${duration}`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        color,
      ]);
      lines.push(`file '${color.replace(/\\/g, '/')}'`);
    } else {
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const asset = await this.assets.get(clip.assetId);
        const mediaPath = await this.assets.ensureLocalFilePath(asset, workDir);
        const trimmed = join(workDir, `v${i}.mp4`);
        const fadeArgs: string[] = [];
        if (clip.transition === 'fade' || clip.transition === 'dissolve') {
          const d = Math.min(0.5, clip.duration / 3);
          fadeArgs.push(
            '-vf',
            `fade=t=in:st=0:d=${d},fade=t=out:st=${Math.max(0, clip.duration - d)}:d=${d}`,
          );
        }
        await this.runFfmpeg([
          '-y',
          '-i',
          mediaPath,
          '-t',
          String(clip.duration),
          ...fadeArgs,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-an',
          trimmed,
        ]).catch(async () => {
          // fallback copy without fade
          await this.runFfmpeg(['-y', '-i', mediaPath, '-t', String(clip.duration), '-c', 'copy', trimmed]);
        });
        lines.push(`file '${trimmed.replace(/\\/g, '/')}'`);
      }
    }
    writeFileSync(listFile, lines.join('\n'), 'utf8');

    const outId = uuid();
    const outPath = join(uploadDir, 'projects', projectId, `${outId}.mp4`);

    // 拼接视频
    const concatOut = join(workDir, 'concat.mp4');
    await this.runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c',
      'copy',
      concatOut,
    ]).catch(async () => {
      await this.runFfmpeg([
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        concatOut,
      ]);
    });

    // 混音（旁白/对白/BGM）
    const audioClips = t.data.tracks
      .filter((tr) => tr.type === 'audio')
      .flatMap((tr) => tr.clips)
      .filter((c) => c.assetId);

    let finalVideo = concatOut;
    if (audioClips.length) {
      const mixed = join(workDir, 'mixed.mp4');
      const inputs = ['-i', concatOut];
      const filterParts: string[] = [];
      let idx = 1;
      for (const clip of audioClips) {
        const a = await this.assets.get(clip.assetId);
        try {
          const audioPath = await this.assets.ensureLocalFilePath(a, workDir);
          inputs.push('-i', audioPath);
          filterParts.push(
            `[${idx}:a]adelay=${Math.round(clip.start * 1000)}|${Math.round(clip.start * 1000)}[a${idx}]`,
          );
          idx++;
        } catch {
          /* skip missing audio */
        }
      }
      if (filterParts.length) {
        const mixInputs = Array.from({ length: filterParts.length }, (_, i) => `[a${i + 1}]`).join(
          '',
        );
        const filter = `${filterParts.join(';')};${mixInputs}amix=inputs=${filterParts.length}:dropout_transition=0[aout]`;
        await this.runFfmpeg([
          '-y',
          ...inputs,
          '-filter_complex',
          filter,
          '-map',
          '0:v',
          '-map',
          '[aout]',
          '-c:v',
          'copy',
          '-shortest',
          mixed,
        ]);
        finalVideo = mixed;
      }
    }

    // 字幕烧录
    const subClips = t.data.tracks.find((tr) => tr.type === 'subtitle')?.clips || [];
    if (subClips.length) {
      const srt = subClips
        .map((c, i) => {
          const start = this.formatSrtTime(c.start);
          const end = this.formatSrtTime(c.start + c.duration);
          return `${i + 1}\n${start} --> ${end}\n${c.text || ''}\n`;
        })
        .join('\n');
      const srtPath = join(workDir, 'subs.srt');
      writeFileSync(srtPath, srt, 'utf8');
      const burned = join(workDir, 'burned.mp4');
      const escaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      await this.runFfmpeg([
        '-y',
        '-i',
        finalVideo,
        '-vf',
        `subtitles='${escaped}'`,
        '-c:a',
        'copy',
        burned,
      ]).catch(async () => {
        copyFileSync(finalVideo, outPath);
      });
      if (existsSync(burned)) {
        copyFileSync(burned, outPath);
      } else if (!existsSync(outPath)) {
        copyFileSync(finalVideo, outPath);
      }
    } else {
      copyFileSync(finalVideo, outPath);
    }

    const asset = await this.assets.createFromBuffer(projectId, {
      type: 'export',
      name: `成片-${new Date().toISOString().slice(0, 19)}`,
      buffer: readFileSync(outPath),
      ext: '.mp4',
      mimeType: 'video/mp4',
      meta: { timelineId: t.id },
    });
    t.exportAssetId = asset.id;
    await this.timelines.save(t);
    return asset;
  }

  private formatSrtTime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  async exportSubtitleAsset(projectId: string) {
    const t = await this.getByProject(projectId);
    let subClips = t.data.tracks.find((tr) => tr.type === 'subtitle')?.clips || [];
    if (!subClips.length) {
      // ensure subtitle track exists from current timeline / rebuild from empty
      subClips = [];
    }
    if (!subClips.length) {
      throw new NotFoundException('时间轴尚无字幕，请先「从镜头自动编排」');
    }
    const srt = subClips
      .map((c, i) => {
        const start = this.formatSrtTime(c.start);
        const end = this.formatSrtTime(c.start + c.duration);
        return `${i + 1}\n${start} --> ${end}\n${c.text || ''}\n`;
      })
      .join('\n');
    return this.assets.createTextAsset(projectId, {
      type: 'subtitle',
      name: `字幕-${new Date().toISOString().slice(0, 19)}`,
      content: srt,
      meta: { format: 'srt', timelineId: t.id },
    });
  }
}
