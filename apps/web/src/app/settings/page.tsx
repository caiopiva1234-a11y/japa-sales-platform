"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type IntegrationSettings = {
  openaiApiKey: string;
  olistApiBaseUrl: string;
  olistApiToken: string;
  evolutionApiToken: string;
};

export default function SettingsPage() {
  const [form, setForm] = useState<IntegrationSettings>({
    openaiApiKey: "",
    olistApiBaseUrl: "",
    olistApiToken: "",
    evolutionApiToken: ""
  });
  const [message, setMessage] = useState("");
  const [testingProvider, setTestingProvider] = useState<string>("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const data = await apiFetch<IntegrationSettings>("/settings/integrations");
      setForm(data);
    } catch {
      setMessage("Nao foi possivel carregar configuracoes.");
    }
  }

  async function save() {
    await apiFetch("/settings/integrations", {
      method: "POST",
      body: JSON.stringify(form)
    });
    setMessage("Configuracoes salvas com sucesso.");
    await load();
  }

  async function testConnection(provider: "openai" | "olist" | "evolution") {
    try {
      setTestingProvider(provider);
      const result = await apiFetch<{ ok: boolean; message: string }>("/settings/integrations/test", {
        method: "POST",
        body: JSON.stringify({ provider })
      });
      setMessage(result.message);
    } catch (error) {
      setMessage(
        error instanceof Error ? `Falha no teste de ${provider}: ${error.message}` : "Falha no teste."
      );
    } finally {
      setTestingProvider("");
    }
  }

  return (
    <main className="container grid" style={{ gap: 20 }}>
      <header className="card">
        <h2>Configuracoes de Integracoes</h2>
        <p>Salve tokens e URLs de integracao sem expor os segredos no frontend.</p>
      </header>

      <section className="card grid">
        <label>
          OpenAI API Key
          <input
            className="input"
            value={form.openaiApiKey}
            onChange={(event) => setForm((prev) => ({ ...prev, openaiApiKey: event.target.value }))}
            placeholder="sk-..."
          />
          <button
            className="btn"
            type="button"
            onClick={() => testConnection("openai")}
            disabled={testingProvider === "openai"}
            style={{ marginTop: 8 }}
          >
            {testingProvider === "openai" ? "Testando..." : "Testar OpenAI"}
          </button>
        </label>
        <label>
          OLIST API Base URL
          <input
            className="input"
            value={form.olistApiBaseUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, olistApiBaseUrl: event.target.value }))}
            placeholder="https://..."
          />
        </label>
        <label>
          OLIST API Token
          <input
            className="input"
            value={form.olistApiToken}
            onChange={(event) => setForm((prev) => ({ ...prev, olistApiToken: event.target.value }))}
            placeholder="Token OLIST"
          />
          <button
            className="btn"
            type="button"
            onClick={() => testConnection("olist")}
            disabled={testingProvider === "olist"}
            style={{ marginTop: 8 }}
          >
            {testingProvider === "olist" ? "Testando..." : "Testar OLIST"}
          </button>
        </label>
        <label>
          Evolution API Token
          <input
            className="input"
            value={form.evolutionApiToken}
            onChange={(event) => setForm((prev) => ({ ...prev, evolutionApiToken: event.target.value }))}
            placeholder="Token Evolution"
          />
          <button
            className="btn"
            type="button"
            onClick={() => testConnection("evolution")}
            disabled={testingProvider === "evolution"}
            style={{ marginTop: 8 }}
          >
            {testingProvider === "evolution" ? "Testando..." : "Testar Evolution"}
          </button>
        </label>
        <div>
          <button className="btn btn-primary" onClick={save}>
            Salvar configuracoes
          </button>
        </div>
        {message ? <p>{message}</p> : null}
      </section>
    </main>
  );
}
