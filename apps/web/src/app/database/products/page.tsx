"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type Product = {
  id: string;
  sku: string;
  name: string;
  category?: string | null;
  margin?: number | null;
  _count: { orderItems: number };
};

export default function ProductsPage() {
  const [rows, setRows] = useState<Product[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setMessage("");
      const data = await apiFetch<Product[]>("/catalog/products");
      setRows(data);
    } catch {
      setMessage("Nao foi possivel carregar produtos.");
    }
  }

  return (
    <main className="container grid">
      <header className="card row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Produtos</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Catalogo local (SKU unico). A coluna “Pedidos” indica quantas linhas de item ja apareceram em pedidos.
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
              <th>SKU</th>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Margem</th>
              <th>Pedidos (linhas)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => (
              <tr key={product.id}>
                <td className="muted">{product.sku}</td>
                <td style={{ fontWeight: 700 }}>{product.name}</td>
                <td>{product.category ?? "-"}</td>
                <td>{product.margin === null || product.margin === undefined ? "-" : `${product.margin}`}</td>
                <td>{product._count.orderItems}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
