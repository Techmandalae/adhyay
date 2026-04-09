import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import { Footer } from "@/components/layout/Footer";
import { APP_NAME } from "@/lib/branding";
import "./globals.css";
import { Providers } from "./providers";

const displayFont = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"]
});

const bodyFont = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Smart exam generation platform",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/logo-icon.png"
  },
  openGraph: {
    images: ["/logo-full.png"]
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} flex min-h-screen flex-col antialiased`}>
        <Providers>
          <div className="flex min-h-screen flex-1 flex-col">{children}</div>
        </Providers>
        <Footer />
      </body>
    </html>
  );
}
