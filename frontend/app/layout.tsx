import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NavBar } from "@/components/nav-bar";
import { AuthProvider } from "@/lib/auth-context";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OPD Claim Adjudication",
  description: "AI-powered OPD insurance claim adjudication tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.className}>
      <body className="min-h-screen bg-gray-50">
        <AuthProvider>
          <NavBar />
          <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
          <Toaster richColors />
        </AuthProvider>
      </body>
    </html>
  );
}
