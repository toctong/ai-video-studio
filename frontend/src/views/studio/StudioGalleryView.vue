<template>
  <div ref="homeEl" class="studio-home" @scroll.passive="onHomeScroll">
    <div class="plaza-back">
      <button type="button" class="btn-ghost" @click="$router.push('/home')">‹ 回开工台</button>
      <span class="plaza-back-label">完整广场</span>
    </div>
    <!-- 个人最近（次级；主列表在 /productions） -->
    <section class="sec recent-sec">
      <div class="sec-head">
        <h2>最近工作流</h2>
        <button type="button" class="all-link" @click="$router.push('/productions')">
          全部项目
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div class="recent-rail" v-loading="loading">
        <div class="start-wrap">
          <button type="button" class="start-card" :disabled="creating" @click="createBlank">
            <span class="plus">+</span>
            <strong>{{ creating ? '创建中…' : '开始创作' }}</strong>
          </button>
          <button type="button" class="model-pill" title="默认视频模型">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 5h16v3H4V5zm0 5h10v3H4v-3zm0 5h16v3H4v-3zm12-5h4v8h-4v-8z"
              />
            </svg>
            Seedance 2.0
          </button>
        </div>

        <article
          v-for="w in recentWorkflows"
          :key="w.id"
          class="proj-card"
          @click="openCanvas(w.id)"
        >
          <div class="proj-thumb" :style="coverStyle(w)">
            <MediaThumb v-if="w.thumbUrl" :url="w.thumbUrl" />
            <span v-else class="proj-ph">{{ coverLabel(w) }}</span>
            <div class="card-ops" @click.stop>
              <button type="button" title="打开" @click="openCanvas(w.id)">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z"/></svg>
              </button>
              <button type="button" title="复制" :disabled="busyId === w.id" @click="copyProject(w)">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M8 4h10a2 2 0 0 1 2 2v10h-2V6H8V4zm-4 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2zm0 2v10h10V10H4z"/></svg>
              </button>
              <button type="button" title="重命名" :disabled="busyId === w.id" @click="renameProject(w)">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M4 20h4l10.5-10.5-4-4L4 16v4zm13.9-13.9 1.4-1.4a1.5 1.5 0 0 1 2.1 2.1l-1.4 1.4-2.1-2.1z"/></svg>
              </button>
              <button type="button" title="删除" class="danger" :disabled="busyId === w.id" @click="deleteProject(w)">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M7 7h10v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7zm3-4h4l1 1h4v2H4V4h4l1-1zm0 6v9h2V9H10zm4 0v9h2V9h-2z"/></svg>
              </button>
            </div>
          </div>
          <div class="proj-meta">
            <strong :title="w.name">{{ w.name || '未命名' }}</strong>
            <span>{{ formatDate(w.updatedAt || w.createdAt) }}</span>
          </div>
        </article>

        <div v-if="!loading && !mine.length" class="rail-empty">还没有项目，点「开始创作」</div>
      </div>
    </section>

    <!-- 中央创作输入（参考即梦/Agent 输入框） -->
    <section class="composer-sec">
      <form class="composer" @submit.prevent="onPromptStart">
        <div class="composer-main">
          <div v-if="activeSkill" class="skill-chip">
            <div class="skill-chip-thumb" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path
                  fill="currentColor"
                  d="M22.7 19.3 15.4 12a6.5 6.5 0 1 0-3.4 3.4l7.3 7.3a1 1 0 0 0 1.4 0l2-2a1 1 0 0 0 0-1.4zM7.5 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
                />
              </svg>
            </div>
            <strong :title="activeSkill.name">{{ activeSkill.name }}</strong>
            <button type="button" class="skill-chip-x" title="移除技能" @click="clearSkill">×</button>
          </div>
          <div
            class="ref-stack"
            :class="{ empty: !refPreviews.length }"
            :style="refStackStyle"
            @mouseenter="refsExpanded = true"
            @mouseleave="refsExpanded = false"
          >
            <div
              class="ref-flyout"
              :class="{
                expanded: refsExpanded && refPreviews.length > 0,
                packed: refPreviews.length > 0 && !refsExpanded,
              }"
            >
              <template v-if="refPreviews.length">
                <div
                  v-for="(r, i) in refPreviews"
                  :key="r.id"
                  class="ref-card"
                  :title="r.name || '参考图'"
                >
                  <img :src="r.url" alt="" />
                  <button
                    type="button"
                    class="ref-del"
                    title="移除"
                    @click.stop="removeReference(i)"
                  >
                    ×
                  </button>
                </div>
                <button
                  v-if="refPreviews.length < 4"
                  type="button"
                  class="ref-card ref-add-card"
                  title="再加一张"
                  @click="addReferenceFromLocal(false)"
                >
                  <span class="ref-plus">+</span>
                </button>
              </template>
              <button
                v-else
                type="button"
                class="ref-card ref-add-card alone"
                :class="refEmptyKind"
                :title="refEmptyTitle"
                @click="addReferenceFromLocal(false)"
              >
                <span class="ref-plus">+</span>
                <em v-if="refEmptyKind !== 'kind-image'">参考内容</em>
              </button>
            </div>
          </div>

          <textarea
            ref="promptEl"
            v-model="prompt"
            rows="3"
            :placeholder="composerPlaceholder"
            @keydown="onPromptKeydown"
            @input="onPromptInput"
          />
        </div>

        <div class="composer-bar">
          <div class="composer-pills">
            <div class="pill-wrap">
              <button
                type="button"
                class="pill"
                :class="{ on: panel === 'mode' }"
                @click.stop="togglePanel('mode')"
              >
                <span class="ico wave">〰</span>
                {{ modeLabel }}
                <span class="chev">▾</span>
              </button>
              <div v-if="panel === 'mode'" class="pop mode-pop" @click.stop>
                <div class="pop-title">创作类型</div>
                <button
                  v-for="m in modes"
                  :key="m.id"
                  type="button"
                  class="pop-item"
                  :class="{ on: createMode === m.id, disabled: m.disabled }"
                  :disabled="m.disabled"
                  @click="selectMode(m)"
                >
                  <span class="mi">{{ m.icon }}</span>
                  <span>{{ m.label }}</span>
                  <span v-if="createMode === m.id" class="check">✓</span>
                </button>
              </div>
            </div>

            <div class="pill-wrap">
              <button
                type="button"
                class="pill"
                :class="{ on: panel === 'prefs' }"
                @click.stop="togglePanel('prefs')"
              >
                <span class="ico">☰</span>
                {{ prefsAuto ? '自动' : '自定义' }}
              </button>
              <div v-if="panel === 'prefs'" class="pop prefs-pop" @click.stop>
                <div class="prefs-head">
                  <strong>生成偏好</strong>
                  <label class="auto-tog">
                    自动
                    <input v-model="prefsAuto" type="checkbox" />
                  </label>
                </div>
                <div class="media-seg">
                  <button
                    type="button"
                    :class="{ on: mediaKind === 'image' }"
                    @click="mediaKind = 'image'"
                  >
                    图片
                  </button>
                  <button
                    type="button"
                    :class="{ on: mediaKind === 'video' }"
                    @click="mediaKind = 'video'"
                  >
                    视频
                  </button>
                </div>
                <div class="prefs-label">选择比例</div>
                <div class="ratio-row">
                  <button
                    v-for="r in ratios"
                    :key="r.id"
                    type="button"
                    class="ratio"
                    :class="{ on: aspect === r.id }"
                    @click="aspect = r.id"
                  >
                    <i :class="r.shape" />
                    {{ r.label }}
                  </button>
                </div>
                <div class="prefs-label">其他设置</div>
                <div class="prefs-selects">
                  <button type="button" class="sel">
                    <span>▣</span>
                    {{ mediaKind === 'video' ? '豆包 Seedance 2.0' : '豆包 Seedream 4.5' }}
                    <em>▾</em>
                  </button>
                  <button type="button" class="sel">
                    <span>HD</span>
                    {{ mediaKind === 'video' ? '720P+' : '2K' }}
                    <em>▾</em>
                  </button>
                </div>
              </div>
            </div>

            <div class="pill-wrap">
              <button
                type="button"
                class="pill"
                :class="{ on: panel === 'skills' || !!activeSkill }"
                @click.stop="togglePanel('skills')"
              >
                <span class="ico wrench" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <path
                      fill="currentColor"
                      d="M22.7 19.3 15.4 12a6.5 6.5 0 1 0-3.4 3.4l7.3 7.3a1 1 0 0 0 1.4 0l2-2a1 1 0 0 0 0-1.4zM7.5 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
                    />
                  </svg>
                </span>
                {{ activeSkill ? activeSkill.name : '使用技能' }}
              </button>
              <div v-if="panel === 'skills'" class="pop skills-pop" @click.stop>
                <div class="skills-top">
                  <label class="skills-search">
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M10.5 3a7.5 7.5 0 015.9 12.1l4 4a1 1 0 01-1.4 1.4l-4-4A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11z"
                      />
                    </svg>
                    <input v-model="skillQ" type="search" placeholder="搜索技能" />
                  </label>
                  <button type="button" class="more-skills" @click="goMoreSkills">
                    更多技能 ›
                  </button>
                </div>

                <div class="skills-list">
                  <button
                    v-for="s in filteredSkillList"
                    :key="s.id"
                    type="button"
                    class="skill-row"
                    :class="{ on: activeSkill?.id === s.id }"
                    @click="applySkill(s)"
                  >
                    <span class="sk-ico" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path
                          fill="currentColor"
                          d="M22.7 19.3 15.4 12a6.5 6.5 0 1 0-3.4 3.4l7.3 7.3a1 1 0 0 0 1.4 0l2-2a1 1 0 0 0 0-1.4zM7.5 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
                        />
                      </svg>
                    </span>
                    <div class="sk-body">
                      <div class="sk-title">
                        <strong>{{ s.name }}</strong>
                        <em v-if="s.official">官方</em>
                      </div>
                      <p>{{ s.desc }}</p>
                    </div>
                    <span v-if="activeSkill?.id === s.id" class="sk-check" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path
                          fill="currentColor"
                          d="M9.2 16.6 4.8 12.2l1.4-1.4 3 3 8-8 1.4 1.4-9.4 9.4z"
                        />
                      </svg>
                    </span>
                  </button>
                  <p v-if="!filteredSkillList.length" class="skills-empty">没有匹配的技能</p>
                </div>

                <div class="skills-foot">
                  <button type="button" @click="createSkillWithAgent">
                    + 用 Agent 创建技能
                  </button>
                </div>
              </div>
            </div>

            <div class="pill-wrap">
              <button
                type="button"
                class="pill round"
                :class="{ on: panel === 'mention' }"
                @click.stop="toggleMention"
              >
                @
              </button>
              <div v-if="panel === 'mention'" class="pop mention-pop" @click.stop>
                <template v-if="mentionView === 'assets'">
                  <div class="mention-assets-head">
                    <button type="button" class="back-btn" title="返回" @click="mentionView = 'main'">
                      <IconBack :size="16" />
                    </button>
                    <div class="pop-title">从资产添加</div>
                  </div>
                  <label class="mention-search">
                    <input v-model="assetPickQ" type="search" placeholder="搜索图片资产…" />
                  </label>
                  <div v-loading="assetPickLoading" class="mention-asset-list">
                    <button
                      v-for="a in filteredImageAssets"
                      :key="a.id"
                      type="button"
                      class="pop-item mention-item"
                      :disabled="refPreviews.length >= 4"
                      @click="addSubjectFromAsset(a)"
                    >
                      <img :src="a.url" alt="" />
                      <span>{{ a.name || '未命名' }}</span>
                    </button>
                    <p v-if="!assetPickLoading && !filteredImageAssets.length" class="mention-empty">
                      暂无图片资产
                    </p>
                  </div>
                </template>
                <template v-else>
                  <div class="pop-title">可能@的内容</div>
                  <div
                    class="create-subject"
                    @mouseenter="createSubjectOpen = true"
                    @mouseleave="createSubjectOpen = false"
                  >
                    <button
                      type="button"
                      class="pop-item"
                      :class="{ on: createSubjectOpen }"
                      @click="createSubjectOpen = !createSubjectOpen"
                    >
                      <span class="mi">+</span>
                      创建主体
                    </button>
                    <div v-if="createSubjectOpen" class="create-fly">
                      <button type="button" :disabled="uploadingRef || refPreviews.length >= 4" @click="addReferenceFromLocal()">
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path
                            fill="currentColor"
                            d="M12 3 7 9h3v6h4V9h3l-5-6zm-7 14v2h14v-2H5z"
                          />
                        </svg>
                        从本地添加
                      </button>
                      <button type="button" :disabled="refPreviews.length >= 4" @click="openAssetPicker">
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path
                            fill="currentColor"
                            d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm1 11 3.5-4.5 2.5 3 3.5-4.5L19 16H6zm3-7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
                          />
                        </svg>
                        从资产添加
                      </button>
                    </div>
                  </div>
                  <button
                    v-for="(r, i) in refPreviews"
                    :key="r.id"
                    type="button"
                    class="pop-item mention-item"
                    @click="insertMention(r)"
                  >
                    <img :src="r.url" alt="" />
                    <span>{{ r.name || `参考图 ${i + 1}` }}</span>
                  </button>
                </template>
              </div>
            </div>
          </div>

          <div class="composer-actions">
            <button
              type="submit"
              class="send"
              :disabled="(!prompt.trim() && !refPreviews.length) || creating"
              title="开始创作"
            >
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="currentColor" d="M12 4 5 14h4v6h6v-6h4L12 4z" />
              </svg>
            </button>
          </div>
        </div>
      </form>

      <div class="model-cards">
        <button type="button" class="mcard" @click="createMode = 'video'; mediaKind = 'video'">
          <span class="badge">New</span>
          <strong>视频 Seedance 2.0</strong>
          <em>全新上线</em>
        </button>
        <button type="button" class="mcard" @click="createMode = 'image'; mediaKind = 'image'">
          <strong>图片 Seedream 4.5</strong>
          <em>多图融合 · 4K</em>
        </button>
        <button type="button" class="mcard" @click="createMode = 'agent'">
          <strong>Agent 模式</strong>
          <em>生图 → 视频一条龙</em>
        </button>
      </div>
    </section>

    <!-- 发现 / 提示词 / 工作流 -->
    <section class="sec show-sec">
      <div class="plaza-tabs">
        <button
          v-for="t in plazaTabs"
          :key="t.id"
          type="button"
          class="plaza-tab"
          :class="{ on: plazaTab === t.id }"
          @click="plazaTab = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- 发现：社区发布 feed -->
      <template v-if="plazaTab === 'discover'">
        <div class="show-bar">
          <div class="filters">
            <button
              v-for="f in discoverFilters"
              :key="f.id"
              type="button"
              class="filter"
              :class="{ on: discoverKind === f.id }"
              @click="discoverKind = f.id"
            >
              {{ f.label }}
            </button>
          </div>
          <label class="search-sm">
            <input v-model="discoverQ" type="search" placeholder="搜索发现…" />
          </label>
          <button type="button" class="filter" :disabled="discoverLoading" @click="loadDiscover">
            刷新
          </button>
        </div>
        <div v-loading="discoverLoading" class="skill-grid">
          <article
            v-for="p in discoverPosts"
            :key="p.id"
            class="skill-card"
            @click="openDiscoverPost(p)"
          >
            <div class="skill-card-top">
              <strong>{{ p.title }}</strong>
              <button
                type="button"
                class="skill-plus"
                title="打开分享"
                @click.stop="openDiscoverPost(p)"
              >
                →
              </button>
            </div>
            <p>{{ p.description || kindDiscoverLabel(p.kind) }}</p>
            <div class="skill-card-foot">
              <span class="likes">♥ {{ formatLikes(p.likeCount || 0) }}</span>
              <span class="from">{{ kindDiscoverLabel(p.kind) }} · {{ p.authorName || '创作者' }}</span>
              <button
                type="button"
                class="skill-copy"
                title="复制分享链接"
                @click.stop="copyDiscoverLink(p)"
              >
                链接
              </button>
            </div>
          </article>
        </div>
        <p v-if="!discoverLoading && !discoverPosts.length" class="plaza-sub">
          暂无社区内容，可从项目或画布点「发布」；下方仍展示本地热门。
        </p>
        <h3 class="plaza-sub">本地热门技能</h3>
      </template>

      <!-- 技能：即梦式文字卡片 -->
      <template v-if="plazaTab === 'skill' || plazaTab === 'discover'">
        <div v-if="plazaTab === 'skill'" class="show-bar">
          <div class="filters">
            <button
              v-for="f in skillFilters"
              :key="f.id"
              type="button"
              class="filter"
              :class="{ on: skillFilter === f.id }"
              @click="skillFilter = f.id"
            >
              {{ f.label }}
            </button>
          </div>
          <label class="search-sm">
            <input v-model="skillPlazaQ" type="search" placeholder="搜索技能…" />
          </label>
        </div>

        <div class="skill-grid">
          <article
            v-for="s in plazaSkills"
            :key="s.id"
            class="skill-card"
            :class="{ on: activeSkill?.id === s.id }"
          >
            <div class="skill-card-top">
              <strong>{{ s.name }}</strong>
              <button type="button" class="skill-plus" title="使用技能" @click="applySkill(s)">+</button>
            </div>
            <p>{{ s.desc }}</p>
            <div class="skill-card-foot">
              <span class="likes">♥ {{ formatLikes(s.likes) }}</span>
              <span class="from">来自 {{ s.author }}</span>
              <button
                type="button"
                class="skill-copy"
                title="复制技能提示"
                @click.stop="copySkillPrompt(s)"
              >
                复制
              </button>
              <button
                v-if="plazaTab === 'skill'"
                type="button"
                class="skill-copy"
                title="发布到发现"
                @click.stop="publishSkill(s)"
              >
                发布
              </button>
            </div>
          </article>
        </div>
      </template>

      <!-- 工作流模板 -->
      <template v-if="plazaTab === 'workflow' || plazaTab === 'discover'">
        <div v-if="plazaTab === 'workflow'" class="show-bar">
          <div class="filters">
            <button
              v-for="f in showFilters"
              :key="f.id"
              type="button"
              class="filter"
              :class="{ on: showFilter === f.id }"
              @click="showFilter = f.id"
            >
              {{ f.label }}
            </button>
          </div>
          <label class="search-sm">
            <input v-model="showKeyword" type="search" placeholder="搜索工作流…" />
          </label>
        </div>
        <h3 v-if="plazaTab === 'discover'" class="plaza-sub">推荐工作流</h3>
        <div class="show-grid">
          <article
            v-for="card in plazaWorkflows"
            :key="card.id"
            class="show-card"
            :class="{ busy: creatingTemplateId === card.id }"
            @click="useTemplate(card)"
          >
            <div
              class="show-cover"
              :style="
                card.coverUrl
                  ? { backgroundImage: `url(${card.coverUrl})` }
                  : { background: 'linear-gradient(135deg, #1f2937, #111)' }
              "
            >
              <div class="show-badges">
                <span>工作流</span>
                <span v-if="card.category" class="lv">{{ card.category }}</span>
              </div>
              <div class="show-cap">
                <strong>{{ card.name }}</strong>
                <span>{{ card.author }}</span>
              </div>
            </div>
          </article>
        </div>
      </template>

      <!-- 镜头库：加载镜头脚本 → 创建带生图/视频节点的项目 -->
      <template v-if="plazaTab === 'shots'">
        <div class="show-bar">
          <div class="filters">
            <button
              type="button"
              class="filter"
              :class="{ on: shotFilter === 'all' }"
              @click="shotFilter = 'all'"
            >
              全部
            </button>
            <button
              v-for="c in shotCategories"
              :key="c"
              type="button"
              class="filter"
              :class="{ on: shotFilter === c }"
              @click="shotFilter = c"
            >
              {{ c }}
            </button>
          </div>
          <label class="search-sm">
            <input v-model="shotKeyword" type="search" placeholder="搜索镜头脚本…" />
          </label>
        </div>
        <p class="plaza-hint">
          点击镜头卡片：确认后创建项目并打开画布，可在脚本生成器里调整细案
        </p>
        <div class="show-grid" v-loading="shotLoading">
          <article
            v-for="item in plazaShots"
            :key="item.id"
            class="show-card"
            :class="{ busy: creatingShotId === item.id }"
            @click="useShotScript(item)"
          >
            <div class="show-cover" :style="{ backgroundImage: `url(${shotCover(item)})` }">
              <div class="show-badges">
                <span>镜头库</span>
                <span v-if="item.category" class="lv">{{ item.category }}</span>
              </div>
              <div class="show-cap">
                <strong>{{ item.label }}</strong>
                <span>{{ item.blurb || item.cameraFocus || '镜头脚本' }}</span>
              </div>
            </div>
          </article>
          <p v-if="!shotLoading && !plazaShots.length" class="plaza-empty">暂无镜头脚本</p>
        </div>
      </template>
    </section>

    <button
      v-show="showBackTop"
      type="button"
      class="back-top"
      title="回到顶部"
      aria-label="回到顶部"
      @click="scrollToTop"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M12 5.5 5.5 12H10v7h4v-7h4.5L12 5.5z" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { resolveAssetProjectId } from '@/constants/studio';
