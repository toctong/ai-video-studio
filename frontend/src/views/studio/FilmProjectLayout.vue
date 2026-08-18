<template>
  <div class="film-detail studio-book">
    <div class="film-workspace">
      <aside class="step-rail">
        <div class="rail-head">
          <button type="button" class="back-btn" :title="isSeriesMode ? '返回合集' : '返回项目列表'" @click="goBackToSeries">
            <UiIcon name="arrow-left" :size="16" />
          </button>
          <strong class="rail-title" :title="draft.name || '未命名剧集'">
            {{ draft.name || '未命名剧集' }}
          </strong>
        </div>
        <UiScroll class="step-list-scroll" always>
          <nav class="step-list" aria-label="制作步骤">
          <button
            v-for="step in steps"
            :key="step.index"
            type="button"
            class="step-item"
            :class="{
              on: activeStep === step.index,
              done: isStepDone(step.index),
              pending: !isStepDone(step.index) && activeStep !== step.index,
            }"
            @click="goStep(step.index)"
          >
            <span class="step-track" aria-hidden="true">
              <span v-if="isStepDone(step.index) && activeStep !== step.index" class="step-check">✓</span>
              <span v-else class="step-no">{{ step.index }}</span>
            </span>
            <span class="step-label">
              <strong>{{ step.label }}</strong>
            </span>
          </button>
          </nav>
        </UiScroll>
        <button type="button" class="share-rail-btn" @click="onShareCreation">
          <UiIcon name="share" :size="16" />
          <span>分享创作</span>
        </button>
      </aside>

      <div
        class="work-main"
        :class="{
          'script-focus': activeStep === 1,
          'board-focus': activeStep === 4 || activeStep === 5,
          'preview-focus': activeStep === 6,
        }"
      >
        <header v-if="activeStep !== 1" class="film-detail-head">
          <div class="head-left">
            <div class="head-copy">
              <el-input
                v-model="draft.name"
                class="title-input"
                placeholder="剧集名称"
                @change="dirty = true"
              />
              <p>
                {{ activeStepTitle }}
                <template v-if="draft.sourceBookTitle">
                  · 改编自《{{ draft.sourceBookTitle }}》
                </template>
              </p>
            </div>
          </div>
          <div class="head-actions">
            <button
              type="button"
              class="pill-btn"
              :disabled="saving || !dirty"
              @click="save()"
            >
              {{ saving ? '保存中…' : '保存' }}
            </button>
            <button
              v-if="activeStep < 6"
              type="button"
              class="pill-btn primary"
              @click="goNext"
            >
              下一步：{{ nextStepLabel }}
            </button>
          </div>
        </header>

      <section v-loading="loading" class="step-content">
        <UiScroll class="step-scroll" always height="100%">
        <!-- ① 剧本编辑：纳米风格 AI帮写 / 上传 + 全幅编辑器 -->
        <div v-if="activeStep === 1" class="step-pane flat script-step" :class="{ 'ai-open': scriptUiMode === 'ai' }">
          <aside v-if="scriptUiMode === 'ai'" class="ai-assist">
            <header class="ai-assist-head">
              <div class="ai-avatar"><UiIcon name="bot" :size="20" /></div>
              <div class="ai-assist-title">
                <strong>AI 帮写</strong>
                <p>说说你想怎么处理剧本</p>
              </div>
              <button type="button" class="ai-close" title="关闭" @click="enterWriteMode">×</button>
            </header>

            <UiScroll class="ai-assist-scroll" always>
            <div class="ai-assist-body">
              <template v-if="!aiMessages.length">
                <div class="ai-empty">
                  <UiIcon name="message" :size="32" />
                  <strong>{{ isSeriesMode ? '按合集大纲写本集' : '从一句话到完整剧本' }}</strong>
                  <p>
                    {{
                      isSeriesMode
                        ? seriesOutline
                          ? `当前为第${draft.episodeIndex || 1}集，将依据合集大纲生成`
                          : '合集尚无大纲，发送想法后会先生成大纲再写本集'
                        : '输出含剧本大纲、人物设定与完整脚本'
                    }}
                  </p>
                </div>
                <div class="ai-quick">
                  <button
                    v-for="q in aiQuickPrompts"
                    :key="q.title"
                    type="button"
                    class="ai-quick-item"
                    @click="useQuickPrompt(q)"
                  >
                    <strong>{{ q.title }}</strong>
                    <em>{{ q.hint }}</em>
                  </button>
                </div>
              </template>
              <div v-else class="ai-msgs">
                <div
                  v-for="(m, i) in aiMessages"
                  :key="i"
                  class="ai-msg"
                  :class="m.role"
                >
                  {{ m.content }}
                </div>
                <p v-if="aiWriting" class="ai-typing">正在生成剧本…</p>
              </div>
            </div>

            <div class="ai-compose">
              <div class="ai-compose-box">
                <textarea
                  v-model="aiPrompt"
                  rows="2"
                  placeholder="描述你想做成什么片子…"
                  @keydown.enter.exact.prevent="sendAiWrite"
                />
                <div class="ai-compose-bar">
                  <el-select
                    v-model="adaptModel"
                    class="ai-model-select"
                    size="small"
                    teleported
                    placeholder="模型"
                  >
                    <el-option
                      v-for="m in chatModels"
                      :key="m.value || 'default'"
                      :label="m.label || m.value || '默认模型'"
                      :value="m.value"
                    />
                  </el-select>
                  <button
                    type="button"
                    class="ai-send"
                    :disabled="aiWriting || !aiPrompt.trim()"
                    @click="sendAiWrite"
                  >
                    <UiIcon name="arrow-up" :size="16" />
                  </button>
                </div>
              </div>
            </div>
            </UiScroll>
          </aside>

          <div class="script-canvas">
            <div class="script-action-bar">
              <div class="action-center">
                <button
                  type="button"
                  class="nami-pill ai"
                  :class="{ on: scriptUiMode === 'ai' }"
                  @click="scriptUiMode === 'ai' ? enterWriteMode() : enterAiMode()"
                >
                  <span class="pill-avatar"><UiIcon name="bot" :size="14" /></span>
                  AI 帮写
                </button>
                <button type="button" class="nami-pill" @click="triggerUpload">
                  <UiIcon name="upload" :size="15" />
                  上传剧本
                </button>
              </div>
              <div class="action-right">
                <button type="button" class="icon-tool" title="撤销" :disabled="!canUndo" @click="undoScript">
                  <UiIcon name="undo" :size="15" />
                </button>
                <button type="button" class="icon-tool" title="重做" :disabled="!canRedo" @click="redoScript">
                  <UiIcon name="redo" :size="15" />
                </button>
                <button type="button" class="icon-tool" title="复制" @click="copyScript">
                  <UiIcon name="copy" :size="15" />
                </button>
                <button type="button" class="icon-tool" title="清空" @click="clearScript">
                  <UiIcon name="trash" :size="15" />
                </button>
                <button
                  type="button"
                  class="pill-btn slim"
                  :disabled="saving || !dirty"
                  @click="save()"
                >
                  {{ saving ? '保存中…' : '保存' }}
                </button>
                <button type="button" class="pill-btn primary slim" @click="goNext">
                  下一步
                </button>
              </div>
            </div>

            <div v-if="draft.sourceBookId" class="novel-strip">
              <div>
                <strong>《{{ draft.sourceBookTitle || '已绑定小说' }}》</strong>
                <em>已选 {{ selectedChapterIds.length }} 章</em>
              </div>
              <div class="novel-strip-actions">
                <button type="button" class="tb-btn" @click="pickNovelOpen = true">换小说</button>
                <button
                  type="button"
                  class="tb-btn accent"
                  :disabled="adapting || !selectedChapterIds.length"
                  @click="runAdapt"
                >
                  {{ adapting ? '改编中…' : '从章节改编' }}
                </button>
              </div>
            </div>
            <div v-if="draft.sourceBookId" class="chapter-inline" v-loading="novelLoading">
              <label
                v-for="ch in filteredChapters"
                :key="ch.id"
                class="chapter-chip"
                :class="{ on: selectedChapterIds.includes(ch.id) }"
              >
                <input
                  type="checkbox"
                  :checked="selectedChapterIds.includes(ch.id)"
                  @change="toggleChapter(ch.id)"
                />
                {{ ch.title || `第${ch.orderIndex + 1}章` }}
              </label>
              <p v-if="!novelLoading && !filteredChapters.length" class="empty-inline">暂无章节</p>
            </div>

            <div class="script-editor-shell">
              <textarea
                v-model="draft.script"
                class="script-editor"
                :placeholder="scriptPlaceholder"
                @input="onScriptInput"
              />
              <button
                v-if="!String(draft.script || '').trim()"
                type="button"
                class="paste-fab"
                @click="pasteScript"
              >
                <strong>{{ isArticleEntry ? '粘贴文章' : '粘贴剧本' }}</strong>
                <em>{{ isArticleEntry ? '输入文章或一句话，生成完整短片' : '已有内容可直接粘贴' }}</em>
              </button>
            </div>
            <p v-if="adaptStatus" class="status-line">{{ adaptStatus }}</p>
          </div>

          <input
            ref="scriptFileInput"
            type="file"
            accept=".txt,.md,.doc,.docx,text/plain"
            class="sr-only"
            @change="onScriptFile"
          />
        </div>

        <!-- ② 视频设定（对齐参考图） -->
        <div v-else-if="activeStep === 2" class="step-pane wide flat video-settings">
          <div class="section-block">
            <h4>视频画面比例</h4>
            <div class="chip-row">
              <button
                v-for="a in visibleAspectOptions"
                :key="a.value"
                type="button"
                class="aspect-chip"
                :class="{ on: draft.videoSettings.aspect === a.value }"
                @click="setAspect(a.value)"
              >
                <span class="aspect-ico" :class="a.icon" aria-hidden="true" />
                <span>{{ a.label }}</span>
              </button>
              <button type="button" class="aspect-chip ghost" @click="aspectExpanded = !aspectExpanded">
                {{ aspectExpanded ? '收起' : '展开' }}
              </button>
            </div>
          </div>

          <div class="section-block">
            <h4>生分镜视频方式</h4>
            <div class="mode-cards">
              <button
                v-for="m in videoGenModes"
                :key="m.id"
                type="button"
                class="mode-card"
                :class="{ on: draft.videoGenMode === m.id, hover: modeHoverId === m.id }"
                :ref="(el) => bindModeCard(m.id, el)"
                @click="setVideoMode(m.id)"
                @mouseenter="onModeEnter(m.id)"
                @mouseleave="onModeLeave"
              >
                <img v-if="m.badge" class="mode-corner" :src="m.badge" alt="" draggable="false" />
                <div class="mode-card-body">
                  <div class="mode-card-top">
                    <strong>{{ m.title }}</strong>
                    <span v-if="m.tag" class="mode-badge">{{ m.tag }}</span>
                  </div>
                  <em>{{ m.desc }}</em>
                </div>
              </button>
            </div>
            <Teleport to="body">
              <div
                v-if="modeHoverPop"
                class="mode-hover-pop"
                :style="modeHoverPop.style"
                @mouseenter="onModePopEnter"
                @mouseleave="onModeLeave"
              >
                <div v-if="modeHoverPop.cover || modeHoverPop.video" class="mode-hover-media" aria-hidden="true">
                  <img v-if="modeHoverPop.cover" class="mode-cover" :src="modeHoverPop.cover" alt="" draggable="false" />
                  <video
                    v-if="modeHoverPop.video"
                    ref="modeHoverVideoEl"
                    class="mode-video on"
                    :src="modeHoverPop.video"
                    muted
                    loop
                    playsinline
                    autoplay
                    preload="metadata"
                  />
                </div>
                <p>{{ modeHoverPop.detail }}</p>
              </div>
            </Teleport>
          </div>

          <div class="section-block">
            <h4>选择画面风格</h4>
            <div v-loading="stylesLoading" class="style-row">
              <button
                v-for="s in stylePreviewList"
                :key="s.id"
                type="button"
                class="style-card"
                :class="{ on: selectedStyleId === s.id || draft.style.sub === s.label }"
                @click="applyStyle(s)"
              >
                <span class="style-cover">
                  <LazyCoverImage v-if="styleCoverUrl(s)" class="style-cover-img" :src="styleCoverUrl(s)" :alt="s.label" />
                  <template v-else>{{ (s.label || '?').slice(0, 2) }}</template>
                  <span v-if="selectedStyleId === s.id || draft.style.sub === s.label" class="style-check">
                    <UiIcon name="check" :size="12" />
                  </span>
                  <span class="style-label">{{ s.label }}</span>
                </span>
              </button>
              <button type="button" class="style-card more-card" @click="openStyleModal">
                <span class="style-cover dashed">
                  <span class="more-text">更多 →</span>
                </span>
              </button>
            </div>

            <p v-if="!styleList.length" class="hint-line">
              暂无画风。请到「资产管理 → 风格库」上传，或在补充说明里直接描述风格。
            </p>

            <label class="style-brief-field">
              <span class="style-brief-label">
                <strong>画风补充说明</strong>
                <em>可选 · 会叠加到所选风格上，指导出图与视频</em>
              </span>
              <textarea
                v-model="draft.style.brief"
                class="style-brief-input"
                rows="3"
                placeholder="例如：暖色侧光、胶片颗粒、禁止过度磨皮；服饰偏靛蓝系…"
                @input="dirty = true"
              />
            </label>
          </div>
        </div>

        <!-- ③ 场景角色道具 -->
        <div v-else-if="activeStep === 3" class="step-pane wide flat assets-step">
          <div class="content-toolbar assets-toolbar">
            <div class="asset-kind-tabs" role="tablist" aria-label="资产类型">
              <button
                v-for="t in assetKindTabs"
                :key="t.kind"
                type="button"
                role="tab"
                :aria-selected="assetKindFilter === t.kind"
                :class="{ on: assetKindFilter === t.kind }"
                @click="assetKindFilter = t.kind"
              >
                {{ t.label }}
                <em>{{ countByKind(t.kind) }}</em>
              </button>
            </div>
            <div class="toolbar-right">
              <span class="stat">
                已完成
                {{ filteredSceneItems.filter((i) => i.name).length }} /
                {{ filteredSceneItems.length }}
              </span>
              <button type="button" class="pill-btn" @click="addSceneItem">
                + 新增{{ kindLabel(assetKindFilter) }}
              </button>
              <button
                type="button"
                class="pill-btn"
                :disabled="extracting"
                @click="runExtractAssets"
              >
                {{ extracting ? '抽取中…' : '+ 自动提取' }}
              </button>
            </div>
          </div>
          <div class="asset-grid">
            <article v-for="item in filteredSceneItems" :key="item.id" class="asset-tile">
              <div class="asset-face">
                <img v-if="item.imageUrl" :src="item.imageUrl" alt="" />
                <span v-else class="face-placeholder">{{ kindLabel(item.kind) }}</span>
                <div class="asset-hover">
                  <button type="button" @click.stop="openAssetEditor(item.id)">编辑</button>
                  <button type="button" @click.stop="replaceAssetImage(item)">替换</button>
                </div>
              </div>
              <div class="asset-tile-head">
                <span class="kind-ico" :class="item.kind" aria-hidden="true">
                  <UiIcon :name="item.kind === 'character' ? 'user' : 'image'" :size="14" />
                </span>
                <strong>{{ item.name || '未命名' }}</strong>
                <button type="button" class="more" title="更多" @click.stop="openAssetMenu(item)">
                  ···
                </button>
              </div>
            </article>
          </div>
          <p v-if="!filteredSceneItems.length" class="empty-inline">
            还没有{{ kindLabel(assetKindFilter) }}。可点「自动提取」从剧本抽取，或「新增{{
              kindLabel(assetKindFilter)
            }}」。
          </p>
        </div>

        <!-- ④ 分镜脚本 -->
        <div v-else-if="activeStep === 4" class="step-pane wide flat storyboard-step">
          <div class="content-toolbar">
            <span class="stat">
              共 {{ draft.storyboard.length }} 个分镜，已完成
              {{ storyboardDoneCount }} 个
            </span>
            <div class="toolbar-right">
              <button
                type="button"
                class="pill-btn"
                :disabled="splitting"
                @click="runSplitStoryboard"
              >
                {{ splitting ? '拆分中…' : '重新生成' }}
              </button>
              <button type="button" class="pill-btn primary" @click="addStoryboardShot">+ 新增分镜</button>
            </div>
          </div>
          <div class="shot-board">
            <div
              v-for="(shot, idx) in draft.storyboard"
              :key="shot.id"
              class="shot-slot-wrap"
            >
              <article
                class="shot-card visual"
                :class="{ on: shotMenuId === shot.id }"
                :style="storyboardAspectStyle"
                @click="openShotEditor(shot.id)"
              >
                <div class="shot-card-head">
                  <span class="shot-no">{{ String(shot.index).padStart(2, '0') }}</span>
                  <button
                    type="button"
                    class="more"
                    title="更多"
                    @click.stop="toggleShotMenu(shot.id, $event)"
                  >
                    ···
                  </button>
                </div>
                <div class="shot-face">
                  <img v-if="shot.imageUrl" :src="shot.imageUrl" alt="" />
                  <p v-else-if="shotCardHint(shot)" class="shot-face-hint">{{ shotCardHint(shot) }}</p>
                  <span v-else class="face-placeholder">点击编辑分镜</span>
                </div>
                <span v-if="shot.durationSec" class="shot-dur">{{ shot.durationSec }}s</span>
              </article>
              <button
                v-if="idx < draft.storyboard.length - 1"
                type="button"
                class="board-insert"
                title="在此插入分镜"
                @click="insertShotAfter(idx)"
              >
                <UiIcon name="plus" :size="14" />
              </button>
            </div>
            <button
              type="button"
              class="shot-card add visual"
              :style="storyboardAspectStyle"
              @click="addStoryboardShot"
            >
              <span class="add-plus">+</span>
              <span>添加分镜</span>
            </button>
          </div>

          <Teleport to="body">
            <div v-if="shotMenuId" class="shot-menu-mask" @mousedown="closeShotMenu">
              <div
                class="shot-menu"
                :style="{ top: `${shotMenuPos.y}px`, left: `${shotMenuPos.x}px` }"
                @mousedown.stop
              >
                <button type="button" @click="menuEditShot">编辑分镜脚本</button>
                <button type="button" @click="menuJumpVideo">跳转分镜视频</button>
                <button type="button" @click="menuCopyShot">复制分镜</button>
                <button type="button" class="danger" @click="menuDeleteShot">删除分镜</button>
              </div>
            </div>
          </Teleport>
        </div>

        <!-- ⑤ 分镜视频：卡片 + 菜单（对齐参考图） -->
        <div v-else-if="activeStep === 5" class="step-pane wide flat video-step">
          <div class="content-toolbar">
            <span class="stat">
              共 {{ videoSlots.length }} 个分镜，已完成
              {{ draft.shotVideos.filter((v) => String(v.url || '').trim()).length }} 个
            </span>
            <div class="toolbar-right">
              <button type="button" class="pill-btn" :disabled="canvasBusy" @click="syncToCanvas">
                {{ canvasBusy ? '同步中…' : '批量生成视频' }}
              </button>
              <button type="button" class="pill-btn" @click="addVideoShot">+ 新增</button>
            </div>
          </div>
          <div class="video-board">
            <div
              v-for="(slot, idx) in videoSlots"
              :key="slot.key"
              class="video-slot-wrap"
            >
              <article
                class="video-card"
                :class="{ on: videoMenuId === slot.key }"
                @click="previewShotVideo(slot)"
              >
                <div class="video-card-head">
                  <span class="shot-no">{{ String(idx + 1).padStart(2, '0') }}</span>
                  <button
                    type="button"
                    class="more"
                    title="更多"
                    @click.stop="toggleVideoMenu(slot.key, $event)"
                  >
                    ···
                  </button>
                </div>
                <div class="video-face">
                  <video
                    v-if="slot.video?.url"
                    :src="slot.video.url"
                    muted
                    preload="metadata"
                  />
                  <span v-else class="face-placeholder">待生成</span>
                  <span v-if="slot.video?.url" class="play-fab" aria-hidden="true">
                    <i class="play-tri" />
                  </span>
                </div>
              </article>
              <button
                v-if="idx < videoSlots.length - 1"
                type="button"
                class="video-insert"
                title="在此插入分镜"
                @click="insertStoryboardAfter(idx)"
              >
                <UiIcon name="plus" :size="14" />
              </button>
            </div>
          </div>
          <p v-if="!videoSlots.length" class="empty-inline">
            请先完成分镜脚本，再生成分镜视频。
          </p>

          <Teleport to="body">
            <div v-if="videoMenuId" class="shot-menu-mask" @mousedown="closeVideoMenu">
              <div
                class="shot-menu video-ctx-menu"
                :style="{ top: `${videoMenuPos.y}px`, left: `${videoMenuPos.x}px` }"
                @mousedown.stop
              >
                <button type="button" @click="videoMenuJumpScript">跳转分镜脚本</button>
                <button type="button" @click="videoMenuGenerate">生成分镜视频</button>
                <button type="button" @click="videoMenuEdit">编辑分镜视频</button>
                <button type="button" @click="videoMenuCopy">复制分镜</button>
                <button type="button" @click="videoMenuPreview">预览</button>
                <button type="button" @click="videoMenuReplace">替换</button>
                <button type="button" @click="videoMenuDownload">下载</button>
                <button type="button" class="danger" @click="videoMenuDelete">删除分镜</button>
              </div>
            </div>
          </Teleport>

          <Teleport to="body">
            <div
              v-if="videoPreviewOpen"
              class="video-preview-mask"
              @mousedown.self="closeVideoPreview"
            >
              <div class="video-preview-dlg" role="dialog" aria-label="预览分镜视频">
                <header>
                  <strong>{{ videoPreviewTitle }}</strong>
                  <button type="button" class="x" @click="closeVideoPreview">×</button>
                </header>
                <video
                  v-if="videoPreviewUrl"
                  :src="videoPreviewUrl"
                  controls
                  autoplay
                  class="video-preview-el"
                />
                <p v-else class="empty-inline">暂无可预览视频</p>
              </div>
            </div>
          </Teleport>

          <input
            ref="videoReplaceInput"
            type="file"
            accept="video/*"
            class="sr-only"
            @change="onVideoReplaceFile"
          />
        </div>

        <!-- ⑥ 视频预览：多轨时间轴（vue-timeline-editor） -->
        <div v-else-if="activeStep === 6" class="step-pane wide flat preview-pane">
          <FilmPreviewWorkbench
            :shots="draft.storyboard"
            :shot-videos="draft.shotVideos"
            :default-duration-sec="draft.videoSettings.durationSec || 10"
            :aspect="draft.videoSettings.aspect || '16:9'"
            :music-title="draft.name ? `${draft.name} BGM` : '背景音乐'"
            @dirty="dirty = true"
            @edit-shot="openVideoEditor"
          />
        </div>
        </UiScroll>
      </section>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="pickNovelOpen" class="novel-mask" @mousedown.self="pickNovelOpen = false">
        <div class="novel-panel" role="dialog" aria-label="选择小说">
          <header class="novel-head">
            <strong>绑定源小说</strong>
            <button type="button" class="x" @click="pickNovelOpen = false">×</button>
          </header>
          <UiScroll class="novel-scroll" always>
          <div v-loading="pickLoading" class="novel-list">
            <button
              v-for="b in novelBooks"
              :key="b.id"
              type="button"
              class="novel-row"
              @click="bindNovel(b)"
            >
              <strong>{{ b.title || '未命名' }}</strong>
              <em>{{ b.chapterCount || 0 }} 章</em>
            </button>
            <p v-if="!pickLoading && !novelBooks.length" class="empty-inline">暂无小说</p>
          </div>
          </UiScroll>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="styleModalOpen" class="style-mask" @mousedown.self="cancelStyleModal">
        <div class="style-modal" role="dialog" aria-label="全部风格">
          <header class="style-modal-head">
            <strong>全部风格</strong>
            <button type="button" class="x" @click="cancelStyleModal">×</button>
          </header>
          <div class="style-filters">
            <button
              v-for="f in styleFilters"
              :key="f.id"
              type="button"
              class="filter-chip"
              :class="{ on: styleFilterId === f.id }"
              @click="styleFilterId = f.id"
            >
              {{ f.label }}
            </button>
          </div>
          <UiScroll class="style-modal-scroll" always>
          <div class="style-modal-grid">
            <button
              v-for="s in filteredModalStyles"
              :key="s.id"
              type="button"
              class="style-card"
              :class="{ on: pendingStyleId === s.id }"
              @click="pendingStyleId = s.id"
            >
              <span class="style-cover">
                <LazyCoverImage v-if="styleCoverUrl(s)" class="style-cover-img" :src="styleCoverUrl(s)" :alt="s.label" />
                <template v-else>{{ (s.label || '?').slice(0, 2) }}</template>
              </span>
              <span class="style-caption">{{ s.label }}</span>
            </button>
            <p v-if="!filteredModalStyles.length" class="empty-inline">该分类暂无风格</p>
          </div>
          </UiScroll>
          <footer class="style-modal-foot">
            <button type="button" class="modal-btn" @click="cancelStyleModal">取消</button>
            <button type="button" class="modal-btn confirm" @click="confirmStyleModal">确认</button>
          </footer>
        </div>
      </div>
    </Teleport>

    <!-- 场景/角色/道具 编辑弹框（参考生图工作台） -->
    <Teleport to="body">
      <div v-if="assetEditorOpen && editingAsset" class="asset-editor-mask">
        <div class="asset-editor" role="dialog" aria-label="编辑资产">
          <header class="ae-top">
            <button type="button" class="ae-back" @click="closeAssetEditor">
              <UiIcon name="arrow-left" :size="16" />
            </button>
            <strong class="ae-title">{{ editingAsset.name || '未命名' }}</strong>
            <em class="ae-count">共 {{ draft.sceneItems.length }} 个{{ kindLabel(editingAsset.kind) }}</em>
            <div class="ae-top-actions">
              <button type="button" class="pill-btn" @click="replaceAssetImage(editingAsset)">
                <UiIcon name="upload" :size="14" />
                上传
              </button>
              <button type="button" class="pill-btn" @click="removeEditingAsset">删除</button>
              <button type="button" class="pill-btn primary" @click="saveAssetEditor">完成</button>
            </div>
          </header>

          <div class="ae-body">
            <aside class="ae-left">
              <UiScroll class="ae-left-scroll" always>
              <div class="ae-tabs">
                <button type="button" class="on">生图</button>
                <button type="button" class="off" disabled title="二期">改图</button>
              </div>
              <button type="button" class="ae-ref" @click="replaceAssetImage(editingAsset)">
                <template v-if="editingAsset.imageUrl">
                  <img :src="editingAsset.imageUrl" alt="" />
                  <span>更换参考图</span>
                </template>
                <template v-else>
                  <UiIcon name="plus" :size="18" />
                  <span>导入参考图</span>
                </template>
              </button>
              <label class="ae-field">
                <span>名称</span>
                <el-input v-model="editingAsset.name" placeholder="未命名" @input="dirty = true" />
              </label>
              <label class="ae-field">
                <span>类型</span>
                <el-select v-model="editingAsset.kind" @change="dirty = true">
                  <el-option label="场景" value="scene" />
                  <el-option label="角色" value="character" />
                  <el-option label="道具" value="prop" />
                </el-select>
              </label>
              <label class="ae-field grow">
                <span>画面描述</span>
                <textarea
                  v-model="editingAsset.prompt"
                  class="ae-prompt"
                  maxlength="3000"
                  placeholder="描述想要生成的画面，如：雨夜船舱内昏黄油灯…"
                  @input="dirty = true"
                />
                <em class="ae-count-tip">{{ (editingAsset.prompt || '').length }}/3000</em>
              </label>
              <label class="ae-field">
                <span>补充说明</span>
                <el-input
                  v-model="editingAsset.description"
                  type="textarea"
                  :rows="2"
                  resize="none"
                  placeholder="一句话描述"
                  @input="dirty = true"
                />
              </label>
              <button type="button" class="ae-gen" @click="applyAssetPrompt">
                保存提示词
              </button>
              </UiScroll>
            </aside>

            <section class="ae-center">
              <div class="ae-preview-meta">
                <span>{{ editingAsset.imageUrl ? '当前预览' : '暂无图像' }}</span>
              </div>
              <div class="ae-preview" :class="{ empty: !editingAsset.imageUrl }">
                <img v-if="editingAsset.imageUrl" :src="editingAsset.imageUrl" alt="" />
                <button
                  v-else
                  type="button"
                  class="ae-preview-upload"
                  @click="replaceAssetImage(editingAsset)"
                >
                  <UiIcon name="upload" :size="22" />
                  <strong>上传参考图</strong>
                  <span>支持 JPG / PNG / WebP</span>
                </button>
              </div>
              <div class="ae-tools">
                <button type="button" disabled title="二期">四宫格拆分</button>
                <button type="button" disabled title="二期">改图</button>
                <button type="button" class="on" @click="replaceAssetImage(editingAsset)">
                  上传 / 替换
                </button>
                <button type="button" disabled title="二期">变清晰</button>
              </div>
            </section>

            <aside class="ae-right">
              <strong>历史记录</strong>
              <button type="button" class="ae-upload" @click="replaceAssetImage(editingAsset)">
                <UiIcon name="upload" :size="16" />
                上传图片
              </button>
              <UiScroll class="ae-hist-scroll" always>
              <div class="ae-history">
                <button
                  v-if="editingAsset.imageUrl"
                  type="button"
                  class="ae-hist on"
                >
                  <img :src="editingAsset.imageUrl" alt="" />
                  <span class="tick"><UiIcon name="check" :size="10" /></span>
                </button>
                <p v-else class="ae-hist-empty">暂无记录</p>
              </div>
              </UiScroll>
            </aside>
          </div>

          <div class="ae-strip">
            <UiScroll class="ae-strip-scroll" always>
            <div class="ae-strip-inner">
            <button
              v-for="item in draft.sceneItems"
              :key="item.id"
              type="button"
              class="ae-strip-card"
              :class="{ on: item.id === editingAssetId }"
              @click="openAssetEditor(item.id)"
            >
              <span class="ae-strip-face">
                <img v-if="item.imageUrl" :src="item.imageUrl" alt="" />
                <em v-else>{{ kindLabel(item.kind) }}</em>
              </span>
              <span class="ae-strip-name">{{ item.name || '未命名' }}</span>
            </button>
            </div>
            </UiScroll>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 编辑分镜视频（参考生视频工作台） -->
    <Teleport to="body">
      <div v-if="videoEditorOpen && editingVideoSlot" class="video-editor-mask">
        <div class="video-editor" role="dialog" aria-label="编辑分镜视频">
          <header class="ve-top">
            <button type="button" class="ve-back" @click="closeVideoEditor">
              <UiIcon name="arrow-left" :size="16" />
              <span>返回</span>
            </button>
            <strong class="ve-title">
              {{ draft.name || '未命名漫剧' }}
              <em>共 {{ videoSlots.length }} 个分镜</em>
            </strong>
            <nav class="ve-modes" aria-label="生视频方式">
              <button
                v-for="m in videoEditorModes"
                :key="m.id"
                type="button"
                :class="{ on: videoEditorMode === m.id }"
                @click="videoEditorMode = m.id"
              >
                {{ m.label }}
              </button>
            </nav>
          </header>

          <div class="ve-body">
            <aside class="ve-left">
              <UiScroll class="ve-left-scroll" always>
              <p class="ve-tip">
                {{ videoEditorModeTip }}
              </p>

              <div class="ve-section">
                <span class="ve-sec-label">素材</span>
                <div class="ve-materials">
                  <button type="button" class="ve-mat add" @click="triggerVideoMaterial">
                    <UiIcon name="plus" :size="18" />
                    <span>导入素材</span>
                  </button>
                  <button
                    v-for="m in videoEditorMaterials"
                    :key="m.id"
                    type="button"
                    class="ve-mat"
                    :title="m.name"
                  >
                    <img v-if="m.url" :src="m.url" alt="" />
                    <em>{{ m.name }}</em>
                  </button>
                </div>
              </div>

              <div class="ve-prompt-box">
                <textarea
                  v-model="videoEditorPrompt"
                  class="ve-prompt"
                  maxlength="6000"
                  placeholder="描述这一镜的运动、光影、镜头与风格…"
                  @input="onVideoPromptInput"
                />
                <div class="ve-prompt-bar">
                  <div class="ve-prompt-tools">
                    <button type="button" title="重置" @click="refreshVideoPrompt">
                      <UiIcon name="refresh" :size="14" />
                    </button>
                    <button type="button" title="清空" @click="clearVideoPrompt">
                      <UiIcon name="trash" :size="14" />
                    </button>
                    <button type="button" title="复制" @click="copyVideoPrompt">
                      <UiIcon name="copy" :size="14" />
                    </button>
                    <em>{{ videoEditorPrompt.length }}/6000</em>
                  </div>
                  <button type="button" class="ve-gen-prompt" @click="buildVideoPrompt">
                    <UiIcon name="wand" :size="14" />
                    生成提示词
                  </button>
                </div>
              </div>

              <div class="ve-controls">
                <label class="ve-ctrl">
                  <span>模型</span>
                  <el-select v-model="videoEditorModel" size="small" placeholder="默认模型">
                    <el-option
                      v-for="m in videoModels"
                      :key="m.value || 'default'"
                      :label="m.label || m.value || '默认模型'"
                      :value="m.value || ''"
                    />
                  </el-select>
                </label>
                <label class="ve-ctrl">
                  <span>画幅</span>
                  <el-select v-model="draft.videoSettings.aspect" size="small" @change="dirty = true">
                    <el-option
                      v-for="a in aspectOptions"
                      :key="a.value"
                      :label="a.label"
                      :value="a.value"
                    />
                  </el-select>
                </label>
                <label class="ve-ctrl">
                  <span>时长</span>
                  <el-select
                    v-model="draft.videoSettings.durationSec"
                    size="small"
                    @change="dirty = true"
                  >
                    <el-option :value="5" label="5秒" />
                    <el-option :value="10" label="10秒" />
                    <el-option :value="15" label="15秒" />
                  </el-select>
                </label>
                <label class="ve-ctrl">
                  <span>数量</span>
                  <el-select v-model="videoEditorCount" size="small">
                    <el-option :value="1" label="1个" />
                    <el-option :value="2" label="2个" />
                    <el-option :value="4" label="4个" />
                  </el-select>
                </label>
                <label class="ve-ctrl">
                  <span>分辨率</span>
                  <el-select
                    v-model="draft.videoSettings.resolution"
                    size="small"
                    @change="dirty = true"
                  >
                    <el-option value="720p" label="720P" />
                    <el-option value="1080p" label="1080P" />
                    <el-option value="2k" label="2K" />
                  </el-select>
                </label>
              </div>

              <button
                type="button"
                class="ve-gen"
                :disabled="videoGenerating"
                @click="runGenerateShotVideo"
              >
                {{ videoGenerating ? '生成中…' : '生成视频' }}
              </button>
              </UiScroll>
            </aside>

            <section class="ve-center">
              <div class="ve-preview-meta">
                <span>{{ videoEditorModeLabel }}</span>
                <span>{{ videoEditorModelLabel }}</span>
                <span>{{ draft.videoSettings.aspect || '16:9' }}</span>
                <span>{{ draft.videoSettings.durationSec || 10 }}秒</span>
              </div>
              <div class="ve-preview" :class="{ empty: !editingVideoSlot.video?.url }">
                <video
                  v-if="editingVideoSlot.video?.url"
                  :src="editingVideoSlot.video.url"
                  class="ve-preview-video"
                  controls
                  playsinline
                />
                <template v-else>
                  <span class="play-fab big"><i class="play-tri" /></span>
                  <p>填写提示词后生成，或替换已有视频</p>
                </template>
              </div>
            </section>

            <aside class="ve-right">
              <strong>历史记录</strong>
              <button type="button" class="ve-upload" @click="triggerVideoReplaceInEditor">
                <UiIcon name="plus" :size="14" />
                上传
              </button>
              <UiScroll class="ve-hist-scroll" always>
              <div class="ve-history">
                <button
                  v-if="editingVideoSlot.video?.url"
                  type="button"
                  class="ve-hist on"
                >
                  <video :src="editingVideoSlot.video.url" muted />
                  <span class="tick"><UiIcon name="check" :size="10" /></span>
                </button>
                <p v-else class="ve-hist-empty">暂无记录</p>
              </div>
              </UiScroll>
            </aside>
          </div>

          <div class="ve-strip">
            <UiScroll class="ve-strip-scroll" always>
            <div class="ve-strip-inner">
            <button
              v-for="(slot, idx) in videoSlots"
              :key="slot.key"
              type="button"
              class="ve-strip-card"
              :class="{ on: slot.key === videoEditorShotKey }"
              @click="openVideoEditor(slot.key)"
            >
              <span class="ve-strip-no">{{ String(idx + 1).padStart(2, '0') }}</span>
              <span class="ve-strip-face">
                <video v-if="slot.video?.url" :src="slot.video.url" muted />
                <em v-else>待生成</em>
              </span>
            </button>
            </div>
            </UiScroll>
          </div>
          <input
            ref="videoMaterialInput"
            type="file"
            accept="image/*,video/*"
            class="sr-only"
            @change="onVideoMaterialFile"
          />
          <input
            ref="videoEditorReplaceInput"
            type="file"
            accept="video/*"
            class="sr-only"
            @change="onVideoEditorReplaceFile"
          />
        </div>
      </div>
    </Teleport>

    <!-- 分镜脚本编辑弹框 -->
    <Teleport to="body">
      <div v-if="shotEditorOpen && editingShot" class="shot-editor-mask" @mousedown.self="closeShotEditor">
        <div class="shot-editor wide" role="dialog" aria-label="编辑分镜">
          <header class="se-head">
            <strong>
              分镜脚本{{ editingShot.index }}：{{ shotEditorForm.shot || '未命名' }}
            </strong>
            <div class="se-head-actions">
              <button type="button" class="modal-btn confirm" @click="saveShotEditor">保存</button>
              <button type="button" class="se-close" @click="closeShotEditor">×</button>
            </div>
          </header>
          <div class="se-split">
            <aside class="se-keyframe">
              <UiScroll class="se-kf-scroll" always>
              <div class="se-kf-preview" :style="storyboardAspectStyle">
                <img v-if="shotEditorForm.imageUrl" :src="shotEditorForm.imageUrl" alt="" />
                <span v-else class="face-placeholder">暂无关键帧</span>
              </div>
              <div class="se-kf-actions">
                <button
                  type="button"
                  class="pill-btn primary"
                  :disabled="shotImageBusy"
                  @click="generateShotKeyframe"
                >
                  {{ shotImageBusy ? '生成中…' : shotEditorForm.imageUrl ? '重新生成' : '生成分镜图' }}
                </button>
                <button type="button" class="pill-btn" @click="triggerShotImageReplace">替换</button>
              </div>
              <label class="se-field">
                <span>关键帧提示词</span>
                <textarea
                  v-model="shotEditorForm.prompt"
                  rows="3"
                  placeholder="用于生成关键帧的提示词…"
                  @input="dirty = true"
                />
              </label>
              </UiScroll>
            </aside>
            <div class="se-fields">
              <UiScroll class="se-fields-scroll" always>
              <div class="se-toolbar compact">
                <button type="button" @click="copyShotStructured">
                  <UiIcon name="copy" :size="15" />
                  复制
                </button>
                <button type="button" @click="clearShotStructured">
                  <UiIcon name="trash" :size="15" />
                  清空正文
                </button>
              </div>
              <label class="se-field">
                <span>镜头名</span>
                <input v-model="shotEditorForm.shot" type="text" @input="dirty = true" />
              </label>
              <label class="se-field">
                <span>画面描述</span>
                <textarea
                  v-model="shotEditorForm.description"
                  rows="5"
                  placeholder="画面动作、构图、运镜…"
                  @input="dirty = true"
                />
              </label>
              <label class="se-field">
                <span>对白</span>
                <textarea
                  v-model="shotEditorForm.dialogue"
                  rows="2"
                  placeholder="对白 / 旁白（可选）"
                  @input="dirty = true"
                />
              </label>
              <div class="se-row">
                <label class="se-field">
                  <span>时长（秒）</span>
                  <input
                    v-model.number="shotEditorForm.durationSec"
                    type="number"
                    min="1"
                    max="60"
                    @input="dirty = true"
                  />
                </label>
                <label class="se-field">
                  <span>场景名</span>
                  <input v-model="shotEditorForm.scene" type="text" @input="dirty = true" />
                </label>
              </div>
              <label class="se-field">
                <span>绑定场景资产</span>
                <select v-model="shotEditorForm.sceneId" @change="onShotSceneBind">
                  <option value="">不绑定</option>
                  <option
                    v-for="item in sceneAssetOptions"
                    :key="item.id"
                    :value="item.id"
                  >
                    {{ item.name }}
                  </option>
                </select>
              </label>
              <div class="se-field">
                <span>绑定角色</span>
                <div class="se-chips">
                  <label
                    v-for="item in characterAssetOptions"
                    :key="item.id"
                    class="se-chip"
                  >
                    <input
                      type="checkbox"
                      :value="item.id"
                      v-model="shotEditorForm.characterIds"
                      @change="dirty = true"
                    />
                    <em>{{ item.name }}</em>
                  </label>
                  <span v-if="!characterAssetOptions.length" class="muted">暂无角色资产，请先在第 3 步生成</span>
                </div>
              </div>
              </UiScroll>
            </div>
          </div>
          <input
            ref="shotImageInput"
            type="file"
            accept="image/*"
            class="sr-only"
            @change="onShotImageReplace"
          />
        </div>
      </div>
    </Teleport>
    <input
      ref="assetReplaceInput"
      type="file"
      accept="image/*"
      class="sr-only"
      @change="onAssetReplaceFile"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import UiIcon from '@/components/icons/UiIcon.vue';
