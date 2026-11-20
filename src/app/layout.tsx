import { PlayerHoverProvider } from "@/components/players/PlayerHoverCard";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ScrollToTop } from "@/components/ScrollToTop";
import { siteMetadata } from "@/components/Seo";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { getSessionIdentity } from "@/lib/auth/session";
import { demoEnabled, missingAuthConfiguration } from "@/lib/auth/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = siteMetadata;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionIdentity().catch(() => null);
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full text-slate-100">
        <div className="min-h-screen bg-transparent">
          <ScrollToTop />
          <AuthProvider
            initialUser={user}
            demoAllowed={demoEnabled()}
            missingConfiguration={missingAuthConfiguration()}
          >
            <PlayerHoverProvider>{children}</PlayerHoverProvider>
          </AuthProvider>
        </div>
      </body>
    </html>
  );
}