import {
  createWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  fetchWorkflows,
  updateWorkflow,
  type WorkflowRow,
} from '@/api/workflows';
import { defaultMediaPipelineGraph } from '@/utils/workflow-defaults';
import { compileShotToWorkflow } from '@/utils/compile-shot-workflow';
import {
  createBlankProduction,
  ensureCompiledProduction,
} from '@/utils/compile-production';
import {
  STUDIO_SKILL_TABS,
  type PlazaTab,
  type StudioSkill,
  setRuntimeSkillCatalog,
} from '@/utils/studio-skills';
import api from '@/api';
import IconBack from '@/components/IconBack.vue';
import MediaThumb from '@/components/MediaThumb.vue';
import { pickLocalFile, uploadProjectAsset } from '@/utils/upload-asset';
import { useLibrariesStore } from '@/stores/libraries';
import { libraryCoverForItem } from '@/libraries/cover-images';
import type { AnyLibraryItem, ShotLibraryItem } from '@/libraries/types';
import { copyText } from '@/utils/clipboard';
import { skillPromptText } from '@/utils/skill-catalog';
import {
  fetchDiscoverFeed,
  publishToDiscover,
  type DiscoverKind,
  type DiscoverPost,
} from '@/api/discover';
import { skillExportPackage } from '@/utils/export-packages';
import { fetchSkillPlaza, toCatalogSkill } from '@/api/skills';
import { fetchWorkflowsPlaza, type WorkflowPlazaItem } from '@/api/plaza';

