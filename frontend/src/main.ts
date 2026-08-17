import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { provideA2UI } from 'a2ui-vue';
import 'a2ui-vue/dist/a2ui-vue.css';
import App from './App.vue';
import router from './router';
import './styles/main.css';
import './styles/shell.css';
import './styles/studio-book.css';
import './styles/home-prompt.css';
import { useThemeStore } from './stores/theme';
import { assembleCatalog } from './a2ui/catalog';
import { A2UI_BASIC_CATALOG_ID, studioA2UITheme } from './a2ui/theme';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
useThemeStore();
provideA2UI({
  app,
  catalog: assembleCatalog,
  theme: studioA2UITheme,
  catalogId: A2UI_BASIC_CATALOG_ID,
});
app.use(router).use(ElementPlus, { locale: zhCn }).mount('#app');
