"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";

type CrmSummary = {
  customers: number;
  leads: number;
  pendingTasks: number;
  followUpsToday: number;
  leadsByStage: Record<string, number>;
};

export default function CrmHomePage() {
  const [summary, setSummary] = useState<CrmSummary | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setMessage("");
      const data = await apiFetch<CrmSummary>("/crm/summary");
      setSummary(data);
    } catch {
      setMessage("Nao foi possivel carregar o resumo do CRM.");
    }
  }

  return (
    <main className="container grid">
      <header className="card row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>CRM</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Central para leads, follow-ups e tarefas comerciais (sem depender de WhatsApp).
          </p>
        </div>
        <button className="btn" type="button" onClick={() => void load()}>
          Atualizar
        </button>
      </header>

      {message ? (
        <div className="card">
          <p style={{ margin: 0 }}>{message}</p>
        </div>
      ) : null}

      <section className="grid grid-3">
        <div className="card">
          <strong>Clientes</strong>
          <p>{summary?.customers ?? 0}</p>
        </div>
        <div className="card">
          <strong>Leads</strong>
          <p>{summary?.leads ?? 0}</p>
        </div>
        <div className="card">
          <strong>Tarefas pendentes</strong>
          <p>{summary?.pendingTasks ?? 0}</p>
        </div>
      </section>

      <section className="grid grid-3">
        <div className="card">
          <strong>Follow-ups hoje</strong>
          <p>{summary?.followUpsToday ?? 0}</p>
        </div>
        <div className="card" style={{ gridColumn: "span 2" }}>
          <strong>Leads por etapa</strong>
          <p className="muted" style={{ marginTop: 8 }}>
            {summary?.leadsByStage && Object.keys(summary.leadsByStage).length
              ? Object.entries(summary.leadsByStage)
                  .map(([stage, count]) => `${stage}: ${count}`)
                  .join(" · ")
              : "Sem dados ainda."}
          </p>
        </div>
      </section>

      <section className="grid grid-3">
        <Link className="card" href="/crm/leads" style={{ textDecoration: "none", color: "inherit" }}>
          <h3 style={{ marginTop: 0 }}>Funil de leads</h3>
          <p className="muted" style={{ margin: 0 }}>
            Mover etapas rapidamente.
          </p>
        </Link>
        <Link className="card" href="/crm/tasks" style={{ textDecoration: "none", color: "inherit" }}>
          <h3 style={{ marginTop: 0 }}>Tarefas</h3>
          <p className="muted" style={{ margin: 0 }}>
            Executar follow-ups e snooze.
          </p>
        </Link>
        <Link className="card" href="/crm/customers" style={{ textDecoration: "none", color: "inherit" }}>
          <h3 style={{ marginTop: 0 }}>Clientes (CRM)</h3>
          <p className="muted" style={{ margin: 0 }}>
            Notas e proximo contato.
          </p>
        </Link>
      </section>
    </main>
  );
}
