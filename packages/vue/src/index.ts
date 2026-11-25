import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue';
import {
  mount,
  type HeadersProvider,
  type ODataUIInstance,
  type RequestInterceptor,
  type ThemeMode,
} from '@odata-ui/core';

export const ODataUI = defineComponent({
  name: 'ODataUI',
  props: {
    url: { type: String, default: undefined },
    metadata: { type: String, default: undefined },
    headers: { type: [Object, Function] as PropType<HeadersProvider>, default: undefined },
    requestInterceptor: { type: Function as PropType<RequestInterceptor>, default: undefined },
    theme: { type: String as PropType<ThemeMode>, default: 'auto' },
  },
  setup(props) {
    const hostRef = ref<HTMLElement | null>(null);
    let instance: ODataUIInstance | null = null;

    onMounted(() => {
      if (!hostRef.value) return;
      instance = mount(hostRef.value, {
        url: props.url,
        metadata: props.metadata,
        headers: props.headers,
        requestInterceptor: props.requestInterceptor,
        theme: props.theme,
      });
    });

    watch(
      () => props.url,
      (nextUrl) => {
        if (nextUrl && instance) {
          void instance.setUrl(nextUrl);
        }
      },
    );

    watch(
      () => props.metadata,
      (nextMeta) => {
        if (nextMeta && instance) {
          instance.loadMetadata(nextMeta, props.url);
        }
      },
    );

    watch(
      () => props.theme,
      (nextTheme) => {
        if (nextTheme && instance) {
          instance.setTheme(nextTheme);
        }
      },
    );

    onBeforeUnmount(() => {
      instance?.unmount();
      instance = null;
    });

    return () =>
      h('div', {
        ref: hostRef,
        style: { width: '100%', height: '100%' },
      });
  },
});

export default ODataUI;
