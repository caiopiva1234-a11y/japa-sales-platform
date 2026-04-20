"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type Order = {
  id: string;
  externalId?: string | null;
  orderDate: string;
  totalValue: number;
  status: string;
  customer: { id: string; name: string; phone?: string | null };
  items: Array<{ quantity: number; unitPrice: number; product: { sku: string; name: string } }>;
};

export default function OrdersPage() {
  const [rows, setRows] = useState<Order[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setMessage("");
      const data = await apiFetch<Order[]>("/sales/orders");
      setRows(data);
    } catch {
      setMessage("Nao foi possivel carregar pedidos.");
    }
  }

  return (
    <main className="container grid">
      <header className="card row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Pedidos</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Itens aparecem expandidos abaixo de cada pedido.
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

      <section className="card grid" style={{ gap: 12 }}>
        {rows.map((order) => (
          <div key={order.id} className="card" style={{ padding: 14 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800 }}>{order.customer.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {new Date(order.orderDate).toLocaleString("pt-BR")} · {order.status}
                </div>
              </div>
              <div style={{ fontWeight: 900 }}>R$ {order.totalValue.toFixed(2)}</div>
            </div>

            <div className="muted" style={{ fontSize: 12 }}>
              Pedido: {order.id}
              {order.externalId ? ` · Externo: ${order.externalId}` : ""}
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Itens</div>
              {order.items.length ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Produto</th>
                      <th>Qtd</th>
                      <th>Preco</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, index) => (
                      <tr key={`${order.id}-${item.product.sku}-${index}`}>
                        <td className="muted">{item.product.sku}</td>
                        <td>{item.product.name}</td>
                        <td>{item.quantity}</td>
                        <td>R$ {item.unitPrice.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="muted">Sem itens.</div>
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
