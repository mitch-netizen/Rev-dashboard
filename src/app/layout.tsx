import type { Metadata } from "next";
import { IBM_Plex_Sans, Playfair_Display, Geist_Mono } from "next/font/google";
import "./globals.css";

// The Queens brand pairing, used site-wide (not just the printable report):
// IBM Plex Sans for body text and data, Playfair Display for headings and
// headline figures.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Revenue Dashboard — The Queens Gladstone",
  description: "Daily revenue tracking for The Queens Hotel Gladstone",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${playfairDisplay.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
