<template>
  <div
    class="wf-node"
    :class="[
      statusClass,
      isGridSplitCell ? '' : frameAspect,
      {
        selected: isCardSelected,
        media: isMediaCard,
        textcard: isTextCard,
        mediocard: isFitMediaCard,
        'grid-cell': isGridSplitCell,
        'port-plus': isTextCard || isImageMediaCard || isVideoLike || isAgentCard,
        notecard: isNoteCard,
        engine: isEngineCard && !isAgentCard,
        agent: isAgentCard,
        video: isVideoLike,
        portrait: !isGridSplitCell && frameAspect === 'portrait',
        empty: isMediaCard && !hasMedia,
        muted: data.mode === 'mute',
        bypassed: data.mode === 'bypass',
        resized: isResized,
      },
    ]"
    :style="nodeBoxStyle"
  >
    <template v-if="isMediaCard">
      <!-- 选中浮层：视频仅预览 / 下载 -->
      <div
        v-if="isVideoLike && isCardSelected && hasMedia && !isBusy"
        class="media-float nodrag nopan"
        @pointerdown.stop
        @mousedown.stop
        @click.stop
      >
        <button
          type="button"
          class="mf-ico"
          title="预览"
          @pointerdown.stop
          @mousedown.stop
          @click.stop="onMediaPreview"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 5c5.2 0 9.5 3.2 11 7.5C21.5 16.8 17.2 20 12 20S2.5 16.8 1 12.5C2.5 8.2 6.8 5 12 5zm0 2.2a5.3 5.3 0 1 0 0 10.6 5.3 5.3 0 0 0 0-10.6z"
            />
          </svg>
        </button>
        <button type="button" class="mf-ico" title="下载" @click="downloadMedia">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="M12 16 7 11h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z" />
          </svg>
        </button>
      </div>

      <!-- 选中浮层：派生 | 背景 | 构图 | 工具（后续能力优先进「派生」列表） -->
      <div
        v-if="isImageMediaCard && isCardSelected && hasMedia && !isBusy"
        class="media-float nodrag nopan"
        @pointerdown.stop
        @mousedown.stop
        @click.stop
      >
        <div class="mf-drop">
          <button
            type="button"
            class="mf-btn"
            :class="{ on: mediaMenu === 'derive' }"
            title="基于当前图的 AI 派生"
            @click="toggleMediaMenu('derive')"
          >
            派生
            <span class="chev">{{ mediaMenu === 'derive' ? '▴' : '▾' }}</span>
          </button>
          <div v-if="mediaMenu === 'derive'" class="mf-menu derive-menu" @mousedown.stop>
            <button
              v-for="item in deriveActions"
              :key="item.id"
              type="button"
              class="mf-menu-item"
              :title="item.desc"
              @click="onMediaToolbar(item.id)"
            >
              <strong>{{ item.label }}</strong>
              <span>{{ item.desc }}</span>
            </button>
          </div>
        </div>

        <div class="mf-drop">
          <button
            type="button"
            class="mf-btn mf-bg"
            :class="{ on: mediaMenu === 'bg' }"
            title="换背景（AI 生成）"
            @click="toggleMediaMenu('bg')"
          >
            <span class="mf-swatch" :style="{ background: cardBgColor }" />
            背景
            <span class="chev">{{ mediaMenu === 'bg' ? '▴' : '▾' }}</span>
          </button>
          <div v-if="mediaMenu === 'bg'" class="mf-color-panel" @mousedown.stop>
            <button
              v-for="c in cardBgOptions"
              :key="c.color"
              type="button"
              class="mf-color"
              :class="{ on: c.color.toLowerCase() === cardBgColor.toLowerCase() }"
              :style="{ background: c.color }"
              :title="`生成${c.label}`"
              @click="setCardBg(c.color)"
            />
          </div>
        </div>

        <span class="mf-sep" aria-hidden="true" />

        <div class="mf-drop">
          <button
            type="button"
            class="mf-btn"
            :class="{ on: mediaMenu === 'multigrid' }"
            @click="toggleMediaMenu('multigrid')"
          >
            多宫格
            <span class="chev">{{ mediaMenu === 'multigrid' ? '▴' : '▾' }}</span>
          </button>
          <div v-if="mediaMenu === 'multigrid'" class="mf-panel mg-panel" @mousedown.stop>
            <aside class="mg-nav">
              <button
                v-for="t in multigridTabs"
                :key="t.id"
                type="button"
                class="mg-nav-item"
                :class="{ on: multigridTab === t.id }"
                @click="multigridTab = t.id"
              >
                <span>{{ t.label }}</span>
                <span class="arrow">›</span>
              </button>
            </aside>
            <div class="mg-body">
              <strong class="mg-title">{{ currentMultigridTab?.label }}</strong>

              <template v-if="multigridTab === 'three_view'">
                <div class="mg-label">比例</div>
                <div class="mg-chips">
                  <button
                    v-for="a in ['1:1', '4:3', '16:9']"
                    :key="a"
                    type="button"
                    :class="{ on: multigridAspect === a }"
                    @click="multigridAspect = a"
                  >
                    {{ a }}
                  </button>
                </div>
              </template>

              <template v-else-if="multigridTab === 'multi_cam'">
                <div class="mg-label">模式</div>
                <div class="mg-chips">
                  <button
                    v-for="m in multigridModes"
                    :key="m.id"
                    type="button"
                    :class="{ on: multigridMode === m.id }"
                    @click="multigridMode = m.id"
                  >
                    {{ m.label }}
                  </button>
                </div>
              </template>

              <template v-else-if="multigridTab === 'storyboard9'">
                <textarea
                  v-model="multigridPrompt"
                  class="mg-input"
                  rows="4"
                  placeholder="输入分镜剧情…"
                />
              </template>

              <template v-else>
                <textarea
                  v-model="multigridPrompt"
                  class="mg-input"
                  rows="3"
                  placeholder="输入故事板描述…"
                />
                <div class="mg-label">清晰度</div>
                <div class="mg-chips">
                  <button
                    v-for="s in ['1K', '2K', '4K']"
                    :key="s"
                    type="button"
                    :class="{ on: multigridSize === s }"
                    @click="multigridSize = s"
                  >
                    {{ s }}
                  </button>
                </div>
              </template>

              <button type="button" class="mg-gen" @click="runMultigridGenerate">
                生成
              </button>
            </div>
          </div>
        </div>
        <div class="mf-drop">
          <button
            type="button"
            class="mf-btn"
            :class="{ on: mediaMenu === 'gridsplit' }"
            @click="toggleMediaMenu('gridsplit')"
          >
            宫格切分
            <span class="chev">{{ mediaMenu === 'gridsplit' ? '▴' : '▾' }}</span>
          </button>
          <div v-if="mediaMenu === 'gridsplit'" class="mf-panel gs-panel" @mousedown.stop>
            <div class="gs-label">预设宫格</div>
            <div class="gs-presets">
              <button
                v-for="p in gridSplitPresets"
                :key="p.id"
                type="button"
                :class="{ on: splitHover.rows === p.rows && splitHover.cols === p.cols }"
                @mouseenter="splitHover = { rows: p.rows, cols: p.cols }"
                @click="beginGridSplit(p.rows, p.cols)"
              >
                {{ p.label }}
              </button>
            </div>
            <div class="gs-label">自定义</div>
            <div
              class="gs-board"
              @mouseleave="splitHover = { ...splitDraft }"
            >
              <button
                v-for="cell in splitBoardCells"
                :key="cell.key"
                type="button"
                class="gs-cell"
                :class="{ on: cell.row <= splitHover.rows && cell.col <= splitHover.cols }"
                @mouseenter="splitHover = { rows: cell.row, cols: cell.col }"
                @click="beginGridSplit(cell.row, cell.col)"
              />
            </div>
            <div class="gs-foot">{{ splitHover.rows }}x{{ splitHover.cols }} 切分</div>
          </div>
        </div>

        <span class="mf-sep" aria-hidden="true" />

        <button
          type="button"
          class="mf-ico"
          title="预览"
          @pointerdown.stop
          @mousedown.stop
          @click.stop="onImageDetail"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 5c5.2 0 9.5 3.2 11 7.5C21.5 16.8 17.2 20 12 20S2.5 16.8 1 12.5C2.5 8.2 6.8 5 12 5zm0 2.2a5.3 5.3 0 1 0 0 10.6 5.3 5.3 0 0 0 0-10.6z"
            />
          </svg>
        </button>
        <button type="button" class="mf-ico" title="下载" @click="downloadMedia">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="M12 16 7 11h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z" />
          </svg>
        </button>
      </div>

      <div class="cap media-cap">
        <span v-if="roleChip" class="role-chip">{{ roleChip }}</span>
        <span v-else class="cap-ico" aria-hidden="true">
          <svg v-if="isVideoLike" viewBox="0 0 24 24" width="12" height="12">
            <path
              fill="currentColor"
              d="M4 6h11a2 2 0 0 1 2 2v1.2l3.5-2.2v9.6L17 14.4V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm1 2v8h10V8H5z"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="12" height="12">
            <path
              fill="currentColor"
              d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm1 3v7l3.2-3.2 2.3 2.3L16 10l3 3.5V8H6z"
            />
          </svg>
        </span>
        <span class="cap-name" :title="displayName">{{ displayName }}</span>
        <span v-if="isSplitGroup" class="split-count" :title="`${splitCellCount} 格`">{{
          splitCellCount
        }}</span>
        <button
          type="button"
          class="cap-rename nodrag nopan"
          title="重命名"
          @pointerdown.stop
          @mousedown.stop
          @click.stop="renameMediaNode"
        >
          <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
            <path
              fill="currentColor"
              d="M4 17.25V20h2.75L17.8 8.94l-2.75-2.75L4 17.25zM20.7 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
            />
          </svg>
        </button>
        <span
          class="cap-badge"
          :class="{
            ok: data.status === 'completed' && hasMedia,
            run: isBusy,
            fail: data.status === 'failed',
          }"
          :title="
            data.status === 'failed'
              ? String(data.statusMessage || '失败')
              : isBusy
                ? '运行中'
                : data.status === 'completed'
                  ? '完成'
                  : ''
          "
        />
        <span v-if="resolutionText" class="cap-res">{{ resolutionText }}</span>
      </div>

      <div
        class="frame"
        :class="{
          previewable: !isImageMediaCard && hasMedia && !isBusy && !isSplitGroup,
          busy: isBusy,
          'split-frame': isSplitGroup,
          // 仅显式选择底色时用浅/深底对比类；默认底色走 CSS 主题变量
          'bg-light': isImageMediaCard && !!cardBgColor && cardBgIsLight,
          'bg-dark': isImageMediaCard && !!cardBgColor && !cardBgIsLight,
        }"
        :style="mediaFrameStyle"
        :title="
          isImageMediaCard && !isBusy && !isSplitGroup
            ? '单击编辑 · 右键查看详情'
            : hasMedia && !isBusy && !isSplitGroup
              ? '点击预览'
              : undefined
        "
        @mousedown="onMediaCardMouseDown"
        @click.stop="onFrameClick"
      >
        <div
          v-if="isSplitGroup"
          class="split-group-grid"
          :style="{
            gridTemplateRows: `repeat(${splitRows}, 1fr)`,
            gridTemplateColumns: `repeat(${splitCols}, 1fr)`,
          }"
        >
          <button
            v-for="cell in splitCells"
            :key="cell.index"
            type="button"
            class="split-cell"
            @click.stop="onSplitCellPreview(cell.url)"
          >
            <span class="split-lab">{{
              cell.label || `${splitRows}x${splitCols}-${cell.index + 1}`
            }}</span>
            <img :src="cell.url" alt="" draggable="false" />
          </button>
        </div>
        <img
          v-else-if="displayImage"
          :key="mediaDisplayKey"
          :src="displayImage"
          alt=""
          draggable="false"
          @load="onImgLoad"
          @error="onMediaError"
        />
        <template v-else-if="displayVideo">
          <!-- 有独立封面只显示图片，不请求 mp4；无封面用静态占位 -->
          <img
            v-if="videoPosterUrl"
            :key="`${mediaDisplayKey}-poster`"
            class="video-poster"
            :src="videoPosterUrl"
            alt=""
            draggable="false"
            @load="onImgLoad"
            @error="onMediaError"
          />
          <div v-else class="video-poster-ph" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28">
              <path
                fill="currentColor"
                d="M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm3.2 3.6v6.8L15.6 12 10.2 8.6z"
              />
            </svg>
          </div>
          <button
            v-if="!isBusy"
            type="button"
            class="vid-preview-play"
            title="预览播放"
            @click.stop="onMediaPreview"
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M8 5.5v13l11-6.5L8 5.5z" />
            </svg>
          </button>
        </template>
        <div v-else class="frame-empty">
          <span v-if="isVideoLike" class="vid-ph" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26">
              <path
                fill="currentColor"
                d="M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm3.2 3.6v6.8L15.6 12 10.2 8.6z"
              />
            </svg>
          </span>
          <span v-else class="pic" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28">
              <path
                fill="currentColor"
                d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm1 3v7l3.2-3.2 2.3 2.3L16 10l3 3.5V8H6zm2.2 1.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z"
              />
            </svg>
          </span>
          <!-- 视频仍保留快捷上传；图片走 updream：空态仅占位，hover 用「替换」 -->
          <div
            v-if="isInputMedia && isVideoLike && !isBusy"
            class="empty-actions"
            @mousedown.stop
            @click.stop
          >
            <button type="button" @click="onEmptyAction('upload')">上传</button>
            <button type="button" @click="onEmptyAction('asset')">拖入资产</button>
          </div>
        </div>

        <div v-if="isBusy" class="gen-overlay" :class="{ video: isVideoLike }" @click.stop>
          <div class="gen-haze" aria-hidden="true" />
          <div class="gen-shimmer" aria-hidden="true" />
          <div class="gen-core">
            <div class="gen-orb" aria-hidden="true">
              <span class="gen-ring" />
              <span class="gen-ring delay" />
              <span class="gen-pulse" />
            </div>
            <strong>{{ busyTitle }}</strong>
            <em>{{ busyHint }}</em>
            <button
              type="button"
              class="gen-cancel nodrag nopan"
              title="终止生成"
              @pointerdown.stop
              @mousedown.stop
              @click.stop="onCancelRun"
            >
              <i class="gen-stop" aria-hidden="true" />
              终止
            </button>
          </div>
        </div>

        <button
          v-if="(isImageMediaCard || isVideoLike) && !isBusy"
          type="button"
          class="media-replace nodrag nopan"
          title="替换"
          @pointerdown.stop
          @mousedown.stop
          @click.stop="openMediaReplace"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5a5 5 0 0 1-8.9 3.1L6.7 17.5A7 7 0 0 0 19 13c0-3.87-3.13-7-7-7zm-7 7c0-1.48.49-2.84 1.3-3.94L7.7 10.5A5 5 0 0 0 7 13c0 2.76 2.24 5 5 5v3l4-4-4-4v3c-2.76 0-5-2.24-5-5z"
            />
          </svg>
          替换
        </button>

        <!-- 宫格切分预览 -->
        <div
          v-if="showGridSplitOverlay"
          class="grid-split-overlay nodrag nopan"
          @pointerdown.stop
          @mousedown.stop
          @click.stop
        >
          <div
            class="grid-lines"
            :style="{
              gridTemplateRows: `repeat(${activeSplit.rows}, 1fr)`,
              gridTemplateColumns: `repeat(${activeSplit.cols}, 1fr)`,
            }"
          >
            <div
              v-for="i in activeSplit.rows * activeSplit.cols"
              :key="i"
              class="grid-cell"
            >
              {{ i }}
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="showGridSplitOverlay"
        class="grid-split-bar nodrag nopan"
        @pointerdown.stop
        @mousedown.stop
        @click.stop
      >
        <span>{{ activeSplit.rows }} × {{ activeSplit.cols }}</span>
        <span>{{ activeSplit.rows * activeSplit.cols }}/{{ activeSplit.rows * activeSplit.cols }}</span>
        <button type="button" class="gs-ok" :disabled="gridSplitBusy" @click="confirmGridSplit">
          {{ gridSplitBusy ? '切分中…' : '确认切分' }}
        </button>
        <button type="button" class="gs-x" title="取消" @click="cancelGridSplit">×</button>
      </div>
    </template>

    <template v-else-if="isTextCard">
      <div
        v-if="selected"
        class="text-float nodrag nopan"
        @pointerdown.stop
        @mousedown.stop
        @click.stop
      >
        <button type="button" class="tf-btn" title="缩小字号" @click="bumpFont(-1)">A-</button>
        <button type="button" class="tf-btn" title="放大字号" @click="bumpFont(1)">A+</button>
        <span class="tf-sep" />
        <button type="button" class="tf-btn wide" title="编辑" @click="openTextEdit">
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path
              fill="currentColor"
              d="M4 17.25V20h2.75L17.8 8.94l-2.75-2.75L4 17.25zM20.7 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
            />
          </svg>
          编辑
        </button>
        <button type="button" class="tf-btn wide" title="下载" @click="downloadText">
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 16 7 11h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z"
            />
          </svg>
          下载
        </button>
      </div>

      <div class="cap text-cap">
        <span class="cap-ico text-t" aria-hidden="true">T</span>
        <span class="cap-name" :title="displayName">{{ displayName }}</span>
        <button
          type="button"
          class="cap-rename nodrag nopan"
          title="重命名"
          @pointerdown.stop
          @mousedown.stop
          @click.stop="renameTextNode"
        >
          <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
            <path
              fill="currentColor"
              d="M4 17.25V20h2.75L17.8 8.94l-2.75-2.75L4 17.25zM20.7 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
            />
          </svg>
        </button>
      </div>

      <div
        class="text-frame"
        :class="{ busy: isBusy }"
        :style="textFrameStyle"
        @dblclick.stop="openTextEdit"
        @wheel.stop
      >
        <div
          v-if="localPrompt.trim()"
          class="text-body"
          :style="{ fontSize: `${textFontSize}px` }"
          v-html="textHtml"
        />
        <div v-else class="text-ph">双击编辑文本...</div>

        <div v-if="isBusy" class="gen-overlay text-gen-overlay" @click.stop>
          <div class="gen-haze" aria-hidden="true" />
          <div class="gen-shimmer" aria-hidden="true" />
          <div class="gen-core">
            <div class="gen-orb" aria-hidden="true">
              <span class="gen-ring" />
              <span class="gen-ring delay" />
              <span class="gen-pulse" />
            </div>
            <strong>正在生成文本</strong>
            <em>稍候片刻…</em>
            <button
              type="button"
              class="gen-cancel nodrag nopan"
              title="终止生成"
              @pointerdown.stop
              @mousedown.stop
              @click.stop="onCancelRun"
            >
              <i class="gen-stop" aria-hidden="true" />
              终止
            </button>
          </div>
        </div>

        <button
          v-if="!isBusy"
          type="button"
          class="text-replace nodrag nopan"
          title="替换"
          @pointerdown.stop
          @mousedown.stop
          @click.stop="openTextReplace"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5a5 5 0 0 1-8.9 3.1L6.7 17.5A7 7 0 0 0 19 13c0-3.87-3.13-7-7-7zm-7 7c0-1.48.49-2.84 1.3-3.94L7.7 10.5A5 5 0 0 0 7 13c0 2.76 2.24 5 5 5v3l4-4-4-4v3c-2.76 0-5-2.24-5-5z"
            />
          </svg>
          替换
        </button>
      </div>
    </template>

    <template v-else-if="isNoteCard">
      <div class="cap">
        <span class="cap-ico note-ico" aria-hidden="true">✎</span>
        <span class="cap-name" :title="displayName">{{ displayName }}</span>
      </div>
      <div class="note-frame" @mousedown.stop @click.stop @wheel.stop>
        <textarea
          class="nodrag nowheel note-prompt"
          rows="4"
          :value="localPrompt"
          placeholder="写备注…"
          @input="onPromptInput"
        />
      </div>
    </template>

    <template v-else-if="isAgentCard">
      <div class="agent-card" @click.stop="openAgentSheet">
        <div class="agent-cap">
          <span class="agent-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                fill="currentColor"
                d="M12 2l1.6 4.8L18.5 8l-3.7 3.1L16 16l-4-2.6L8 16l1.2-4.9L5.5 8l4.9-1.2L12 2zm6.5 11.2 1 2.8 2.8.7-2.1 1.8.5 2.9-2.2-1.5-2.2 1.5.5-2.9-2.1-1.8 2.8-.7 1-2.8z"
              />
            </svg>
          </span>
          <strong class="agent-name" :title="displayName">{{ displayName }}</strong>
          <button
            type="button"
            class="cap-rename nodrag nopan"
            title="重命名"
            @pointerdown.stop
            @mousedown.stop
            @click.stop="renameMediaNode"
          >
            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 17.25V20h2.75L17.8 8.94l-2.75-2.75L4 17.25zM20.7 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
              />
            </svg>
          </button>
        </div>
        <div class="agent-status-row">
          <span
            class="agent-status"
            :class="{
              run: isBusy || agentLiveStreaming,
              ok: data.status === 'completed' && !agentLiveStreaming,
              fail: data.status === 'failed' && !agentLiveStreaming,
            }"
          >
            <span class="st-dot" aria-hidden="true" />
            {{ agentStatusText }}
          </span>
        </div>
        <div class="agent-body">
          <!-- 图2：已添加技能 -->
          <div v-if="agentHasSkill || agentLiveStreaming || agentReplyText" class="agent-task">
            <div class="agent-task-top">
              <strong class="agent-task-title">{{ displayName }}</strong>
              <button
                v-if="agentHasSkill && !agentLiveStreaming"
                type="button"
                class="agent-restart nodrag nopan"
                title="重新开始"
                @click.stop="restartAgent"
              >
                重新开始
              </button>
            </div>
            <code v-if="agentSkillSlash" class="agent-slash">{{ agentSkillSlash }}</code>
            <p v-if="agentBodyText" class="agent-preview" :class="{ live: agentLiveStreaming }">
              {{ agentBodyText }}
            </p>
            <p v-else-if="agentLiveStreaming" class="agent-preview live">正在思考…</p>
          </div>
          <!-- 图1：未添加技能 -->
          <button
            v-else
            type="button"
            class="agent-empty nodrag nopan"
            @click.stop="openAgentSheet"
          >
            <span class="agent-face" aria-hidden="true">
              <svg viewBox="0 0 48 48" width="36" height="36">
                <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="2" />
                <circle cx="17" cy="20" r="2" fill="currentColor" />
                <circle cx="31" cy="20" r="2" fill="currentColor" />
                <path
                  d="M16 32c2.5-3 13.5-3 16 0"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            <span>添加技能给我任务</span>
          </button>
          <div class="agent-foot">
            <span v-if="!agentHasSkill && !agentReplyText && !agentLiveStreaming" class="agent-grip" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="12" height="12">
                <circle cx="4" cy="4" r="1.2" fill="currentColor" />
                <circle cx="8" cy="4" r="1.2" fill="currentColor" />
                <circle cx="12" cy="4" r="1.2" fill="currentColor" />
                <circle cx="4" cy="8" r="1.2" fill="currentColor" />
                <circle cx="8" cy="8" r="1.2" fill="currentColor" />
                <circle cx="12" cy="8" r="1.2" fill="currentColor" />
                <circle cx="4" cy="12" r="1.2" fill="currentColor" />
                <circle cx="8" cy="12" r="1.2" fill="currentColor" />
                <circle cx="12" cy="12" r="1.2" fill="currentColor" />
              </svg>
            </span>
            <span>{{
              agentLiveStreaming
                ? '计划输出文字'
                : agentHasSkill || agentReplyText
                  ? ':: 拖入素材，或在下方输入你的想法'
                  : '无任务'
            }}</span>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="engine-card">
        <div class="engine-cap">
          <span class="engine-cat">{{ categoryLabel }}</span>
          <span class="engine-title" :title="engineTitle">{{ engineTitle }}</span>
          <span v-if="isBusy" class="cap-run" />
          <span v-else-if="data.status === 'failed'" class="cap-fail">!</span>
          <span v-else-if="data.status === 'completed'" class="cap-ok">✓</span>
          <button
            v-if="canRunOnCard"
            type="button"
            class="cap-run-btn"
            :disabled="isBusy"
            title="运行此节点"
            @click.stop="onRunClick"
          >
            <svg viewBox="0 0 24 24" width="12" height="12">
              <path fill="currentColor" d="M13 3 4 14h7l-1 7 10-13h-7l0-5z" />
            </svg>
          </button>
        </div>
        <div class="engine-body">
          <div v-if="inputs.length" class="port-col left">
            <div v-for="p in inputs" :key="`il-${p.id}`" class="port-row">
              <span class="port-lab">{{ p.label || p.id }}</span>
            </div>
          </div>
          <div class="engine-mid">
            <p>{{ shortDesc }}</p>
          </div>
          <div v-if="outputs.length" class="port-col right">
            <div v-for="p in outputs" :key="`ol-${p.id}`" class="port-row end">
              <span class="port-lab">{{ p.label || p.id }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <Handle
      v-for="(p, i) in inputs"
      :id="p.id"
      :key="`hin-${p.id}`"
      type="target"
      :position="Position.Left"
      class="port-handle"
      :connectable="true"
      :style="handleStyle(i, inputs.length, p.type, 'in')"
      :title="`${p.label || p.id} (${p.type})`"
    />
    <Handle
      v-for="(p, i) in outputs"
      :id="p.id"
      :key="`hout-${p.id}`"
      type="source"
      :position="Position.Right"
      class="port-handle"
      :connectable="true"
      :style="handleStyle(i, outputs.length, p.type, 'out')"
      :title="`${p.label || p.id} (${p.type})`"
    />

    <!-- 右下角拉伸手柄：挂在节点根上，避免被内容区裁切 -->
    <button
      v-if="canResize"
      type="button"
      class="resize-handle nodrag nopan"
      :title="isFitMediaCard ? '拖拽等比缩放' : '拖拽调整大小'"
      :aria-label="isFitMediaCard ? '拖拽等比缩放' : '拖拽调整大小'"
      @pointerdown.stop.prevent="onResizeStart"
      @mousedown.stop.prevent
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path
          d="M5 15h2v-2H5v2zm4 0h2v-2H9v2zm4 0h2v-2h-2v2zM9 11h2V9H9v2zm4 0h2V9h-2v2zm0-4h2V5h-2v2z"
          fill="currentColor"
        />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Handle, Position, useVueFlow, type NodeProps } from '@vue-flow/core';