const router = useRouter();
const route = useRoute();

const prompt = ref('');
const promptEl = ref<HTMLTextAreaElement | null>(null);
const showKeyword = ref('');
const showFilter = ref('all');
const loading = ref(false);
const creating = ref(false);
const mine = ref<WorkflowRow[]>([]);
const busyId = ref('');
const creatingTemplateId = ref('');
const creatingShotId = ref('');
const shotFilter = ref('all');
const shotKeyword = ref('');
const libraries = useLibrariesStore();

type CreateMode = 'agent' | 'image' | 'video';
type Panel = 'mode' | 'prefs' | 'skills' | 'mention' | null;

const createMode = ref<CreateMode>('agent');
const panel = ref<Panel>(null);
const prefsAuto = ref(true);
const mediaKind = ref<'image' | 'video'>('video');
const aspect = ref('smart');
const skillQ = ref('');
const activeSkill = ref<StudioSkill | null>(null);
const plazaTab = ref<PlazaTab>('skill');
const skillFilter = ref('all');
const skillPlazaQ = ref('');
const discoverLoading = ref(false);
const discoverPosts = ref<DiscoverPost[]>([]);
const discoverKind = ref<'all' | DiscoverKind>('all');
const discoverQ = ref('');
const discoverFilters: Array<{ id: 'all' | DiscoverKind; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'production', label: '项目' },
  { id: 'workflow', label: '工作流' },
  { id: 'template', label: '模板' },
  { id: 'skill', label: '技能' },
];

async function loadDiscover() {
  discoverLoading.value = true;
  try {
    discoverPosts.value = await fetchDiscoverFeed({
      kind: discoverKind.value === 'all' ? undefined : discoverKind.value,
      q: discoverQ.value.trim() || undefined,
      take: 40,
    });
  } catch {
    discoverPosts.value = [];
  } finally {
    discoverLoading.value = false;
  }
}

function kindDiscoverLabel(kind: string) {
  const map: Record<string, string> = {
    skill: '技能',
    workflow: '工作流',
    template: '模板',
    production: '项目',
  };
  return map[kind] || kind;
}

