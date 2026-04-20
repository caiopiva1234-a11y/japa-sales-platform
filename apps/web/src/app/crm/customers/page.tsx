"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  externalId?: string | null;
  notes?: string | null;
  nextFollowUpAt?: string | null;
};

export default function CrmCustomersPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setMessage("");
      const data = await apiFetch<Customer[]>("/customers");
      setRows(data);
    } catch {
      setMessage("Nao foi possivel carregar clientes.");
    }
  }

  async function save(customer: Customer) {
    await apiFetch(`/customers/${customer.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        notes: customer.notes,
        nextFollowUpAt: customer.nextFollowUpAt ? `${customer.nextFollowUpAt}T12:00:00.000Z` : null
      })
    });
    await load();
  }

  return (
    <main className="container grid">
      <header className="card row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Clientes (CRM)</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Registre notas e proximo contato para o time agir rapido.
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

      <section className="card grid" style={{ gap: 14 }}>
        {rows.map((customer) => (
          <div key={customer.id} className="card" style={{ padding: 14 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 900 }}>{customer.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {customer.phone ?? "Sem telefone"}
                  {customer.externalId ? ` · Externo: ${customer.externalId}` : ""}
                </div>
              </div>
              <button className="btn btn-primary" type="button" onClick={() => void save(customer)}>
                Salvar
              </button>
            </div>

            <label className="grid" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Proximo contato
              </span>
              <input
                className="input"
                type="date"
                value={customer.nextFollowUpAt ? customer.nextFollowUpAt.slice(0, 10) : ""}
                onChange={(event) =>
                  setRows((prev) =>
                    prev.map((row) =>
                      row.id === customer.id ? { ...row, nextFollowUpAt: event.target.value || null } : row
                    )
                  )
                }
              />
            </label>

            <label className="grid" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Notas
              </span>
              <textarea
                className="input"
                rows={3}
                value={customer.notes ?? ""}
                onChange={(event) =>
                  setRows((prev) =>
                    prev.map((row) => (row.id === customer.id ? { ...row, notes: event.target.value } : row))
                  )
                }
              />
            </label>
          </div>
        ))}
      </section>
    </main>
  );
}