import type { PortType, WorkflowNodeCatalogItem } from '@ai-video-studio/shared';
import { portColor } from '@/utils/workflow-connect';
import {
  openImagePreview,
  openVideoPreview,
  warmVideoUrl,
} from '@/composables/useMediaPreview';
import { copyText } from '@/utils/clipboard';
import { inferFrameAspect, inferNodeRoleChip } from '@/utils/node-spec';
import { parseGridSplitCells } from '@/utils/split-image-grid';
import DOMPurify from 'dompurify';
import { renderMarkdown } from '@/utils/markdown';
import { htmlToPlainText } from '@/utils/html-to-plain';
import { downloadUrl, downloadTextFile } from '@/utils/download';
import { findChatSkill } from '@/utils/skill-catalog';

export type WorkflowFlowNodeData = {
  label?: string;
  /** 旧字段兼容：某些节点把标题存在 title */
  title?: string;
  nodeType: string;
  params?: Record<string, unknown>;
  mode?: 'active' | 'mute' | 'bypass';
  catalog?: WorkflowNodeCatalogItem | null;
  /** 节点最近一次运行的产物（image / video / text 等） */
  outputs?: Record<string, unknown>;
  status?: string;
  /** 运行中进度文案，如「图生图中…」 */
  statusMessage?: string;
  previewImage?: string;
  previewVideo?: string;
  previewText?: string;
};

