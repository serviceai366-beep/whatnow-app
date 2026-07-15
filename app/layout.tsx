import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatNow? — know what to do next",
  description: "Plain-language document explanations, action plans, a private calendar, and reminders.",
  icons: {
    icon: [{ url: "/whatnow-logo.jpg", type: "image/jpeg" }],
    apple: "/whatnow-logo.jpg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
