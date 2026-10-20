import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InkStream - 小说下载器",
  description: "InkStream 小说下载器：全网搜书、智能分章、EPUB 打包",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
