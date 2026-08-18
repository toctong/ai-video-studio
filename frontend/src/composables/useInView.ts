import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

/** IntersectionObserver：进入视口（含预加载边距）才算可见 */
export function useInView(opts?: { rootMargin?: string; once?: boolean }) {
  const el = ref<HTMLElement | null>(null) as Ref<HTMLElement | null>;
  const inView = ref(false);
  let io: IntersectionObserver | null = null;

  function observe(node: HTMLElement | null) {
    if (!io) return;
    if (el.value && el.value !== node) io.unobserve(el.value);
    el.value = node;
    if (node) io.observe(node);
  }

  onMounted(() => {
    io = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        if (vis) {
          inView.value = true;
          if (opts?.once && el.value) io?.unobserve(el.value);
        } else if (!opts?.once) {
          inView.value = false;
        }
      },
      { root: null, rootMargin: opts?.rootMargin ?? '180px 0px', threshold: 0.01 },
    );
    if (el.value) io.observe(el.value);
  });

  onBeforeUnmount(() => {
    io?.disconnect();
    io = null;
  });

  watch(el, (n, o) => {
    if (!io) return;
    if (o) io.unobserve(o);
    if (n) io.observe(n);
  });

  return { el, inView, observe };
}