const props = defineProps<NodeProps<WorkflowFlowNodeData>>();

const runNode = inject<(id: string) => void>('studioRunNode', () => {});
const cancelRun = inject<(id?: string) => void>('studioCancelRun', () => {});
const mediaAction = inject<
  (id: string, action: 'upload' | 'asset' | 'ref-upload' | 'ref-asset') => void
>('studioMediaNodeAction', () => {});
const updateNodeParam = inject<(id: string, key: string, value: string) => void>(
  'studioUpdateNodeParam',
  () => {},
);
const renameNodeLabel = inject<(id: string, label: string) => void>('studioRenameNode', () => {});
const textNodeAction = inject<(id: string, action: 'edit' | 'replace' | 'compose') => void>(
  'studioTextNodeAction',
  () => {},
);
const mediaCardAction = inject<
  (
    id: string,
    action: string,
    payload?: Record<string, string | number>,
  ) => void
>('studioMediaCardAction', () => {});
const studioSelectedId = inject<import('vue').Ref<string> | undefined>('studioSelectedId', undefined);
const studioAgentLive = inject<{
  nodeId: string;
  streaming: boolean;
  text: string;
  phase?: string;
} | null>('studioAgentLive', null);
const gridSplitSession = inject<
  import('vue').Ref<{ nodeId: string; rows: number; cols: number } | null>
>('studioGridSplitSession', ref(null));

const TEXT_PORT = { id: 'text', label: '文本', type: 'text' as const };

const { getViewport, updateNode, updateNodeInternals } = useVueFlow({ id: 'studio-canvas' });

const nodeType = computed(() => props.data.nodeType || '');
const selected = computed(() => Boolean(props.selected));
/** Vue Flow 的 selected 偶发不同步时，用画布 selectedId 兜底（顶部操作条依赖它） */
const isCardSelected = computed(
  () => selected.value || (!!studioSelectedId && studioSelectedId.value === props.id),
);
const isTextCard = computed(() => nodeType.value === 'input.text');
const isImageMediaCard = computed(() => {
  const t = nodeType.value;
  return t === 'ai.image' || t === 'input.image' || t === 'output.preview';
});

/** 图片 / 视频共用默认外接框与自适应宽高（避免视频默认比图片小一圈） */
const isFitMediaCard = computed(() => {
  const t = nodeType.value;
  return (
    isImageMediaCard.value ||
    t === 'ai.video' ||
    t === 'input.video'
  );
});

const mediaMenu = ref<'derive' | 'bg' | 'multigrid' | 'gridsplit' | ''>('');