function openDiscoverPost(p: DiscoverPost) {
  if (p.shareToken) router.push(`/share/${p.shareToken}`);
  else router.push(`/share/${p.id}`);
}

async function copyDiscoverLink(p: DiscoverPost) {
  const token = p.shareToken || p.id;
  const url = `${window.location.origin}/share/${token}`;
  const ok = await copyText(url);
  ElMessage[ok ? 'success' : 'error'](ok ? '分享链接已复制' : '复制失败');
}

async function publishSkill(s: StudioSkill) {
  try {
    const post = await publishToDiscover({
      kind: 'skill',
      title: s.name,
      description: s.desc || '',
      sourceId: s.id,
      payload: skillExportPackage(s),
    });
    const url = `${window.location.origin}/share/${post.shareToken}`;
    await copyText(url);
    ElMessage.success('技能已发布，分享链接已复制');
    if (plazaTab.value === 'discover') void loadDiscover();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '发布失败');
  }
}
const refPreviews = ref<
  Array<{ id: string; url: string; name: string; file?: File; local?: boolean }>
>([]);
const refsExpanded = ref(false);
const uploadingRef = ref(false);
const createSubjectOpen = ref(false);
const mentionView = ref<'main' | 'assets'>('main');
const assetPickQ = ref('');
const assetPickLoading = ref(false);
const studioAssets = ref<Array<{ id: string; url: string; name: string; type?: string }>>([]);
const homeEl = ref<HTMLElement | null>(null);
const showBackTop = ref(false);

type MentionAsset = { id: string; url: string; name: string; type?: string };

function isImageAsset(a: MentionAsset) {
  if (/\.(mp4|webm|mov)(\?|$)/i.test(a.url || '') || /video/i.test(String(a.type || ''))) {
    return false;
  }
  return (
    /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(a.url || '') ||
    /storyboard|scene|character|cover|image/i.test(String(a.type || '')) ||
    /^data:image\//i.test(a.url || '')
  );
}

const filteredImageAssets = computed(() => {
  const q = assetPickQ.value.trim().toLowerCase();
  return studioAssets.value.filter((a) => {
    if (!a.url || !isImageAsset(a)) return false;
    if (refPreviews.value.some((r) => r.id === a.id || r.url === a.url)) return false;
    if (q && !String(a.name || '').toLowerCase().includes(q)) return false;
    return true;
  });
});

const modes = [
  { id: 'agent' as const, label: 'Agent 模式', icon: '〰', disabled: false },
  { id: 'image' as const, label: '图片生成', icon: '🖼', disabled: false },
  { id: 'video' as const, label: '视频生成', icon: '🎬', disabled: false },
  { id: 'music' as const, label: '音乐生成', icon: '♪', disabled: true },
  { id: 'voice' as const, label: '配音生成', icon: '🎙', disabled: true },
  { id: 'avatar' as const, label: '数字人', icon: '👤', disabled: true },
  { id: 'motion' as const, label: '动作模仿', icon: '🕺', disabled: true },
];

const ratios = [
  { id: 'smart', label: '智能', shape: 'sq' },
  { id: '21:9', label: '21:9', shape: 'wide' },
  { id: '16:9', label: '16:9', shape: 'wide' },
  { id: '4:3', label: '4:3', shape: 'sq' },
  { id: '1:1', label: '1:1', shape: 'sq' },
  { id: '3:4', label: '3:4', shape: 'tall' },
  { id: '9:16', label: '9:16', shape: 'tall' },
];

const skillList = ref<StudioSkill[]>([]);
const plazaTabs = STUDIO_SKILL_TABS;
const skillFilters = [
  { id: 'all', label: '全部' },
  { id: 'story', label: '短剧影视' },
  { id: 'video', label: '视频' },
  { id: 'image', label: '图片' },
  { id: 'commerce', label: '电商' },
  { id: 'design', label: '设计' },
];
const showFilters = ref<{ id: string; label: string }[]>([{ id: 'all', label: '全部' }]);
const showCards = ref<WorkflowPlazaItem[]>([]);

const modeLabel = computed(
  () => modes.find((m) => m.id === createMode.value)?.label || 'Agent 模式',
);

/** 空态上传卡：生图=竖卡仅 +；视频/Agent=方卡 +「参考内容」 */
const refEmptyKind = computed(() =>
  createMode.value === 'image' ? 'kind-image' : 'kind-video',
);

const refEmptyTitle = computed(() =>
  createMode.value === 'image' ? '上传参考图' : '上传参考内容',
);

/** 外层占位始终按叠放宽度，展开用绝对定位浮层，不挤开输入区 */
const refStackStyle = computed(() => {
  const n = refPreviews.value.length
    ? refPreviews.value.length + (refPreviews.value.length < 4 ? 1 : 0)
    : 1;
  return { '--ref-n': String(Math.max(n, 1)) };
});

const composerPlaceholder = computed(() => {
  if (activeSkill.value) {
    return `继续补充「${activeSkill.value.name}」的主题或细节…`;
  }
  if (createMode.value === 'image') {
    return '上传参考图、输入文字或 @ 主体，描述你想生成的图片。';
  }
  if (createMode.value === 'video') {
    return '上传参考素材，输入文字或 @ 参考内容，自由组合图文元素。例如：@图片1 参考构图与角色。';
  }
  return '输入想法或上传参考图，支持 “/” 使用技能，@ 创建/引用主体，和 Agent 一起创作';
});

const filteredSkillList = computed(() => {
  const q = skillQ.value.trim().toLowerCase();
  let list = skillList.value;
  if (q) {
    list = list.filter(
      (s) => s.name.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q),
    );
    return list;
  }
  // 下拉默认：官方优先，控制高度
  return [...list]
    .sort((a, b) => Number(!!b.official) - Number(!!a.official) || b.likes - a.likes)
    .slice(0, 8);
});

const plazaSkills = computed(() => {
  const q = skillPlazaQ.value.trim().toLowerCase();
  let list = skillList.value;
  if (plazaTab.value === 'discover') {
    list = [...list].sort((a, b) => b.likes - a.likes).slice(0, 8);
  } else {
    if (skillFilter.value !== 'all') {
      list = list.filter((s) => s.category === skillFilter.value);
    }
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.desc.toLowerCase().includes(q) ||
          s.author.toLowerCase().includes(q),
      );
    }
  }
  return list;
});

const shotLoading = computed(() => !!libraries.loading.shot);
const shotCategories = computed(() => libraries.categoriesOf('shot').slice(0, 12));
const plazaShots = computed(() => {
  const q = shotKeyword.value.trim().toLowerCase();
  let list = libraries.itemsOf('shot') as ShotLibraryItem[];
  if (shotFilter.value !== 'all') {
    list = list.filter((i) => i.category === shotFilter.value);
  }
  if (q) {
    list = list.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        String(i.blurb || '')
          .toLowerCase()
          .includes(q) ||
        String(i.category || '')
          .toLowerCase()
          .includes(q),
    );
  }
  return list;
});

function shotCover(item: AnyLibraryItem) {
  return libraryCoverForItem(item, 'shot');
}

function shotPromptOf(item: ShotLibraryItem) {
  const sub =
    (item.tags || []).find((t) => t && t !== '画风' && t !== '动漫风') || '';
  const styleLock = [item.category, sub].filter(Boolean).join('·');
  return [
    item.seed || item.blurb,
    item.cameraFocus && `镜头：${item.cameraFocus}`,
    item.moveFocus && `动作：${item.moveFocus}`,
    item.vfxFocus && `特效：${item.vfxFocus}`,
    item.sceneHint && `场景：${item.sceneHint}`,
    styleLock
      ? `画风：${styleLock}；动漫呈现；禁止真人、禁止照片级皮肤`
      : '画风：动漫/国漫/动画电影美学；禁止真人、禁止照片级皮肤',
  ]
    .filter(Boolean)
    .join('\n');
}