import { UiScroll } from '@/components/ui';
import FilmPreviewWorkbench from '@/components/studio/FilmPreviewWorkbench.vue';
import { useAiSettings } from '@/composables/useAiSettings';
import {
  FILM_STYLE_FILTERS,
  FILM_STYLES,
  type FilmStyleItem,
} from '@/constants/film-styles';
import { namiAsset, resolveMediaUrl } from '@/constants/oss-public';
import LazyCoverImage from '@/components/LazyCoverImage.vue';
import api from '@/api';
import {
  createGenerateSession,
  generateImage,
  listGenerateMessages,
  uploadGenerateRef,
} from '@/api/generate';
import {
  emptyFilmDraft,
  fetchFilmCollection,
  fetchFilmProject,
  filmDraftToPatch,
  isSeriesEntry,
  toFilmDraft,
  updateFilmCollectionOutline,
  updateFilmProject,
  type FilmCollection,
  type FilmProject,
  type FilmProjectDraft,
  type FilmSceneItem,
  type FilmShotVideo,
  type FilmStoryboardShot,
  type FilmVideoGenMode,
} from '@/api/film-projects';
import { ensureCompiledProduction } from '@/utils/compile-production';
import {
  adaptNovelToComicScript,
  buildMultiChapterRawScript,
  extractOutlineFromScript,
  extractSceneItemsFromScript,
  fetchNovelChapters,
  fetchNovelCharacters,
  fetchNovelOutline,
  generateComicScriptFromIdea,
  generateSeriesOutlineFromIdea,
  listNovelBooks,
  splitScriptToStoryboard,
  type NovelBookRow,
  type NovelChapterRow,
  type NovelCharacterRow,
} from '@/utils/film-novel';

