import type { Metadata } from "next";
import { Work_Sans, Big_Shoulders, Geist_Mono } from "next/font/google";
import "./globals.css";

// The Queens Hotel Gladstone's real brand pairing (from the venue's design
// system), used site-wide (not just the printable report): Work Sans for
// body text and data, Big Shoulders Display for headings and headline
// figures (rendered upper-case via .font-display in globals.css, matching
// the brand's all-caps section headers).
const plexSans = Work_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const playfairDisplay = Big_Shoulders({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
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
