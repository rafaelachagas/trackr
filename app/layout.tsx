import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// Manrope: alternativa gratuita (Google Fonts) próxima da Uber Move usada pela Utmify.
// Uber Move é proprietária da Uber, não licenciável. Teste — reverter é só voltar pra Inter.
const inter = Manrope({ subsets: ["latin"], variable: "--font-app" });

export const metadata: Metadata = {
  title: "The Track",
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