/** 一键 AI 派生：后续新能力优先加这里，避免顶栏继续变长 */
const deriveActions: Array<{ id: string; label: string; desc: string }> = [
  { id: 'lineart', label: '线稿', desc: '转清晰黑白勾线，白底' },
  { id: 'fullbody', label: '全身照', desc: '单人站立全身像，非设定面板' },
  { id: 'panorama', label: '全景', desc: '横向扩展为更宽画面' },
];
const splitDraft = ref({ rows: 3, cols: 3 });
const splitHover = ref({ rows: 3, cols: 3 });
const gridSplitBusy = ref(false);
/** 图片卡预览底色；未显式选择时跟随主题，生成后可在浮层改白底等 */
const cardBgOptions = [
  { color: '#262626', label: '深灰' },
  { color: '#ffffff', label: '白底' },
  { color: '#f5f0e6', label: '米白' },
  { color: '#e5e5e5', label: '浅灰' },
  { color: '#111111', label: '黑底' },
  { color: '#00c853', label: '绿幕' },
  { color: '#1e88e5', label: '蓝底' },
  { color: '#f48fb1', label: '粉色' },
] as const;
const DEFAULT_CARD_BG = '#262626';
const cardBgColor = computed(() => {
  const raw = String(props.data.params?.cardBg || '').trim();
  if (/^#([0-9a-f]{6})$/i.test(raw)) return raw;
  if (/^#([0-9a-f]{3})$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  // 未显式选色：不写内联背景，交给 CSS 默认 var(--studio-panel-3) 跟随主题
  return '';
});
/** 浅色底用深色空态图标；深色底用浅色图标 */
const cardBgIsLight = computed(() => {
  const hex = (
    cardBgColor.value ||
    getComputedStyle(document.documentElement).getPropertyValue('--studio-panel-3').trim()
  ).replace('#', '');
  if (hex.length !== 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 168;
});
const gridSplitPresets = [
  { id: '2x2', label: '2x2', rows: 2, cols: 2 },
  { id: '3x3', label: '3x3', rows: 3, cols: 3 },
  { id: '4x4', label: '4x4', rows: 4, cols: 4 },
  { id: '5x5', label: '5x5', rows: 5, cols: 5 },
];
const SPLIT_BOARD = 8;
const splitBoardCells = Array.from({ length: SPLIT_BOARD * SPLIT_BOARD }, (_, i) => {
  const row = Math.floor(i / SPLIT_BOARD) + 1;
  const col = (i % SPLIT_BOARD) + 1;
  return { key: `${row}-${col}`, row, col };
});

type MultigridTabId = 'three_view' | 'multi_cam' | 'storyboard9' | 'super_board';
const multigridTabs: Array<{ id: MultigridTabId; label: string; imageGrid: string }> = [
  { id: 'three_view', label: '角色三视图', imageGrid: '4' },
  { id: 'multi_cam', label: '多机位', imageGrid: '4' },
  { id: 'storyboard9', label: '九宫格分镜', imageGrid: '9' },
  { id: 'super_board', label: '超级故事板', imageGrid: '16' },
];
const multigridModes = [
  { id: 'stable', label: '稳定' },
  { id: 'creative', label: '创意' },
  { id: 'wild', label: '放飞' },
];
const multigridTab = ref<MultigridTabId>('three_view');
const multigridAspect = ref('1:1');
const multigridMode = ref('stable');
const multigridPrompt = ref('');
const multigridSize = ref('1K');
const currentMultigridTab = computed(() => multigridTabs.find((t) => t.id === multigridTab.value));

const showGridSplitOverlay = computed(
  () =>
    isImageMediaCard.value &&
    gridSplitSession.value?.nodeId === props.id &&
    !!gridSplitSession.value,
);
const activeSplit = computed(() => ({
  rows: gridSplitSession.value?.rows || splitDraft.value.rows,
  cols: gridSplitSession.value?.cols || splitDraft.value.cols,
}));

const IMAGE_PORT = { id: 'image', label: '图片', type: 'image' as const };
const END_IMAGE_PORT = { id: 'endImage', label: '尾帧', type: 'image' as const };
const VIDEO_PORT = { id: 'video', label: '视频', type: 'video' as const };
/** Agent 仅左侧参考入口；右侧不提供连接点（完成后会落图/视频/文本节点） */
const AGENT_IN_PORT = { id: 'image', label: '输入', type: 'image' as const };

/** 文本/图片节点两侧都有连线点（左入右出）；图片左侧只保留一个 + */
const inputs = computed(() => {
  const list = props.data.catalog?.inputs || [];
  if (isAgentCard.value) return [AGENT_IN_PORT];
  if (isTextCard.value) {
    // 画布左口统一 text；图片→文本参考走同口类型例外
    return [TEXT_PORT];
  }
  if (isImageMediaCard.value) {
    return [IMAGE_PORT];
  }
  if (nodeType.value === 'ai.video') {
    return [IMAGE_PORT, END_IMAGE_PORT, VIDEO_PORT];
  }
  return list;
});
const outputs = computed(() => {
  const list = props.data.catalog?.outputs || [];
  if (isAgentCard.value) return [];
  if (isTextCard.value) {
    if (list.some((p) => p.id === 'text')) return list;
    return [...list, TEXT_PORT];
  }
  if (isImageMediaCard.value) {
    return [IMAGE_PORT];
  }
  if (nodeType.value === 'ai.video') {
    return [VIDEO_PORT];
  }
  return list;
});

const isMediaCard = computed(() => {
  const t = nodeType.value;
  return (
    t === 'input.image' ||
    t === 'input.video' ||
    t === 'ai.image' ||
    t === 'ai.video' ||
    t === 'output.preview'
  );
});

const isNoteCard = computed(() => nodeType.value === 'input.note');
const isAgentCard = computed(() => nodeType.value === 'ai.chat');
const isEngineCard = computed(
  () => !isMediaCard.value && !isTextCard.value && !isNoteCard.value && !isAgentCard.value,
);
const agentLiveStreaming = computed(
  () => !!(studioAgentLive && studioAgentLive.streaming && studioAgentLive.nodeId === props.id),
);

const agentLiveText = computed(() => {
  if (!agentLiveStreaming.value || !studioAgentLive) return '';
  return String(studioAgentLive.text || '').trim();
});

const agentStatusText = computed(() => {
  if (agentLiveStreaming.value) {
    const phase = String(studioAgentLive?.phase || '');
    if (phase === 'understanding') return '理解中';
    if (phase === 'generating') return '生成中';
    return '执行中';
  }
  if (isBusy.value) {
    const msg = String(props.data.statusMessage || '').trim();
    if (/理解/.test(msg)) return '理解中';
    if (/生成/.test(msg)) return '生成中';
    return '运行中';
  }
  if (props.data.status === 'failed') return '失败';
  if (props.data.status === 'completed') return '已完成';
  return '待开始';
});

const agentPreview = computed(() => {
  const reply = String(props.data.previewText || '').trim();
  const prompt = String(props.data.params?.prompt || '').trim();
  const raw = reply || prompt;
  if (!raw) return '';
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
});

const agentReplyText = computed(() => String(props.data.previewText || '').trim());

/** 卡片正文：优先流式增量，其次回复（有技能时不把 prompt 当正文刷） */
const agentBodyText = computed(() => {
  const live = agentLiveText.value;
  if (live) return live.length > 160 ? `${live.slice(0, 160)}…` : live;
  const reply = agentReplyText.value;
  if (reply) return reply.length > 120 ? `${reply.slice(0, 120)}…` : reply;
  if (agentHasSkill.value) return '';
  return agentPreview.value;
});

const agentSkillSlash = computed(() => {
  const slash = String(props.data.params?.slash || '').trim();
  if (slash) return slash.startsWith('/') ? slash : `/${slash}`;
  const skillId = String(props.data.params?.skillId || '').trim();
  if (skillId) return `/${skillId}`;
  return '';
});

const agentHasSkill = computed(
  () => !!(String(props.data.params?.skillId || '').trim() || agentSkillSlash.value),
);

function restartAgent() {
  mediaCardAction(props.id, 'agent-restart');
}
const isInputMedia = computed(
  () => nodeType.value === 'input.image' || nodeType.value === 'input.video',
);

const localPrompt = computed(() => {
  if (isTextCard.value || isNoteCard.value) {
    return String(props.data.params?.value || props.data.previewText || '');
  }
  return String(props.data.params?.prompt || '');
});

const textFontSize = computed(() => {
  const n = Number(props.data.params?.textFontSize);
  if (Number.isFinite(n) && n >= 11 && n <= 22) return n;
  return 13;
});

/** 宫格切分出来的小图：允许更紧凑，避免分组内重叠 */
const isGridSplitCell = computed(() => String(props.data.params?.op || '') === 'grid-split-cell');

/** 图片卡外接矩形：高同文本，宽=高×1.5；实际显示按比例塞进此框（竖图变窄、横图变矮） */
const IMAGE_CARD_H = 248;
const IMAGE_CARD_W = Math.round(IMAGE_CARD_H * 1.5); // 372
/** 手动缩放：相对自适应框下限 0.6×，相对默认外接框上限 2× */
const IMAGE_RESIZE_MIN_SCALE = 0.6;
const IMAGE_RESIZE_MAX_SCALE = 2;

const canResize = computed(
  () => isTextCard.value || isMediaCard.value || isNoteCard.value || isEngineCard.value,
);

const liveW = ref<number | null>(null);
const liveH = ref<number | null>(null);

/** 解析图片宽/高比（只要比例，不要像素） */
function resolveImageRatioWH(): number {
  if (mediaSize.value.w > 0 && mediaSize.value.h > 0) {
    return mediaSize.value.w / mediaSize.value.h;
  }
  const fromAspect = parseRatioPair(String(props.data.params?.aspect || ''));
  if (fromAspect) return fromAspect.w / fromAspect.h;
  const size = String(props.data.params?.size || '').trim();
  const m = size.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (m) {
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (w > 0 && h > 0) return w / h;
  }
  return IMAGE_CARD_W / IMAGE_CARD_H; // 默认 1.5
}

/** 将比例塞进默认外接框，保证不比 372×248 更大 */
function fitRatioInImageBox(ratioWH: number): { w: number; h: number } {
  const maxW = IMAGE_CARD_W;
  const maxH = IMAGE_CARD_H;
  const r = ratioWH > 0 ? ratioWH : maxW / maxH;
  if (maxW / maxH > r) {
    const h = maxH;
    return { w: Math.max(1, Math.round(h * r)), h };
  }
  const w = maxW;
  return { w, h: Math.max(1, Math.round(w / r)) };
}

const imageFitBox = computed(() => fitRatioInImageBox(resolveImageRatioWH()));

const minCardW = computed(() => {
  if (isGridSplitCell.value) return 64;
  const t = nodeType.value;
  if (t === 'input.text') return 220;
  if (t === 'input.note') return 240;
  if (isFitMediaCard.value) {
    return Math.max(140, Math.round(imageFitBox.value.w * IMAGE_RESIZE_MIN_SCALE));
  }
  return 260;
});
const minCardH = computed(() => {
  if (isGridSplitCell.value) return 72;
  const t = nodeType.value;
  if (t === 'input.text') return 248;
  if (t === 'input.note') return 160;
  if (isFitMediaCard.value) {
    return Math.max(120, Math.round(imageFitBox.value.h * IMAGE_RESIZE_MIN_SCALE));
  }
  return 160;
});
const maxCardW = computed(() => {
  if (isFitMediaCard.value && !isGridSplitCell.value) {
    return Math.round(IMAGE_CARD_W * IMAGE_RESIZE_MAX_SCALE); // 744
  }
  return 720;
});
const maxCardH = computed(() => {
  if (isFitMediaCard.value && !isGridSplitCell.value) {
    return Math.round(IMAGE_CARD_H * IMAGE_RESIZE_MAX_SCALE); // 496
  }
  return 640;
});

/** 按宽高比等比收敛到 min/max（不单边变形） */
function clampUniformImageSize(w: number, ratioWH: number) {
  const r = ratioWH > 0 ? ratioWH : IMAGE_CARD_W / IMAGE_CARD_H;
  const rawW = Math.max(1, w);
  const rawH = Math.max(1, rawW / r);
  const minW = minCardW.value;
  const minH = minCardH.value;
  const maxW = maxCardW.value;
  const maxH = maxCardH.value;
  let sc = 1;
  if (rawW < minW || rawH < minH) {
    sc = Math.max(minW / rawW, minH / rawH);
  } else if (rawW > maxW || rawH > maxH) {
    sc = Math.min(maxW / rawW, maxH / rawH);
  }
  // 放大到 min 后若又超 max，再压回 max
  if (rawW * sc > maxW || rawH * sc > maxH) {
    sc = Math.min(maxW / rawW, maxH / rawH);
  }
  return {
    w: Math.max(1, Math.round(rawW * sc)),
    h: Math.max(1, Math.round(rawH * sc)),
  };
}

const isResized = computed(() => {
  if (isGridSplitCell.value) {
    const w = Number(props.data.params?.cardW);
    const h = Number(props.data.params?.cardH);
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  }
  // 图片 / 视频：用户手动拉伸过才锁尺寸；仅有历史残留的单边参数不算
  if (isFitMediaCard.value) {
    const w = Number(props.data.params?.cardW);
    const h = Number(props.data.params?.cardH);
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  }
  const w = Number(props.data.params?.cardW);
  const h = Number(props.data.params?.cardH);
  return (Number.isFinite(w) && w > minCardW.value) || (Number.isFinite(h) && h > minCardH.value);
});

const cardW = computed(() => {
  if (liveW.value != null) return liveW.value;
  if (isFitMediaCard.value && !isGridSplitCell.value && !isResized.value) {
    return imageFitBox.value.w;
  }
  if (isFitMediaCard.value && !isGridSplitCell.value) {
    const pw = Number(props.data.params?.cardW);
    const ph = Number(props.data.params?.cardH);
    if (Number.isFinite(pw) && pw > 0 && Number.isFinite(ph) && ph > 0) {
      return clampUniformImageSize(pw, pw / ph).w;
    }
  }
  const n = Number(props.data.params?.cardW);
  if (Number.isFinite(n) && n >= minCardW.value) return Math.round(n);
  return isFitMediaCard.value ? IMAGE_CARD_W : minCardW.value;
});
const cardH = computed(() => {
  if (liveH.value != null) return liveH.value;
  if (isFitMediaCard.value && !isGridSplitCell.value && !isResized.value) {
    return imageFitBox.value.h;
  }
  if (isFitMediaCard.value && !isGridSplitCell.value) {
    const pw = Number(props.data.params?.cardW);
    const ph = Number(props.data.params?.cardH);
    if (Number.isFinite(pw) && pw > 0 && Number.isFinite(ph) && ph > 0) {
      return clampUniformImageSize(pw, pw / ph).h;
    }
  }
  const n = Number(props.data.params?.cardH);
  if (Number.isFinite(n) && n >= minCardH.value) return Math.round(n);
  return isFitMediaCard.value ? IMAGE_CARD_H : minCardH.value;
});

const nodeBoxStyle = computed(() => {
  if (!canResize.value) return undefined;
  if (isFitMediaCard.value && !isGridSplitCell.value && !isResized.value && liveH.value == null) {
    // 未拉伸：宽度跟自适应框，高度由画幅比例撑开（不超出 372×248）
    return { width: `${imageFitBox.value.w}px` };
  }
  const style: Record<string, string> = { width: `${cardW.value}px` };
  if (
    isTextCard.value ||
    isNoteCard.value ||
    isResized.value ||
    isGridSplitCell.value ||
    liveH.value != null
  ) {
    style.height = `${cardH.value}px`;
  }
  return style;
});

const textFrameStyle = computed(() => {
  if (!isTextCard.value) return undefined;
  // 去掉默认比例锁，高度由节点盒承接
  return {
    aspectRatio: 'auto',
    flex: '1',
    minHeight: '200px',
    height: 'auto',
    maxHeight: 'none',
  } as Record<string, string>;
});

let resizeSession: {
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  /** 图片卡等比拉伸用 */
  ratioWH: number;
  uniform: boolean;
  pointerId: number;
} | null = null;

function onResizeStart(e: PointerEvent) {
  if (!canResize.value) return;
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture?.(e.pointerId);
  const startW = cardW.value;
  const startH = cardH.value;
  const uniform = isFitMediaCard.value && !isGridSplitCell.value;
  const ratioWH = uniform
    ? startH > 0
      ? startW / startH
      : resolveImageRatioWH()
    : 1;
  resizeSession = {
    startX: e.clientX,
    startY: e.clientY,
    startW,
    startH,
    ratioWH,
    uniform,
    pointerId: e.pointerId,
  };
  liveW.value = startW;
  liveH.value = startH;
  applyNodeBox(startW, startH);
  document.body.style.cursor = 'nwse-resize';
  window.addEventListener('pointermove', onResizeMove);
  window.addEventListener('pointerup', onResizeEnd);
  window.addEventListener('pointercancel', onResizeEnd);
}

function flowZoom() {
  try {
    return Math.max(0.2, Number(getViewport()?.zoom) || 1);
  } catch {
    return 1;
  }
}

function applyNodeBox(w: number, h: number) {
  try {
    updateNode(props.id, {
      style: {
        width: `${w}px`,
        height: `${h}px`,
      },
    });
    updateNodeInternals([props.id]);
  } catch {
    /* ignore */
  }
}

function onResizeMove(e: PointerEvent) {
  if (!resizeSession) return;
  const zoom = flowZoom();
  const dw = (e.clientX - resizeSession.startX) / zoom;
  const dh = (e.clientY - resizeSession.startY) / zoom;

  if (resizeSession.uniform) {
    // 角点等比：取对角方向上变化更大的轴决定缩放
    const { startW, startH, ratioWH } = resizeSession;
    const scaleW = (startW + dw) / Math.max(1, startW);
    const scaleH = (startH + dh) / Math.max(1, startH);
    const scale =
      Math.abs(scaleW - 1) * startW >= Math.abs(scaleH - 1) * startH ? scaleW : scaleH;
    const rawW = startW * scale;
    const clamped = clampUniformImageSize(rawW, ratioWH);
    liveW.value = clamped.w;
    liveH.value = clamped.h;
    applyNodeBox(clamped.w, clamped.h);
    return;
  }

  const rawW = Math.round(resizeSession.startW + dw);
  const rawH = Math.round(resizeSession.startH + dh);
  const w = Math.min(maxCardW.value, Math.max(minCardW.value, rawW));
  const h = Math.min(maxCardH.value, Math.max(minCardH.value, rawH));
  liveW.value = w;
  liveH.value = h;
  applyNodeBox(w, h);
}

function onResizeEnd() {
  if (!resizeSession) return;
  let w = liveW.value ?? cardW.value;
  let h = liveH.value ?? cardH.value;
  if (resizeSession.uniform) {
    const c = clampUniformImageSize(w, resizeSession.ratioWH);
    w = c.w;
    h = c.h;
  }
  updateNodeParam(props.id, 'cardW', String(w));
  updateNodeParam(props.id, 'cardH', String(h));
  applyNodeBox(w, h);
  liveW.value = null;
  liveH.value = null;
  resizeSession = null;
  document.body.style.cursor = '';
  window.removeEventListener('pointermove', onResizeMove);
  window.removeEventListener('pointerup', onResizeEnd);
  window.removeEventListener('pointercancel', onResizeEnd);
}

function onDocPointerDown(e: PointerEvent) {
  if (!mediaMenu.value) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('.media-float')) return;
  mediaMenu.value = '';
}

onMounted(async () => {
  if (canResize.value) {
    const w = Number(props.data.params?.cardW);
    const h = Number(props.data.params?.cardH);
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
      const c =
        isFitMediaCard.value && !isGridSplitCell.value
          ? clampUniformImageSize(w, w / h)
          : {
              w: Math.min(maxCardW.value, Math.max(minCardW.value, Math.round(w))),
              h: Math.min(maxCardH.value, Math.max(minCardH.value, Math.round(h))),
            };
      applyNodeBox(c.w, c.h);
    }
  }
  // 手柄样式变更后重测 bounds，避免连线悬空
  await Promise.resolve();
  updateNodeInternals([props.id]);
  window.addEventListener('pointerdown', onDocPointerDown, true);
});

onUnmounted(() => {
  window.removeEventListener('pointermove', onResizeMove);
  window.removeEventListener('pointerup', onResizeEnd);
  window.removeEventListener('pointercancel', onResizeEnd);
  window.removeEventListener('pointerdown', onDocPointerDown, true);
});

const textHtml = computed(() => {
  const raw = localPrompt.value.trim();
  if (!raw) return '';
  // 富文本编辑器保存的 HTML
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
    return DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true },
    });
  }
  try {
    return renderMarkdown(raw).html;
  } catch {
    return raw.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
  }
});