const route = useRoute();
const router = useRouter();
const { modelsOf, ensureAiSettings } = useAiSettings();

const projectId = computed(() => String(route.params.id || ''));
const loading = ref(false);
const saving = ref(false);
const dirty = ref(false);
const project = ref<FilmProject | null>(null);
const draft = reactive<FilmProjectDraft>(emptyFilmDraft());

const novelLoading = ref(false);
const chapters = ref<NovelChapterRow[]>([]);
const characters = ref<NovelCharacterRow[]>([]);
const chapterKeyword = ref('');
const selectedChapterIds = ref<string[]>([]);
const adapting = ref(false);
const adaptStatus = ref('');
const adaptModel = ref('');
const extracting = ref(false);
const splitting = ref(false);
const canvasBusy = ref(false);

const pickNovelOpen = ref(false);
const pickLoading = ref(false);
const novelBooks = ref<NovelBookRow[]>([]);
const editingAssetId = ref('');
const assetEditorOpen = ref(false);
const assetReplaceInput = ref<HTMLInputElement | null>(null);
const assetReplaceTargetId = ref('');
const assetKindFilter = ref<'scene' | 'character' | 'prop'>('scene');
const assetKindTabs = [
  { kind: 'scene' as const, label: '场景' },
  { kind: 'character' as const, label: '角色' },
  { kind: 'prop' as const, label: '道具' },
];
const editingShotId = ref('');
const shotEditorOpen = ref(false);
const shotEditorForm = reactive({
  shot: '',
  scene: '',
  description: '',
  dialogue: '',
  durationSec: 3,
  prompt: '',
  imageUrl: '',
  characterIds: [] as string[],
  sceneId: '',
});
const shotMenuId = ref('');
const shotMenuPos = ref({ x: 0, y: 0 });
const shotImageInput = ref<HTMLInputElement | null>(null);
const shotImageBusy = ref(false);
const filmGenSessionId = ref('');
const videoMenuId = ref('');
const videoMenuPos = ref({ x: 0, y: 0 });
const videoReplaceInput = ref<HTMLInputElement | null>(null);
const videoReplaceTargetKey = ref('');
const videoPreviewOpen = ref(false);
const videoPreviewUrl = ref('');
const videoPreviewTitle = ref('');
const videoEditorOpen = ref(false);
const videoEditorShotKey = ref('');
const videoEditorMode = ref<'i2v' | 'omni' | 'grid' | 'frames'>('omni');
const videoEditorPrompt = ref('');
const videoEditorModel = ref('');
const videoEditorCount = ref(1);
const videoGenerating = ref(false);
const videoMaterialInput = ref<HTMLInputElement | null>(null);
const videoEditorReplaceInput = ref<HTMLInputElement | null>(null);
const videoEditorMaterials = ref<Array<{ id: string; name: string; url: string }>>([]);

const videoEditorModes = [
  { id: 'i2v' as const, label: '图生视频' },
  { id: 'omni' as const, label: '多参生视频' },
  { id: 'grid' as const, label: '多宫格生视频' },
  { id: 'frames' as const, label: '首尾帧视频' },
];

const editingAsset = computed(
  () => draft.sceneItems.find((i) => i.id === editingAssetId.value) || null,
);

const filteredSceneItems = computed(() =>
  draft.sceneItems.filter((i) => i.kind === assetKindFilter.value),
);

function countByKind(kind: 'scene' | 'character' | 'prop') {
  return draft.sceneItems.filter((i) => i.kind === kind).length;
}

const editingShot = computed(
  () => draft.storyboard.find((s) => s.id === editingShotId.value) || null,
);

const storyboardDoneCount = computed(
  () =>
    draft.storyboard.filter(
      (s) => String(s.imageUrl || '').trim() || String(s.description || '').trim(),
    ).length,
);

const storyboardAspectStyle = computed(() => {
  const raw = String(draft.videoSettings.aspect || '16:9');
  const [w, h] = raw.split(':').map((n) => Number(n));
  if (w > 0 && h > 0) return { aspectRatio: `${w} / ${h}` };
  return { aspectRatio: '16 / 9' };
});

const sceneAssetOptions = computed(() =>
  draft.sceneItems.filter((i) => i.kind === 'scene' && String(i.name || '').trim()),
);

const characterAssetOptions = computed(() =>
  draft.sceneItems.filter((i) => i.kind === 'character' && String(i.name || '').trim()),
);

const isArticleEntry = computed(() => String(route.query.from || '') === 'article');
const scriptPlaceholder = computed(() =>
  isArticleEntry.value ? '粘贴文章、新闻或一句话创意，将据此改编成漫剧剧本…' : '',
);
const scriptUiMode = ref<'write' | 'ai'>('write');
const scriptFileInput = ref<HTMLInputElement | null>(null);
const scriptHistory = ref<string[]>(['']);
const scriptHistoryIndex = ref(0);
const aiPrompt = ref('');
const aiWriting = ref(false);
const aiMessages = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
const collectionMeta = ref<FilmCollection | null>(null);
const seriesOutline = ref('');

const isSeriesMode = computed(
  () =>
    isSeriesEntry(draft.entryMode) ||
    isSeriesEntry(collectionMeta.value?.meta?.entryMode),
);

const aiQuickPrompts = [
  {
    title: '做短剧爆款',
    hint: '写一个适合竖屏的反转短剧开场',
    prompt: '帮我写一个竖屏短剧爆款剧本，要有强冲突和反转，适合 60 秒内讲完一个钩子。',
  },
  {
    title: '拍品牌广告',
    hint: '写一支有故事感的产品广告分场',
    prompt: '帮我写一支品牌广告分场剧本，画面感强，适合 15～30 秒 TVC。',
  },
  {
    title: '做文旅宣传',
    hint: '城市/景区故事向宣传片剧本',
    prompt: '帮我写一个城市文旅宣传短片剧本，有人物与情感线，适合漫剧风格呈现。',
  },
  {
    title: '打造个人 IP',
    hint: '知识分享 / 人设故事分场',
    prompt: '帮我写一个个人 IP 短视频分场剧本，偏知识分享与人设故事。',
  },
];

const aspectExpanded = ref(false);
const aspectOptions = [
  { value: '9:16', label: '竖屏 9:16', icon: 'portrait', primary: true },
  { value: '16:9', label: '横屏 16:9', icon: 'landscape', primary: true },
  { value: '21:9', label: '影院宽屏 21:9', icon: 'cinema', primary: false },
  { value: '4:3', label: '4:3', icon: 'box', primary: false },
  { value: '3:4', label: '3:4', icon: 'portrait', primary: false },
  { value: '1:1', label: '1:1', icon: 'square', primary: false },
];

const visibleAspectOptions = computed(() => {
  if (aspectExpanded.value) return aspectOptions;
  const primary = aspectOptions.filter((a) => a.primary);
  const cur = draft.videoSettings.aspect;
  if (primary.some((a) => a.value === cur)) return primary;
  const extra = aspectOptions.find((a) => a.value === cur);
  return extra ? [...primary, extra] : primary;
});

const videoGenModes: Array<{
  id: FilmVideoGenMode;
  title: string;
  tag?: string;
  desc: string;
  detail: string;
  cover: string;
  badge?: string;
  video?: string;
}> = [
  {
    id: 'omni',
    title: '全能参考模式',
    tag: 'Seedance 2.5 + H3',
    desc: '多参考图直出视频，镜头连贯性更好',
    detail:
      '全能参考模式：无需生分镜图，场景角色道具图直出视频，支持参考多张图片、音频、视频素材生成单条多镜头视频，镜头连贯性更好',
    cover: namiAsset('modes/omni-cover.jpg'),
    video: namiAsset('modes/omni-preview.mp4'),
    badge: 'https://p4.ssl.qhimg.com/t110b9a930193b3196d24616a75.png',
  },
  {
    id: 'i2v',
    title: '图生视频模式',
    tag: 'Seedance 2.5 + H3',
    desc: '多参考图生成分镜图后再生视频，精准掌控',
    detail:
      '图生视频模式：需先生分镜图，将关键剧情拆分成精细分镜图再生视频，适合对视频精度要求高的场景',
    cover: namiAsset('modes/i2v-cover.jpg'),
    video: namiAsset('modes/i2v-preview.mp4'),
    badge: 'https://p4.ssl.qhimg.com/t110b9a930193b3196d24616a75.png',
  },
  {
    id: 'grid',
    title: '多宫格生视频',
    desc: '通过连续不同帧生分镜视频，画面更连贯',
    detail: '多宫格生视频：通过连续不同帧生分镜视频，画面更连贯',
    cover: namiAsset('modes/grid-cover.jpg'),
    video: namiAsset('modes/grid-preview.mp4'),
  },
];

const modeHoverId = ref<string>('');
const modeCardEls = new Map<string, HTMLElement>();
const modeHoverVideoEl = ref<HTMLVideoElement | null>(null);
const modeHoverPop = ref<null | {
  cover: string;
  video?: string;
  detail: string;
  style: Record<string, string>;
}>(null);
let modeLeaveTimer: ReturnType<typeof setTimeout> | null = null;

function bindModeCard(id: string, el: unknown) {
  if (el instanceof HTMLElement) modeCardEls.set(id, el);
  else modeCardEls.delete(id);
}

function placeModePop(id: string) {
  const m = videoGenModes.find((x) => x.id === id);
  const card = modeCardEls.get(id);
  if (!m || !card) {
    modeHoverPop.value = null;
    return;
  }
  const rect = card.getBoundingClientRect();
  const popW = Math.min(300, window.innerWidth - 24);
  let left = rect.left + rect.width / 2 - popW / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - popW - 12));
  const gap = 10;
  const preferTop = rect.top > 220;
  const style: Record<string, string> = {
    width: `${popW}px`,
    left: `${left}px`,
  };
  if (preferTop) {
    style.bottom = `${window.innerHeight - rect.top + gap}px`;
    style.top = 'auto';
  } else {
    style.top = `${rect.bottom + gap}px`;
    style.bottom = 'auto';
  }
  modeHoverPop.value = {
    cover: m.cover,
    video: m.video,
    detail: m.detail,
    style,
  };
}

