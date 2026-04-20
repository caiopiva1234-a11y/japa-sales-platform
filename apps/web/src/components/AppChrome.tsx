"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinkStyle: CSSProperties = {
  textDecoration: "none",
  color: "#1d2433",
  fontWeight: 600,
  padding: "8px 10px",
  borderRadius: 8
};

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideChrome = pathname === "/";

  if (hideChrome) return <>{children}</>;

  const activeStyle = (href: string): CSSProperties => {
    const active =
      href === "/database"
        ? pathname === "/database" || pathname.startsWith("/database/")
        : pathname === href || pathname.startsWith(`${href}/`);
    return {
      ...navLinkStyle,
      background: active ? "#e7f0ff" : "transparent"
    };
  };

  return (
    <div>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "#ffffffcc",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid #e2e8f0"
        }}
      >
        <div
          className="container"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            paddingTop: 12,
            paddingBottom: 12
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontWeight: 800, letterSpacing: -0.2 }}>Japa Atacado</div>
            <div style={{ color: "#64748b", fontSize: 13 }}>Plataforma comercial</div>
          </div>

          <nav style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
            <Link href="/dashboard" style={activeStyle("/dashboard")}>
              Painel
            </Link>
            <Link href="/crm" style={activeStyle("/crm")}>
              CRM
            </Link>
            <Link href="/database" style={activeStyle("/database")}>
              Banco de dados
            </Link>
            <Link href="/settings" style={activeStyle("/settings")}>
              Configuracoes
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
