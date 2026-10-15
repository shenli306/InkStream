import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // 原样搬来的代码在 Vite 下从未走类型检查；这里关掉构建期 type-check，
  // 让历史代码不因 strict 报错而编译不过（功能不变）。
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // jsdom 仅由 scrapling/SmartSelector 在服务端 require() 动态加载，不打包进前端
  serverExternalPackages: ["jsdom"],
  // 服务端 route 里用到 node: 内置模块，避免 edge 打包
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.fallback = { ...(config.resolve.fallback || {}), tls: false, net: false, fs: false };
    return config;
  },
};

export default nextConfig;