function onModeEnter(id: string) {
  if (modeLeaveTimer) {
    clearTimeout(modeLeaveTimer);
    modeLeaveTimer = null;
  }
  modeHoverId.value = id;
  placeModePop(id);
  requestAnimationFrame(() => {
    const el = modeHoverVideoEl.value;
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  });
}

function onModePopEnter() {
  if (modeLeaveTimer) {
    clearTimeout(modeLeaveTimer);
    modeLeaveTimer = null;
  }
}

function onModeLeave() {
  if (modeLeaveTimer) clearTimeout(modeLeaveTimer);
  modeLeaveTimer = setTimeout(() => {
    modeHoverId.value = '';
    modeHoverPop.value = null;
    modeLeaveTimer = null;
  }, 80);
}

onBeforeUnmount(() => {
  if (modeLeaveTimer) clearTimeout(modeLeaveTimer);
});

const steps = [
  { index: 1, label: '剧本编辑', desc: '大纲+章节改编漫剧' },
  { index: 2, label: '视频设定', desc: '比例、方式与画风' },
  { index: 3, label: '场景角色道具', desc: '视觉对象与提示词' },
  { index: 4, label: '分镜脚本', desc: '镜头拆分与关键帧' },
  { index: 5, label: '分镜视频', desc: '逐镜视频生成' },
  { index: 6, label: '视频预览', desc: '成片预览与备注' },
];

const styleList = ref<FilmStyleItem[]>([...FILM_STYLES]);
const styleFilters = ref([...FILM_STYLE_FILTERS]);
const stylesLoading = ref(false);
const selectedStyleId = ref('');
const styleModalOpen = ref(false);
const styleFilterId = ref('all');
const pendingStyleId = ref('');

const stylePreviewList = computed(() => styleList.value.slice(0, 7));

const filteredModalStyles = computed(() => {
  const fid = String(styleFilterId.value || 'all');
  if (!fid || fid === 'all' || fid === '全部') return styleList.value;
  return styleList.value.filter((s) => {
    if (String(s.group || '') === fid) return true;
    return (s.tags || []).includes(fid);
  });
});

const activeStep = computed(() => {
  const n = Number(route.query.step || 1);
  return Number.isFinite(n) && n >= 1 && n <= 6 ? Math.floor(n) : 1;
});

const activeStepInfo = computed(
  () => steps.find((s) => s.index === activeStep.value) || steps[0],
);
const activeStepTitle = computed(() => activeStepInfo.value.label);
const activeStepDesc = computed(() => activeStepInfo.value.desc);
const nextStepLabel = computed(() => {
  const next = steps.find((s) => s.index === activeStep.value + 1);
  return next?.label || '完成';
});

/** 已完成步骤：有实质内容才算 done（对齐参考图勾选态） */
function isStepDone(index: number) {
  if (index === 1) return !!String(draft.script || '').trim();
  if (index === 2) {
    return !!(draft.videoSettings.aspect && draft.videoGenMode);
  }
  if (index === 3) return draft.sceneItems.length > 0;
  if (index === 4) return draft.storyboard.length > 0;
  if (index === 5) return draft.shotVideos.some((v) => String(v.url || '').trim());
  if (index === 6) return !!String(draft.videoPreview.url || '').trim();
  return false;
}

const chatModels = computed(() => {
  const list = modelsOf('chat') || [];
  return list.length ? list : [{ value: '', label: '默认模型' }];
});

const filteredChapters = computed(() => {
  const q = chapterKeyword.value.trim().toLowerCase();
  const list = [...chapters.value].sort((a, b) => a.orderIndex - b.orderIndex);
  if (!q) return list;
  return list.filter((c) =>
    `${c.title || ''} ${c.synopsis || ''} ${c.novelBody || ''}`.toLowerCase().includes(q),
  );
});

const videoSlots = computed(() => {
  if (draft.storyboard.length) {
    return draft.storyboard.map((shot) => {
      const video =
        draft.shotVideos.find((v) => v.shotId === shot.id) ||
        draft.shotVideos.find((v) => v.shotLabel === shot.shot);
      return { key: shot.id, shot, video };
    });
  }
  return draft.shotVideos.map((video) => ({
    key: video.id,
    shot: null as FilmStoryboardShot | null,
    video,
  }));
});

const editingVideoSlot = computed(() =>
  videoSlots.value.find((s) => s.key === videoEditorShotKey.value),
);

const videoModels = computed(() => {
  const list = modelsOf('video') || modelsOf('chat') || [];
  return list.length ? list : [{ value: '', label: '默认模型' }];
});

const imageModels = computed(() => {
  const list = modelsOf('image') || [];
  return list.length ? list : [{ value: '', label: '默认模型' }];
});

const videoEditorModeLabel = computed(
  () => videoEditorModes.find((m) => m.id === videoEditorMode.value)?.label || '多参生视频',
);

const videoEditorModelLabel = computed(() => {
  const hit = videoModels.value.find((m) => m.value === videoEditorModel.value);
  return hit?.label || videoEditorModel.value || '默认模型';
});

const videoEditorModeTip = computed(() => {
  if (videoEditorMode.value === 'i2v') {
    return '图生视频：建议上传分镜关键帧；提示词侧重运动与镜头变化。';
  }
  if (videoEditorMode.value === 'grid') {
    return '多宫格：适合连续分格关键帧串联生成，注意镜头衔接。';
  }
  if (videoEditorMode.value === 'frames') {
    return '首尾帧：请提供起始与结束关键帧，中间运动由模型补全。';
  }
  return '多参生视频：可导入多张参考素材（图/视频），描述主体、运动与光影。';
});

const canUndo = computed(() => scriptHistoryIndex.value > 0);
const canRedo = computed(
  () => scriptHistoryIndex.value < scriptHistory.value.length - 1,
);

function enterWriteMode() {
  scriptUiMode.value = 'write';
  draft.adaptedFrom = draft.sourceBookId ? 'novel' : 'paste';
  dirty.value = true;
  pushScriptHistory(draft.script || '');
}

function enterAiMode() {
  scriptUiMode.value = 'ai';
  if (!draft.adaptedFrom || draft.adaptedFrom === 'blank') {
    draft.adaptedFrom = 'paste';
  }
  dirty.value = true;
}

function triggerUpload() {
  scriptFileInput.value?.click();
}

async function onScriptFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    draft.script = text;
    draft.adaptedFrom = 'paste';
    scriptUiMode.value = 'write';
    dirty.value = true;
    pushScriptHistory(text);
    ElMessage.success('剧本已导入');
  } catch (e: any) {
    ElMessage.error(e?.message || '读取文件失败');
  }
}

function pushScriptHistory(text: string) {
  const next = scriptHistory.value.slice(0, scriptHistoryIndex.value + 1);
  if (next[next.length - 1] === text) return;
  next.push(text);
  if (next.length > 40) next.shift();
  scriptHistory.value = next;
  scriptHistoryIndex.value = next.length - 1;
}

let scriptInputTimer: ReturnType<typeof setTimeout> | null = null;
function onScriptInput() {
  dirty.value = true;
  if (scriptInputTimer) clearTimeout(scriptInputTimer);
  scriptInputTimer = setTimeout(() => {
    pushScriptHistory(draft.script || '');
  }, 400);
}

function undoScript() {
  if (!canUndo.value) return;
  scriptHistoryIndex.value -= 1;
  draft.script = scriptHistory.value[scriptHistoryIndex.value] || '';
  dirty.value = true;
}

function redoScript() {
  if (!canRedo.value) return;
  scriptHistoryIndex.value += 1;
  draft.script = scriptHistory.value[scriptHistoryIndex.value] || '';
  dirty.value = true;
}

async function copyScript() {
  try {
    await navigator.clipboard.writeText(draft.script || '');
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}

function clearScript() {
  draft.script = '';
  dirty.value = true;
  pushScriptHistory('');
}

async function pasteScript() {
  try {
    const text = await navigator.clipboard.readText();
    if (!String(text || '').trim()) {
      ElMessage.warning('剪贴板没有文本');
      return;
    }
    draft.script = text;
    draft.adaptedFrom = 'paste';
    dirty.value = true;
    pushScriptHistory(text);
    ElMessage.success('已粘贴剧本');
  } catch {
    ElMessage.error('无法读取剪贴板，请直接在编辑区 Ctrl+V 粘贴');
  }
}

function useQuickPrompt(q: { title: string; prompt: string }) {
  aiPrompt.value = q.prompt;
  void sendAiWrite();
}

async function sendAiWrite() {
  const idea = aiPrompt.value.trim();
  if (!idea || aiWriting.value) return;
  aiWriting.value = true;
  aiMessages.value.push({ role: 'user', content: idea });
  aiPrompt.value = '';
  try {
    await ensureAiSettings();
    await ensureCollectionMeta();
    const existing = String(draft.script || '').trim();
    const series = isSeriesMode.value;

    // 合集模式：没有大纲则先生成合集大纲，再写本集
    if (series && !String(seriesOutline.value || '').trim() && !existing) {
      aiMessages.value.push({
        role: 'assistant',
        content: '合集还没有大纲，先为整部剧生成大纲…',
      });
      const outline = await generateSeriesOutlineFromIdea({
        idea,
        model: adaptModel.value || undefined,
      });
      seriesOutline.value = outline;
      draft.outlineSnapshot = outline;
      draft.entryMode = 'series';
      const cid = String(draft.collectionId || '').trim();
      if (cid) {
        collectionMeta.value = await updateFilmCollectionOutline(cid, outline);
      }
      aiMessages.value.push({
        role: 'assistant',
        content: '合集大纲已生成，接着写本集剧本…',
      });
    }

    const promptIdea = existing
      ? `当前已有剧本如下，请按用户要求继续修改/扩写，并保持原有结构输出完整正文：\n\n【现有剧本】\n${existing.slice(0, 10000)}\n\n【用户要求】\n${idea}`
      : idea;

    const text = await generateComicScriptFromIdea({
      idea: promptIdea,
      durationSec: draft.videoSettings.durationSec,
      model: adaptModel.value || undefined,
      entryMode: series ? 'series' : 'standalone',
      seriesOutline: seriesOutline.value || draft.outlineSnapshot,
      episodeIndex: draft.episodeIndex || 1,
      episodeName: draft.name || (series ? `第${draft.episodeIndex || 1}集` : '未命名项目'),
    });

    draft.script = text;
    draft.adaptedFrom = 'paste';
    dirty.value = true;
    pushScriptHistory(text);

    if (!series) {
      const extracted = extractOutlineFromScript(text);
      if (extracted) draft.outlineSnapshot = extracted;
    } else if (!draft.outlineSnapshot.trim() && seriesOutline.value) {
      draft.outlineSnapshot = seriesOutline.value;
    }

    aiMessages.value.push({
      role: 'assistant',
      content: existing
        ? '已按你的要求更新右侧剧本，可继续微调。'
        : series
          ? `已基于合集大纲生成第${draft.episodeIndex || 1}集剧本，可在右侧继续修改。`
          : '已生成含「剧本大纲 / 人物设定 / 完整脚本」的正文，可在右侧查看与修改。',
    });
    ElMessage.success(existing ? '剧本已更新' : '剧本已生成');
    await save(true);
  } catch (e: any) {
    aiMessages.value.push({
      role: 'assistant',
      content: e?.response?.data?.message || e?.message || '生成失败，请重试',
    });
    ElMessage.error(e?.response?.data?.message || e?.message || '生成失败');
  } finally {
    aiWriting.value = false;
  }
}

async function ensureCollectionMeta() {
  const cid = String(draft.collectionId || '').trim();
  if (!cid) {
    collectionMeta.value = null;
    seriesOutline.value = '';
    return;
  }
  if (collectionMeta.value?.id === cid) {
    seriesOutline.value = String(collectionMeta.value.meta?.seriesOutline || '');
    return;
  }
  try {
    const col = await fetchFilmCollection(cid);
    collectionMeta.value = col;
    seriesOutline.value = String(col.meta?.seriesOutline || '');
    if (isSeriesEntry(col.meta?.entryMode)) {
      draft.entryMode = 'series';
    } else if (col.meta?.entryMode === 'standalone') {
      draft.entryMode = 'standalone';
    }
    if (!draft.outlineSnapshot.trim() && seriesOutline.value) {
      draft.outlineSnapshot = seriesOutline.value;
    }
  } catch {
    collectionMeta.value = null;
  }
}

function goBackToSeries() {
  // 回到「我的项目」：制作大片入口不再是列表页
  if (!isSeriesMode.value) {
    router.push('/productions');
    return;
  }
  const cid = String(draft.collectionId || '').trim();
  if (cid) router.push(`/films/c/${cid}`);
  else router.push('/productions');
}

function onShareCreation() {
  const name = draft.name || '未命名剧集';
  const text = `${name} · AIGC 视频工厂`;
  void navigator.clipboard
    ?.writeText(`${text}\n${location.href}`)
    .then(() => ElMessage.success('已复制分享链接'))
    .catch(() => ElMessage.info('可复制地址栏链接分享'));
}

function kindLabel(kind: string) {
  if (kind === 'character') return '角色';
  if (kind === 'prop') return '道具';
  return '场景';
}

function openAssetEditor(id: string) {
  editingAssetId.value = id;
  const item = draft.sceneItems.find((i) => i.id === id);
  if (item?.kind) assetKindFilter.value = item.kind;
  assetEditorOpen.value = true;
}

function closeAssetEditor() {
  assetEditorOpen.value = false;
}

async function saveAssetEditor() {
  dirty.value = true;
  assetEditorOpen.value = false;
  await save(true);
}

function applyAssetPrompt() {
  dirty.value = true;
  ElMessage.success('提示词已保存，二期将支持在此直出生图');
}

function openAssetMenu(item: FilmSceneItem) {
  openAssetEditor(item.id);
}

function replaceAssetImage(item: FilmSceneItem) {
  assetReplaceTargetId.value = item.id;
  assetReplaceInput.value?.click();
}

async function onAssetReplaceFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const tid = assetReplaceTargetId.value;
  assetReplaceTargetId.value = '';
  if (!file || !tid) return;
  const item = draft.sceneItems.find((i) => i.id === tid);
  if (!item) return;
  try {
    item.imageUrl = URL.createObjectURL(file);
    dirty.value = true;
    ElMessage.success('已替换参考图');
  } catch (e: any) {
    ElMessage.error(e?.message || '读取图片失败');
  }
}

async function removeEditingAsset() {
  if (!editingAssetId.value) return;
  removeSceneItem(editingAssetId.value);
  assetEditorOpen.value = false;
  editingAssetId.value = '';
}