const refThumb = computed(() => {
  const url = String(props.data.params?.referenceImage || '').trim();
  if (!url || isVideoUrl(url)) return '';
  return isImageUrl(url) ? url : url.startsWith('http') || url.startsWith('data:') ? url : '';
});

function onPromptInput(ev: Event) {
  const v = (ev.target as HTMLTextAreaElement).value;
  if (isTextCard.value || isNoteCard.value) updateNodeParam(props.id, 'value', v);
  else updateNodeParam(props.id, 'prompt', v);
}

function openTextEdit() {
  textNodeAction(props.id, 'edit');
}

function openTextReplace() {
  textNodeAction(props.id, 'replace');
}

function openMediaReplace() {
  mediaCardAction(props.id, 'replace');
}

function openAgentSheet() {
  mediaCardAction(props.id, 'compose');
}

function toggleMediaMenu(name: 'derive' | 'bg' | 'multigrid' | 'gridsplit') {
  const next = mediaMenu.value === name ? '' : name;
  mediaMenu.value = next;
  if (next === 'gridsplit') {
    splitHover.value = { ...splitDraft.value };
  }
  if (next === 'multigrid' && !multigridPrompt.value) {
    multigridPrompt.value = String(props.data.params?.prompt || '').trim();
  }
}

function setCardBg(color: string) {
  const next = String(color || '').trim() || DEFAULT_CARD_BG;
  updateNodeParam(props.id, 'cardBg', next);
  mediaMenu.value = '';
  // 选色即派生生图：把主体放到对应纯色背景上
  mediaCardAction(props.id, 'rebg', { cardBg: next });
}

function onMediaToolbar(action: string, payload?: Record<string, string | number>) {
  mediaMenu.value = '';
  mediaCardAction(props.id, action, payload);
}

function runMultigridGenerate() {
  const tab = currentMultigridTab.value;
  if (!tab) return;
  if (!displayImage.value) {
    ElMessage.warning('请先生成或上传图片，再派生多宫格');
    return;
  }
  const payload: Record<string, string | number> = {
    imageGrid: tab.imageGrid,
    label: tab.label,
    kind: tab.id,
    prompt: multigridPrompt.value.trim(),
  };
  if (tab.id === 'three_view') {
    payload.aspect = multigridAspect.value;
  } else if (tab.id === 'multi_cam') {
    payload.mode = multigridMode.value;
    payload.aspect = '16:9';
  } else if (tab.id === 'storyboard9') {
    payload.aspect = '1:1';
  } else {
    payload.size = multigridSize.value;
    payload.aspect = '1:1';
  }
  onMediaToolbar('multigrid', payload);
}

function beginGridSplit(rows: number, cols: number) {
  const r = Math.max(1, Math.min(SPLIT_BOARD, rows || 3));
  const c = Math.max(1, Math.min(SPLIT_BOARD, cols || 3));
  splitDraft.value = { rows: r, cols: c };
  splitHover.value = { rows: r, cols: c };
  mediaMenu.value = '';
  mediaCardAction(props.id, 'grid-split-preview', { rows: r, cols: c });
}

function cancelGridSplit() {
  mediaCardAction(props.id, 'grid-split-cancel');
}

async function confirmGridSplit() {
  if (gridSplitBusy.value) return;
  gridSplitBusy.value = true;
  try {
    mediaCardAction(props.id, 'grid-split-confirm', {
      rows: activeSplit.value.rows,
      cols: activeSplit.value.cols,
    });
  } finally {
    // 父级异步完成后会清 session；此处短暂锁避免连点
    setTimeout(() => {
      gridSplitBusy.value = false;
    }, 800);
  }
}

async function renameMediaNode() {
  try {
    const { value } = await ElMessageBox.prompt('节点名称', '重命名', {
      inputValue: displayName.value,
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '请输入名称',
    });
    const label = String(value || '').trim();
    if (label) renameNodeLabel(props.id, label);
  } catch {
    /* cancel */
  }
}

async function downloadMedia() {
  const url = displayImage.value || displayVideo.value;
  if (!url) {
    ElMessage.info('暂无媒体可下载');
    return;
  }
  const isVid = Boolean(displayVideo.value) || isVideoLike.value;
  const ext = isVid
    ? /\.webm(\?|$)/i.test(url)
      ? 'webm'
      : /\.mov(\?|$)/i.test(url)
        ? 'mov'
        : 'mp4'
    : /\.jpe?g(\?|$)/i.test(url)
      ? 'jpg'
      : /\.webp(\?|$)/i.test(url)
        ? 'webp'
        : 'png';
  const filename = `${displayName.value || 'media'}.${ext}`;
  try {
    await downloadUrl(url, filename);
    ElMessage.success('已开始下载');
  } catch (e: any) {
    ElMessage.error(e?.message || '下载失败');
  }
}

function bumpFont(delta: number) {
  const next = Math.min(22, Math.max(11, textFontSize.value + delta));
  updateNodeParam(props.id, 'textFontSize', String(next));
}

async function renameTextNode() {
  try {
    const { value } = await ElMessageBox.prompt('节点名称', '重命名', {
      inputValue: displayName.value,
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '请输入名称',
    });
    const label = String(value || '').trim();
    if (label) renameNodeLabel(props.id, label);
  } catch {
    /* cancel */
  }
}

function downloadText() {
  const text = htmlToPlainText(localPrompt.value);
  if (!text) {
    ElMessage.info('暂无文本可下载');
    return;
  }
  downloadTextFile(`${text}`, `${displayName.value || '文本'}.txt`, 'text/plain;charset=utf-8');
}

function clearRef() {
  updateNodeParam(props.id, 'referenceImage', '');
}

function onEmptyAction(action: 'upload' | 'asset' | 'ref-upload' | 'ref-asset') {
  mediaAction(props.id, action);
}

const canRunOnCard = computed(() => {
  const t = nodeType.value;
  return t.startsWith('ai.') || t.startsWith('library.');
});

const isBusy = computed(
  () =>
    props.data.status === 'running' ||
    props.data.status === 'active' ||
    props.data.status === 'queued' ||
    props.data.status === 'pending',
);

const busyTitle = computed(() => {
  if (isTextCard.value) return '正在生成提示词';
  if (isVideoLike.value) return '正在生成视频';
  return '正在生成图片';
});

const busyHint = computed(() => {
  const msg = String(props.data.statusMessage || '').trim();
  if (msg && !/^(完成|AI |节点)/.test(msg)) return msg;
  if (props.data.status === 'queued') return '排队中…';
  return isVideoLike.value ? '图生视频通常需要几十秒，请稍候' : '出图中，请稍候';
});

function onRunClick() {
  runNode(props.id);
}

function onCancelRun() {
  cancelRun(props.id);
}

const textPreview = computed(() => {
  const v = String(props.data.params?.value || props.data.previewText || '').trim();
  return v.slice(0, 220);
});

const isVideoLike = computed(() => /video/i.test(nodeType.value));

/** 在线地址加载失败后不再回退 /api/uploads（展示必须用 FileOSS） */
const preferLocalMedia = ref(false);

const localMirrorUrl = computed(() => {
  const u = String(props.data.params?.localUrl || '').trim();
  // 历史字段：忽略本地 uploads，避免展示非 OSS 地址
  if (u.startsWith('/api/uploads/')) return '';
  return u;
});

function isDisplayableMediaUrl(u: string) {
  if (!u) return false;
  if (u.startsWith('/api/uploads/')) return false;
  return /^https?:\/\//i.test(u) || u.startsWith('data:');
}

function pickMediaUrl(...candidates: string[]) {
  for (const raw of candidates) {
    const u = String(raw || '').trim();
    if (!u || !isDisplayableMediaUrl(u)) continue;
    return u;
  }
  return '';
}

const displayImage = computed(() => {
  if (isVideoLike.value) return '';
  // 重跑中不展示旧图，避免结束后仍像「没换图」
  if (isBusy.value) return '';
  const run = String(props.data.previewImage || '').trim();
  if (run && !isVideoUrl(run) && isDisplayableMediaUrl(run)) return run;
  const url = pickMediaUrl(
    String(props.data.params?.lastImage || ''),
    String(props.data.params?.url || ''),
    String(props.data.params?.referenceImage || ''),
  );
  if (!url || isVideoUrl(url)) return '';
  return isImageUrl(url) || /^https?:\/\//i.test(url) ? url : '';
});

const displayVideo = computed(() => {
  if (isBusy.value) return '';
  if (isVideoLike.value) {
    return (
      pickMediaUrl(
        String(props.data.previewVideo || ''),
        String(props.data.params?.lastVideo || ''),
        String(props.data.params?.url || ''),
        String(props.data.params?.referenceImage || ''),
      ) || ''
    );
  }
  const run = String(props.data.previewVideo || props.data.params?.lastVideo || '').trim();
  if (run && isDisplayableMediaUrl(run)) return run;
  const url = String(props.data.params?.url || '').trim();
  return url && isVideoUrl(url) && isDisplayableMediaUrl(url) ? url : '';
});

const mediaDisplayKey = computed(
  () =>
    `${displayImage.value || displayVideo.value}|${String(props.data.params?.mediaRev || '')}|${String(props.data.status || '')}`,
);

const splitCells = computed(() => parseGridSplitCells(props.data.params?.gridSplitCells));
const isSplitGroup = computed(() => splitCells.value.length > 0);
const splitRows = computed(() => Math.max(1, Number(props.data.params?.gridSplitRows) || 1));
const splitCols = computed(() => Math.max(1, Number(props.data.params?.gridSplitCols) || 1));
const splitCellCount = computed(() => splitCells.value.length);

const hasMedia = computed(() =>
  Boolean(displayImage.value || displayVideo.value || isSplitGroup.value),
);

function onSplitCellPreview(url: string) {
  if (url) openImagePreview(url);
}

const mediaSize = ref({ w: 0, h: 0 });
watch([displayImage, displayVideo], () => {
  mediaSize.value = { w: 0, h: 0 };
});

/** 视频节点封面：独立 JPG（previewImage/lastImage/posterUrl），不加载 mp4 */
const videoPosterUrl = computed(() => {
  if (!displayVideo.value) return '';
  for (const raw of [
    props.data.params?.posterUrl,
    props.data.previewImage,
    props.data.params?.lastImage,
  ]) {
    const u = String(raw || '').trim();
    if (u && !isVideoUrl(u) && isDisplayableMediaUrl(u)) return u;
  }
  return '';
});

function onImageDetail() {
  mediaCardAction(props.id, 'detail');
}

/** 按下即选中，保证顶部操作条立刻出现 */
function onMediaCardMouseDown() {
  if ((!isImageMediaCard.value && !isVideoLike.value) || isSplitGroup.value) return;
  mediaCardAction(props.id, 'select');
}

/** 图片/视频卡片单击开底部条；有视频时中心播放钮单独预览 */
function onFrameClick(ev: MouseEvent) {
  if (isImageMediaCard.value && !isSplitGroup.value) {
    if (nodeType.value === 'ai.image' || nodeType.value === 'ai.video') {
      mediaCardAction(props.id, 'compose');
    } else if (nodeType.value === 'input.image' || nodeType.value === 'output.preview') {
      // 输入图也选中并尽量打开生图条（若画布侧支持）
      mediaCardAction(props.id, 'compose');
    }
    return;
  }
  if (isVideoLike.value && nodeType.value === 'ai.video') {
    mediaCardAction(props.id, 'compose');
    return;
  }
  ev.stopPropagation();
  onMediaPreview();
}

function onMediaPreview() {
  if (isSplitGroup.value) {
    const first = splitCells.value[0]?.url;
    if (first) openImagePreview(first);
    return;
  }
  if (displayVideo.value) {
    const poster = videoPosterUrl.value;
    openVideoPreview(displayVideo.value, poster ? { poster } : undefined);
    return;
  }
  if (displayImage.value) {
    // 图片详情改走右键菜单；此处仅轻量预览
    if (isImageMediaCard.value) {
      onImageDetail();
      return;
    }
    openImagePreview(displayImage.value);
  }
}

const frameAspect = computed(() =>
  inferFrameAspect({
    nodeType: nodeType.value,
    aspect: String(props.data.params?.aspect || ''),
    size: String(props.data.params?.size || ''),
    label: String(props.data.label || props.data.params?.name || ''),
    mediaW: mediaSize.value.w,
    mediaH: mediaSize.value.h,
  }),
);

