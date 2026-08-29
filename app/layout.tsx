import type { Metadata } from "next";
import localFont from "next/font/local";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

// Tipografia da marca (rebrand): Space Grotesk (Google Fonts), pesos 500/600/700.
// Vira a fonte principal do app; Uber Move fica de fallback.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-brand",
  display: "swap",
});

// Uber Move (arquivos locais fornecidos pelo usuário em app/fonts). A licença dos
// arquivos é responsabilidade do usuário.
const uberMove = localFont({
  src: [
    { path: "./fonts/UberMoveTextLight.otf", weight: "300", style: "normal" },
    { path: "./fonts/UberMoveTextRegular.otf", weight: "400", style: "normal" },
    { path: "./fonts/UberMoveTextMedium.otf", weight: "500", style: "normal" },
    { path: "./fonts/UberMoveTextMedium.otf", weight: "600", style: "normal" },
    { path: "./fonts/UberMoveTextBold.otf", weight: "700", style: "normal" },
    // UberMove só vai até Bold (700). Mapeamos 800/900 pro Bold REAL pra evitar o
    // "falso-negrito" sintético do navegador nos títulos com font-black.
    { path: "./fonts/UberMoveTextBold.otf", weight: "800", style: "normal" },
    { path: "./fonts/UberMoveTextBold.otf", weight: "900", style: "normal" },
  ],
  variable: "--font-app",
  display: "swap",
});

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
      <body className={`${spaceGrotesk.variable} ${uberMove.variable} min-h-full`}>{children}</body>
    </html>
  );
}