const filteredShowCards = computed(() => {
  const q = showKeyword.value.trim().toLowerCase();
  return showCards.value.filter((c) => {
    if (showFilter.value !== 'all') {
      const tagHit = (c.tags || []).some((t) => t === showFilter.value);
      if (!tagHit && c.category !== showFilter.value) return false;
    }
    if (
      q &&
      !c.name.toLowerCase().includes(q) &&
      !c.desc.toLowerCase().includes(q) &&
      !c.author.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
});

const plazaWorkflows = computed(() => {
  if (plazaTab.value === 'discover') return showCards.value.slice(0, 6);
  return filteredShowCards.value;
});

function formatLikes(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function togglePanel(p: Panel) {
  if (panel.value === p) {
    panel.value = null;
    createSubjectOpen.value = false;
    mentionView.value = 'main';
    return;
  }
  panel.value = p;
  if (p !== 'mention') {
    createSubjectOpen.value = false;
    mentionView.value = 'main';
  }
}

function toggleMention() {
  togglePanel('mention');
}

function selectMode(m: (typeof modes)[number]) {
  if (m.disabled) return;
  if (m.id === 'agent' || m.id === 'image' || m.id === 'video') {
    createMode.value = m.id;
    if (m.id === 'image') mediaKind.value = 'image';
    if (m.id === 'video') mediaKind.value = 'video';
  }
  panel.value = null;
}

const IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp';

function isImageFile(file: File) {
  if (file.type.startsWith('image/')) return true;
  if (file.type.startsWith('video/')) return false;
  return /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
}

function pushSubject(
  row: { id: string; url: string; name: string; file?: File; local?: boolean },
  autoMention = true,
) {
  if (refPreviews.value.length >= 4) {
    ElMessage.warning('最多 4 张参考图');
    return null;
  }
  if (refPreviews.value.some((r) => r.id === row.id || r.url === row.url)) {
    const exist = refPreviews.value.find((r) => r.id === row.id || r.url === row.url)!;
    if (autoMention) insertMention(exist);
    return exist;
  }
  const name = row.name || `参考图 ${refPreviews.value.length + 1}`;
  const item = {
    id: row.id || String(Date.now()),
    url: row.url,
    name,
    file: row.file,
    local: Boolean(row.local || row.file),
  };
  refPreviews.value.push(item);
  if (autoMention) insertMention(item);
  return item;
}

async function addReferenceFromLocal(autoMention = true) {
  createSubjectOpen.value = false;
  if (refPreviews.value.length >= 4) {
    ElMessage.warning('最多 4 张参考图');
    return;
  }
  const files = await pickLocalFile({ accept: IMAGE_ACCEPT });
  const file = files[0];
  if (!file) return;
  if (!isImageFile(file)) {
    ElMessage.warning('仅支持上传图片，不支持视频');
    return;
  }
  // 仅本地预览，点「开始创作」时再写入项目资产
  const blobUrl = URL.createObjectURL(file);
  const name = file.name.replace(/\.[^.]+$/, '') || `参考图 ${refPreviews.value.length + 1}`;
  pushSubject(
    {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: blobUrl,
      name,
      file,
      local: true,
    },
    autoMention,
  );
}

async function openAssetPicker() {
  createSubjectOpen.value = false;
  mentionView.value = 'assets';
  assetPickQ.value = '';
  assetPickLoading.value = true;
  try {
    const pid = resolveAssetProjectId({});
    const { data } = await api.get(`/projects/${pid}/assets`);
    const rows = Array.isArray(data) ? data : data?.items || [];
    studioAssets.value = rows.map((a: any) => ({
      id: String(a.id || ''),
      url: String(a.url || ''),
      name: String(a.name || ''),
      type: String(a.type || ''),
    }));
  } catch {
    studioAssets.value = [];
    ElMessage.error('加载资产失败');
  } finally {
    assetPickLoading.value = false;
  }
}

function addSubjectFromAsset(a: MentionAsset) {
  pushSubject({
    id: a.id,
    url: a.url,
    name: a.name || '未命名',
  });
  mentionView.value = 'main';
}

function removeReference(i: number) {
  const [removed] = refPreviews.value.splice(i, 1);
  if (removed?.local && removed.url.startsWith('blob:')) {
    URL.revokeObjectURL(removed.url);
  }
  if (!refPreviews.value.length) refsExpanded.value = false;
}

/** 开始创作前：把本地参考图上传到项目资产，返回可用于工作流的 URL 列表 */
async function persistLocalRefs() {
  const urls: string[] = [];
  for (const r of refPreviews.value) {
    if (r.file && r.local) {
      const asset = await uploadProjectAsset(resolveAssetProjectId({}), r.file, {
        type: 'storyboard',
        name: r.file.name || r.name,
      });
      if (!asset.url) throw new Error(`参考图「${r.name}」上传失败`);
      if (r.url.startsWith('blob:')) URL.revokeObjectURL(r.url);
      r.url = asset.url;
      r.id = asset.id || r.id;
      r.local = false;
      r.file = undefined;
      urls.push(asset.url);
      continue;
    }
    if (r.url) urls.push(r.url);
  }
  return urls;
}

async function copySkillPrompt(s: StudioSkill) {
  const text = skillPromptText(s);
  if (!text) {
    ElMessage.warning('该技能暂无可复制提示');
    return;
  }
  const ok = await copyText(text);
  if (ok) ElMessage.success('已复制技能提示');
  else ElMessage.error('复制失败');
}

function applySkill(s: StudioSkill) {
  // 再次点选同一技能 → 取消（对齐下拉里的勾选态）
  if (activeSkill.value?.id === s.id) {
    clearSkill();
    return;
  }
  activeSkill.value = s;
  if (s.mode === 'image' || s.mode === 'video' || s.mode === 'agent') {
    createMode.value = s.mode;
    if (s.mode === 'image') mediaKind.value = 'image';
    if (s.mode === 'video') mediaKind.value = 'video';
  }
  const cur = prompt.value.trim();
  const skeleton = skillPromptText(s) || s.prompt;
  if (!cur || skillList.value.some((x) => x.prompt === cur || cur.startsWith(x.prompt))) {
    prompt.value = skeleton;
  }
  panel.value = null;
  promptEl.value?.focus();
}

function clearSkill() {
  activeSkill.value = null;
  panel.value = null;
}

function goMoreSkills() {
  plazaTab.value = 'skill';
  panel.value = null;
  nextTick(() => {
    document.querySelector('.show-sec')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function createSkillWithAgent() {
  panel.value = null;
  createMode.value = 'agent';
  activeSkill.value = null;
  prompt.value = '帮我设计一个可复用的创作技能：给出技能名称、适用场景、提示词模板与使用步骤。主题：';
  promptEl.value?.focus();
}

function insertMention(r: { id: string; name: string }) {
  const idx = refPreviews.value.findIndex((x) => x.id === r.id);
  const n = (idx >= 0 ? idx : 0) + 1;
  const label = r.name || `参考图${n}`;
  const t = prompt.value;
  const cleaned = t.replace(/(?:^|\s)@$/, ' ').replace(/\s*$/, '');
  const insert = `@${label} `;
  prompt.value = cleaned ? `${cleaned} ${insert}` : insert;
  panel.value = null;
  createSubjectOpen.value = false;
  mentionView.value = 'main';
  promptEl.value?.focus();
}

function onPromptKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void onPromptStart();
    return;
  }
  if (e.key === '/') {
    // 输入 / 时打开技能（延迟到字符写入后）
    setTimeout(() => {
      if (prompt.value.endsWith('/') || prompt.value.includes(' /')) togglePanel('skills');
    }, 0);
  }
  if (e.key === '@') {
    setTimeout(() => togglePanel('mention'), 0);
  }
}

function onPromptInput() {
  /* reserved for slash autocomplete */
}

watch(mediaKind, (k) => {
  if (createMode.value !== 'agent') {
    createMode.value = k === 'image' ? 'image' : 'video';
  }
});

const recentWorkflows = computed(() => {
  const list = [...mine.value].sort((a, b) =>
    String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
  );
  return list.slice(0, 6);
});

function coverLabel(w: WorkflowRow) {
  return (w.tags?.[0] || w.name || '画布').slice(0, 2);
}

function coverStyle(w: WorkflowRow) {
  if (w.thumbUrl) return {};
  const hues = [210, 250, 180, 30, 300];
  const h = hues[(w.name?.length || 0) % hues.length];
  return {
    background: `radial-gradient(circle at 28% 30%, hsla(${h},55%,42%,0.4), transparent 55%), #1a1a1e`,
  };
}

function formatDate(v?: string) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return v;
  }
}

async function load() {
  loading.value = true;
  try {
    const [wf, plaza, workflowsPlaza] = await Promise.all([
      fetchWorkflows(),
      fetchSkillPlaza().catch(() => null),
      fetchWorkflowsPlaza().catch(() => null),
    ]);
    mine.value = wf;
    if (plaza) {
      skillList.value = plaza.skills.map(toCatalogSkill);
      setRuntimeSkillCatalog(skillList.value);
    }
    if (workflowsPlaza) {
      showCards.value = workflowsPlaza.items;
      showFilters.value = workflowsPlaza.filters?.length
        ? workflowsPlaza.filters.some((f) => f.id === 'all')
          ? workflowsPlaza.filters
          : [{ id: 'all', label: '全部' }, ...workflowsPlaza.filters]
        : [{ id: 'all', label: '全部' }];
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function openCanvas(id: string) {
  router.push(`/w/${id}`);
}

async function useTemplate(card: WorkflowPlazaItem) {
  if (creatingTemplateId.value) return;
  if (!card.graph || typeof card.graph !== 'object') {
    ElMessage.info('该工作流尚未提供可落地的 graph，等 Hub 数据就绪后再试');
    return;
  }
  creatingTemplateId.value = card.id;
  try {
    let graph: unknown = card.graph;
    if (typeof graph === 'string') graph = JSON.parse(graph);
    else if (graph && typeof graph === 'object' && 'payload' in (graph as any)) {
      const p = (graph as any).payload;
      graph = typeof p === 'string' ? JSON.parse(p) : p;
    }
    const w = await createWorkflow({
      name: card.name,
      description: card.desc,
      graph: graph as any,
      tags: ['工作流', ...(card.tags || []).slice(0, 4)],
    });
    ElMessage.success(`已创建「${card.name}」`);
    await load();
    openCanvas(w.id);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
  } finally {
    creatingTemplateId.value = '';
  }
}

/** 镜头库：扩写细案 → 短剧流水线（全能参考）→ 打开画布 */
async function useShotScript(item: ShotLibraryItem) {
  if (creatingShotId.value) return;
  try {
    await ElMessageBox.confirm(
      `将扩写「${item.label}」并编译为短剧工作流（定妆→设定板→场景→分镜宫格→全能参考成片）。`,
      '打开镜头流水线',
      {
        confirmButtonText: '编译并打开',
        cancelButtonText: '取消',
        type: 'info',
        autofocus: false,
      },
    );
  } catch {
    return;
  }
  creatingShotId.value = item.id;
  try {
    ElMessage.info('正在扩写细案并编译工作流…');
    const w = await compileShotToWorkflow({
      shotId: item.id,
      label: item.label,
      blurb: item.blurb,
      category: item.category,
      tags: item.tags,
      durationSec: item.durationSec,
    });
    ElMessage.success(`已创建「${w.name || item.label}」`);
    await load();
    openCanvas(w.id);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
  } finally {
    creatingShotId.value = '';
  }
}

async function onPromptStart() {
  const skill = activeSkill.value;
  const text = prompt.value.trim() || skill?.prompt || '根据参考图创作';
  if (!text && !refPreviews.value.length) return;
  creating.value = true;
  uploadingRef.value = true;
  panel.value = null;
  try {
    const refUrls = await persistLocalRefs();
    const mode = createMode.value;
    const name =
      skill?.name ||
      text.slice(0, 40) ||
      (mode === 'image' ? '图片创作' : mode === 'video' ? '视频创作' : 'Agent 创作');
    const { production } = await ensureCompiledProduction({
      create: {
        name,
        description:
          skill?.desc ||
          (mode === 'image' ? '文生图 / 图生图' : mode === 'video' ? '文生视频 / 图生视频' : '生图 → 视频'),
        script: text,
        tags: [
          '广场',
          mode === 'image' ? '生图' : mode === 'video' ? '视频' : 'Agent',
          aspect.value,
          ...(skill ? ['技能', skill.name] : []),
        ],
        meta: { chatMode: mode, fromPlaza: true },
        status: 'draft',
      },
      forceRecompile: true,
    });
    if (production.workflowId) {
      await updateWorkflow(production.workflowId, {
        graph: defaultMediaPipelineGraph(text, {
          referenceImage: refUrls[0] || '',
          mode,
        }),
      });
    }
    router.push({
      path: `/w/${production.workflowId}`,
      query: { productionId: production.id },
    });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
  } finally {
    creating.value = false;
    uploadingRef.value = false;
  }
}

async function createBlank() {
  creating.value = true;
  try {
    const production = await createBlankProduction({ name: '未命名' });
    router.push({
      path: `/w/${production.workflowId}`,
      query: { productionId: production.id },
    });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
  } finally {
    creating.value = false;
  }
}

async function renameProject(w: WorkflowRow) {
  try {
    const { value } = await ElMessageBox.prompt('新名称', '重命名', {
      inputValue: w.name || '',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValidator: (v) => (!!String(v || '').trim() ? true : '名称不能为空'),
    });
    const name = String(value || '').trim();
    busyId.value = w.id;
    await updateWorkflow(w.id, { name });
    ElMessage.success('已重命名');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '重命名失败');
  } finally {
    busyId.value = '';
  }
}

async function copyProject(w: WorkflowRow) {
  busyId.value = w.id;
  try {
    const copy = await duplicateWorkflow(w.id);
    ElMessage.success('已复制');
    await load();
    openCanvas(copy.id);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '复制失败');
  } finally {
    busyId.value = '';
  }
}

async function deleteProject(w: WorkflowRow) {
  try {
    await ElMessageBox.confirm(
      `确认删除「${w.name || '未命名'}」？将同时删除该工作流的运行记录与产出资产，此操作不可恢复。`,
      '删除',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    );
    busyId.value = w.id;
    await deleteWorkflow(w.id);
    ElMessage.success('已删除');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '删除失败');
  } finally {
    busyId.value = '';
  }
}

onMounted(() => {
  const tab = String(route.query.tab || '').trim();
  if (tab === 'discover' || tab === 'skill' || tab === 'workflow' || tab === 'shots') {
    plazaTab.value = tab;
  }
  void load();
  document.addEventListener('mousedown', closePanelsOutside);
});

watch(
  () => plazaTab.value,
  async (tab) => {
    if (tab === 'discover') {
      void loadDiscover();
      return;
    }
    if (tab !== 'shots') return;
    try {
      await libraries.ensureKind('shot');
    } catch (e: any) {
      ElMessage.error(e?.message || '镜头库加载失败');
    }
  },
);

watch([discoverKind, discoverQ], () => {
  if (plazaTab.value === 'discover') void loadDiscover();
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', closePanelsOutside);
  for (const r of refPreviews.value) {
    if (r.local && r.url.startsWith('blob:')) URL.revokeObjectURL(r.url);
  }
});

function onHomeScroll() {
  const el = homeEl.value;
  showBackTop.value = (el?.scrollTop || 0) > 320;
}

function scrollToTop() {
  homeEl.value?.scrollTo({ top: 0, behavior: 'smooth' });
}

function closePanelsOutside(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (!t?.closest?.('.composer-sec')) {
    panel.value = null;
    createSubjectOpen.value = false;
    mentionView.value = 'main';
  }
}
</script>

<style scoped>
.studio-home {
  --ctl-2: color-mix(in srgb, var(--ctl) 82%, var(--ink) 18%);
  --pop: var(--surface);
  --on-accent: var(--accent-ink);
  height: 100%;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 28px 28px 64px;
  box-sizing: border-box;
  background: var(--shell-bg);
  color: var(--ink);
  scrollbar-gutter: stable;
}
.plaza-back {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.plaza-back-label {
  font-size: 12px;
  font-weight: 650;
  color: var(--muted);
}

.back-top {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 40;
  width: 42px;
  height: 42px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 92%, var(--ink));
  color: var(--ink);
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: var(--shadow);
  backdrop-filter: blur(8px);
}

.back-top:hover {
  background: var(--ctl-2);
  border-color: var(--line-strong);
}

.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.sec-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.sec-sub {
  font-size: 12px;
  color: var(--muted);
}

.all-link {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.all-link:hover {
  color: var(--ink);
}

.recent-rail {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: thin;
}

.start-wrap {
  flex: 0 0 240px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.start-card {
  width: 240px;
  aspect-ratio: 16 / 10;
  height: auto;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.start-card:hover:not(:disabled) {
  background: var(--panel-2);
  border-color: var(--line-strong);
}

.start-card:disabled {
  opacity: 0.55;
  cursor: default;
}

.start-card .plus {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--ctl-2);
  color: var(--ink);
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 300;
  line-height: 1;
}

.start-card strong {
  font-size: 14px;
  font-weight: 650;
}

.model-pill {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  color: var(--muted);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: default;
}

.proj-card {
  flex: 0 0 240px;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
  min-width: 0;
}

.proj-card.tall {
  flex: none;
  width: auto;
}

.proj-thumb {
  width: 100%;
  aspect-ratio: 16 / 10;
  height: auto;
  border-radius: 14px;
  overflow: hidden;
  background: var(--panel);
  position: relative;
  border: 1px solid transparent;
}

.proj-card:hover .proj-thumb {
  border-color: var(--line-strong);
}

.proj-thumb :deep(.media-thumb) {
  width: 100%;
  height: 100%;
}
.proj-thumb :deep(.media-thumb img),
.proj-thumb :deep(.media-thumb video) {
  filter: grayscale(0.15);
}

.proj-ph {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 20px;
  font-weight: 750;
  color: var(--studio-text-strong);
}

.proj-meta {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0 2px;
}

.proj-meta strong {
  font-size: 13px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.proj-meta span {
  font-size: 11px;
  color: var(--muted);
}

.card-ops {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.14s ease, transform 0.14s ease;
  z-index: 2;
}

.proj-card:hover .card-ops,
.proj-card:focus-within .card-ops {
  opacity: 1;
  transform: translateY(0);
}

.card-ops button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: rgba(12, 14, 18, 0.72);
  color: var(--studio-ink);
  cursor: pointer;
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-sm);
}

.card-ops button:hover:not(:disabled) {
  background: var(--studio-line-strong);
}

.card-ops button:disabled {
  opacity: 0.45;
  cursor: wait;
}

.card-ops button.danger:hover:not(:disabled) {
  background: rgba(220, 68, 68, 0.85);
  color: #fff;
}

.rail-empty {
  align-self: center;
  color: var(--muted);
  font-size: 13px;
  padding: 24px 12px;
}

.search-sm {
  display: flex;
  align-items: center;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  padding: 0 12px;
  margin-left: auto;
}

.search-sm input {
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  width: 140px;
  font-size: 12px;
}

.composer-sec {
  margin: 48px auto 0;
  max-width: 780px;
  position: relative;
}

.composer {
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--panel);
  padding: 14px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow);
  overflow: visible;
}

.composer-main {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  overflow: visible;
  position: relative;
  z-index: 2;
}

.skill-chip {
  flex-shrink: 0;
  width: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  position: relative;
}

.skill-chip-thumb {
  width: 56px;
  height: 68px;
  border-radius: 10px;
  border: 1px solid var(--line-strong);
  background: linear-gradient(145deg, var(--ctl-2), var(--ctl));
  color: var(--muted);
  display: grid;
  place-items: center;
}

.skill-chip strong {
  font-size: 11px;
  font-weight: 650;
  color: var(--ink);
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.skill-chip-x {
  position: absolute;
  top: -4px;
  right: 2px;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: none;
}

.skill-chip:hover .skill-chip-x {
  display: grid;
  place-items: center;
}

.ref-stack {
  --ref-card-w: 46px;
  --ref-card-h: 62px;
  --ref-overlap: 30px;
  --ref-n: 1;
  position: relative;
  flex-shrink: 0;
  /* 始终只占叠放态宽度，展开不改布局 */
  width: calc(
    var(--ref-card-w) + (var(--ref-n) - 1) * (var(--ref-card-w) - var(--ref-overlap))
  );
  height: calc(var(--ref-card-h) + 8px);
  z-index: 6;
}

.ref-stack.empty {
  width: var(--ref-card-w);
}

.ref-flyout {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: flex-start;
  height: var(--ref-card-h);
  padding: 2px;
  z-index: 7;
}

.ref-flyout.packed {
  width: 100%;
}

.ref-flyout.expanded {
  gap: 8px;
  padding: 8px;
  border-radius: 14px;
  background: rgba(22, 22, 28, 0.96);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  backdrop-filter: blur(10px);
  /* 向右浮开，不改变外层占位 */
  width: max-content;
  min-height: calc(var(--ref-card-h) + 16px);
  height: auto;
}

.ref-card {
  position: relative;
  flex: 0 0 var(--ref-card-w);
  width: var(--ref-card-w);
  height: var(--ref-card-h);
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--studio-glass-3);
  background: var(--ctl);
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.22s ease,
    margin 0.22s ease,
    box-shadow 0.22s ease;
  transform-origin: center bottom;
}

.ref-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

/* 默认叠放扇形 */
.ref-flyout.packed .ref-card + .ref-card {
  margin-left: calc(0px - var(--ref-overlap));
}

.ref-flyout.packed .ref-card:nth-child(1) {
  transform: rotate(-9deg);
  z-index: 1;
}
.ref-flyout.packed .ref-card:nth-child(2) {
  transform: rotate(-3deg);
  z-index: 2;
}
.ref-flyout.packed .ref-card:nth-child(3) {
  transform: rotate(5deg);
  z-index: 3;
}
.ref-flyout.packed .ref-card:nth-child(4) {
  transform: rotate(10deg);
  z-index: 4;
}
.ref-flyout.packed .ref-card:nth-child(5) {
  transform: rotate(4deg);
  z-index: 5;
}

/* hover 展开：摊平 */
.ref-flyout.expanded .ref-card {
  margin-left: 0;
  transform: rotate(0deg);
  z-index: 1;
  box-shadow: var(--shadow-sm);
}

.ref-add-card {
  border: 1px solid var(--line);
  background: var(--ctl-2);
  color: var(--muted);
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 300;
  line-height: 1;
  padding: 0;
  overflow: hidden;
}

.ref-add-card:hover {
  border-color: var(--line-strong);
  color: var(--muted);
  background: var(--ctl-2);
}

.ref-add-card .ref-plus {
  line-height: 1;
  font-size: 22px;
  font-weight: 300;
}

.ref-add-card em {
  font-style: normal;
  font-size: 10px;
  font-weight: 500;
  color: var(--muted);
  letter-spacing: -0.02em;
  white-space: nowrap;
}

/* 生图空态：竖向倾斜，仅 + */
.ref-add-card.alone.kind-image {
  width: var(--ref-card-w);
  height: var(--ref-card-h);
  flex-basis: var(--ref-card-w);
  border-radius: 10px;
  transform: rotate(-8deg);
  box-shadow: var(--shadow-sm);
}

/* 视频 / Agent 空态：同样竖卡，内含 + 与「参考内容」 */
.ref-add-card.alone.kind-video {
  width: var(--ref-card-w);
  height: var(--ref-card-h);
  flex-basis: var(--ref-card-w);
  border-radius: 10px;
  transform: rotate(4deg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: var(--shadow-sm);
}

.ref-add-card.alone.kind-video .ref-plus {
  font-size: 18px;
}

.ref-del {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  display: grid;
  place-items: center;
}

.ref-flyout.expanded .ref-card:hover .ref-del {
  opacity: 1;
  pointer-events: auto;
}

.composer textarea {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: var(--ink);
  font-size: 15px;
  line-height: 1.55;
  font-family: inherit;
  min-height: 72px;
}

.composer textarea::placeholder {
  color: var(--muted);
}

.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.composer-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.pill-wrap {
  position: relative;
}

.pill {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--ctl);
  color: var(--ink);
  font-size: 12.5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pill.round {
  width: 32px;
  padding: 0;
  justify-content: center;
  font-weight: 700;
}

.pill.on,
.pill:hover {
  border-color: var(--line-strong);
  background: var(--ctl-hover);
}

.pill .chev {
  font-size: 10px;
  opacity: 0.6;
}

.pill .ico.wave {
  color: var(--info);
}

.pop {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 20;
  min-width: 220px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--pop);
  box-shadow: var(--shadow);
  padding: 8px;
}

.pop-title {
  padding: 6px 10px 8px;
  font-size: 12px;
  color: var(--muted);
}

.pop-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  color: var(--ink);
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.pop-item:hover,
.pop-item.on {
  background: var(--ctl-2);
}

.pop-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pop-item .mi {
  width: 18px;
  text-align: center;
  opacity: 0.85;
}

.pop-item .check {
  margin-left: auto;
  color: var(--info);
}

.mode-pop {
  min-width: 200px;
}

.prefs-pop {
  width: 340px;
  padding: 12px;
}

.prefs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.prefs-head strong {
  font-size: 14px;
}

.auto-tog {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.media-seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border-radius: 999px;
  background: var(--ctl);
  padding: 3px;
  margin-bottom: 12px;
}

.media-seg button {
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
}

.media-seg button.on {
  background: var(--ctl-2);
  color: var(--ink);
  font-weight: 650;
}

.prefs-label {
  font-size: 12px;
  color: var(--muted);
  margin: 4px 0 8px;
}

.ratio-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  background: var(--ctl);
  border-radius: 10px;
  padding: 6px;
  margin-bottom: 12px;
}

.ratio {
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ratio.on {
  background: var(--ctl-2);
  color: var(--ink);
}

.ratio i {
  display: inline-block;
  border: 1.5px solid currentColor;
  border-radius: 2px;
  opacity: 0.7;
}

.ratio i.sq {
  width: 10px;
  height: 10px;
}
.ratio i.wide {
  width: 14px;
  height: 8px;
}
.ratio i.tall {
  width: 8px;
  height: 12px;
}

.prefs-selects {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.sel {
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--ctl);
  color: var(--ink);
  font-size: 11px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  overflow: hidden;
}

.sel em {
  margin-left: auto;
  font-style: normal;
  opacity: 0.5;
}

.skills-pop {
  width: 360px;
  padding: 12px 10px 8px;
  top: calc(100% + 8px);
  bottom: auto;
  left: 0;
}

.skills-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  padding: 0 2px;
}

.skills-search {
  flex: 1;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--ctl);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  color: var(--muted);
}