/** 解析 16:9 / 9/16 等比例 */
function parseRatioPair(raw: string): { w: number; h: number } | null {
  const m = String(raw || '')
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

/**
 * 图片画幅：未拉伸时用外接框内的自适应宽高比；拉伸后随盒子伸缩。
 */
const mediaFrameStyle = computed(() => {
  const useFit =
    (isImageMediaCard.value || isVideoLike.value) && !isGridSplitCell.value && !isSplitGroup.value;
  const bgStyle = isImageMediaCard.value
    ? cardBgColor.value
      ? ({ background: cardBgColor.value, '--frame-bg': cardBgColor.value } as Record<string, string>)
      : undefined
    : undefined;
  if (!useFit) return bgStyle;
  if (isResized.value || liveH.value != null) {
    return {
      aspectRatio: 'auto',
      flex: '1',
      minHeight: '0',
      height: 'auto',
      ...(bgStyle || {}),
    } as Record<string, string>;
  }
  // 视频也跟图片同一套外接框比例；有 aspect / 真实像素时再覆盖
  if (isVideoLike.value) {
    const pair =
      parseRatioPair(String(props.data.params?.aspect || '')) ||
      (mediaSize.value.w > 0 && mediaSize.value.h > 0
        ? { w: mediaSize.value.w, h: mediaSize.value.h }
        : null);
    if (pair) return { aspectRatio: `${pair.w} / ${pair.h}` };
    const { w, h } = imageFitBox.value;
    return { aspectRatio: `${w} / ${h}` };
  }
  // 已加载真实像素时直接用自然比，避免 fit 取整导致 contain 留缝
  if (mediaSize.value.w > 0 && mediaSize.value.h > 0) {
    return {
      aspectRatio: `${mediaSize.value.w} / ${mediaSize.value.h}`,
      ...(bgStyle || {}),
    };
  }
  const { w, h } = imageFitBox.value;
  return { aspectRatio: `${w} / ${h}`, ...(bgStyle || {}) };
});

const roleChip = computed(() =>
  inferNodeRoleChip(
    String(props.data.label || props.data.params?.name || ''),
    nodeType.value,
  ),
);

const copyablePrompt = computed(() => {
  const p = String(
    props.data.params?.prompt ||
      props.data.params?.value ||
      props.data.params?.motionPrompt ||
      props.data.previewText ||
      '',
  ).trim();
  return p;
});

async function onCopyPrompt() {
  const text = copyablePrompt.value;
  if (!text) return;
  const ok = await copyText(text);
  if (ok) ElMessage.success('已复制提示词');
  else ElMessage.error('复制失败');
}

const displayName = computed(() => {
  const name = String(props.data.label || props.data.params?.name || '').trim();
  if (isTextCard.value) {
    if (!name || /^(文本输入|提示词|文本)$/.test(name)) return '文本';
    return truncate(name, 16);
  }
  if (isNoteCard.value) {
    if (!name || /^(备注|注释)$/.test(name)) return '备注';
    return truncate(name, 16);
  }
  if (isAgentCard.value) {
    // 标题跟弹层技能态同步：有技能用技能名，无技能（或已叉掉）固定 Agent
    const skillId = String(props.data.params?.skillId || '').trim();
    if (skillId) {
      const skName = String(findChatSkill(skillId)?.name || name || '').trim();
      return truncate(skName || 'Agent', 16);
    }
    const named = String(props.data.params?.agentTitle || '').trim();
    if (named) return truncate(named, 16);
    return 'Agent';
  }
  if (name && !isGenericName(name)) return truncate(name, 18);
  return props.data.catalog?.title || (isVideoLike.value ? '视频' : '图片');
});

const engineTitle = computed(() => {
  const name = String(props.data.label || '').trim();
  if (name && !isGenericName(name)) return truncate(name, 20);
  return props.data.catalog?.title || nodeType.value;
});

const categoryLabel = computed(() => props.data.catalog?.category || '节点');

const shortDesc = computed(() => {
  const d = String(props.data.catalog?.description || '').trim();
  if (d) return truncate(d, 48);
  return nodeType.value;
});

const resolutionText = computed(() => {
  if (mediaSize.value.w && mediaSize.value.h) {
    return `${mediaSize.value.w} × ${mediaSize.value.h}`;
  }
  return '';
});

const statusClass = computed(() => (props.data.status ? `st-${props.data.status}` : ''));

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function isGenericName(s: string) {
  return /^(生图|图生视频|预览|AI 生图|AI 视频|图片输入|视频输入|workflow-image|workflow-video|wf-frame|wf-video)$/i.test(
    s,
  );
}

function onImgLoad(ev: Event) {
  const img = ev.target as HTMLImageElement;
  if (img?.naturalWidth) {
    mediaSize.value = { w: img.naturalWidth, h: img.naturalHeight };
    // 比例变化后重测节点 bounds，避免连线错位
    nextTick(() => {
      try {
        updateNodeInternals([props.id]);
      } catch {
        /* ignore */
      }
    });
  }
}

/** 在线图/视频失败时回退本地镜像 */
function onMediaError() {
  // 不再回退 /api/uploads；FileOSS 加载失败时保持空态，避免展示第三方/本地地址
}

watch(
  () =>
    `${props.data.previewImage || ''}|${props.data.previewVideo || ''}|${props.data.params?.lastImage || ''}|${props.data.params?.lastVideo || ''}|${props.data.params?.mediaRev || ''}`,
  () => {
    preferLocalMedia.value = false;
  },
);

function onVideoMeta(ev: Event) {
  const v = ev.target as HTMLVideoElement;
  if (v?.videoWidth) mediaSize.value = { w: v.videoWidth, h: v.videoHeight };
}

function handleStyle(i: number, total: number, type: PortType, side: 'in' | 'out') {
  const n = Math.max(total, 1);
  const color = portColor(type);
  if (isEngineCard.value) {
    const top = `${28 + ((i + 0.5) / n) * 52}%`;
    return { top, background: color, borderColor: '#0a0a0a' };
  }
  if (
    isAgentCard.value ||
    isTextCard.value ||
    isImageMediaCard.value ||
    nodeType.value === 'ai.video'
  ) {
    // 连线锚点贴边垂直居中；视觉 + 由 CSS ::after 绘制（左右各一个 +）
    return { top: '50%', zIndex: 8 };
  }
  const top = `${42 + ((i + 0.5) / n) * 48}%`;
  return { top, background: color, borderColor: '#0a0a0a' };
}

function isVideoUrl(url: string) {
  return (
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ||
    url.startsWith('data:video') ||
    /\/video\//i.test(url)
  );
}

function isImageUrl(url: string) {
  if (isVideoUrl(url)) return false;
  return (
    /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(url) ||
    url.startsWith('data:image') ||
    /\/uploads\//i.test(url)
  );
}
</script>

<style scoped>
.wf-node {
  position: relative;
  background: transparent;
  border: 0;
  box-shadow: none;
  color: var(--studio-text);
  box-sizing: border-box;
}

.wf-node.media {
  width: 240px;
}
.wf-node.mediocard {
  width: 372px;
  display: flex;
  flex-direction: column;
  cursor: default;
  box-sizing: border-box;
}
.wf-node.mediocard.grid-cell {
  width: auto !important;
  max-width: none;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  padding: 0 !important;
}
.wf-node.mediocard.grid-cell.selected {
  box-shadow: none !important;
}
.wf-node.mediocard.grid-cell .media-cap {
  order: -1;
  margin: 0 0 2px;
  padding: 0;
  min-height: 14px;
  gap: 2px;
  background: transparent;
}
.wf-node.mediocard.grid-cell .cap-ico,
.wf-node.mediocard.grid-cell .cap-ico svg {
  width: 9px !important;
  height: 9px !important;
}
.wf-node.mediocard.grid-cell .cap-name {
  font-size: 9px;
  font-weight: 650;
  color: var(--studio-text-strong);
}
.wf-node.mediocard.grid-cell .cap-rename,
.wf-node.mediocard.grid-cell .cap-badge,
.wf-node.mediocard.grid-cell .cap-res,
.wf-node.mediocard.grid-cell .media-replace,
.wf-node.mediocard.grid-cell .media-float,
.wf-node.mediocard.grid-cell .resize-handle {
  display: none !important;
}
.wf-node.mediocard.grid-cell .frame,
.wf-node.mediocard.grid-cell.resized .frame,
.wf-node.mediocard.grid-cell:hover .frame,
.wf-node.mediocard.grid-cell.selected .frame {
  min-height: 0 !important;
  height: 100% !important;
  aspect-ratio: auto !important;
  border: 0 !important;
  border-radius: 6px;
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
  flex: 1;
  overflow: hidden;
}
.wf-node.mediocard.grid-cell.selected .frame {
  outline: 1.5px solid var(--studio-text-soft) !important;
  outline-offset: 1px;
}
.wf-node.mediocard.grid-cell .frame img {
  border-radius: 6px;
  display: block;
}

.wf-node.textcard {
  width: 220px;
  min-height: 248px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.wf-node.notecard {
  width: 240px;
  display: flex;
  flex-direction: column;
}
.wf-node.notecard .note-frame {
  flex: 1;
  min-height: 100px;
}

.wf-node.engine {
  width: 260px;
}

.wf-node.agent {
  width: 240px;
  min-height: 0;
  overflow: visible !important;
}
.wf-node.agent.selected .agent-card {
  outline: 1px solid rgba(196, 181, 253, 0.45);
  outline-offset: 0;
}
/* Agent 仅左口；入口始终可见便于拖入参考 */
.wf-node.agent.port-plus .port-handle {
  z-index: 8 !important;
}
.wf-node.agent.port-plus :deep(.vue-flow__handle-left)::after {
  opacity: 1 !important;
}
.agent-card {
  border-radius: 14px;
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-glass-2);
  padding: 12px 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  min-height: 148px;
}
.agent-cap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.agent-ico {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #c4b5fd;
  background: rgba(139, 92, 246, 0.22);
  flex-shrink: 0;
}
.agent-name {
  min-width: 0;
  flex: 1;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wf-node.agent .cap-rename {
  opacity: 0;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--studio-text-faint);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.wf-node.agent:hover .cap-rename,
.wf-node.agent.selected .cap-rename {
  opacity: 1;
}
.agent-status-row {
  display: flex;
  align-items: center;
}
.agent-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
}
.agent-task {
  padding: 10px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid var(--studio-glass);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.agent-task-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.agent-task-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 650;
  color: var(--studio-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-restart {
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: var(--studio-glass-2);
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
}
.agent-restart:hover {
  background: var(--studio-line-strong);
}
.agent-slash {
  font-size: 11px;
  color: var(--studio-text-faint);
  background: transparent;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--studio-text-faint);
}
.agent-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 96px;
  padding: 16px 10px;
  border: 0;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid var(--studio-glass);
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.agent-empty:hover {
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
}
.agent-face {
  color: var(--studio-line-bright);
  display: grid;
  place-items: center;
}
.agent-foot {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--studio-line-bright);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.agent-grip {
  display: inline-grid;
  place-items: center;
  opacity: 0.7;
}
.agent-preview {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--studio-text-strong);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}
.agent-preview.live {
  color: rgba(221, 214, 254, 0.95);
  -webkit-line-clamp: 6;
  line-clamp: 6;
}
.agent-status {
  font-size: 12px;
  font-weight: 600;
  color: var(--studio-text-faint);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.agent-status .st-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.7;
}
.agent-status.run {
  color: #c4b5fd;
}
.agent-status.run .st-dot {
  animation: agent-pulse 1.1s ease infinite;
  box-shadow: 0 0 0 3px rgba(196, 181, 253, 0.2);
}
.agent-status.ok {
  color: #86efac;
}
.agent-status.fail {
  color: #fca5a5;
}
.agent-cta {
  height: 36px;
  border: 0;
  border-radius: 10px;
  background: rgba(139, 92, 246, 0.18);
  color: #e9d5ff;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 0 12px;
  text-align: left;
}
.agent-cta:hover {
  background: rgba(139, 92, 246, 0.28);
  color: #fff;
}
@keyframes agent-pulse {
  50% {
    opacity: 0.45;
  }
}

.wf-node.media.portrait {
  width: 200px;
}

.wf-node.media.square {
  width: 220px;
}

.wf-node.media.landscape,
.wf-node.media.video {
  width: 280px;
}

.role-chip {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-ring);
  border-radius: 4px;
  padding: 1px 5px;
  line-height: 1.3;
}

.cap-ico-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.cap-ico-btn:hover {
  color: var(--ink);
  background: var(--hover-bg);
}

.wf-node.selected .frame,
.wf-node.selected .note-frame,
.wf-node.selected .engine-card {
  outline: 1px solid var(--studio-line-strong);
  outline-offset: 0;
}

