import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { DataProvider } from "@/lib/data-context";
import { cn } from "@/lib/utils";


export const metadata: Metadata = {
  title: "LipaSafe — Secretary Dashboard",
  description: "Diaspora escrow management dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DataProvider>{children}</DataProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}