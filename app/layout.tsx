import type { Metadata } from "next";
import { Funnel_Display, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const funnelDisplay = Funnel_Display({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "B&B Tech",
  description:
    "B&B Tech — importación, extracción con IA, conciliación y exportación de extractos bancarios para ETHOS Gestión Contable.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-AR"
      className={`${funnelDisplay.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-foreground bg-app-gradient">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
