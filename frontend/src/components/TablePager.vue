<template>
  <div class="table-pager">
    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :page-sizes="pageSizes"
      :total="total"
      layout="total, sizes, prev, pager, next, jumper"
      background
    />
  </div>
</template>

<script setup lang="ts">
import { PAGE_SIZES } from '@/composables/useClientPager';

withDefaults(
  defineProps<{
    total: number;
    pageSizes?: number[];
  }>(),
  {
    pageSizes: () => [...PAGE_SIZES],
  },
);

const page = defineModel<number>('page', { required: true });
const pageSize = defineModel<number>('pageSize', { required: true });
</script>
