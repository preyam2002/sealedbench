import type { Metadata } from "next";
import { Archivo, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600", "900"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-archivo",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "SealedBench — the sealed-exam vault for AI benchmarks",
  description:
    "Provably-uncontaminated and provably-honestly-scored model evaluations, notarized on Sui.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${fraunces.variable} ${archivo.variable} ${jetbrains.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