function shotCardHint(shot: FilmStoryboardShot) {
  const text = String(shot.description || shot.shot || shot.scene || '').trim();
  if (!text) return '';
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

function emptyShotFields(indexHint = 0): FilmStoryboardShot {
  return {
    id: id(),
    index: indexHint,
    shot: `未命名${draft.storyboard.length ? draft.storyboard.length : ''}`,
    scene: '',
    description: '',
    dialogue: '',
    durationSec: draft.videoSettings.durationSec || 10,
    prompt: '',
    imageUrl: '',
    characterIds: [],
    sceneId: '',
  };
}

function insertShotAfter(index: number) {
  const shot = emptyShotFields(index + 2);
  draft.storyboard.splice(index + 1, 0, shot);
  draft.storyboard.forEach((s, i) => {
    s.index = i + 1;
  });
  draft.shotVideos.push({
    id: id(),
    shotId: shot.id,
    shotLabel: shot.shot,
    url: '',
    status: 'pending',
    prompt: '',
  });
  dirty.value = true;
  openShotEditor(shot.id);
}

function openShotEditor(shotId: string) {
  editingShotId.value = shotId;
  const shot = draft.storyboard.find((s) => s.id === shotId);
  if (shot) {
    shotEditorForm.shot = shot.shot || '';
    shotEditorForm.scene = shot.scene || '';
    shotEditorForm.description = shot.description || '';
    shotEditorForm.dialogue = shot.dialogue || '';
    shotEditorForm.durationSec = Math.max(1, Number(shot.durationSec) || 3);
    shotEditorForm.prompt = shot.prompt || '';
    shotEditorForm.imageUrl = shot.imageUrl || '';
    shotEditorForm.characterIds = [...(shot.characterIds || [])];
    shotEditorForm.sceneId = shot.sceneId || '';
  }
  shotEditorOpen.value = true;
  closeShotMenu();
}

function closeShotEditor() {
  shotEditorOpen.value = false;
}

function applyShotEditorForm(shot: FilmStoryboardShot) {
  shot.shot = String(shotEditorForm.shot || '').trim() || shot.shot;
  shot.scene = String(shotEditorForm.scene || '').trim();
  shot.description = String(shotEditorForm.description || '');
  shot.dialogue = String(shotEditorForm.dialogue || '').trim();
  shot.durationSec = Math.max(1, Number(shotEditorForm.durationSec) || 3);
  shot.prompt = String(shotEditorForm.prompt || '').trim();
  shot.imageUrl = String(shotEditorForm.imageUrl || '').trim();
  shot.characterIds = [...shotEditorForm.characterIds];
  shot.sceneId = String(shotEditorForm.sceneId || '').trim();
}

async function saveShotEditor() {
  const shot = editingShot.value;
  if (shot) {
    applyShotEditorForm(shot);
    dirty.value = true;
  }
  shotEditorOpen.value = false;
  await save(true);
  ElMessage.success('分镜已保存');
}

async function copyShotStructured() {
  try {
    await navigator.clipboard.writeText(
      [
        shotEditorForm.shot ? `【${shotEditorForm.shot}】` : '',
        shotEditorForm.scene ? `场景：${shotEditorForm.scene}` : '',
        shotEditorForm.description || '',
        shotEditorForm.dialogue ? `对白：${shotEditorForm.dialogue}` : '',
        shotEditorForm.prompt || '',
      ]
        .filter((x) => String(x).trim())
        .join('\n'),
    );
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}

function clearShotStructured() {
  shotEditorForm.description = '';
  shotEditorForm.dialogue = '';
  shotEditorForm.prompt = '';
  dirty.value = true;
}

function onShotSceneBind() {
  dirty.value = true;
  const item = draft.sceneItems.find((i) => i.id === shotEditorForm.sceneId);
  if (item?.name) shotEditorForm.scene = item.name;
}

function triggerShotImageReplace() {
  shotImageInput.value?.click();
}

async function onShotImageReplace(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const sessionId = await ensureFilmGenSession();
    const uploaded = await uploadGenerateRef(sessionId, file);
    shotEditorForm.imageUrl = uploaded.url || URL.createObjectURL(file);
    dirty.value = true;
    ElMessage.success('已替换关键帧');
  } catch (e: any) {
    try {
      shotEditorForm.imageUrl = URL.createObjectURL(file);
      dirty.value = true;
      ElMessage.success('已替换关键帧（本地预览）');
    } catch {
      ElMessage.error(e?.message || '读取图片失败');
    }
  }
}

async function ensureFilmGenSession() {
  if (filmGenSessionId.value) return filmGenSessionId.value;
  const title = `分镜·${draft.name || projectId.value || '剧集'}`.slice(0, 40);
  const session = await createGenerateSession(title);
  filmGenSessionId.value = session.id;
  return session.id;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitGenerateImageUrl(sessionId: string, messageId: string) {
  for (let i = 0; i < 90; i += 1) {
    const rows = await listGenerateMessages(sessionId);
    const row = rows.find((m) => m.id === messageId);
    if (!row) {
      await sleep(2000);
      continue;
    }
    if (row.status === 'error') {
      throw new Error(row.errorMessage || '分镜图生成失败');
    }
    const url = String(row.mediaUrl || '').trim();
    if (row.status === 'done' && url) return url;
    if (row.status === 'done') {
      const prefsUrls = Array.isArray(row.prefs?.mediaUrls)
        ? (row.prefs!.mediaUrls as unknown[]).map((u) => String(u || '').trim()).filter(Boolean)
        : [];
      if (prefsUrls[0]) return prefsUrls[0];
    }
    await sleep(2200);
  }
  throw new Error('分镜图生成超时，请稍后重试');
}

async function generateShotKeyframe() {
  if (shotImageBusy.value) return;
  const prompt = String(
    shotEditorForm.prompt ||
      shotEditorForm.description ||
      shotEditorForm.shot ||
      '',
  ).trim();
  if (!prompt) {
    ElMessage.warning('请先填写画面描述或关键帧提示词');
    return;
  }
  shotImageBusy.value = true;
  try {
    await ensureAiSettings();
    const sessionId = await ensureFilmGenSession();
    const refs: string[] = [];
    for (const cid of shotEditorForm.characterIds) {
      const item = draft.sceneItems.find((i) => i.id === cid && i.imageUrl);
      if (item?.imageUrl) refs.push(String(item.imageUrl));
    }
    if (shotEditorForm.sceneId) {
      const scene = draft.sceneItems.find((i) => i.id === shotEditorForm.sceneId && i.imageUrl);
      if (scene?.imageUrl) refs.push(String(scene.imageUrl));
    }
    const styleBits = [draft.style.family, draft.style.sub, draft.style.brief]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    const fullPrompt = [
      prompt,
      styleBits.length ? `风格：${styleBits.join(' / ')}` : '',
      '电影分镜关键帧，构图清晰，适合后续图生视频。',
    ]
      .filter(Boolean)
      .join('\n');
    const aspect = String(draft.videoSettings.aspect || '16:9');
    const model = String(imageModels.value[0]?.value || '') || undefined;
    const result = await generateImage({
      sessionId,
      prompt: fullPrompt,
      model,
      aspectRatio: aspect,
      count: 1,
      referenceImages: refs.slice(0, 4),
      prefs: { aspectRatio: aspect, source: 'film-storyboard' },
    });
    const msgId = result.assistantMessage?.id;
    if (!msgId) throw new Error('未返回生成任务');
    const url = await waitGenerateImageUrl(sessionId, msgId);
    shotEditorForm.imageUrl = url;
    if (!shotEditorForm.prompt) shotEditorForm.prompt = prompt;
    dirty.value = true;
    ElMessage.success('分镜图已生成');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '生成分镜图失败');
  } finally {
    shotImageBusy.value = false;
  }
}

function toggleShotMenu(id: string, ev: MouseEvent) {
  if (shotMenuId.value === id) {
    closeShotMenu();
    return;
  }
  shotMenuId.value = id;
  const x = Math.min(ev.clientX, window.innerWidth - 180);
  const y = Math.min(ev.clientY, window.innerHeight - 180);
  shotMenuPos.value = { x, y };
}

function closeShotMenu() {
  shotMenuId.value = '';
}

function menuJumpVideo() {
  const shotId = shotMenuId.value;
  closeShotMenu();
  goStep(5);
  if (shotId) editingShotId.value = shotId;
}

function menuEditShot() {
  const shotId = shotMenuId.value;
  closeShotMenu();
  if (shotId) openShotEditor(shotId);
}

function menuCopyShot() {
  const shotId = shotMenuId.value;
  closeShotMenu();
  const src = draft.storyboard.find((s) => s.id === shotId);
  if (!src) return;
  const copy: FilmStoryboardShot = {
    ...src,
    id: id(),
    index: draft.storyboard.length + 1,
    shot: `${src.shot || '分镜'} 副本`,
    characterIds: [...(src.characterIds || [])],
  };
  draft.storyboard.push(copy);
  dirty.value = true;
  ElMessage.success('已复制分镜');
}

function menuDeleteShot() {
  const shotId = shotMenuId.value;
  closeShotMenu();
  if (!shotId) return;
  removeStoryboardShot(shotId);
  ElMessage.success('已删除');
}

type VideoSlot = {
  key: string;
  shot: FilmStoryboardShot | null;
  video: FilmShotVideo | undefined;
};

function videoSlotByKey(key: string): VideoSlot | undefined {
  return videoSlots.value.find((s) => s.key === key);
}

function ensureShotVideo(slot: VideoSlot): FilmShotVideo {
  if (slot.video) return slot.video;
  const video: FilmShotVideo = {
    id: id(),
    shotId: slot.shot?.id || slot.key,
    shotLabel: slot.shot?.shot || '',
    url: '',
    status: 'pending',
    prompt: slot.shot?.prompt || '',
  };
  draft.shotVideos.push(video);
  dirty.value = true;
  return video;
}

function toggleVideoMenu(key: string, ev: MouseEvent) {
  if (videoMenuId.value === key) {
    closeVideoMenu();
    return;
  }
  videoMenuId.value = key;
  const x = Math.min(ev.clientX, window.innerWidth - 200);
  const y = Math.min(ev.clientY, window.innerHeight - 320);
  videoMenuPos.value = { x, y };
}

function closeVideoMenu() {
  videoMenuId.value = '';
}

function videoMenuJumpScript() {
  const key = videoMenuId.value;
  closeVideoMenu();
  const slot = videoSlotByKey(key);
  goStep(4);
  if (slot?.shot?.id) {
    nextTick(() => openShotEditor(slot.shot!.id));
  }
}

async function videoMenuGenerate() {
  const key = videoMenuId.value;
  closeVideoMenu();
  const slot = videoSlotByKey(key);
  if (!slot) return;
  ensureShotVideo(slot);
  dirty.value = true;
  ElMessage.success('已加入生成队列，可用「批量生成视频」同步到画布');
  await save(true);
}

function videoMenuEdit() {
  const key = videoMenuId.value;
  closeVideoMenu();
  if (!key) return;
  openVideoEditor(key);
}

function openVideoEditor(key: string) {
  const slot = videoSlotByKey(key);
  if (!slot) return;
  ensureShotVideo(slot);
  videoEditorShotKey.value = key;
  videoEditorMode.value =
    draft.videoGenMode === 'i2v' || draft.videoGenMode === 'grid'
      ? draft.videoGenMode
      : 'omni';
  const shot = slot.shot;
  videoEditorPrompt.value = String(
    slot.video?.prompt ||
      shot?.prompt ||
      [shot?.description, shot?.dialogue, draft.style.brief]
        .filter(Boolean)
        .join('\n') ||
      '',
  );
  const keyframe = String(shot?.imageUrl || '').trim();
  const fromAssets = draft.sceneItems
    .filter((i) => i.imageUrl)
    .slice(0, 6)
    .map((i) => ({
      id: i.id,
      name: i.name || kindLabel(i.kind),
      url: String(i.imageUrl),
    }));
  videoEditorMaterials.value = [
    ...(keyframe
      ? [{ id: `kf-${shot?.id || 'shot'}`, name: '分镜关键帧', url: keyframe }]
      : []),
    ...fromAssets.filter((i) => i.url !== keyframe),
  ].slice(0, 8);
  if (keyframe && videoEditorMode.value === 'omni') {
    videoEditorMode.value = 'i2v';
  }
  if (!videoEditorModel.value && videoModels.value[0]) {
    videoEditorModel.value = String(videoModels.value[0].value || '');
  }
  videoEditorOpen.value = true;
}

function closeVideoEditor() {
  videoEditorOpen.value = false;
  void save(true);
}

function onVideoPromptInput() {
  const slot = editingVideoSlot.value;
  if (!slot) return;
  const video = ensureShotVideo(slot);
  video.prompt = videoEditorPrompt.value;
  dirty.value = true;
}

function refreshVideoPrompt() {
  const slot = editingVideoSlot.value;
  if (!slot?.shot) return;
  videoEditorPrompt.value = [
    slot.shot.description,
    slot.shot.dialogue,
    draft.style.brief,
  ]
    .filter(Boolean)
    .join('\n');
  onVideoPromptInput();
}

function clearVideoPrompt() {
  videoEditorPrompt.value = '';
  onVideoPromptInput();
}

async function copyVideoPrompt() {
  try {
    await navigator.clipboard.writeText(videoEditorPrompt.value || '');
    ElMessage.success('已复制提示词');
  } catch {
    ElMessage.error('复制失败');
  }
}

function buildVideoPrompt() {
  const slot = editingVideoSlot.value;
  const shot = slot?.shot;
  const parts = [
    draft.style.brief ? `画风：${draft.style.brief}` : '',
    shot?.scene ? `场景：${shot.scene}` : '',
    shot?.description ? `画面：${shot.description}` : '',
    shot?.dialogue ? `对白：${shot.dialogue}` : '',
    draft.videoSettings.aspect ? `画幅 ${draft.videoSettings.aspect}` : '',
    `镜头时长约 ${draft.videoSettings.durationSec || 10} 秒`,
    '运动自然、主体稳定、禁止字幕水印。',
  ].filter(Boolean);
  videoEditorPrompt.value = parts.join('\n');
  onVideoPromptInput();
  ElMessage.success('已根据分镜生成提示词');
}

function triggerVideoMaterial() {
  videoMaterialInput.value?.click();
}

function onVideoMaterialFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const url = URL.createObjectURL(file);
  videoEditorMaterials.value.push({
    id: id(),
    name: file.name.replace(/\.[^.]+$/, '') || '素材',
    url,
  });
  dirty.value = true;
}

function triggerVideoReplaceInEditor() {
  videoEditorReplaceInput.value?.click();
}

function onVideoEditorReplaceFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const slot = editingVideoSlot.value;
  if (!file || !slot) return;
  const video = ensureShotVideo(slot);
  if (video.url?.startsWith('blob:')) URL.revokeObjectURL(video.url);
  video.url = URL.createObjectURL(file);
  video.status = 'ready';
  dirty.value = true;
  ElMessage.success('已替换视频（本地预览）');
}

async function runGenerateShotVideo() {
  const slot = editingVideoSlot.value;
  if (!slot || videoGenerating.value) return;
  const video = ensureShotVideo(slot);
  video.prompt = videoEditorPrompt.value;
  if (videoEditorMode.value === 'i2v' || videoEditorMode.value === 'grid') {
    draft.videoGenMode = videoEditorMode.value;
  } else if (videoEditorMode.value === 'omni') {
    draft.videoGenMode = 'omni';
  }
  videoGenerating.value = true;
  try {
    dirty.value = true;
    await save(true);
    video.status = 'queued';
    ElMessage.success('已提交生成（可点「批量生成视频」同步到画布）');
  } catch (e: any) {
    ElMessage.error(e?.message || '提交失败');
  } finally {
    videoGenerating.value = false;
  }
}

function videoMenuCopy() {
  const key = videoMenuId.value;
  closeVideoMenu();
  const slot = videoSlotByKey(key);
  if (!slot?.shot) {
    ElMessage.warning('无可复制的分镜');
    return;
  }
  const src = slot.shot;
  const copy: FilmStoryboardShot = {
    ...src,
    id: id(),
    index: draft.storyboard.length + 1,
    shot: `${src.shot || '分镜'} 副本`,
  };
  draft.storyboard.push(copy);
  if (slot.video?.url) {
    draft.shotVideos.push({
      id: id(),
      shotId: copy.id,
      shotLabel: copy.shot,
      url: slot.video.url,
      status: slot.video.status || 'ready',
      prompt: slot.video.prompt || '',
    });
  }
  dirty.value = true;
  ElMessage.success('已复制分镜');
}

function previewShotVideo(slot: VideoSlot) {
  if (!slot.video?.url) {
    ElMessage.info('该分镜尚未生成视频');
    return;
  }
  videoPreviewUrl.value = slot.video.url;
  videoPreviewTitle.value = slot.shot
    ? `${String(slot.shot.index).padStart(2, '0')} · ${slot.shot.shot || '分镜'}`
    : '预览分镜视频';
  videoPreviewOpen.value = true;
}

function closeVideoPreview() {
  videoPreviewOpen.value = false;
  videoPreviewUrl.value = '';
}

function videoMenuPreview() {
  const key = videoMenuId.value;
  closeVideoMenu();
  const slot = videoSlotByKey(key);
  if (!slot) return;
  previewShotVideo(slot);
}

function videoMenuReplace() {
  const key = videoMenuId.value;
  closeVideoMenu();
  videoReplaceTargetKey.value = key;
  videoReplaceInput.value?.click();
}

async function onVideoReplaceFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const key = videoReplaceTargetKey.value;
  videoReplaceTargetKey.value = '';
  if (!file || !key) return;
  const slot = videoSlotByKey(key);
  if (!slot) return;
  const video = ensureShotVideo(slot);
  if (video.url?.startsWith('blob:')) URL.revokeObjectURL(video.url);
  video.url = URL.createObjectURL(file);
  video.status = 'ready';
  dirty.value = true;
  ElMessage.success('已替换为本地视频（预览）');
}

