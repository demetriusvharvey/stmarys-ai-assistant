import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const ST_MARYS_LOGO_URL = "/branding/stmarys-logo.svg";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "St. Mary's AI Workforce",
  description: "An intelligent workforce of AI agents for St. Mary's staff",
  icons: {
    icon: [{ url: ST_MARYS_LOGO_URL, type: "image/svg+xml" }],
    shortcut: [ST_MARYS_LOGO_URL],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
