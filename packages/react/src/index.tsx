import { useEffect, useRef, type CSSProperties } from 'react';
import { mount, type ODataUIInstance, type ODataUIMountOptions } from '@odata-ui/core';

export interface ODataUIProps extends ODataUIMountOptions {
  className?: string;
  style?: CSSProperties;
}

export function ODataUI({
  url,
  metadata,
  headers,
  requestInterceptor,
  theme,
  fetch,
  className,
  style,
}: ODataUIProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<ODataUIInstance | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const instance = mount(el, {
      url,
      metadata,
      headers,
      requestInterceptor,
      theme,
      fetch,
    });
    instanceRef.current = instance;
    return () => {
      instance.unmount();
      instanceRef.current = null;
    };
  }, [headers, requestInterceptor, fetch]);

  useEffect(() => {
    if (url && instanceRef.current) {
      void instanceRef.current.setUrl(url);
    }
  }, [url]);

  useEffect(() => {
    if (metadata && instanceRef.current) {
      instanceRef.current.loadMetadata(metadata, url);
    }
  }, [metadata, url]);

  useEffect(() => {
    if (theme && instanceRef.current) {
      instanceRef.current.setTheme(theme);
    }
  }, [theme]);

  return (
    <div ref={hostRef} className={className} style={{ width: '100%', height: '100%', ...style }} />
  );
}

export default ODataUI;
