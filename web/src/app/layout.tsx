import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "資産管理 | 我が家の月次資産・支払い管理",
  description: "夫婦で利用する自宅の月次資産・クレジットカード支払い管理アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold">
              資産管理
            </Link>
            <nav className="flex gap-4 text-sm font-medium text-muted-foreground">
              <Link href="/" className="transition-colors hover:text-foreground">
                ダッシュボード
              </Link>
              <Link href="/input" className="transition-colors hover:text-foreground">
                データ入力
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
