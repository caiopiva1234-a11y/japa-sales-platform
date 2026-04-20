import Link from "next/link";

export default function DatabaseHomePage() {
  return (
    <main className="container grid">
      <header className="card">
        <h2 style={{ margin: 0 }}>Banco de dados</h2>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Cadastros locais alimentados por importacoes e operacoes internas.
        </p>
      </header>

      <section className="grid grid-3">
        <Link className="card" href="/database/customers" style={{ textDecoration: "none", color: "inherit" }}>
          <h3 style={{ marginTop: 0 }}>Clientes</h3>
          <p className="muted" style={{ margin: 0 }}>
            Lista completa com ultimos pedidos (amostra).
          </p>
        </Link>
        <Link className="card" href="/database/orders" style={{ textDecoration: "none", color: "inherit" }}>
          <h3 style={{ marginTop: 0 }}>Pedidos</h3>
          <p className="muted" style={{ margin: 0 }}>
            Pedidos com itens expandidos.
          </p>
        </Link>
        <Link className="card" href="/database/products" style={{ textDecoration: "none", color: "inherit" }}>
          <h3 style={{ marginTop: 0 }}>Produtos</h3>
          <p className="muted" style={{ margin: 0 }}>
            Catalogo por SKU.
          </p>
        </Link>
      </section>
    </main>
  );
}
