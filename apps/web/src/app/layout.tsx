import "./globals.css";
import type { ReactNode } from "react";
import { AppChrome } from "../components/AppChrome";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
