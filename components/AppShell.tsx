'use client';

import { useEffect, useState } from "react";
import App from "@/App";

// 原 SPA 全靠浏览器渲染。这里等价地仅在客户端挂载 App：
// 首次 SSR 返回空占位，mount 后再渲染真正的 App，避免组件里
// window/document 的访问在服务端报错，且保持 App.tsx 源码原样。
export default function AppShell() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <App />;
}