.skills-search input {
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  font-size: 12.5px;
}

.more-skills {
  font-size: 12.5px;
  color: var(--muted);
  text-decoration: none;
  white-space: nowrap;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.more-skills:hover {
  color: var(--ink);
}

.skills-list {
  max-height: 280px;
  overflow: auto;
  padding: 2px 0;
  scrollbar-width: thin;
}

.skill-row {
  width: 100%;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 18px;
  gap: 10px;
  align-items: flex-start;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 10px 8px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--ink);
}

.skill-row:hover {
  background: var(--ctl-2);
}

.skill-row.on {
  background: var(--ctl-2);
}

.sk-ico {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--muted);
  display: grid;
  place-items: center;
}

.skill-row.on .sk-ico {
  color: var(--ink);
}

.sk-body {
  min-width: 0;
}

.sk-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.sk-title strong {
  font-size: 13px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sk-title em {
  flex-shrink: 0;
  font-style: normal;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ctl-2);
  color: var(--muted);
  font-weight: 600;
}

.sk-body p {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sk-check {
  margin-top: 2px;
  color: var(--info);
  display: grid;
  place-items: center;
}

.skills-empty {
  margin: 16px 8px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}

.skills-foot {
  border-top: 1px solid var(--line);
  margin-top: 4px;
  padding-top: 4px;
}

.skills-foot button {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--ink);
  text-align: left;
  padding: 10px 8px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

.skills-foot button:hover {
  background: var(--ctl-2);
}

.pill .ico.wrench {
  display: grid;
  place-items: center;
  color: var(--muted);
}

.pill.on .ico.wrench {
  color: var(--ink);
}

.mention-pop {
  min-width: 240px;
  overflow: visible;
}

.mention-item img {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
}

.mention-empty {
  margin: 4px 10px 8px;
  font-size: 12px;
  color: var(--muted);
}

.create-subject {
  position: relative;
}

.create-fly {
  position: absolute;
  left: calc(100% + 6px);
  top: 0;
  min-width: 148px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--panel);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 5;
}