.cap,
.engine-cap {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 4px;
  min-height: 20px;
  padding: 0 1px;
}
.cap-ops {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--dur-fast, 0.15s) var(--ease, ease);
}
.wf-node:hover .cap-ops,
.wf-node.selected .cap-ops {
  opacity: 1;
}
.cap-badge {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  flex-shrink: 0;
  background: transparent;
  font-size: 10px;
  font-weight: 700;
  display: none;
  place-items: center;
  box-sizing: border-box;
}
.cap-badge.ok,
.cap-badge.run,
.cap-badge.fail {
  display: inline-grid;
}
.cap-badge.ok {
  background: color-mix(in srgb, var(--ok, #16a34a) 18%, transparent);
  color: var(--ok, #16a34a);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ok, #16a34a) 40%, transparent);
}
.cap-badge.ok::after {
  content: '✓';
}
.cap-badge.run {
  background: color-mix(in srgb, var(--info, var(--accent)) 18%, transparent);
  color: var(--info, var(--accent));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--info, var(--accent)) 40%, transparent);
  animation: pulse 1s ease-in-out infinite;
}
.cap-badge.run::after {
  content: '…';
}
.cap-badge.fail {
  background: color-mix(in srgb, var(--danger) 18%, transparent);
  color: var(--danger);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--danger) 40%, transparent);
}
.cap-badge.fail::after {
  content: '!';
}

.cap-ico {
  color: var(--studio-text-faint);
  display: grid;
  place-items: center;
  opacity: 1;
}

.cap-name,
.engine-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--studio-text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.01em;
}

.engine-cat {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--muted);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 1px 5px;
}

.cap-res {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--muted);
}

.cap-run-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 6px;
  background: var(--hover-bg);
  color: var(--ink);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}

.cap-run-btn:hover:not(:disabled) {
  background: var(--bg-3);
}

.cap-run-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.cap-preview-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--accent);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}

.cap-preview-btn:hover {
  background: var(--accent-ring);
  color: var(--accent-2);
}

.wf-node.video .cap-preview-btn {
  background: rgba(251, 191, 36, 0.14);
  color: #fbbf24;
}

.wf-node.video .cap-preview-btn:hover {
  background: rgba(251, 191, 36, 0.28);
  color: #fde68a;
}

.cap-ok {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ok, var(--accent));
  flex-shrink: 0;
}

.cap-fail {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--danger);
  color: var(--accent-ink, #fff);
  font-size: 10px;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.cap-run {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--info, var(--accent));
  flex-shrink: 0;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}

.frame {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: var(--studio-panel-3);
  width: 100%;
  height: 150px;
  aspect-ratio: auto;
  box-shadow: none;
  border: 1px solid var(--studio-glass-2);
}
.wf-node.mediocard .frame {
  border-radius: 12px;
  width: 100%;
  height: auto;
  min-height: 0;
  /* 高度只由 aspect-ratio × 卡片宽度决定，不被原图像素撑开 */
  aspect-ratio: auto;
  border-color: var(--studio-glass-2);
  cursor: default;
  overflow: hidden;
}
/* 图片卡默认深灰底（与历史一致）；可在参数里改白底等 */
.wf-node.mediocard:not(.video) .frame {
  background: var(--frame-bg, var(--studio-panel-3));
}
.wf-node.mediocard.video .frame {
  background: var(--studio-panel-3);
}
.wf-node.mediocard .frame img,
.wf-node.mediocard .frame video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  /* 切断 img 固有尺寸对布局的影响 */
  max-width: none;
}
.wf-node.mediocard:not(.video):hover .frame,
.wf-node.mediocard:not(.video).selected .frame {
  border-color: var(--studio-line-bright);
  background: var(--frame-bg, var(--studio-panel-3));
}
.wf-node.mediocard.video:hover .frame,
.wf-node.mediocard.video.selected .frame {
  border-color: var(--studio-line-bright);
  background: var(--studio-panel-3);
}
.wf-node.mediocard.resized .frame {
  aspect-ratio: auto !important;
  min-height: 120px;
  height: 100%;
  flex: 1;
}

/* 非 mediocard 的旧媒体节点保留固定高度 */
.wf-node.media:not(.mediocard).portrait .frame {
  height: 220px;
}
.wf-node.media:not(.mediocard).square .frame {
  height: 200px;
}
.wf-node.media:not(.mediocard).landscape .frame,
.wf-node.video:not(.mediocard) .frame {
  height: 158px;
}

.frame.busy {
  box-shadow: 0 0 0 1px var(--studio-line-strong);
}

.frame.busy img,
.frame.busy video {
  filter: brightness(0.42) saturate(0.75);
}

.gen-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--studio-panel) 72%, transparent);
  backdrop-filter: blur(8px) saturate(1.05);
  -webkit-backdrop-filter: blur(8px) saturate(1.05);
  pointer-events: none;
  overflow: hidden;
}

.gen-haze {
  position: absolute;
  inset: -20%;
  background:
    radial-gradient(ellipse 55% 45% at 50% 42%, rgba(148, 163, 184, 0.16), transparent 70%),
    radial-gradient(ellipse 80% 70% at 50% 100%, rgba(0, 0, 0, 0.35), transparent 55%);
  animation: gen-breathe 2.8s ease-in-out infinite;
  pointer-events: none;
}

.gen-overlay.video .gen-haze {
  background:
    radial-gradient(ellipse 55% 45% at 50% 42%, rgba(251, 191, 36, 0.14), transparent 70%),
    radial-gradient(ellipse 80% 70% at 50% 100%, rgba(0, 0, 0, 0.35), transparent 55%);
}

.gen-overlay .gen-cancel {
  pointer-events: auto;
  margin-top: 6px;
  height: 28px;
  padding: 0 14px 0 12px;
  border: 1px solid var(--studio-line-strong);
  border-radius: 999px;
  background: var(--studio-glass-2);
  color: var(--studio-text-strong);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}
.gen-overlay .gen-cancel:hover {
  background: rgba(239, 68, 68, 0.92);
  border-color: transparent;
  color: #fff;
}
.gen-stop {
  width: 8px;
  height: 8px;
  border-radius: 1.5px;
  background: currentColor;
  flex-shrink: 0;
}

.gen-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 30%,
    var(--studio-glass) 48%,
    transparent 66%
  );
  background-size: 220% 100%;
  animation: shimmer 2.2s ease-in-out infinite;
  pointer-events: none;
}

.gen-core {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 14px 16px;
  text-align: center;
  max-width: 92%;
}

.gen-core strong {
  font-size: 13px;
  font-weight: 650;
  color: var(--studio-ink);
  letter-spacing: 0.03em;
}

.gen-core em {
  font-style: normal;
  font-size: 11px;
  line-height: 1.4;
  color: var(--studio-text-faint);
  max-width: 200px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gen-orb {
  position: relative;
  width: 42px;
  height: 42px;
  margin-bottom: 4px;
}

.gen-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1.5px solid transparent;
  border-top-color: rgba(226, 232, 240, 0.9);
  border-right-color: rgba(226, 232, 240, 0.25);
  animation: spin 0.9s linear infinite;
}

.gen-ring.delay {
  inset: 6px;
  border-top-color: rgba(148, 163, 184, 0.55);
  border-right-color: transparent;
  border-bottom-color: rgba(148, 163, 184, 0.2);
  animation-duration: 1.35s;
  animation-direction: reverse;
}

.gen-overlay.video .gen-ring {
  border-top-color: rgba(253, 230, 138, 0.95);
  border-right-color: rgba(251, 191, 36, 0.22);
}
.gen-overlay.video .gen-ring.delay {
  border-top-color: rgba(251, 191, 36, 0.55);
  border-bottom-color: rgba(251, 191, 36, 0.18);
}

.gen-pulse {
  position: absolute;
  inset: 13px;
  border-radius: 50%;
  background: var(--studio-text-strong);
  box-shadow: 0 0 12px rgba(255, 255, 255, 0.25);
  animation: gen-dot 1.4s ease-in-out infinite;
}

.gen-overlay.video .gen-pulse {
  background: rgba(253, 230, 138, 0.95);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.28);
}

@keyframes gen-breathe {
  0%,
  100% {
    opacity: 0.7;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.04);
  }
}

@keyframes gen-dot {
  0%,
  100% {
    transform: scale(0.85);
    opacity: 0.55;
  }
  50% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes shimmer {
  0% {
    background-position: 120% 0;
  }
  100% {
    background-position: -80% 0;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.wf-node.video .frame {
  height: auto;
  min-height: 120px;
  background: var(--studio-panel-3);
}
.wf-node.video.mediocard .frame,
.wf-node.video .frame {
  /* 具体比例由 mediaFrameStyle（params.aspect）控制，默认与图片同为 16:9 */
  aspect-ratio: auto;
}

.frame img,
.frame video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.wf-node.mediocard .frame img,
.wf-node.mediocard .frame video {
  object-fit: cover;
  background: transparent;
}

.frame.previewable {
  cursor: zoom-in;
}

.frame video {
  cursor: zoom-in;
}

.vid-preview-play {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
  z-index: 2;
  display: grid;
  place-items: center;
  padding-left: 2px;
}

.vid-preview-play:hover {
  background: rgba(0, 0, 0, 0.72);
}

.frame-empty {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--studio-panel-3);
}
.wf-node.mediocard .frame-empty {
  background: transparent;
}
/* 空图卡：深灰底浅色图标；若改成浅色底则反转对比 */
.wf-node.mediocard:not(.video).empty .frame.bg-light {
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.02), transparent 42%),
    var(--frame-bg, #ffffff);
  border-color: rgba(0, 0, 0, 0.1);
}
.wf-node.mediocard:not(.video).empty .frame.bg-dark {
  border-color: var(--studio-glass-3);
}
.wf-node.mediocard:not(.video).empty .frame.bg-light .pic {
  color: rgba(0, 0, 0, 0.32);
}
.wf-node.mediocard:not(.video).empty .frame.bg-dark .pic {
  color: var(--studio-text-faint);
}
.media-cap .cap-rename {
  opacity: 0;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--studio-text-faint);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.wf-node.mediocard:hover .media-cap .cap-rename,
.wf-node.mediocard.selected .media-cap .cap-rename,
.wf-node.media.video:hover .media-cap .cap-rename,
.wf-node.media.video.selected .media-cap .cap-rename {
  opacity: 1;
}
.media-cap .cap-rename:hover {
  color: #fff;
  background: var(--studio-glass-2);
}

.empty-actions {
  display: flex;
  gap: 6px;
}

.empty-actions button {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--studio-line-strong);
  border-radius: 6px;
  background: var(--studio-glass-2);
  color: var(--studio-text-strong);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

.empty-actions button:hover {
  border-color: var(--studio-line-bright);
  color: #fff;
  background: var(--studio-glass-3);
}

.vid-ph,
.pic {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: transparent;
  border: 0;
  display: grid;
  place-items: center;
  color: var(--studio-line-bright);
  box-sizing: border-box;
}

.text-float {
  position: absolute;
  left: 50%;
  top: -40px;
  transform: translateX(-50%);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--studio-panel) 96%, transparent);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  white-space: nowrap;
}
.tf-btn {
  height: 28px;
  min-width: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
}
.tf-btn.wide {
  padding: 0 10px;
}
.tf-btn:hover {
  background: var(--studio-glass-3);
  color: #fff;
}
.tf-sep {
  width: 1px;
  height: 14px;
  margin: 0 2px;
  background: var(--studio-line-strong);
}
.text-cap .cap-rename {
  opacity: 0;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--studio-text-faint);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.wf-node.textcard:hover .cap-rename,
.wf-node.textcard.selected .cap-rename {
  opacity: 1;
}
.cap-rename:hover {
  color: var(--studio-ink);
  background: var(--studio-glass-2);
}
.text-t {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: var(--studio-glass-3);
  color: var(--studio-ink) !important;
  font-size: 10px;
  font-weight: 800;
  font-style: normal;
  line-height: 1;
}
.text-frame {
  position: relative;
  border-radius: 12px;
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-glass-2);
  padding: 14px 14px 44px;
  min-height: 200px;
  aspect-ratio: 1 / 1.05;
  box-sizing: border-box;
  box-shadow: none;
  cursor: default;
  overflow: hidden;
}
.wf-node.textcard .text-body {
  overflow: auto;
  max-height: 100%;
  padding-bottom: 36px; /* 给底部「替换」留空，避免叠字 */
  box-sizing: border-box;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.wf-node.textcard .text-body::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}
