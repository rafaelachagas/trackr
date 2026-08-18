import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Uber Move (arquivos locais fornecidos pelo usuário em app/fonts). A licença dos
// arquivos é responsabilidade do usuário.
const uberMove = localFont({
  src: [
    { path: "./fonts/UberMoveTextLight.otf", weight: "300", style: "normal" },
    { path: "./fonts/UberMoveTextRegular.otf", weight: "400", style: "normal" },
    { path: "./fonts/UberMoveTextMedium.otf", weight: "500", style: "normal" },
    { path: "./fonts/UberMoveTextBold.otf", weight: "700", style: "normal" },
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
      <body className={`${uberMove.variable} min-h-full`}>{children}</body>
    </html>
  );
}
