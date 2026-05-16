import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trackr Dashboard",
  description: "Painel de Gestão de Tráfego Pago - Hotmart + Meta Ads + VTurb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className={`${inter.className} min-h-full`}>{children}</body>
    </html>
  );
}
