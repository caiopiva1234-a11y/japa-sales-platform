"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type Customer = {
  id: string;
  externalId?: string | null;
  name: string;
  phone?: string | null;
  city?: string | null;
  segment?: string | null;
  orders: Array<{ id: string; orderDate: string; totalValue: number; status: string }>;
};

export default function CustomersPage() {
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

  return (
    <main className="container grid">
      <header className="card row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Clientes</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Cadastro local sincronizado via importacao OLIST/Tiny (quando houver pedidos associados).
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

      <section className="card" style={{ overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Externo</th>
              <th>Ultimos pedidos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{customer.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {customer.city ? `${customer.city}` : ""}
                    {customer.segment ? `${customer.city ? " · " : ""}${customer.segment}` : ""}
                  </div>
                </td>
                <td>{customer.phone ?? "-"}</td>
                <td className="muted">{customer.externalId ?? "-"}</td>
                <td>
                  {customer.orders.length ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {customer.orders.map((order) => (
                        <li key={order.id} className="muted">
                          {new Date(order.orderDate).toLocaleString("pt-BR")} · R$ {order.totalValue.toFixed(2)} ·{" "}
                          {order.status}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="muted">Sem pedidos recentes</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
