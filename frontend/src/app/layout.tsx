import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/branding";
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
  description: APP_DESCRIPTION
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
