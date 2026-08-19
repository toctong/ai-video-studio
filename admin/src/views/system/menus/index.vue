<template>
  <div>
    <PageHeader title="菜单管理" description="配置后台侧栏目录/菜单，并关联权限标识">
      <template #extra>
        <a-button type="primary" @click="openCreate()">
          <template #icon><icon-plus /></template>
          新建菜单
        </a-button>
      </template>
    </PageHeader>

    <div class="page-card">
      <div class="search-bar">
        <a-input v-model="q" placeholder="搜索标题/路径/权限" allow-clear style="width: 260px" @press-enter="load">
          <template #prefix><icon-search /></template>
        </a-input>
        <a-button type="primary" @click="load">搜索</a-button>
      </div>

      <a-table
        row-key="id"
        :loading="loading"
        :data="list"
        :pagination="false"
        :bordered="false"
        default-expand-all-rows
      >
        <template #columns>
          <a-table-column title="标题" data-index="title" :width="200" />
          <a-table-column title="类型" :width="90">
            <template #cell="{ record }">
              <a-tag>{{ typeLabel(record.type) }}</a-tag>
            </template>
          </a-table-column>
          <a-table-column title="路径" data-index="path" :width="160" ellipsis tooltip />
          <a-table-column title="图标" data-index="icon" :width="140" ellipsis tooltip />
          <a-table-column title="权限标识" data-index="permission" :width="160" ellipsis tooltip />
          <a-table-column title="排序" data-index="sort" :width="70" />
          <a-table-column title="状态" :width="80">
            <template #cell="{ record }">
              <a-tag :color="record.status === '1' ? 'green' : 'gray'" size="small">
                {{ record.status === '1' ? '启用' : '停用' }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column title="操作" :width="200" fixed="right">
            <template #cell="{ record }">
              <a-space>
                <a-button type="text" size="small" @click="openCreate(record.id)">子级</a-button>
                <a-button type="text" size="small" @click="openEdit(record)">编辑</a-button>
                <a-popconfirm content="确认删除？" @ok="remove(record.id)">
                  <a-button type="text" status="danger" size="small">删除</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </a-table-column>
        </template>
      </a-table>
    </div>

    <a-modal v-model:visible="visible" :title="editing ? '编辑菜单' : '新建菜单'" width="640px" :ok-loading="saving" @ok="save">
      <a-form :model="form" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="上级">
              <a-tree-select
                v-model="form.parentId"
                :data="list"
                :field-names="{ key: 'id', title: 'title', children: 'children' }"
                allow-clear
                placeholder="空为顶级"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="类型" required>
              <a-select v-model="form.type">
                <a-option :value="1">目录</a-option>
                <a-option :value="2">菜单</a-option>
                <a-option :value="3">按钮</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="标题" required>
          <a-input v-model="form.title" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="路由路径">
              <a-input v-model="form.path" placeholder="/system/users" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="图标">
              <a-input v-model="form.icon" placeholder="icon-user" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="组件">
              <a-input v-model="form.component" placeholder="system/users/index" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="权限标识">
              <a-input v-model="form.permission" placeholder="system:user:list" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="排序">
              <a-input-number v-model="form.sort" :min="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="状态">
              <a-radio-group v-model="form.status">
                <a-radio value="1">启用</a-radio>
                <a-radio value="0">停用</a-radio>
              </a-radio-group>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="隐藏">
              <a-switch v-model="form.hidden" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import api from '@/api';
import PageHeader from '@/components/PageHeader.vue';

const loading = ref(false);
const saving = ref(false);
const visible = ref(false);
const editing = ref(false);
const editId = ref('');
const q = ref('');
const list = ref<any[]>([]);

const form = reactive({
  parentId: '',
  type: 2 as number,
  title: '',
  path: '',
  icon: '',
  component: '',
  permission: '',
  sort: 0,
  status: '1',
  hidden: false,
});

function typeLabel(t: number) {
  return ({ 1: '目录', 2: '菜单', 3: '按钮' } as Record<number, string>)[t] || String(t);
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/menus', { params: { q: q.value || undefined } });
    list.value = Array.isArray(data) ? data : [];
  } finally {
    loading.value = false;
  }
}

function openCreate(parentId = '') {
  editing.value = false;
  editId.value = '';
  Object.assign(form, {
    parentId: parentId || '',
    type: 2,
    title: '',
    path: '',
    icon: '',
    component: '',
    permission: '',
    sort: 0,
    status: '1',
    hidden: false,
  });
  visible.value = true;
}

function openEdit(row: any) {
  editing.value = true;
  editId.value = row.id;
  Object.assign(form, {
    parentId: row.parentId || '',
    type: row.type || 2,
    title: row.title,
    path: row.path || '',
    icon: row.icon || '',
    component: row.component || '',
    permission: row.permission || '',
    sort: row.sort || 0,
    status: row.status || '1',
    hidden: Boolean(row.hidden),
  });
  visible.value = true;
}

async function save() {
  if (!form.title.trim()) return Message.warning('请填写标题');
  saving.value = true;
  try {
    if (editing.value) {
      await api.patch(`/admin/menus/${editId.value}`, { ...form });
    } else {
      await api.post('/admin/menus', { ...form });
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
    await api.delete(`/admin/menus/${id}`);
    Message.success('已删除');
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '删除失败');
  }
}

onMounted(load);
</script>
