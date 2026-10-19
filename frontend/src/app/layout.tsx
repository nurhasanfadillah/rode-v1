import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Outfit } from "next/font/google";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/Pwa";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "RODE — Redone Output Data Entry",
  description: "Sistem pencatatan & monitoring produksi real-time PT REDONE BERKAH MANDIRI",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, title: "RODE", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0A2463", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${outfit.variable} ${mono.variable}`}>
      <body>
        {children}
        <Toaster position="top-center" richColors closeButton />
        <PwaRegister />
      </body>
    </html>
  );
}
