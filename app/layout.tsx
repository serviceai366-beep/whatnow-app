import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatNow? — поймите, что делать дальше",
  description: "Понятное объяснение официальных документов и пошаговый план действий.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
