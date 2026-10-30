import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InkStream - 小说下载器",
  description: "InkStream 小说下载器：全网搜书、智能分章、EPUB 打包",
  applicationName: "InkStream",
  appleWebApp: {
    capable: true,
    title: "InkStream",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false, email: false, address: false },
};

/* 移动端视口：viewport-fit=cover 是 env(safe-area-inset-*) 生效的前提，
   缺了它 App.tsx / dynamic-island.css / reader.css 里所有安全区变量在 iOS 上恒为 0 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#08070d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
