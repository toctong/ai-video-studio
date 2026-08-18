<template>
  <div class="foss-panel">
    <article class="foss-card">
      <div class="foss-head">
        <div>
          <div class="foss-title">MinIO 对象存储</div>
          <div class="foss-sub">
            图 / 视频永久直链（S3 兼容）。推荐本地 Docker MinIO；未配 Key 时回落本地磁盘。
          </div>
        </div>
        <el-tag v-if="configured" size="small" type="success" effect="plain">已配置</el-tag>
        <el-tag v-else size="small" type="danger" effect="plain">必填 · 未配置</el-tag>
      </div>

      <el-alert
        v-if="!configured"
        type="warning"
        show-icon
        :closable="false"
        title="请填写桶名与 MinIO AccessKey，并保存后测试连通"
        style="margin-bottom: 14px"
      />
      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="本地开发：npm run minio 后点「填入本地 MinIO 默认值」，控制台 http://127.0.0.1:9001"
        style="margin-bottom: 14px"
      />

      <el-form label-position="top" class="foss-form">
        <el-form-item label="公网读地址">
          <el-input v-model="draft.baseUrl" placeholder="https://your-minio.example" />
          <p class="hint">拼永久直链：{公网}/{bucket}/{key}；浏览器读图读视频用这个</p>
        </el-form-item>
        <el-form-item label="API Endpoint（可选）">
          <el-input
            v-model="draft.apiEndpoint"
            placeholder="留空则与公网相同；例 http://192.168.0.139:9000"
          />
          <p class="hint">
            上传/列举走 S3 API（端口 <b>9000</b>）。<b>不要填 9001</b>（那是控制台）。公网签名失败时填内网
            :9000。
          </p>
        </el-form-item>
        <el-form-item label="桶名 Bucket" required>
          <el-input v-model="draft.bucket" placeholder="例如 aivideo" />
          <p class="hint">与迁移前一致；公开读桶无需预签名即可播放视频 Range</p>
        </el-form-item>
        <el-form-item label="对象前缀 Key Prefix">
          <el-input v-model="draft.keyPrefix" placeholder="ai/video-studio" />
        </el-form-item>
        <el-form-item
          :label="
            draft.hasAccessKeyId
              ? `AccessKeyId（已配置 ${draft.accessKeyIdMasked || '****'}，留空不改）`
              : 'AccessKeyId'
          "
          required
        >
          <el-input
            v-model="draft.accessKeyId"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="MinIO Access Key（勿用旧 FileOSS Key）"
          />
        </el-form-item>
        <el-form-item
          :label="
            draft.hasAccessKeySecret
              ? `AccessKeySecret（已配置 ${draft.accessKeySecretMasked || '****'}，留空不改）`
              : 'AccessKeySecret'
          "
          required
        >
          <el-input
            v-model="draft.accessKeySecret"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="MinIO Secret Key"
          />
        </el-form-item>

        <div class="foss-actions">
          <el-button @click="fillLocalMinioDefaults">填入本地 MinIO 默认值</el-button>
          <el-button :loading="testing" @click="test">测试连通</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存对象存储</el-button>
        </div>

        <el-alert
          v-if="result"
          :title="result.message"
          :type="result.ok ? 'success' : 'error'"
          show-icon
          style="margin-top: 12px"
        />
      </el-form>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import api from '@/api';

const props = defineProps<{ settings: any }>();
const emit = defineEmits<{ saved: [data: any] }>();

const draft = reactive({
  baseUrl: '',
  apiEndpoint: '',
  bucket: '',
  keyPrefix: '',
  accessKeyId: '',
  accessKeySecret: '',
  accessKeyIdMasked: '',
  accessKeySecretMasked: '',
  hasAccessKeyId: false,
  hasAccessKeySecret: false,
});

const saving = ref(false);
const testing = ref(false);
const result = ref<{ ok: boolean; message: string } | null>(null);

const configured = computed(() => Boolean(props.settings?.fileOss?.configured));