function videoMenuDownload() {
  const key = videoMenuId.value;
  closeVideoMenu();
  const slot = videoSlotByKey(key);
  const url = slot?.video?.url;
  if (!url) {
    ElMessage.warning('暂无可下载视频');
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slot?.shot?.shot || 'shot'}-${String(slot?.shot?.index || '').padStart(2, '0') || 'video'}.mp4`;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function videoMenuDelete() {
  const key = videoMenuId.value;
  closeVideoMenu();
  const slot = videoSlotByKey(key);
  if (!slot) return;
  if (slot.shot) {
    removeStoryboardShot(slot.shot.id);
  } else if (slot.video) {
    removeShotVideo(slot.video.id);
  }
  ElMessage.success('已删除分镜');
}

function insertStoryboardAfter(index: number) {
  const shot = emptyShotFields(index + 2);
  draft.storyboard.splice(index + 1, 0, shot);
  draft.storyboard.forEach((s, i) => {
    s.index = i + 1;
  });
  draft.shotVideos.push({
    id: id(),
    shotId: shot.id,
    shotLabel: shot.shot,
    url: '',
    status: 'pending',
    prompt: '',
  });
  dirty.value = true;
  openVideoEditor(shot.id);
}

function id() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function chapterMeta(ch: NovelChapterRow) {
  const words =
    Number.isFinite(ch.wordCount) && Number(ch.wordCount) > 0
      ? Number(ch.wordCount)
      : String(ch.novelBody || '').trim().length;
  return words ? `${words} 字` : '暂无正文';
}

function stepBlockReason(target: number): string {
  if (target <= 1) return '';
  if (target >= 2 && !String(draft.script || '').trim()) {
    return '请先完成漫剧剧本（第①步）';
  }
  if (target >= 5 && !draft.storyboard.length) {
    return '请先填写分镜脚本';
  }
  if (target >= 6 && !draft.storyboard.length) {
    return '请先填写分镜脚本';
  }
  return '';
}

function tryGoStep(index: number) {
  const reason = stepBlockReason(index);
  if (reason) {
    ElMessage.warning(reason);
    return;
  }
  goStep(index);
}

function goStep(index: number) {
  if (dirty.value) void save(true);
  router.replace({ query: { ...route.query, step: index } });
}

/** 仅右上角「下一步」校验；左侧步骤条可自由跳转 */
function goNext() {
  tryGoStep(Math.min(6, activeStep.value + 1));
}

function assignDraft(p: FilmProject) {
  const next = toFilmDraft(p);
  Object.assign(draft, next);
  selectedChapterIds.value = [...(next.sourceChapterIds || [])];
  dirty.value = false;
  scriptHistory.value = [next.script || ''];
  scriptHistoryIndex.value = 0;
  // 已有剧本直接进编写态，否则展示三选一入口
  scriptUiMode.value = 'write';
  if (String(route.query.from || '') === 'article') {
    draft.adaptedFrom = 'paste';
    scriptUiMode.value = 'write';
  }
}

async function loadNovelData(bookId: string) {
  if (!bookId) {
    chapters.value = [];
    characters.value = [];
    return;
  }
  novelLoading.value = true;
  try {
    const [chs, chars, outline] = await Promise.all([
      fetchNovelChapters(bookId),
      fetchNovelCharacters(bookId),
      draft.outlineSnapshot.trim()
        ? Promise.resolve(draft.outlineSnapshot)
        : fetchNovelOutline(bookId).catch(() => ''),
    ]);
    chapters.value = chs;
    characters.value = chars;
    if (!draft.outlineSnapshot.trim() && outline) {
      draft.outlineSnapshot = outline;
      dirty.value = true;
    }
    if (!selectedChapterIds.value.length && chs.length) {
      selectedChapterIds.value = [chs[0].id];
      draft.sourceChapterIds = [...selectedChapterIds.value];
      dirty.value = true;
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载小说章节失败');
  } finally {
    novelLoading.value = false;
  }
}

async function load() {
  const pid = projectId.value;
  if (!pid) return;
  loading.value = true;
  try {
    const p = await fetchFilmProject(pid);
    project.value = p;
    assignDraft(p);
    await ensureAiSettings();
    adaptModel.value = chatModels.value[0]?.value || '';
    await ensureCollectionMeta();
    if (draft.sourceBookId) await loadNovelData(draft.sourceBookId);
    void hydrateStyles();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载项目失败');
  } finally {
    loading.value = false;
  }
}

async function save(silent = false) {
  const pid = projectId.value;
  if (!pid || saving.value) return;
  saving.value = true;
  try {
    draft.sourceChapterIds = [...selectedChapterIds.value];
    const p = await updateFilmProject(pid, filmDraftToPatch(draft, activeStep.value));
    project.value = p;
    dirty.value = false;
    if (!silent) ElMessage.success('已保存');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function usePasteMode() {
  draft.adaptedFrom = 'paste';
  dirty.value = true;
}

async function openPickNovel() {
  pickNovelOpen.value = true;
  pickLoading.value = true;
  try {
    novelBooks.value = await listNovelBooks();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载小说失败');
  } finally {
    pickLoading.value = false;
  }
}

watch(pickNovelOpen, (v) => {
  if (v) void openPickNovel();
});

async function bindNovel(b: NovelBookRow) {
  draft.sourceBookId = b.id;
  draft.sourceBookTitle = b.title || '未命名小说';
  draft.adaptedFrom = 'novel';
  draft.description = draft.description || `由小说《${draft.sourceBookTitle}》改编成漫剧`;
  if (!draft.name || draft.name.includes('未命名')) {
    draft.name = `《${draft.sourceBookTitle}》漫剧`;
  }
  pickNovelOpen.value = false;
  dirty.value = true;
  scriptUiMode.value = 'write';
  try {
    draft.outlineSnapshot = await fetchNovelOutline(b.id);
  } catch {
    draft.outlineSnapshot = '';
  }
  selectedChapterIds.value = [];
  await loadNovelData(b.id);
  await save(true);
}

function toggleChapter(cid: string) {
  const set = new Set(selectedChapterIds.value);
  if (set.has(cid)) set.delete(cid);
  else set.add(cid);
  selectedChapterIds.value = [...set];
  draft.sourceChapterIds = [...selectedChapterIds.value];
  dirty.value = true;
}

async function runAdapt() {
  if (adapting.value) return;
  const picked = chapters.value.filter((c) => selectedChapterIds.value.includes(c.id));
  if (!picked.length) {
    ElMessage.warning('请先选择至少一个章节');
    return;
  }
  adapting.value = true;
  adaptStatus.value = '正在把小说大纲与章节改编成漫剧剧本…';
  try {
    await ensureAiSettings();
    const raw = buildMultiChapterRawScript(
      picked,
      characters.value,
      draft.outlineSnapshot,
    );
    const text = await adaptNovelToComicScript({
      draft: raw,
      outline: draft.outlineSnapshot,
      durationSec: draft.videoSettings.durationSec,
      styleBrief: draft.style.brief,
      model: adaptModel.value || undefined,
    });
    draft.script = text;
    draft.adaptedFrom = 'novel';
    dirty.value = true;
    adaptStatus.value = '改编完成，可继续编辑后进入视频设定。';
    ElMessage.success('漫剧剧本已生成');
    await save(true);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '改编失败');
    adaptStatus.value = '';
  } finally {
    adapting.value = false;
  }
}

function setAspect(aspect: string) {
  draft.videoSettings.aspect = aspect;
  dirty.value = true;
}

function setVideoMode(mode: FilmVideoGenMode) {
  draft.videoGenMode = mode;
  dirty.value = true;
}

function styleCoverUrl(s: FilmStyleItem) {
  return s.coverUrl || '';
}

function applyStyle(s: FilmStyleItem) {
  selectedStyleId.value = s.id;
  draft.style.family = s.group || '';
  draft.style.sub = s.label;
  draft.style.brief = s.brief || draft.style.brief || '';
  dirty.value = true;
}

function openStyleModal() {
  styleFilterId.value = 'all';
  pendingStyleId.value =
    selectedStyleId.value ||
    styleList.value.find((x) => x.label === draft.style.sub)?.id ||
    '';
  styleModalOpen.value = true;
}

function cancelStyleModal() {
  styleModalOpen.value = false;
}

function confirmStyleModal() {
  const s = styleList.value.find((x) => x.id === pendingStyleId.value);
  if (s) applyStyle(s);
  styleModalOpen.value = false;
}

function inferStyleGroup(a: { name?: string; prompt?: string; meta?: Record<string, unknown> }) {
  const metaGroup = String(a.meta?.group || '').trim();
  if (metaGroup) return metaGroup;
  const blob = `${a.name || ''} ${a.prompt || ''} ${JSON.stringify(a.meta || {})}`;
  if (/真人|写实|短剧|商业广告|电影|古装|港风/i.test(blob)) return '真人';
  if (/3D|三维|CG|机甲|卡通/i.test(blob)) return '3D';
  if (/2D|动漫|水墨|立绘|国风/i.test(blob)) return '2D';
  return '其他';
}

async function hydrateStyles() {
  stylesLoading.value = true;
  try {
    const { data } = await api.get('/projects/_library/assets', {
      params: { type: 'style' },
    });
    const rows = Array.isArray(data) ? data : [];
    const mapped: FilmStyleItem[] = rows
      .filter((a: any) => {
        const url = String(a?.url || '').trim();
        const meta = a?.meta && typeof a.meta === 'object' ? a.meta : {};
        // 跳过旧的猜测种子（首页作品/海报乱分类）
        if (meta.source === 'nami' && meta.seedSlug) return false;
        return Boolean(url);
      })
      .map((a: any) => {
        const group = inferStyleGroup(a);
        const tags = Array.isArray(a?.meta?.tags)
          ? a.meta.tags.map((t: unknown) => String(t))
          : [group].filter(Boolean);
        return {
          id: String(a.id),
          label: String(a.name || '未命名风格'),
          group,
          brief: String(a.prompt || a.meta?.brief || ''),
          coverUrl: resolveMediaUrl(String(a.url || '')),
          tags,
        } satisfies FilmStyleItem;
      });
    styleList.value = mapped.length ? mapped : [...FILM_STYLES];
    const groups = [...new Set(styleList.value.map((s) => s.group).filter(Boolean))];
    styleFilters.value = [
      { id: 'all', label: '全部' },
      ...groups.map((g) => ({ id: g, label: g })),
    ];
    if (!selectedStyleId.value && draft.style.sub) {
      const hit = styleList.value.find((x) => x.label === draft.style.sub);
      if (hit) selectedStyleId.value = hit.id;
    }
  } catch (e: any) {
    console.warn('load style library failed', e?.message || e);
    styleList.value = [...FILM_STYLES];
    styleFilters.value = [...FILM_STYLE_FILTERS];
  } finally {
    stylesLoading.value = false;
  }
}

function addSceneItem() {
  const kind = assetKindFilter.value;
  const sameKindCount = draft.sceneItems.filter((i) => i.kind === kind).length;
  const item: FilmSceneItem = {
    id: id(),
    kind,
    name: `未命名${sameKindCount || ''}`,
    description: '',
    prompt: '',
  };
  draft.sceneItems.push(item);
  dirty.value = true;
  openAssetEditor(item.id);
}

function removeSceneItem(itemId: string) {
  const index = draft.sceneItems.findIndex((item) => item.id === itemId);
  if (index >= 0) {
    draft.sceneItems.splice(index, 1);
    dirty.value = true;
  }
}

async function runExtractAssets() {
  if (extracting.value) return;
  extracting.value = true;
  try {
    await ensureAiSettings();
    const items = await extractSceneItemsFromScript({
      script: draft.script,
      model: adaptModel.value || undefined,
    });
    draft.sceneItems = items;
    dirty.value = true;
    ElMessage.success(`已抽取 ${items.length} 个对象`);
    await save(true);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '抽取失败');
  } finally {
    extracting.value = false;
  }
}

function addStoryboardShot() {
  const shot = emptyShotFields(draft.storyboard.length + 1);
  shot.durationSec = 3;
  draft.storyboard.push(shot);
  dirty.value = true;
  openShotEditor(shot.id);
}

/** 分镜视频页：新增一镜并打开视频编辑台（不进脚本编辑） */
function addVideoShot() {
  const shot = emptyShotFields(draft.storyboard.length + 1);
  draft.storyboard.push(shot);
  draft.shotVideos.push({
    id: id(),
    shotId: shot.id,
    shotLabel: shot.shot,
    url: '',
    status: 'pending',
    prompt: '',
  });
  dirty.value = true;
  openVideoEditor(shot.id);
}

function removeStoryboardShot(shotId: string) {
  const index = draft.storyboard.findIndex((shot) => shot.id === shotId);
  if (index >= 0) {
    draft.storyboard.splice(index, 1);
    draft.storyboard.forEach((shot, i) => {
      shot.index = i + 1;
    });
    draft.shotVideos = draft.shotVideos.filter((v) => v.shotId !== shotId);
    dirty.value = true;
  }
}

async function runSplitStoryboard() {
  if (splitting.value) return;
  splitting.value = true;
  try {
    await ensureAiSettings();
    const shots = await splitScriptToStoryboard({
      script: draft.script,
      durationSec: draft.videoSettings.durationSec,
      model: adaptModel.value || undefined,
    });
    draft.storyboard = shots;
    dirty.value = true;
    ElMessage.success(`已拆出 ${shots.length} 个分镜`);
    await save(true);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '拆分失败');
  } finally {
    splitting.value = false;
  }
}

function addShotVideo() {
  const video: FilmShotVideo = {
    id: id(),
    shotId: draft.storyboard[0]?.id || '',
    shotLabel: '',
    url: '',
    status: 'pending',
    prompt: '',
  };
  draft.shotVideos.push(video);
  dirty.value = true;
}

function removeShotVideo(videoId: string) {
  const index = draft.shotVideos.findIndex((video) => video.id === videoId);
  if (index >= 0) {
    draft.shotVideos.splice(index, 1);
    dirty.value = true;
  }
}

function shotLabel(shot: FilmStoryboardShot) {
  return `${shot.index}. ${shot.shot || '未命名分镜'}`;
}

async function syncToCanvas() {
  if (!project.value || canvasBusy.value) return;
  if (!String(draft.script || '').trim()) {
    ElMessage.warning('请先完成漫剧剧本');
    return;
  }
  canvasBusy.value = true;
  try {
    await save(true);
    const latest = await fetchFilmProject(projectId.value);
    // 把 sceneItems 同步进 cast/scenes 以便 compile
    const cast = draft.sceneItems
      .filter((i) => i.kind === 'character' && i.name.trim())
      .map((i) => ({
        name: i.name,
        appearance: i.description || '',
        portraitPrompt: i.prompt || i.description || i.name,
      }));
    const scenes = draft.sceneItems
      .filter((i) => i.kind === 'scene' && i.name.trim())
      .map((i) => ({
        name: i.name,
        description: i.description || '',
        imagePrompt: i.prompt || i.description || i.name,
      }));
    const patched = await updateFilmProject(projectId.value, {
      script: draft.script,
      style: draft.style,
      cast,
      scenes,
      meta: {
        ...(latest.meta || {}),
        ...filmDraftToPatch(draft, activeStep.value).meta,
        durationSec: draft.videoSettings.durationSec,
        videoRefMode: draft.videoGenMode === 'omni' ? 'omni' : 'frames',
      },
    });
    const { production } = await ensureCompiledProduction({
      production: patched,
      forceRecompile: true,
    });
    if (!production.workflowId) throw new Error('未关联画布');
    ElMessage.success('已同步到画布');
    await router.push({
      path: `/w/${production.workflowId}`,
      query: { productionId: production.id },
    });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '同步失败');
  } finally {
    canvasBusy.value = false;
  }
}

watch(
  () => draft.sourceBookId,
  (id) => {
    if (id) void loadNovelData(id);
  },
);

onMounted(load);
</script>

<style scoped>
.film-detail {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 !important;
  background: transparent !important;
  overflow: hidden;
}

.film-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 0;
  padding: 0;
}

.work-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid rgba(255, 255, 255, 0.05);
  background: #111;
}
.work-main.script-focus .step-content {
  padding: 0;
}
.work-main.board-focus .step-content {
  padding: 12px 20px 24px;
}
.work-main.preview-focus .step-content {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.work-main.preview-focus .step-pane.preview-pane {
  flex: 1;
  min-height: 0;
  height: auto;
}

.film-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px 12px;
  flex-shrink: 0;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.back-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}

.head-copy {
  min-width: 0;
  flex: 1;
}

.title-input {
  max-width: 420px;
}

.title-input :deep(.el-input__wrapper) {
  background: transparent;
  box-shadow: none;
  padding-left: 0;
}

.title-input :deep(.el-input__inner) {
  font-size: 18px;
  font-weight: 650;
  color: var(--studio-ink);
}

.head-copy p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--studio-faint);
}

.head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* —— 左侧步骤轨：纳米风格胶囊激活态 —— */
.step-rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 14px 12px 16px;
  background: #0f0f0f;
  overflow: hidden;
  box-sizing: border-box;
  border: 0;
  border-radius: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.rail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  padding: 0 4px;
  min-width: 0;
}

.rail-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--studio-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.step-list-scroll {
  flex: 1;
  min-height: 0;
}

.step-list {
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 0 2px;
}

.step-item {
  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-muted);
  text-align: left;
  padding: 10px 10px;
  cursor: pointer;
  font: inherit;
  transition: background 0.15s ease, color 0.15s ease;
}

.step-item:hover {
  color: var(--studio-ink);
  background: rgba(255, 255, 255, 0.04);
}

.step-item.on {
  color: #eff6ff;
  background: rgba(37, 99, 235, 0.22);
}

/* 虚线时间轴：从当前圆点连到下一步 */
.step-item:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 23px;
  top: 36px;
  bottom: -6px;
  width: 0;
  border-left: 1px dashed rgba(255, 255, 255, 0.18);
  opacity: 0.7;
  pointer-events: none;
}

.step-track {
  position: relative;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  z-index: 1;
}

.step-no {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: transparent;
  color: var(--studio-muted);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 600;
  position: relative;
  z-index: 1;
  box-sizing: border-box;
}

.step-check {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #2563eb;
  color: #ffffff;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
}

.step-item.on .step-no {
  border-color: #3b82f6;
  background: #2563eb;
  color: #ffffff;
}

.step-item.done:not(.on) .step-no {
  border-color: #3b82f6;
  color: #3b82f6;
}

.step-label {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  line-height: 1.3;
}

.step-label strong {
  font-size: 14px;
  font-weight: 500;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.step-item.on .step-label strong {
  font-weight: 650;
  color: #eff6ff;
}

.share-rail-btn {
  margin-top: 16px;
  width: 100%;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--studio-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 560;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.share-rail-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(59, 130, 246, 0.35);
}

.step-content {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 8px 24px 28px;
  box-sizing: border-box;
}
.step-scroll {
  flex: 1;
  min-height: 0;
}
.work-main.script-focus .step-scroll :deep(.el-scrollbar__view),
.work-main.preview-focus .step-scroll :deep(.el-scrollbar__view) {
  height: 100%;
  min-height: 100%;
}

.step-pane {
  max-width: 900px;
  margin: 0 auto;
}

.step-pane.wide {
  max-width: 1200px;
}

.step-pane.flat {
  max-width: none;
}

.step-pane.preview-pane {
  height: 100%;
  min-height: 0;
}

/* —— 剧本编辑：纳米风格居中胶囊 + 全幅编辑器 —— */
.script-step {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: row;
  background: #111;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.script-canvas {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 20px 16px;
}

.script-action-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 48px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.action-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.action-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.nami-pill {
  height: 40px;
  padding: 0 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #f5f5f5;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.nami-pill:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.22);
}
.nami-pill.ai {
  background: rgba(37, 99, 235, 0.16);
  border-color: rgba(59, 130, 246, 0.35);
  color: #eff6ff;
}
.nami-pill.ai.on,
.nami-pill.ai:hover {
  background: rgba(37, 99, 235, 0.28);
  border-color: #3b82f6;
}
.pill-avatar {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(37, 99, 235, 0.28);
  color: #93c5fd;
}
.icon-tool {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #a3a3a3;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.icon-tool:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.icon-tool:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.pill-btn.slim {
  height: 34px;
  padding: 0 12px;
  font-size: 12px;
}

.script-editor-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  border-radius: 16px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}
.script-editor {
  width: 100%;
  height: 100%;
  min-height: 420px;
  border: 0;
  resize: none;
  padding: 22px 24px;
  background: transparent;
  color: #f0f0f0;
  font: inherit;
  font-size: 15px;
  line-height: 1.75;
  outline: none;
  box-sizing: border-box;
}
.script-editor::placeholder {
  color: #737373;
}
.paste-fab {
  position: absolute;
  right: 20px;
  bottom: 20px;
  min-width: 148px;
  padding: 12px 16px;
  border: 0;
  border-radius: 14px;
  background: #2563eb;
  color: #ffffff;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 10px 28px rgba(37, 99, 235, 0.35);
  transition: transform 0.15s ease, background 0.15s ease;
}
.paste-fab:hover {
  background: #3b82f6;
  transform: translateY(-1px);
}
.paste-fab strong {
  font-size: 14px;
  font-weight: 700;
}
.paste-fab em {
  font-style: normal;
  font-size: 11px;
  opacity: 0.75;
}

.script-step .ai-assist {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  background: #0f0f0f;
  min-height: 0;
}
.ai-assist-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 14px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.ai-assist-title {
  min-width: 0;
  flex: 1;
}
.ai-assist-title strong {
  display: block;
  font-size: 14px;
}
.ai-assist-title p {
  margin: 2px 0 0;
  font-size: 12px;
  color: #737373;
}
.ai-assist-scroll {
  flex: 1;
  min-height: 0;
}
.ai-avatar {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(37, 99, 235, 0.18);
  color: #93c5fd;
  flex-shrink: 0;
}
.ai-close {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #a3a3a3;
  font-size: 18px;
  cursor: pointer;
}
.ai-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.ai-assist-scroll {
  flex: 1;
  min-height: 0;
}
.ai-assist-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 14px;
}
.ai-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 24px 12px 16px;
  color: #a3a3a3;
}
.ai-empty strong {
  color: #f5f5f5;
  font-size: 14px;
}
.ai-empty p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
.ai-quick {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.ai-quick-item {
  text-align: left;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  font: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ai-quick-item:hover {
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(37, 99, 235, 0.08);
}
.ai-quick-item strong {
  font-size: 13px;
}
.ai-quick-item em {
  font-style: normal;
  font-size: 12px;
  color: #737373;
}
.ai-msgs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai-msg {
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
}
.ai-msg.user {
  background: rgba(37, 99, 235, 0.16);
  color: #eff6ff;
  align-self: flex-end;
  max-width: 92%;
}
.ai-msg.assistant {
  background: rgba(255, 255, 255, 0.05);
  color: #e5e5e5;
}
.ai-typing {
  margin: 0;
  font-size: 12px;
  color: #93c5fd;
}
.ai-compose {
  padding: 12px 14px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: #0f0f0f;
}
.ai-compose-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 10px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #1a1a1a;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.ai-compose-box:focus-within {
  border-color: rgba(59, 130, 246, 0.45);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
.ai-compose-box textarea {
  width: 100%;
  min-height: 56px;
  max-height: 140px;
  resize: none;
  border: 0;
  outline: none;
  background: transparent;
  color: #f5f5f5;
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
  padding: 0;
  box-sizing: border-box;
  field-sizing: content;
}
.ai-compose-box textarea::placeholder {
  color: #737373;
}
.ai-compose-box textarea::-webkit-scrollbar {
  width: 6px;
}
.ai-compose-box textarea::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.16);
  border-radius: 999px;
}
.ai-compose-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ai-model-select {
  width: 128px;
  max-width: 58%;
}
.ai-compose .ai-model-select .el-select__wrapper {
  min-height: 30px !important;
  padding: 0 10px !important;
  background: rgba(255, 255, 255, 0.04) !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1) inset !important;
  border-radius: 999px !important;
}
.ai-compose .ai-model-select .el-select__wrapper:hover,
.ai-compose .ai-model-select .el-select__wrapper.is-focused {
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.4) inset !important;
}
.ai-compose .ai-model-select .el-select__selected-item,
.ai-compose .ai-model-select .el-select__placeholder,
.ai-compose .ai-model-select .el-select__caret {
  color: #d4d4d4 !important;
  font-size: 12px;
}
.ai-send {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: #2563eb;
  color: #ffffff;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, opacity 0.15s ease, transform 0.15s ease;
}
.ai-send:hover:not(:disabled) {
  background: #3b82f6;
  transform: translateY(-1px);
}
.ai-send:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
}

.novel-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
.novel-strip strong {
  display: block;
  font-size: 13px;
}
.novel-strip em {
  font-style: normal;
  font-size: 12px;
  color: #737373;
}
.novel-strip-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.chapter-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.chapter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  font-size: 12px;
  color: #a3a3a3;
  cursor: pointer;
}
.chapter-chip.on {
  border-color: rgba(59, 130, 246, 0.4);
  color: #eff6ff;
  background: rgba(37, 99, 235, 0.12);
}
.chapter-chip input {
  accent-color: #2563eb;
}
.status-line {
  margin: 8px 0 0;
  font-size: 12px;
  color: #93c5fd;
  flex-shrink: 0;
}
.tb-btn {
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #a3a3a3;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 0 10px;
}
.tb-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.tb-btn.accent {
  background: rgba(37, 99, 235, 0.18);
  color: #93c5fd;
}
.tb-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.section-block {
  margin-bottom: 28px;
}

.section-block h4 {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
}

.video-settings {
  --vs-accent: #3b82f6;
  --vs-accent-soft: rgba(59, 130, 246, 0.18);
}

.chip-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.aspect-chip {
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--studio-line-bright);
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.aspect-chip:hover {
  color: var(--studio-ink);
  border-color: var(--studio-line-bright);
}
.aspect-chip.on {
  border-color: var(--vs-accent);
  color: var(--vs-accent);
  background: var(--vs-accent-soft);
}
.aspect-chip.ghost {
  border-style: dashed;
}

.aspect-ico {
  display: inline-block;
  border: 1.5px solid currentColor;
  border-radius: 2px;
  opacity: 0.9;
}
.aspect-ico.portrait {
  width: 9px;
  height: 14px;
}
.aspect-ico.landscape {
  width: 14px;
  height: 9px;
}
.aspect-ico.cinema {
  width: 16px;
  height: 7px;
}
.aspect-ico.box {
  width: 12px;
  height: 10px;
}
.aspect-ico.square {
  width: 11px;
  height: 11px;
}

.mode-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.mode-card {
  position: relative;
  text-align: left;
  padding: 0;
  border-radius: 14px;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-inset);
  color: inherit;
  cursor: pointer;
  font: inherit;
  display: block;
  min-height: 0;
  overflow: hidden;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.mode-card:hover,
.mode-card.hover {
  border-color: var(--studio-line-bright);
}
.mode-card.on {
  border-color: var(--vs-accent);
  background: var(--vs-accent-soft);
  box-shadow: inset 0 0 0 1px var(--vs-accent);
}
.mode-corner {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 3;
  height: 18px;
  width: auto;
  pointer-events: none;
}
.mode-card-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 14px 14px;
}
.mode-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.mode-card-top strong {
  font-size: 15px;
  font-weight: 650;
}
.mode-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, #d4a84b 55%, var(--studio-line-bright));
  color: #e8c878;
  background: linear-gradient(180deg, rgba(232, 200, 120, 0.14), rgba(232, 200, 120, 0.04));
}
.mode-card.on .mode-badge {
  border-color: color-mix(in srgb, #d4a84b 70%, var(--vs-accent));
  color: #f0d28a;
}
.mode-card em {
  font-style: normal;
  font-size: 12px;
  line-height: 1.5;
  color: var(--studio-muted);
}

.style-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-start;
}

.style-card {
  width: 96px;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
}

.style-cover {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, #2c2c2c, #161616);
  color: var(--studio-muted);
  font-size: 18px;
  font-weight: 650;
  border: 2px solid transparent;
}
.style-cover-img {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.style-card.on .style-cover {
  border-color: var(--vs-accent);
}
.style-cover.dashed {
  border: 1px dashed var(--studio-line-bright);
  background: transparent;
}

.style-label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  padding: 18px 6px 8px;
  font-size: 11px;
  font-weight: 500;
  color: #fff;
  text-align: center;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.72));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.style-check {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--vs-accent);
  color: #111;
  display: grid;
  place-items: center;
}

.more-text {
  font-size: 13px;
  color: var(--studio-muted);
  font-weight: 500;
}
.more-card:hover .more-text {
  color: var(--studio-ink);
}

.hint-line {
  margin: 12px 0 8px;
  font-size: 12px;
  color: var(--studio-faint);
}

.style-brief-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 18px;
  padding: 14px 14px 12px;
  border-radius: 12px;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-inset);
}

.style-brief-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.style-brief-label strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--studio-ink);
}

.style-brief-label em {
  font-style: normal;
  font-size: 12px;
  line-height: 1.45;
  color: var(--studio-faint);
}

.style-brief-input {
  width: 100%;
  min-height: 84px;
  box-sizing: border-box;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--studio-line-bright);
  border-radius: 10px;
  background: var(--studio-panel, #fff);
  color: var(--studio-ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.style-brief-input::placeholder {
  color: var(--studio-faint);
}

.style-brief-input:hover {
  border-color: var(--studio-line-bright);
}

.style-brief-input:focus {
  border-color: var(--vs-accent, #3b82f6);
  box-shadow: 0 0 0 3px var(--vs-accent-soft, rgba(59, 130, 246, 0.18));
}

.style-mask {
  position: fixed;
  inset: 0;
  z-index: 4100;
  background: rgba(0, 0, 0, 0.65);
  display: grid;
  place-items: center;
  padding: 24px;
}

.style-modal {
  width: min(1080px, 100%);
  /* 固定高度：切换「全部/真人/3D/2D」时不随条目数量伸缩 */
  height: min(86vh, 820px);
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border: 1px solid #2e2e2e;
  border-radius: 14px;
  color: #f2f2f2;
  overflow: hidden;
}

.style-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 8px;
  flex-shrink: 0;
}
.style-modal-head strong {
  font-size: 16px;
}
.style-modal-head .x {
  border: 0;
  background: transparent;
  color: #999;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
}

.style-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 18px 12px;
  flex-shrink: 0;
}

.filter-chip {
  height: 30px;
  padding: 0 14px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: #9a9a9a;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.filter-chip.on {
  background: #f3f3f3;
  color: #111;
  font-weight: 600;
}

.style-modal-scroll {
  flex: 1;
  min-height: 0;
}
.style-modal-grid {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 8px 18px 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 14px 12px;
  align-content: start;
}

.style-modal-grid .style-card {
  width: auto;
}

.style-caption {
  font-size: 12px;
  text-align: center;
  color: #c8c8c8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.style-modal-grid .style-card.on .style-caption {
  color: #fff;
}
.style-modal-grid .style-card.on .style-cover {
  border-color: var(--vs-accent, #3b82f6);
}

.style-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 18px 16px;
  border-top: 1px solid #2a2a2a;
  flex-shrink: 0;
}

.modal-btn {
  height: 36px;
  min-width: 88px;
  padding: 0 18px;
  border-radius: 10px;
  border: 1px solid #444;
  background: transparent;
  color: #eee;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.modal-btn.confirm {
  border: 0;
  background: #3b82f6;
  color: #111;
  font-weight: 650;
}

@media (max-width: 960px) {
  .mode-cards {
    grid-template-columns: 1fr;
  }
}

.content-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.content-toolbar .stat {
  font-size: 13px;
  color: var(--studio-muted);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.assets-toolbar {
  align-items: flex-end;
}

.asset-kind-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  background: var(--studio-inset);
  border: 1px solid var(--studio-line);
}

.asset-kind-tabs button {
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.asset-kind-tabs button em {
  font-style: normal;
  font-size: 12px;
  color: var(--studio-faint);
  min-width: 1em;
}

.asset-kind-tabs button.on {
  background: var(--studio-panel, #fff);
  color: var(--studio-ink);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.asset-kind-tabs button.on em {
  color: var(--studio-muted);
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.shot-board,
.video-board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.shot-slot-wrap,
.video-slot-wrap {
  position: relative;
}

.board-insert,
.video-insert {
  position: absolute;
  top: 50%;
  right: -11px;
  z-index: 3;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid #3a3a3a;
  background: #2a2a2a;
  color: #c8c8c8;
  display: grid;
  place-items: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.shot-slot-wrap:hover .board-insert,
.video-slot-wrap:hover .video-insert,
.board-insert:focus-visible,
.video-insert:focus-visible {
  opacity: 1;
}
.board-insert:hover,
.video-insert:hover {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #ffffff;
}

.video-card {
  position: relative;
  background: #1e1e1e;
  border: 1px solid #2e2e2e;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.video-card:hover,
.video-card.on {
  border-color: rgba(59, 130, 246, 0.4);
  background: #242424;
}

.video-card-head {
  position: absolute;
  inset: 0 0 auto 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 0;
  pointer-events: none;
}
.video-card-head .shot-no {
  font-size: 13px;
  font-weight: 650;
  color: #f2f2f2;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
}
.video-card-head .more {
  pointer-events: auto;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.35);
  color: #eee;
  font: inherit;
  font-size: 16px;
  line-height: 1;
  letter-spacing: 1px;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.video-card-head .more:hover {
  background: rgba(0, 0, 0, 0.55);
}

.video-step .video-face {
  aspect-ratio: 16 / 9;
  background: #000;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.video-step .video-face video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center center;
  display: block;
  background: #000;
}
.video-step .face-placeholder {
  color: #777;
  font-size: 13px;
}

.play-fab {
  position: absolute;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.18);
  display: grid;
  place-items: center;
  pointer-events: none;
}
.play-tri {
  display: block;
  width: 0;
  height: 0;
  margin-left: 3px;
  border-style: solid;
  border-width: 7px 0 7px 12px;
  border-color: transparent transparent transparent #fff;
}

.video-insert {
  /* shared with .board-insert above */
  position: absolute;
  top: 50%;
  right: -11px;
  z-index: 3;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid #3a3a3a;
  background: #2a2a2a;
  color: #c8c8c8;
  display: grid;
  place-items: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.video-slot-wrap:hover .video-insert,
.video-insert:focus-visible {
  opacity: 1;
}
.video-insert:hover {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #ffffff;
}

.video-ctx-menu {
  min-width: 168px;
}

.video-preview-mask {
  position: fixed;
  inset: 0;
  z-index: 4500;
  background: rgba(0, 0, 0, 0.72);
  display: grid;
  place-items: center;
  padding: 24px;
}
.video-preview-dlg {
  width: min(920px, 100%);
  background: #1a1a1a;
  border: 1px solid #2e2e2e;
  border-radius: 14px;
  overflow: hidden;
  color: #f0f0f0;
}
.video-preview-dlg header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a2a;
}
.video-preview-dlg header .x {
  border: 0;
  background: transparent;
  color: #999;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
}
.video-preview-dlg {
  width: min(920px, 100%);
  background: #1a1a1a;
  border: 1px solid #2e2e2e;
  border-radius: 14px;
  overflow: hidden;
  color: #f0f0f0;
  display: flex;
  flex-direction: column;
  max-height: min(90vh, 860px);
}
.video-preview-dlg header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
}
.video-preview-dlg header .x {
  border: 0;
  background: transparent;
  color: #999;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
}
.video-preview-el {
  width: 100%;
  flex: 1;
  min-height: 240px;
  max-height: min(70vh, 640px);
  object-fit: contain;
  object-position: center center;
  display: block;
  background: #000;
}

.asset-tile {
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  min-width: 0;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.asset-tile:hover {
  border-color: rgba(59, 130, 246, 0.35);
  transform: translateY(-2px);
}

.asset-tile-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 12px;
  min-width: 0;
}

.kind-ico {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: var(--studio-muted);
  background: var(--studio-inset-2);
  flex-shrink: 0;
}

.asset-tile-head strong {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.more {
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  flex-shrink: 0;
}

.asset-face {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--studio-inset-2);
  overflow: hidden;
  display: grid;
  place-items: center;
}

.asset-face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.face-placeholder {
  font-size: 13px;
  color: var(--studio-faint);
}

.asset-hover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.45);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.asset-tile:hover .asset-hover {
  opacity: 1;
}
.asset-hover button {
  height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  color: #111;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.asset-hover button:hover {
  background: #fff;
}

.video-face {
  aspect-ratio: 16 / 10;
  background: var(--studio-inset);
  overflow: hidden;
  display: grid;
  place-items: center;
}
.video-face video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.shot-cell-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  min-width: 0;
}

.shot-edit,
.video-edit {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--studio-line-strong);
}

/* —— 分镜卡片 —— */
.shot-card {
  position: relative;
  min-height: 210px;
  padding: 12px 14px 14px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  text-align: left;
  color: inherit;
  font: inherit;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}
.shot-card.visual {
  min-height: 0;
  padding: 0;
  overflow: hidden;
  background: #1e1e1e;
}
.shot-card:hover,
.shot-card.on {
  background: #222;
  border-color: rgba(59, 130, 246, 0.35);
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
}
.shot-card.visual:hover,
.shot-card.visual.on {
  background: #242424;
}
.shot-card.add {
  background: transparent;
  border-style: dashed;
  border-color: #3a3a3a;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #888;
  min-height: 210px;
}
.shot-card.add.visual {
  min-height: 0;
}
.shot-card.add:hover {
  border-color: #3b82f6;
  color: #eff6ff;
  background: rgba(37, 99, 235, 0.06);
}
.shot-card.add .add-plus {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
  font-size: 24px;
  font-weight: 300;
  line-height: 1;
}
.shot-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.shot-card.visual .shot-card-head {
  position: absolute;
  inset: 0 0 auto 0;
  z-index: 2;
  margin: 0;
  padding: 10px 10px 0;
  pointer-events: none;
}
.shot-card .shot-no {
  font-size: 13px;
  font-weight: 650;
  color: #c8c8c8;
  letter-spacing: 0.02em;
}
.shot-card.visual .shot-no {
  color: #f2f2f2;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
}
.shot-card .more {
  width: 28px;
  height: 28px;
  margin-left: auto;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #999;
  font: inherit;
  font-size: 16px;
  line-height: 1;
  letter-spacing: 1px;
  cursor: pointer;
  display: grid;
  place-items: center;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
}
.shot-card.visual .more {
  pointer-events: auto;
  background: rgba(0, 0, 0, 0.35);
  color: #eee;
  border-radius: 6px;
}
.shot-card:hover .more,
.shot-card.on .more,
.shot-card .more:focus-visible {
  opacity: 1;
}
.shot-card .more:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #eee;
}
.shot-card.visual .more:hover {
  background: rgba(0, 0, 0, 0.55);
}
.shot-face {
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.shot-face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.shot-face-hint {
  margin: 0;
  padding: 28px 16px 18px;
  font-size: 12px;
  line-height: 1.55;
  color: #d4d4d4;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.shot-dur {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 2;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  color: #eee;
  font-size: 11px;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
}

.shot-menu-mask {
  position: fixed;
  inset: 0;
  z-index: 4300;
}
.shot-menu {
  position: fixed;
  min-width: 148px;
  padding: 6px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.shot-menu button {
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #eee;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.shot-menu button:hover {
  background: rgba(255, 255, 255, 0.08);
}
.shot-menu button.danger {
  color: #f07178;
}
.shot-menu button.danger:hover {
  background: rgba(240, 113, 120, 0.12);
}

/* —— 分镜脚本编辑弹框 —— */
.shot-editor-mask {
  position: fixed;
  inset: 0;
  z-index: 4400;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: 24px;
  box-sizing: border-box;
}
.shot-editor {
  width: min(920px, 100%);
  height: min(780px, 92vh);
  background: #1a1a1a;
  border: 1px solid #2e2e2e;
  border-radius: 14px;
  color: #f0f0f0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}
.shot-editor.wide {
  width: min(1080px, 100%);
  height: min(820px, 94vh);
}
.se-split {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(240px, 0.9fr) minmax(280px, 1.1fr);
  gap: 0;
}
.se-keyframe {
  padding: 16px 16px 18px;
  border-right: 1px solid #2a2a2a;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 12px;
}
.se-kf-scroll {
  flex: 1;
  min-height: 0;
}
.se-kf-preview {
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: center;
}
.se-kf-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.se-kf-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.se-fields {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.se-fields-scroll {
  flex: 1;
  min-height: 0;
}
.se-fields-scroll :deep(.el-scrollbar__view) {
  padding: 8px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.se-toolbar.compact {
  padding: 4px 0 8px;
  border-bottom: 0;
}
.se-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #a3a3a3;
}
.se-field input,
.se-field textarea,
.se-field select {
  width: 100%;
  border: 1px solid #2e2e2e;
  border-radius: 8px;
  background: #121212;
  color: #eee;
  font: inherit;
  font-size: 13px;
  padding: 8px 10px;
  box-sizing: border-box;
  outline: none;
}
.se-field textarea {
  resize: vertical;
  line-height: 1.55;
  min-height: 64px;
}
.se-row {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 10px;
}
.se-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.se-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: #121212;
  border: 1px solid #2e2e2e;
  cursor: pointer;
}
.se-chip em {
  font-style: normal;
  color: #ddd;
  font-size: 12px;
}
.se-chip input {
  margin: 0;
}
.muted {
  color: #737373;
  font-size: 12px;
}
@media (max-width: 840px) {
  .se-split {
    grid-template-columns: 1fr;
  }
  .se-keyframe {
    border-right: 0;
    border-bottom: 1px solid #2a2a2a;
  }
}
.se-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
}
.se-head strong {
  font-size: 15px;
  font-weight: 650;
  color: #f5f5f5;
}
.se-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.se-close {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #bbb;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.se-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.se-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.se-toolbar button {
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #bbb;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.se-toolbar button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: #eee;
}
.se-toolbar button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.se-toolbar .se-import {
  margin-left: auto;
}
.se-editor {
  flex: 1;
  min-height: 0;
  margin: 14px 18px 18px;
  padding: 16px;
  border: 0;
  border-radius: 10px;
  background: #121212;
  color: #eee;
  font: inherit;
  font-size: 14px;
  line-height: 1.7;
  resize: none;
  outline: none;
  box-sizing: border-box;
}
.se-editor::placeholder {
  color: #666;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* —— 资产编辑弹框 —— */
.asset-editor-mask {
  position: fixed;
  inset: 0;
  z-index: 4200;
  background: #121212;
  color: #f0f0f0;
}

.asset-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* —— 分镜视频编辑工作台 —— */
.video-editor-mask {
  position: fixed;
  inset: 0;
  z-index: 4250;
  background: #121212;
  color: #f0f0f0;
}
.video-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.ve-top {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
}
.ve-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #ccc;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.ve-back:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.ve-title {
  font-size: 14px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ve-title em {
  margin-left: 8px;
  font-style: normal;
  font-weight: 500;
  color: #888;
  font-size: 12px;
}
.ve-modes {
  margin-left: auto;
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 10px;
  background: #1a1a1a;
  border: 1px solid #2e2e2e;
}
.ve-modes button {
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #999;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.ve-modes button.on {
  background: rgba(59, 130, 246, 0.16);
  color: #3b82f6;
  font-weight: 600;
}

.ve-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr) 120px;
  gap: 0;
}

.ve-left {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  border-right: 1px solid #2a2a2a;
  min-height: 0;
  overflow: hidden;
}
.ve-left-scroll {
  flex: 1;
  min-height: 0;
}
.ve-left-scroll :deep(.el-scrollbar__view) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 14px 16px;
}
.ve-tip {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  color: #9a9a9a;
  font-size: 12px;
  line-height: 1.5;
}
.ve-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ve-sec-label {
  font-size: 12px;
  color: #888;
}
.ve-materials {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.ve-mat {
  width: 76px;
  height: 76px;
  border-radius: 10px;
  border: 1px solid #333;
  background: #1a1a1a;
  color: #aaa;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  overflow: hidden;
  position: relative;
}
.ve-mat.add {
  border-style: dashed;
  color: #888;
}
.ve-mat img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ve-mat em {
  position: relative;
  z-index: 1;
  font-style: normal;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.45);
  padding: 1px 4px;
  border-radius: 4px;
}
.ve-mat.add em {
  background: transparent;
}

.ve-prompt-box {
  flex: 1;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  border: 1px solid #2e2e2e;
  border-radius: 12px;
  background: #1a1a1a;
  overflow: hidden;
}
.ve-prompt {
  flex: 1;
  min-height: 140px;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 12px;
  border: 0;
  background: transparent;
  color: #eee;
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
  resize: none;
  outline: none;
}
.ve-prompt-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid #2a2a2a;
}
.ve-prompt-tools {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #888;
  font-size: 12px;
}
.ve-prompt-tools button {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #999;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.ve-prompt-tools button:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #eee;
}
.ve-prompt-tools em {
  margin-left: 4px;
  font-style: normal;
}
.ve-gen-prompt {
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
  font: inherit;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.ve-gen-prompt:hover {
  background: rgba(59, 130, 246, 0.2);
}

.ve-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.ve-ctrl {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #888;
  min-width: 0;
}
.ve-ctrl :deep(.el-select) {
  width: 100%;
}
.ve-gen {
  height: 42px;
  border: 0;
  border-radius: 10px;
  background: #3b82f6;
  color: #111;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
}
.ve-gen:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ve-center {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 14px 16px;
  gap: 10px;
}
.ve-preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: #888;
}
.ve-preview {
  flex: 1;
  min-height: 280px;
  border-radius: 12px;
  background: #000;
  border: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}
.ve-preview.empty {
  color: #777;
  font-size: 13px;
  gap: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0c0c0c;
}
/* 竖版/横版都完整显示：居中 + 两侧或上下黑边（letterbox） */
.ve-preview-video {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  object-position: center center;
  background: #000;
  display: block;
  vertical-align: middle;
}
.play-fab.big {
  width: 56px;
  height: 56px;
}

.ve-right {
  border-left: 1px solid #2a2a2a;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}
.ve-right strong {
  font-size: 13px;
}
.ve-upload {
  height: 32px;
  border: 1px dashed #3a3a3a;
  border-radius: 8px;
  background: transparent;
  color: #aaa;
  font: inherit;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
}
.ve-hist-scroll {
  flex: 1;
  min-height: 0;
}
.ve-history {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ve-hist {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  border: 1px solid #333;
  overflow: hidden;
  padding: 0;
  background: #000;
  cursor: pointer;
}
.ve-hist.on {
  border-color: #3b82f6;
}
.ve-hist video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center center;
  display: block;
  background: #000;
}
.ve-hist .tick {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #3b82f6;
  color: #111;
  display: grid;
  place-items: center;
}
.ve-hist-empty {
  margin: 0;
  font-size: 12px;
  color: #666;
}

.ve-strip {
  flex-shrink: 0;
  overflow: hidden;
  padding: 12px 16px;
  border-top: 1px solid #2a2a2a;
  background: #161616;
}
.ve-strip-scroll {
  height: 96px;
}
.ve-strip-inner {
  display: flex;
  gap: 10px;
  width: max-content;
}
.ve-strip-card {
  width: 112px;
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.ve-strip-no {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}
.ve-strip-face {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
  border: 1px solid #2e2e2e;
}
.ve-strip-card.on .ve-strip-face {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}
.ve-strip-face video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center center;
  background: #000;
}
.ve-strip-face em {
  font-style: normal;
  font-size: 12px;
  color: #777;
}

@media (max-width: 1100px) {
  .ve-body {
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  }
  .ve-right {
    display: none;
  }
}

.ae-top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
  min-width: 0;
}
.ae-back {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #ccc;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.ae-back:hover {
  background: #222;
}
.ae-title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ae-count {
  font-style: normal;
  font-size: 12px;
  color: #888;
  flex-shrink: 0;
}
.ae-top-actions {
  margin-left: auto;
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}
.asset-editor-mask .pill-btn {
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: #262626;
  color: #eee;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.asset-editor-mask .pill-btn.primary {
  background: #2563eb;
  color: #fff;
  font-weight: 650;
}
.asset-editor-mask .pill-btn.primary:hover {
  background: #3b82f6;
}

.ae-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr) 168px;
  gap: 0;
}

.ae-left {
  border-right: 1px solid #2a2a2a;
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.ae-left-scroll {
  flex: 1;
  min-height: 0;
}
.ae-left-scroll :deep(.el-scrollbar__view) {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ae-tabs {
  display: flex;
  flex-shrink: 0;
  gap: 0;
  border-bottom: 1px solid #2a2a2a;
  margin-bottom: 4px;
}
.ae-tabs button {
  flex: 1;
  height: 36px;
  border: 0;
  background: transparent;
  color: #888;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.ae-tabs button.on {
  color: #3b82f6;
  box-shadow: inset 0 -2px 0 #3b82f6;
}
.ae-tabs button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ae-ref {
  flex-shrink: 0;
  min-height: 72px;
  height: auto;
  padding: 10px 12px;
  border: 1px dashed #3b82f6;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.08);
  color: #dbeafe;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  overflow: hidden;
}
.ae-ref img {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 8px;
}

.ae-field {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 6px;
  font-size: 12px;
  color: #999;
}
.ae-field.grow {
  flex: 1;
  flex-shrink: 1;
  min-height: 96px;
}
.ae-prompt {
  flex: 1;
  min-height: 140px;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #333;
  border-radius: 10px;
  background: #171717;
  color: #eee;
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
  padding: 10px 12px;
  resize: none;
  outline: none;
}
.ae-count-tip {
  font-style: normal;
  align-self: flex-end;
  font-size: 11px;
  color: #666;
}
.ae-gen {
  flex-shrink: 0;
  height: 42px;
  border: 0;
  border-radius: 10px;
  background: #3b82f6;
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.ae-center {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 18px;
  gap: 12px;
}
.ae-preview-meta {
  font-size: 12px;
  color: #888;
}
.ae-preview {
  flex: 1;
  min-height: 0;
  border-radius: 12px;
  overflow: hidden;
  background: #0c0c0c;
  border: 1px solid #2a2a2a;
  display: grid;
  place-items: center;
}
.ae-preview.empty {
  color: #777;
  font-size: 13px;
  padding: 16px;
  text-align: center;
  border-style: dashed;
  border-color: #3a3a3a;
}
.ae-preview-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: min(280px, 100%);
  min-height: 160px;
  padding: 24px 16px;
  border: 1px dashed #3b82f6;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.08);
  color: #e2e8f0;
  cursor: pointer;
  font: inherit;
}
.ae-preview-upload strong {
  font-size: 15px;
  font-weight: 650;
  color: #fff;
}
.ae-preview-upload span {
  font-size: 12px;
  color: #93c5fd;
}
.ae-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.ae-tools {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
}
.ae-tools button {
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid #3a3a3a;
  background: #1c1c1c;
  color: #ddd;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.ae-tools button.on {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.16);
  color: #93c5fd;
}
.ae-tools button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ae-right {
  border-left: 1px solid #2a2a2a;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 148px;
  min-height: 0;
}
.ae-right strong {
  flex-shrink: 0;
  font-size: 13px;
}
.ae-upload {
  flex-shrink: 0;
  width: 100%;
  height: 40px;
  border: 1px dashed #3b82f6;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.1);
  color: #dbeafe;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
}
.ae-hist-scroll {
  flex: 1;
  min-height: 0;
}
.ae-history {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ae-hist {
  position: relative;
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 0;
  background: #1a1a1a;
  cursor: pointer;
  overflow: hidden;
}
.ae-hist.on {
  border-color: #3b82f6;
}
.ae-hist img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}
.ae-hist .tick {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #3b82f6;
  color: #111;
  display: grid;
  place-items: center;
}
.ae-hist-empty {
  margin: 12px 0;
  font-size: 12px;
  color: #666;
  text-align: center;
}

.ae-strip {
  flex-shrink: 0;
  overflow: hidden;
  padding: 12px 16px 16px;
  border-top: 1px solid #2a2a2a;
}
.ae-strip-scroll {
  height: 108px;
}
.ae-strip-inner {
  display: flex;
  gap: 10px;
  width: max-content;
}
.ae-strip-card {
  width: 120px;
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0;
  text-align: left;
}
.ae-strip-face {
  display: block;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a1a;
  border: 2px solid transparent;
  margin-bottom: 6px;
}
.ae-strip-card.on .ae-strip-face {
  border-color: #3b82f6;
}
.ae-strip-face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ae-strip-face em {
  font-style: normal;
  font-size: 11px;
  color: #777;
  display: grid;
  place-items: center;
  height: 100%;
}
.ae-strip-name {
  font-size: 12px;
  color: #bbb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

@media (max-width: 1100px) {
  .ae-body {
    grid-template-columns: minmax(240px, 280px) minmax(0, 1fr) 148px;
  }
  .ae-count {
    display: none;
  }
}
@media (max-width: 860px) {
  .ae-body {
    grid-template-columns: 1fr;
    overflow: hidden;
  }
  .ae-right {
    min-width: 0;
    border-left: 0;
    border-top: 1px solid #2a2a2a;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }
  .ae-upload {
    width: auto;
    min-width: 120px;
    padding: 0 14px;
  }
  .ae-history {
    flex: 1;
    flex-direction: row;
  }
}

.video-cell {
  position: relative;
  cursor: pointer;
}

.preview-pane {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.phase2-banner {
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--studio-inset);
  border: 1px solid var(--studio-line-strong);
  color: var(--studio-muted);
  font-size: 12px;
  line-height: 1.5;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.form-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: var(--studio-muted);
  font-size: 12px;
}

.form-item :deep(.el-textarea__inner),
.form-item :deep(.el-input__wrapper) {
  background: var(--studio-inset);
  border-color: var(--studio-line-strong);
  color: var(--studio-ink);
}

.pane-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.list-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--studio-line-strong);
  border-radius: 12px;
  background: var(--studio-inset);
}

.list-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kind-select {
  width: 120px;
  flex: 0 0 120px;
}

.remove-btn {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-muted);
  font-size: 20px;
  cursor: pointer;
  flex-shrink: 0;
}

.shot-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.mini-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--studio-muted);
}

.remove-link {
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.video-preview,
.final-video {
  width: 100%;
  max-height: 360px;
  border-radius: 12px;
  background: #000;
}

.final-video {
  margin-top: 16px;
}

.empty-inline {
  margin: 18px 0;
  text-align: center;
  font-size: 12px;
  color: var(--studio-muted);
}

.novel-mask {
  position: fixed;
  inset: 0;
  z-index: 4000;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: 24px;
}

.novel-panel {
  width: min(480px, 100%);
  max-height: 70vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: var(--studio-panel, #161616);
  border: 1px solid var(--studio-line-strong, #333);
}

.novel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--studio-line, #2a2a2a);
}

.novel-head .x {
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  font-size: 20px;
  cursor: pointer;
}

.novel-scroll {
  flex: 1;
  min-height: 0;
}
.novel-list {
  overflow: hidden;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.novel-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: var(--studio-inset, #1c1c1c);
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.novel-row:hover {
  border-color: var(--studio-line-bright, #555);
}

.novel-row em {
  font-style: normal;
  color: var(--studio-muted);
  font-size: 12px;
}

@media (max-width: 960px) {
  .film-workspace {
    grid-template-columns: 1fr;
    overflow: hidden;
  }

  .work-main {
    border-left: 0;
  }

  .step-rail {
    border-bottom: 1px solid var(--studio-line-strong);
    padding-bottom: 8px;
  }

  .step-list {
    flex-direction: row;
    overflow: visible;
    gap: 4px;
    width: max-content;
  }

  .step-item {
    min-width: 108px;
    grid-template-columns: 22px minmax(0, 1fr);
    padding: 8px 6px;
  }

  .step-item:not(:last-child)::after {
    display: none;
  }

  .share-rail-btn {
    display: none;
  }

  .script-step {
    flex-direction: column;
  }
  .script-step .ai-assist {
    width: 100%;
    max-height: 42vh;
    border-right: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .ai-assist-scroll {
    max-height: 42vh;
  }
  .action-center {
    position: static;
    transform: none;
  }
  .script-action-bar {
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }
  .action-right {
    width: 100%;
    justify-content: flex-end;
  }
}

/* 六步轨定宽（与 grid 对齐） */
.step-rail {
  width: auto;
}
.step-pane.flat {
  max-width: none;
  height: 100%;
  min-height: 0;
}
.storyboard-step,
.video-step {
  max-width: 1180px;
  margin: 0 auto;
}
</style>

<style>
/* Teleport 到 body，需非 scoped */
.mode-hover-pop {
  position: fixed;
  z-index: 3200;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: #141414;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  text-align: left;
  pointer-events: auto;
}
.mode-hover-pop .mode-hover-media {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: #0a0a0a;
  aspect-ratio: 16 / 10;
  margin-bottom: 10px;
}
.mode-hover-pop .mode-cover,
.mode-hover-pop .mode-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mode-hover-pop .mode-cover {
  opacity: 1;
  transition: opacity 0.2s ease;
}
.mode-hover-pop:has(.mode-video.on) .mode-cover {
  opacity: 0;
}
.mode-hover-pop .mode-video {
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.mode-hover-pop .mode-video.on {
  opacity: 1;
}
.mode-hover-pop p {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #f2f2f2;
}
</style>
