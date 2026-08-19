<template>
  <div>
    <PageHeader title="部门管理" description="维护组织架构树，用户可归属到部门">
      <template #extra>
        <a-button type="primary" @click="openCreate()">
          <template #icon><icon-plus /></template>
          新建部门
        </a-button>
      </template>
    </PageHeader>

    <div class="page-card">
      <div class="search-bar">
        <a-input v-model="q" placeholder="搜索部门名称" allow-clear style="width: 240px" @press-enter="load">
          <template #prefix><icon-search /></template>
        </a-input>
        <a-button type="primary" @click="load">搜索</a-button>
        <a-button status="danger" :disabled="!hasSelection" :loading="batchLoading" @click="batchRemove">批量删除</a-button>
      </div>

      <a-table
        v-model:selectedKeys="selectedKeys"
        row-key="id"
        :loading="loading"
        :data="list"
        :pagination="false"
        :bordered="false"
        :row-selection="rowSelection"
        default-expand-all-rows
      >
        <template #columns>
          <a-table-column title="部门名称" data-index="name" />
          <a-table-column title="排序" data-index="sort" :width="80" />
          <a-table-column title="状态" :width="90">
            <template #cell="{ record }">
              <a-tag :color="record.status === '1' ? 'green' : 'gray'">
                {{ record.status === '1' ? '启用' : '停用' }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column title="描述" data-index="description" ellipsis tooltip />
          <a-table-column title="操作" :width="220" fixed="right">
            <template #cell="{ record }">
              <a-space>
                <a-button type="text" size="small" @click="openCreate(record.id)">新增子级</a-button>
                <a-button type="text" size="small" @click="openEdit(record)">编辑</a-button>
                <a-popconfirm content="确认删除该部门？" @ok="remove(record.id)">
                  <a-button type="text" status="danger" size="small">删除</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </a-table-column>
        </template>
      </a-table>
    </div>

    <a-modal v-model:visible="visible" :title="editing ? '编辑部门' : '新建部门'" :ok-loading="saving" @ok="save">
      <a-form :model="form" layout="vertical">
        <a-form-item label="上级部门">
          <a-tree-select
            v-model="form.parentId"
            :data="list"
            :field-names="{ key: 'id', title: 'name', children: 'children' }"
            allow-clear
            placeholder="空为顶级"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="名称" required>
          <a-input v-model="form.name" />
        </a-form-item>
        <a-form-item label="排序">
          <a-input-number v-model="form.sort" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="状态">
          <a-radio-group v-model="form.status">
            <a-radio value="1">启用</a-radio>
            <a-radio value="0">停用</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model="form.description" :auto-size="{ minRows: 2, maxRows: 4 }" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import api from '@/api';
import PageHeader from '@/components/PageHeader.vue';
import { useTableBatch } from '@/composables/useTableBatch';

const { selectedKeys, rowSelection, hasSelection, batchLoading, batchDelete } = useTableBatch();

const loading = ref(false);
const saving = ref(false);
const visible = ref(false);
const editing = ref(false);
const editId = ref('');
const q = ref('');
const list = ref<any[]>([]);

const form = reactive({
  parentId: '',
  name: '',
  sort: 0,
  status: '1',
  description: '',
});

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/depts', { params: { q: q.value || undefined } });
    list.value = Array.isArray(data) ? data : [];
  } finally {
    loading.value = false;
  }
}

function openCreate(parentId = '') {
  editing.value = false;
  editId.value = '';
  Object.assign(form, { parentId: parentId || '', name: '', sort: 0, status: '1', description: '' });
  visible.value = true;
}

function openEdit(row: any) {
  editing.value = true;
  editId.value = row.id;
  Object.assign(form, {
    parentId: row.parentId || '',
    name: row.name,
    sort: row.sort || 0,
    status: row.status || '1',
    description: row.description || '',
  });
  visible.value = true;
}

async function save() {
  if (!form.name.trim()) return Message.warning('请填写部门名称');
  saving.value = true;
  try {
    if (editing.value) {
      await api.patch(`/admin/depts/${editId.value}`, { ...form });
    } else {
      await api.post('/admin/depts', { ...form });
    }
    Message.success('已保存');
    visible.value = false;
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function remove(id: string) {
  try {
    await api.delete(`/admin/depts/${id}`);
    Message.success('已删除');
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '删除失败');
  }
}

function batchRemove() {
  return batchDelete((id) => api.delete(`/admin/depts/${id}`), '个部门', load);
}

onMounted(load);
</script>
