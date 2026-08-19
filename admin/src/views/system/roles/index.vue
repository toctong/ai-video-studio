<template>
  <div>
    <PageHeader title="角色管理" description="配置角色编码，并为角色分配菜单权限">
      <template #extra>
        <a-button type="primary" @click="openCreate">
          <template #icon><icon-plus /></template>
          新建角色
        </a-button>
      </template>
    </PageHeader>

    <div class="page-card">
      <div class="search-bar">
        <a-input v-model="q" placeholder="搜索角色名/编码" allow-clear style="width: 240px" @press-enter="load">
          <template #prefix><icon-search /></template>
        </a-input>
        <a-button type="primary" @click="load">搜索</a-button>
      </div>

      <a-table row-key="id" :loading="loading" :data="list" :pagination="false" :bordered="false" stripe>
        <template #columns>
          <a-table-column title="名称" data-index="name" />
          <a-table-column title="编码" data-index="code" :width="120" />
          <a-table-column title="排序" data-index="sort" :width="80" />
          <a-table-column title="状态" :width="90">
            <template #cell="{ record }">
              <a-tag :color="record.status === '1' ? 'green' : 'gray'">
                {{ record.status === '1' ? '启用' : '停用' }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column title="菜单数" :width="90">
            <template #cell="{ record }">{{ record.menuIds?.length || 0 }}</template>
          </a-table-column>
          <a-table-column title="描述" data-index="description" ellipsis tooltip />
          <a-table-column title="操作" :width="220" fixed="right">
            <template #cell="{ record }">
              <a-space>
                <a-button type="text" size="small" @click="openEdit(record)">编辑</a-button>
                <a-button type="text" size="small" @click="openPerm(record)">分配菜单</a-button>
                <a-popconfirm content="确认删除该角色？" @ok="remove(record.id)">
                  <a-button type="text" status="danger" size="small" :disabled="record.code === 'admin'">
                    删除
                  </a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </a-table-column>
        </template>
      </a-table>
    </div>

    <a-modal v-model:visible="visible" :title="editing ? '编辑角色' : '新建角色'" :ok-loading="saving" @ok="save">
      <a-form :model="form" layout="vertical">
        <a-form-item label="名称" required>
          <a-input v-model="form.name" />
        </a-form-item>
        <a-form-item label="编码" required>
          <a-input v-model="form.code" :disabled="editing && form.code === 'admin'" placeholder="如 ops" />
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

    <a-modal v-model:visible="permVisible" title="分配菜单" :ok-loading="saving" width="520px" @ok="savePerm">
      <a-tree
        v-if="menuTree.length"
        ref="menuTreeRef"
        v-model:checked-keys="checkedKeys"
        :checkable="true"
        :check-strictly="false"
        :data="menuTree"
        :field-names="{ key: 'id', title: 'title', children: 'children' }"
        :default-expand-all="true"
      />
      <a-empty v-else description="暂无菜单" />
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
const permVisible = ref(false);
const editing = ref(false);
const editId = ref('');
const q = ref('');
const list = ref<any[]>([]);
const menuTree = ref<any[]>([]);
const checkedKeys = ref<string[]>([]);
const permRoleId = ref('');
const menuTreeRef = ref<any>(null);

const form = reactive({
  name: '',
  code: '',
  sort: 0,
  status: '1',
  description: '',
});

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/roles', { params: { q: q.value || undefined } });
    list.value = Array.isArray(data) ? data : [];
  } finally {
    loading.value = false;
  }
}

async function loadMenus() {
  const { data } = await api.get('/admin/menus');
  menuTree.value = Array.isArray(data) ? data : [];
}

function openCreate() {
  editing.value = false;
  editId.value = '';
  Object.assign(form, { name: '', code: '', sort: 0, status: '1', description: '' });
  visible.value = true;
}

function openEdit(row: any) {
  editing.value = true;
  editId.value = row.id;
  Object.assign(form, {
    name: row.name,
    code: row.code,
    sort: row.sort || 0,
    status: row.status || '1',
    description: row.description || '',
  });
  visible.value = true;
}

function openPerm(row: any) {
  permRoleId.value = row.id;
  checkedKeys.value = [...(row.menuIds || [])];
  permVisible.value = true;
}

async function save() {
  if (!form.name.trim() || !form.code.trim()) return Message.warning('名称与编码必填');
  saving.value = true;
  try {
    if (editing.value) {
      await api.patch(`/admin/roles/${editId.value}`, { ...form });
    } else {
      await api.post('/admin/roles', { ...form });
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

async function savePerm() {
  saving.value = true;
  try {
    // 半选父节点也要写入，保证侧栏目录树完整
    const tree = menuTreeRef.value;
    const checked: string[] = tree?.getCheckedNodes?.(false)?.map((n: any) => n?.id || n?.key) || [
      ...checkedKeys.value,
    ];
    const half: string[] =
      tree?.getHalfCheckedNodes?.()?.map((n: any) => n?.id || n?.key).filter(Boolean) || [];
    const menuIds = [...new Set([...checked, ...half].filter(Boolean))];
    await api.patch(`/admin/roles/${permRoleId.value}`, { menuIds });
    Message.success('菜单权限已更新');
    permVisible.value = false;
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function remove(id: string) {
  try {
    await api.delete(`/admin/roles/${id}`);
    Message.success('已删除');
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '删除失败');
  }
}

onMounted(async () => {
  await Promise.all([load(), loadMenus()]);
});
</script>
