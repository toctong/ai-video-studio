<template>
  <div class="page-card">
    <div class="page-toolbar">
      <a-space wrap>
        <a-input v-model="q" placeholder="搜索用户名/昵称" allow-clear style="width: 220px" @press-enter="search" />
        <a-button type="primary" @click="search">搜索</a-button>
        <a-button @click="openCreate">新建用户</a-button>
      </a-space>
    </div>

    <a-table
      row-key="id"
      :loading="loading"
      :data="list"
      :pagination="pagination"
      @page-change="onPage"
      @page-size-change="onPageSize"
    >
      <template #columns>
        <a-table-column title="ID" data-index="id" :width="80" />
        <a-table-column title="用户名" data-index="username" />
        <a-table-column title="昵称" data-index="nickname" />
        <a-table-column title="角色" data-index="role" :width="100">
          <template #cell="{ record }">
            <a-tag :color="record.role === 'admin' ? 'orangered' : 'arcoblue'">{{ record.role }}</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="TOTP" :width="90">
          <template #cell="{ record }">
            <a-tag :color="record.totpEnabled ? 'green' : 'gray'">
              {{ record.totpEnabled ? '已绑' : '未绑' }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column title="创建时间" :width="170">
          <template #cell="{ record }">{{ formatTime(record.createdAt) }}</template>
        </a-table-column>
        <a-table-column title="操作" :width="180" fixed="right">
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

    <a-modal v-model:visible="visible" :title="editing ? '编辑用户' : '新建用户'" @ok="save" :ok-loading="saving">
      <a-form :model="form" layout="vertical">
        <a-form-item v-if="!editing" label="用户名" required>
          <a-input v-model="form.username" />
        </a-form-item>
        <a-form-item label="昵称">
          <a-input v-model="form.nickname" />
        </a-form-item>
        <a-form-item label="角色">
          <a-select v-model="form.role">
            <a-option value="admin">admin</a-option>
            <a-option value="user">user</a-option>
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

const loading = ref(false);
const saving = ref(false);
const visible = ref(false);
const editing = ref(false);
const q = ref('');
const list = ref<any[]>([]);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const editId = ref<number | null>(null);

const form = reactive({
  username: '',
  nickname: '',
  role: 'user',
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

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/users', {
      params: { q: q.value, page: page.value, pageSize: pageSize.value },
    });
    list.value = data.list || [];
    total.value = data.total || 0;
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
  Object.assign(form, { username: '', nickname: '', role: 'user', password: '' });
  visible.value = true;
}

function openEdit(row: any) {
  editing.value = true;
  editId.value = row.id;
  Object.assign(form, {
    username: row.username,
    nickname: row.nickname || '',
    role: row.role || 'user',
    password: '',
  });
  visible.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (editing.value && editId.value != null) {
      await api.patch(`/admin/users/${editId.value}`, {
        nickname: form.nickname,
        role: form.role,
        password: form.password || undefined,
      });
    } else {
      await api.post('/admin/users', { ...form });
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

onMounted(load);
</script>
