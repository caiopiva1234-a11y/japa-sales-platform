"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";

type LoginResponse = {
  token: string;
  user: { id: string; name: string; email: string; role: string };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@japaatacado.com");
  const [password, setPassword] = useState("12345678");
  const [error, setError] = useState("");

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      const result = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem("japa_token", result.token);
      localStorage.setItem("japa_user", JSON.stringify(result.user));
      router.push("/dashboard");
    } catch {
      setError("Nao foi possivel autenticar. Verifique usuario e senha.");
    }
  };

  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 460, margin: "100px auto" }}>
        <h1>Japa Atacado - Plataforma Comercial</h1>
        <p>Login interno para equipe de atendimento e vendas.</p>
        <form onSubmit={onSubmit} className="grid">
          <input
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            placeholder="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p style={{ color: "#c53030" }}>{error}</p> : null}
          <button className="btn btn-primary" type="submit">
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
