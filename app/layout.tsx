import type { Metadata } from "next";
import localFont from "next/font/local";
import { BackupBanner } from "@/components/backup-banner";
import { Nav } from "@/components/nav";
import { ScannerFieldGuard } from "@/components/scanner-field-guard";
import "./globals.css";

// Fonts ship with the app (OFL, files in app/fonts): the build needs no
// network and the shop laptop renders the same offline.
const plexSans = localFont({
  variable: "--font-sans",
  src: [
    { path: "./fonts/ibm-plex-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-700.woff2", weight: "700", style: "normal" },
  ],
});

const jetbrainsMono = localFont({
  variable: "--font-mono",
  src: [
    { path: "./fonts/jetbrains-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/jetbrains-mono-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/jetbrains-mono-700.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Asia To Go: Warenerfassung",
  description: "Interne Erfassungs-App für den Asia-Lebensmittelladen Schaffhausen",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de-CH" className={`dark ${plexSans.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Nav />
        <BackupBanner />
        <ScannerFieldGuard />
        {children}
      </body>
    </html>
  );
}