.create-fly button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--ink);
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.create-fly button:hover:not(:disabled) {
  background: var(--ctl-2);
}

.create-fly button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.mention-assets-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.mention-assets-head .pop-title {
  margin: 0;
}

.back-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: inline-grid;
  place-items: center;
  padding: 0;
}

.back-btn:hover {
  background: var(--ctl-2);
  color: var(--ink);
}

.mention-search {
  display: block;
  margin: 4px 4px 8px;
}

.mention-search input {
  width: 100%;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--ctl);
  color: var(--ink);
  padding: 0 10px;
  box-sizing: border-box;
  font-size: 12px;
}

.mention-asset-list {
  max-height: 240px;
  overflow: auto;
  min-height: 48px;
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.send {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: var(--ctl-2);
  color: var(--ink);
  cursor: pointer;
  display: grid;
  place-items: center;
}

.send:not(:disabled):hover {
  background: var(--accent);
  color: var(--accent-ink);
}

.send:disabled {
  opacity: 0.35;
  cursor: default;
}

.model-cards {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.mcard {
  position: relative;
  min-width: 140px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  color: var(--ink);
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
}

.mcard:hover {
  border-color: var(--line-strong);
  background: var(--panel-2);
}

.mcard strong {
  display: block;
  font-size: 13px;
}

.mcard em {
  display: block;
  margin-top: 4px;
  font-style: normal;
  font-size: 11px;
  color: var(--muted);
}

.mcard .badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--info);
  color: #fff;
  font-weight: 700;
}