.wf-node.textcard.resized .text-frame,
.wf-node.textcard:has(.resize-handle:active) .text-frame {
  aspect-ratio: auto;
}
.wf-node.textcard:hover .text-frame,
.wf-node.textcard.selected .text-frame {
  border-color: var(--studio-line-bright);
  background: var(--studio-panel-3);
}
.text-frame.busy {
  border-color: var(--studio-line-strong);
}
.text-gen-overlay {
  border-radius: 12px;
  pointer-events: all;
}
.text-body {
  color: var(--studio-text);
  line-height: 1.55;
  word-break: break-word;
  max-height: 100%;
  overflow: auto;
  /* 可滚但不显示滚动条 */
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.text-body::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}
.text-body :deep(p) {
  margin: 0 0 0.5em;
}
.text-body :deep(p:last-child) {
  margin-bottom: 0;
}
.text-body :deep(code) {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.92em;
}
.text-ph {
  color: var(--studio-line-bright);
  font-size: 13px;
  line-height: 1.5;
}
.text-replace {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-bg);
  color: var(--studio-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  display: none;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
}
.wf-node.textcard:hover .text-replace,
.wf-node.textcard.selected .text-replace {
  display: inline-flex;
}
.text-replace:hover {
  background: var(--studio-panel);
}

.note-frame {
  border-radius: 8px;
  background: var(--studio-panel-3);
  border: 1px solid rgba(251, 191, 36, 0.22);
  padding: 8px;
  min-height: 100px;
  box-sizing: border-box;
  box-shadow: none;
}

.note-ico {
  color: var(--warn);
}

.note-prompt {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 88px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-text);
  padding: 4px 6px;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
  font-family: inherit;
  overflow: auto;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

.note-prompt::placeholder {
  color: var(--studio-line-bright);
}

.note-prompt:focus {
  outline: none;
}
.note-prompt::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}

.on-node-editor {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.on-prompt {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 64px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-0);
  color: var(--ink);
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.45;
  outline: none;
  font-family: inherit;
}

.on-prompt:focus {
  border-color: var(--accent);
}

.on-prompt.text-prompt {
  min-height: 96px;
  border: 0;
  background: transparent;
  padding: 4px 6px;
  font-size: 13px;
  color: var(--studio-text);
}

.on-prompt.text-prompt::placeholder {
  color: var(--studio-line-bright);
}

.text-frame .ref-row {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--line);
}

.ref-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ref-thumb {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--line);
  flex-shrink: 0;
  cursor: zoom-in;
}

.ref-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ref-x {
  position: absolute;
  top: 0;
  right: 0;
  width: 14px;
  height: 14px;
  border: 0;
  border-radius: 0 0 0 4px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.ref-btn {
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}

.ref-btn:hover {
  color: var(--accent);
  border-color: var(--line-strong);
}

.text-frame p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--studio-text-strong);
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.engine-card {
  border-radius: 8px;
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-glass-2);
  overflow: hidden;
  box-shadow: none;
  min-height: 120px;
}

.engine-cap {
  margin: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--studio-glass-2);
  background: var(--studio-panel-3);
}

.engine-body {
  display: grid;
  grid-template-columns: 72px 1fr 72px;
  gap: 4px;
  padding: 10px 8px 12px;
  min-height: 72px;
}

.port-col {
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  gap: 6px;
}

.port-row {
  display: flex;
  align-items: center;
}

.port-row.end {
  justify-content: flex-end;
}

.port-lab {
  font-size: 10px;
  color: var(--muted);
  line-height: 1.2;
  max-width: 68px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.engine-mid {
  display: grid;
  place-items: center;
  text-align: center;
  padding: 0 4px;
}

.engine-mid p {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.4;
}

.port-handle {
  width: 10px !important;
  height: 10px !important;
  border-width: 2px !important;
  border-style: solid !important;
  border-color: var(--studio-bg) !important;
  opacity: 0.75 !important;
}

.wf-node:hover .port-handle {
  opacity: 1 !important;
}

/*
  文本/图片节点端口：贴边 2px 锚点 + 外侧视觉 +
*/
.wf-node.port-plus .port-handle {
  width: 2px !important;
  height: 2px !important;
  min-width: 2px !important;
  min-height: 2px !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  opacity: 1 !important;
  border-radius: 0 !important;
  padding: 0 !important;
}
.wf-node.port-plus :deep(.vue-flow__handle-left),
.wf-node.port-plus :deep(.vue-flow__handle-right) {
  transform: translateY(-50%) !important;
}
.wf-node.port-plus :deep(.vue-flow__handle-left) {
  left: 0 !important;
  right: auto !important;
}
.wf-node.port-plus :deep(.vue-flow__handle-right) {
  right: 0 !important;
  left: auto !important;
}
.wf-node.port-plus .port-handle::before {
  content: '';
  position: absolute;
  top: 50%;
  width: 28px;
  height: 28px;
  border-radius: 999px;
}
.wf-node.port-plus .port-handle::after {
  content: '+';
  position: absolute;
  top: 50%;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1.5px solid var(--studio-ink);
  background: var(--studio-panel);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  color: var(--studio-ink);
  font-size: 13px;
  font-weight: 600;
  line-height: 19px;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.wf-node.port-plus :deep(.vue-flow__handle-left)::before,
.wf-node.port-plus :deep(.vue-flow__handle-left)::after {
  left: 0;
  transform: translate(calc(-100% - 3px), -50%);
}
.wf-node.port-plus :deep(.vue-flow__handle-right)::before,
.wf-node.port-plus :deep(.vue-flow__handle-right)::after {
  left: 100%;
  transform: translate(3px, -50%);
}
.wf-node.port-plus:hover .port-handle::after,
.wf-node.port-plus.selected .port-handle::after {
  opacity: 1;
}
:global(.vue-flow.connecting) .wf-node.port-plus .port-handle::after {
  opacity: 1;
}

.media-float {
  position: absolute;
  left: 50%;
  top: -44px;
  transform: translateX(-50%);
  z-index: 12;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--studio-panel) 96%, transparent);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  white-space: nowrap;
  max-width: min(92vw, 720px);
  overflow: visible;
}
.mf-btn,
.mf-ico {
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  padding: 0 8px;
}
.mf-ico {
  width: 28px;
  padding: 0;
  justify-content: center;
}
.mf-btn .chev {
  font-size: 9px;
  opacity: 0.7;
}
.mf-btn:hover,
.mf-ico:hover {
  background: var(--studio-glass-3);
  color: #fff;
}
.mf-btn.on {
  background: var(--studio-ink);
  color: var(--studio-inset);
}
.mf-btn.on .chev {
  opacity: 0.75;
  color: var(--studio-inset);
}
.mf-drop {
  position: relative;
}
.mf-sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--studio-line-strong);
  flex-shrink: 0;
}
.mf-bg {
  gap: 5px;
}
.mf-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid var(--studio-text-faint);
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.mf-color-panel {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 8;
  width: 168px;
  padding: 10px;
  border-radius: 12px;
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.mf-color {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1.5px solid transparent;
  cursor: pointer;
  padding: 0;
}
.mf-color.on,
.mf-color:hover {
  border-color: #fff;
}
.mf-menu {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 8;
  min-width: 140px;
  padding: 6px;
  border-radius: 12px;
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mf-menu button {
  border: 0;
  background: transparent;
  color: var(--studio-text);
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.mf-menu button:hover,
.mf-menu button.on {
  background: var(--studio-glass-2);
}
.derive-menu {
  min-width: 200px;
  padding: 6px;
}
.mf-menu-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 0;
  background: transparent;
  color: var(--studio-text);
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
  width: 100%;
}
.mf-menu-item strong {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}
.mf-menu-item span {
  font-size: 11px;
  color: var(--studio-text-soft);
  line-height: 1.3;
}
.mf-menu-item:hover {
  background: var(--studio-glass-2);
}
.mf-panel {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  z-index: 9;
  border-radius: 16px;
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  color: var(--studio-text);
  white-space: normal;
}
.mg-panel {
  display: grid;
  grid-template-columns: 148px minmax(220px, 260px);
  width: min(420px, 92vw);
  min-height: 220px;
  overflow: hidden;
}
.mg-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 8px;
  border-right: 1px solid var(--studio-glass-2);
  background: rgba(0, 0, 0, 0.18);
}
.mg-nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 10px 10px;
  cursor: pointer;
  text-align: left;
}
.mg-nav-item .arrow {
  opacity: 0.45;
  font-size: 14px;
}
.mg-nav-item:hover {
  background: var(--studio-glass-2);
  color: #fff;
}
.mg-nav-item.on {
  background: var(--studio-glass-3);
  color: #fff;
}
.mg-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 12px;
  min-width: 0;
}
.mg-title {
  font-size: 14px;
  font-weight: 700;
}
.mg-label {
  font-size: 12px;
  color: var(--studio-text-faint);
  font-weight: 650;
}
.mg-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.mg-chips button {
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: var(--studio-glass-2);
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}
.mg-chips button:hover {
  background: var(--studio-glass-3);
  color: #fff;
}
.mg-chips button.on {
  background: var(--studio-line-strong);
  color: #fff;
}
.mg-input {
  width: 100%;
  min-height: 88px;
  resize: vertical;
  border: 0;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  padding: 10px 12px;
  outline: none;
}
.mg-input::placeholder {
  color: var(--studio-line-bright);
}
.mg-gen {
  margin-top: auto;
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-ink);
  color: var(--studio-inset);
  font: inherit;
  font-size: 14px;
  font-weight: 750;
  cursor: pointer;
}
.mg-gen:hover {
  background: #f2f2f2;
}
.gs-panel {
  width: 280px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.gs-label {
  font-size: 12px;
  color: var(--studio-text-faint);
  font-weight: 650;
}
.gs-presets {
  display: flex;
  gap: 6px;
}
.gs-presets button {
  flex: 1;
  height: 30px;
  border: 0;
  border-radius: 10px;
  background: var(--studio-glass-2);
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}
.gs-presets button:hover,
.gs-presets button.on {
  background: var(--studio-line-strong);
  color: #fff;
}
.gs-board {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 5px;
  padding: 8px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.28);
}
.gs-cell {
  aspect-ratio: 1;
  border: 1px solid var(--studio-line-strong);
  border-radius: 5px;
  background: transparent;
  padding: 0;
  cursor: pointer;
}
.gs-cell.on {
  background: var(--studio-line-bright);
  border-color: var(--studio-text-faint);
}
.gs-cell:hover {
  border-color: var(--studio-line-bright);
}
.gs-foot {
  text-align: center;
  font-size: 13px;
  font-weight: 750;
  color: #fff;
  padding-top: 2px;
}
.wf-node.mediocard:hover .cap-rename,
.wf-node.mediocard.selected .cap-rename {
  opacity: 1;
}
.split-count {
  flex-shrink: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--studio-line-strong);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  display: inline-grid;
  place-items: center;
  line-height: 1;
}
.frame.split-frame {
  background: var(--studio-panel);
  padding: 6px;
  cursor: default;
}
.split-group-grid {
  width: 100%;
  height: 100%;
  display: grid;
  gap: 5px;
  min-height: 160px;
}
.split-cell {
  position: relative;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--studio-inset);
  cursor: zoom-in;
  min-height: 0;
}
.split-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.split-lab {
  position: absolute;
  left: 4px;
  top: 3px;
  z-index: 1;
  font-size: 9px;
  font-weight: 700;
  color: var(--studio-ink);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
  pointer-events: none;
}
.media-replace {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-bg);
  color: var(--studio-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  display: none;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  z-index: 4;
}
.wf-node.mediocard:hover .media-replace,
.wf-node.mediocard.selected .media-replace,
.wf-node.media.video:hover .media-replace,
.wf-node.media.video.selected .media-replace {
  display: inline-flex;
}
.media-replace:hover {
  background: var(--studio-panel);
}
.grid-split-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}
.grid-lines {
  width: 100%;
  height: 100%;
  display: grid;
  gap: 0;
}
.grid-cell {
  border: 1px solid var(--studio-text-soft);
  display: grid;
  place-items: center;
  color: var(--studio-text-strong);
  font-size: 13px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
.grid-split-bar {
  position: absolute;
  left: 50%;
  bottom: -48px;
  transform: translateX(-50%);
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--studio-panel) 96%, transparent);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  color: var(--studio-text-strong);
  font-size: 12px;
  white-space: nowrap;
}
.gs-ok {
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-ink);
  color: var(--studio-inset);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.gs-ok:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.gs-x {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-soft);
  font-size: 16px;
  cursor: pointer;
}
.gs-x:hover {
  color: #fff;
  background: var(--studio-glass-2);
}

.wf-node.muted {
  opacity: 0.42;
  filter: grayscale(0.55);
}

.wf-node.bypassed {
  outline: 1px dashed #f59e0b;
  outline-offset: 2px;
  opacity: 0.75;
}

.resize-handle {
  position: absolute;
  right: 2px;
  bottom: 2px;
  z-index: 50;
  width: 20px;
  height: 20px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--studio-text-faint);
  display: grid;
  place-items: center;
  opacity: 0.4;
  cursor: nwse-resize !important;
  touch-action: none;
  pointer-events: auto;
  box-shadow: none;
}
.wf-node:hover > .resize-handle,
.wf-node.selected > .resize-handle,
.resize-handle:hover,
.resize-handle:focus {
  opacity: 1;
  color: var(--studio-ink);
  background: transparent;
}
</style>
