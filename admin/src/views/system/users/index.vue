<template>
  <div>
    <PageHeader title="用户管理" description="账号、部门、角色与 TOTP 状态">
      <template #extra>
        <a-button type="primary" @click="openCreate">
          <template #icon><icon-plus /></template>
          新建用户
        </a-button>
      </template>
    </PageHeader>

    <div class="page-card">
      <div class="search-bar">
        <a-input v-model="q" placeholder="搜索用户名/昵称" allow-clear style="width: 240px" @press-enter="search">
          <template #prefix><icon-search /></template>
        </a-input>
        <a-button type="primary" @click="search">搜索</a-button>
        <a-button @click="resetSearch">重置</a-button>
        <a-button status="danger" :disabled="!hasSelection" :loading="batchLoading" @click="batchRemove">批量删除</a-button>
      </div>

      <a-table
        v-model:selectedKeys="selectedKeys"
        row-key="id"
        :loading="loading"
        :data="list"
        :pagination="pagination"
        :bordered="false"
        :row-selection="rowSelection"
        stripe
        @page-change="onPage"
        @page-size-change="onPageSize"
      >
        <template #columns>
          <a-table-column title="ID" data-index="id" :width="70" />
          <a-table-column title="用户名" data-index="username" :width="120" />
          <a-table-column title="昵称" data-index="nickname" />
          <a-table-column title="部门" data-index="deptName" :width="140" />
          <a-table-column title="角色" :width="140">
            <template #cell="{ record }">
              <a-tag :color="record.role === 'admin' ? 'orangered' : record.role === 'ops' ? 'green' : 'arcoblue'">
                {{ record.roleName || record.role }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column title="TOTP" :width="80">
            <template #cell="{ record }">
              <a-tag :color="record.totpEnabled ? 'green' : 'gray'" size="small">
                {{ record.totpEnabled ? '已绑' : '未绑' }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column title="创建" :width="160">
            <template #cell="{ record }">{{ formatTime(record.createdAt) }}</template>
          </a-table-column>
          <a-table-column title="操作" :width="160" fixed="right">
            <template #cell="{ record }">
              <a-space>
                <a-button type="text" size="small" @click="openEdit(record)">编辑</a-button>
                <a-popconfirm content="确认删除该用户？" @ok="remove(record.id)">
                  <a-button type="text" status="danger" size="small">删除</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </a-table-column>
        </template>
      </a-table>
    </div>

    <a-modal v-model:visible="visible" :title="editing ? '编辑用户' : '新建用户'" :ok-loading="saving" @ok="save">
      <a-form :model="form" layout="vertical">
        <a-form-item v-if="!editing" label="用户名" required>
          <a-input v-model="form.username" />
        </a-form-item>
        <a-form-item label="昵称">
          <a-input v-model="form.nickname" />
        </a-form-item>
        <a-form-item label="部门">
          <a-tree-select
            v-model="form.deptId"
            :data="deptOptions"
            :field-names="{ key: 'id', title: 'name', children: 'children' }"
            allow-clear
            placeholder="选择部门"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="角色" required>
          <a-select v-model="form.roleId" placeholder="选择角色" allow-search>
            <a-option v-for="r in roleOptions" :key="r.id" :value="r.id">
              {{ r.name }} ({{ r.code }})
            </a-option>
          </a-select>
        </a-form-item>
        <a-form-item :label="editing ? '新密码（留空不改）' : '密码'" :required="!editing">
          <a-input-password v-model="form.password" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import dayjs from 'dayjs';
import { Message } from '@arco-design/web-vue';
import api from '@/api';
import PageHeader from '@/components/PageHeader.vue';
import { useTableBatch } from '@/composables/useTableBatch';

const { selectedKeys, rowSelection, hasSelection, batchLoading, batchDelete } = useTableBatch();

const loading = ref(false);
const saving = ref(false);
const visible = ref(false);
const editing = ref(false);
const q = ref('');
const list = ref<any[]>([]);
const roleOptions = ref<any[]>([]);
const deptOptions = ref<any[]>([]);
const page = ref(1);
const pageSize = ref(20);
const editId = ref<number | null>(null);

const form = reactive({
  username: '',
  nickname: '',
  roleId: '',
  deptId: '',
  password: '',
});

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showTotal: true,
  showPageSize: true,
});

function formatTime(v: string) {
  return v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-';
}

async function loadMeta() {
  const [roles, depts] = await Promise.all([
    api.get('/admin/roles'),
    api.get('/admin/depts'),
  ]);
  roleOptions.value = Array.isArray(roles.data) ? roles.data : [];
  deptOptions.value = Array.isArray(depts.data) ? depts.data : [];
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/users', {
      params: { q: q.value, page: page.value, pageSize: pageSize.value },
    });
    list.value = data.list || [];
    pagination.current = data.page;
    pagination.pageSize = data.pageSize;
    pagination.total = data.total;
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
}
function resetSearch() {
  q.value = '';
  search();
}
function onPage(p: number) {
  page.value = p;
  load();
}
function onPageSize(size: number) {
  pageSize.value = size;
  page.value = 1;
  load();
}

function openCreate() {
  editing.value = false;
  editId.value = null;
  const defRole = roleOptions.value.find((r) => r.code === 'user') || roleOptions.value[0];
  Object.assign(form, {
    username: '',
    nickname: '',
    roleId: defRole?.id || '',
    deptId: '',
    password: '',
  });
  visible.value = true;
}

function openEdit(row: any) {
  editing.value = true;
  editId.value = row.id;
  Object.assign(form, {
    username: row.username,
    nickname: row.nickname || '',
    roleId: row.roleId || '',
    deptId: row.deptId || '',
    password: '',
  });
  visible.value = true;
}

async function save() {
  if (!form.roleId) return Message.warning('请选择角色');
  saving.value = true;
  try {
    const body = {
      nickname: form.nickname,
      roleId: form.roleId,
      deptId: form.deptId || '',
      password: form.password || undefined,
    };
    if (editing.value && editId.value != null) {
      await api.patch(`/admin/users/${editId.value}`, body);
    } else {
      await api.post('/admin/users', { username: form.username, ...body, password: form.password });
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

async function remove(id: number) {
  try {
    await api.delete(`/admin/users/${id}`);
    Message.success('已删除');
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '删除失败');
  }
}

function batchRemove() {
  return batchDelete((id) => api.delete(`/admin/users/${id}`), '个用户', load);
}

onMounted(async () => {
  await loadMeta();
  await load();
});
</script>