.show-sec {
  margin-top: 56px;
  max-width: 1100px;
  margin-left: auto;
  margin-right: auto;
}

.plaza-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--line);
}

.plaza-tab {
  height: 40px;
  padding: 0 16px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  position: relative;
}

.plaza-tab.on {
  color: var(--ink);
}

.plaza-tab.on::after {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--accent);
}

.plaza-sub {
  margin: 8px 0 12px;
  font-size: 13px;
  font-weight: 650;
  color: var(--muted);
}

.plaza-hint {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}

.plaza-empty {
  grid-column: 1 / -1;
  margin: 24px 0;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  margin-bottom: 28px;
}

.skill-card {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
  padding: 16px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 148px;
}

.skill-card.on {
  border-color: var(--line-strong);
  background: var(--panel-2);
}

.skill-card-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.skill-card-top strong {
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
}

.skill-plus {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.skill-plus:hover {
  background: var(--ctl-2);
  color: var(--ink);
}

.skill-card > p {
  margin: 0;
  flex: 1;
  font-size: 13px;
  line-height: 1.55;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.skill-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}

.skill-card-foot .likes {
  opacity: 0.9;
}

.skill-card-foot .from {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.skill-copy {
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  padding: 0 2px;
}

.skill-copy:hover {
  color: var(--ink);
}

.show-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter {
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
}

.filter.on {
  background: var(--ctl-2);
  color: var(--ink);
  font-weight: 650;
}

.filter:hover:not(.on) {
  color: var(--ink);
}

.show-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.show-card {
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  border-radius: 14px;
  overflow: hidden;
}

.show-card.busy {
  opacity: 0.65;
  pointer-events: none;
}

.show-cover {
  aspect-ratio: 4 / 3;
  border-radius: 14px;
  background-size: cover;
  background-position: center;
  position: relative;
  border: 1px solid var(--line);
  overflow: hidden;
}

.show-card:hover .show-cover {
  border-color: var(--line-strong);
}

.show-badges {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  z-index: 1;
}

.show-badges span {
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(12, 14, 18, 0.72);
  color: var(--studio-ink);
  font-size: 11px;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
  backdrop-filter: blur(6px);
}

.show-badges .lv {
  background: var(--studio-text-strong);
  color: var(--studio-inset);
}

.show-cap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 28px 12px 12px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.72));
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.show-cap strong {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.show-cap span {
  font-size: 11px;
  color: var(--studio-text-strong);
}

.runs {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.run-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  text-align: left;
  cursor: pointer;
  color: var(--ink);
}

.run-row em {
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
}

.st {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--studio-glass-2);
  color: var(--muted);
}

.st.completed {
  color: #34d399;
  background: rgba(16, 185, 129, 0.12);
}
.st.failed {
  color: #f87171;
  background: rgba(239, 68, 68, 0.12);
}

.empty-line {
  margin: 24px 0;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

@media (max-width: 720px) {
  .studio-home {
    padding: 18px 14px 48px;
  }
  .back-top {
    right: 16px;
    bottom: 20px;
  }
  .composer-sec {
    margin-top: 36px;
  }
  .show-sec {
    margin-top: 40px;
  }
  .search-sm {
    margin-left: 0;
    width: 100%;
  }
  .search-sm input {
    width: 100%;
  }
}
</style>