function hydrate() {
  const c = props.settings?.fileOss || {};
  draft.baseUrl = c.baseUrl || '';
  draft.apiEndpoint = c.apiEndpoint || '';
  draft.bucket = c.bucket || '';
  draft.keyPrefix = c.keyPrefix || '';
  draft.accessKeyId = '';
  draft.accessKeySecret = '';
  draft.accessKeyIdMasked = c.accessKeyIdMasked || '';
  draft.accessKeySecretMasked = c.accessKeySecretMasked || '';
  draft.hasAccessKeyId = !!c.hasAccessKeyId;
  draft.hasAccessKeySecret = !!c.hasAccessKeySecret;
}

watch(() => props.settings?.fileOss, hydrate, { immediate: true, deep: true });

function fillLocalMinioDefaults() {
  draft.baseUrl = 'http://127.0.0.1:9000';
  draft.apiEndpoint = 'http://127.0.0.1:9000';
  draft.bucket = 'aivideo';
  draft.keyPrefix = draft.keyPrefix || 'ai/video-studio';
  draft.accessKeyId = 'minioadmin';
  draft.accessKeySecret = 'minioadmin';
  ElMessage.success('已填入本地 MinIO 默认值，请保存并测试连通');
}

async function save() {
  if (!String(draft.baseUrl || '').trim()) {
    return ElMessage.warning('请填写公网读地址');
  }
  if (!String(draft.bucket || '').trim()) {
    return ElMessage.warning('请填写桶名');
  }
  if (!draft.hasAccessKeyId && !String(draft.accessKeyId || '').trim()) {
    return ElMessage.warning('请填写 AccessKeyId');
  }
  if (!draft.hasAccessKeySecret && !String(draft.accessKeySecret || '').trim()) {
    return ElMessage.warning('请填写 AccessKeySecret');
  }
  const apiEp = String(draft.apiEndpoint || '').trim();
  if (/:9001\/?$/i.test(apiEp)) {
    return ElMessage.warning(
      'API Endpoint 请用 S3 端口 9000，不要用 9001（9001 是 MinIO 控制台）',
    );
  }
  saving.value = true;
  result.value = null;
  try {
    const { data } = await api.put('/settings', {
      fileOss: {
        baseUrl: String(draft.baseUrl || '').trim(),
        apiEndpoint: apiEp,
        bucket: String(draft.bucket || '').trim(),
        keyPrefix: String(draft.keyPrefix || '').trim() || 'ai/video-studio',
        ...(draft.accessKeyId.trim() ? { accessKeyId: draft.accessKeyId.trim() } : {}),
        ...(draft.accessKeySecret.trim()
          ? { accessKeySecret: draft.accessKeySecret.trim() }
          : {}),
      },
    });
    emit('saved', data);
    draft.accessKeyId = '';
    draft.accessKeySecret = '';
    ElMessage.success('对象存储已保存');
  } catch (e: any) {
    const raw = e?.response?.data?.message ?? e?.message;
    const msg = Array.isArray(raw) ? raw.join('；') : String(raw || '保存失败');
    ElMessage.error(msg);
  } finally {
    saving.value = false;
  }
}

async function test() {
  testing.value = true;
  result.value = null;
  try {
    const needSave =
      !!draft.accessKeyId.trim() ||
      !!draft.accessKeySecret.trim() ||
      !configured.value ||
      draft.bucket !== (props.settings?.fileOss?.bucket || '') ||
      draft.baseUrl !== (props.settings?.fileOss?.baseUrl || '') ||
      draft.apiEndpoint !== (props.settings?.fileOss?.apiEndpoint || '');
    if (needSave) {
      await save();
      if (!props.settings?.fileOss?.configured && !draft.hasAccessKeyId) {
        return;
      }
    }
    const { data } = await api.post('/settings/file-oss/test');
    result.value = { ok: !!data?.ok, message: String(data?.message || '') };
    if (data?.ok) ElMessage.success(data.message || '连通成功');
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '测试失败';
    result.value = { ok: false, message: String(msg) };
  } finally {
    testing.value = false;
  }
}
</script>

<style scoped>
.foss-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  padding: 18px 18px 16px;
}
.foss-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}
.foss-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
}
.foss-sub {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.45;
}
.foss-form :deep(.el-form-item) {
  margin-bottom: 14px;
}
.hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.foss-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
</style>
