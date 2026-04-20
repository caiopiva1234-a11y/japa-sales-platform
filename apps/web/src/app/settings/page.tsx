"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type IntegrationSettings = {
  openaiApiKey: string;
  olistApiBaseUrl: string;
  olistApiToken: string;
  evolutionApiToken: string;
  olistAutoSyncEnabled: boolean;
  olistAutoSyncIntervalMinutes: number;
  olistMinManualIntervalMinutes: number;
};

type OlistSyncResponse = {
  message: string;
  retryAfterSeconds?: number;
  totalReceived?: number;
  rawListCount?: number;
  parsedOrders?: number;
  syncedOrders?: number;
  skippedOutOfRangeOrders?: string[];
  skippedInvalidDateOrders?: string[];
  skippedMissingCustomer?: string[];
  skippedOrders?: string[];
  remote?: {
    httpStatus: number;
    topLevelKeys: string[];
    chosenOrdersPath: string | null;
    rawType: string;
  };
};

export default function SettingsPage() {
  const [form, setForm] = useState<IntegrationSettings>({
    openaiApiKey: "",
    olistApiBaseUrl: "",
    olistApiToken: "",
    evolutionApiToken: "",
    olistAutoSyncEnabled: false,
    olistAutoSyncIntervalMinutes: 120,
    olistMinManualIntervalMinutes: 10
  });
  const [message, setMessage] = useState("");
  const [testingProvider, setTestingProvider] = useState<string>("");
  const [importStart, setImportStart] = useState("");
  const [importEnd, setImportEnd] = useState("");
  const [importMonths, setImportMonths] = useState(6);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const data = await apiFetch<IntegrationSettings>("/settings/integrations");
      setForm({
        ...data,
        olistAutoSyncEnabled: Boolean(data.olistAutoSyncEnabled),
        olistAutoSyncIntervalMinutes: Number(data.olistAutoSyncIntervalMinutes ?? 120),
        olistMinManualIntervalMinutes: Number(data.olistMinManualIntervalMinutes ?? 10)
      });
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

  function toUtcNoonIso(date: string) {
    return `${date}T12:00:00.000Z`;
  }

  function formatOlistSyncResult(result: OlistSyncResponse) {
    if (result.retryAfterSeconds) return result.message;

    const lista = result.rawListCount ?? result.totalReceived ?? 0;
    const parseados = result.parsedOrders ?? result.totalReceived ?? 0;
    const importados = result.syncedOrders ?? 0;
    const fora = result.skippedOutOfRangeOrders?.length ?? 0;
    const datasRuins = result.skippedInvalidDateOrders?.length ?? 0;
    const semCliente = result.skippedMissingCustomer?.length ?? 0;
    const erros = result.skippedOrders?.length ?? 0;

    const remote = result.remote;
    const remoteHint = remote
      ? `HTTP ${remote.httpStatus} | lista=${remote.chosenOrdersPath ?? "nenhuma"} | tipo=${remote.rawType} | keys=${remote.topLevelKeys
          .slice(0, 8)
          .join(",")}${remote.topLevelKeys.length > 8 ? "..." : ""}`
      : "";

    return `${result.message} Lista bruta: ${lista}. Parseados: ${parseados}. Importados: ${importados}. Fora do periodo: ${fora}. Datas invalidas: ${datasRuins}. Sem cliente/id: ${semCliente}. Erros upsert: ${erros}.${remoteHint ? ` ${remoteHint}` : ""}`;
  }

  async function importRange() {
    try {
      setImporting(true);
      if (!importStart || !importEnd) {
        setMessage("Selecione data inicial e final para importar por periodo.");
        return;
      }
      const since = new Date(toUtcNoonIso(importStart));
      const endInclusive = new Date(toUtcNoonIso(importEnd));
      const untilExclusive = new Date(endInclusive.getTime() + 24 * 60 * 60 * 1000);

      const result = await apiFetch<OlistSyncResponse>("/integrations/olist/sync", {
        method: "POST",
        body: JSON.stringify({
          since: since.toISOString(),
          until: untilExclusive.toISOString(),
          mode: "window"
        })
      });
      setMessage(formatOlistSyncResult(result));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na importacao.");
    } finally {
      setImporting(false);
    }
  }

  async function importLastMonths() {
    try {
      setImporting(true);
      const result = await apiFetch<OlistSyncResponse>("/integrations/olist/sync", {
        method: "POST",
        body: JSON.stringify({ months: importMonths, mode: "window" })
      });
      setMessage(formatOlistSyncResult(result));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na importacao.");
    } finally {
      setImporting(false);
    }
  }

  async function importSinceLast() {
    try {
      setImporting(true);
      const result = await apiFetch<OlistSyncResponse>("/integrations/olist/sync", {
        method: "POST",
        body: JSON.stringify({ months: importMonths, mode: "since_last" })
      });
      setMessage(formatOlistSyncResult(result));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na importacao.");
    } finally {
      setImporting(false);
    }
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
        <h2>Configuracoes</h2>
        <p>Integracoes, limites de requisicao e importacao de dados.</p>
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
          OLIST/Tiny API Base URL
          <input
            className="input"
            value={form.olistApiBaseUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, olistApiBaseUrl: event.target.value }))}
            placeholder="https://..."
          />
        </label>
        <label>
          OLIST/Tiny API Token
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

      <section className="card grid">
        <h3 style={{ margin: 0 }}>Limites e importacao automatica (OLIST/Tiny)</h3>
        <p className="muted" style={{ margin: 0 }}>
          Para proteger o limite de requisicoes, o servidor impoe um intervalo minimo entre chamadas remotas de
          listagem de pedidos (importacao manual, automatica e agendada compartilham o mesmo controle).
        </p>

        <div className="grid grid-3">
          <label>
            Intervalo minimo entre importacoes (minutos)
            <input
              className="input"
              type="number"
              min={5}
              value={form.olistMinManualIntervalMinutes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, olistMinManualIntervalMinutes: Number(event.target.value) }))
              }
            />
          </label>
          <label>
            Importacao automatica (intervalo, minutos)
            <input
              className="input"
              type="number"
              min={15}
              value={form.olistAutoSyncIntervalMinutes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, olistAutoSyncIntervalMinutes: Number(event.target.value) }))
              }
            />
          </label>
          <label className="row" style={{ alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={form.olistAutoSyncEnabled}
              onChange={(event) => setForm((prev) => ({ ...prev, olistAutoSyncEnabled: event.target.checked }))}
            />
            <span style={{ fontWeight: 700 }}>Ativar importacao automatica</span>
          </label>
        </div>

        <div>
          <button className="btn btn-primary" onClick={save}>
            Salvar limites/automatico
          </button>
        </div>
      </section>

      <section className="card grid">
        <h3 style={{ margin: 0 }}>Importar dados</h3>
        <p className="muted" style={{ margin: 0 }}>
          A importacao sempre faz uma unica chamada remota para listar pedidos e filtra no servidor (clientes e itens
          entram junto com os pedidos).
        </p>

        <div className="grid grid-3">
          <label>
            Data inicial
            <input className="input" type="date" value={importStart} onChange={(e) => setImportStart(e.target.value)} />
          </label>
          <label>
            Data final
            <input className="input" type="date" value={importEnd} onChange={(e) => setImportEnd(e.target.value)} />
          </label>
          <label>
            Meses (fallback / primeira carga incremental)
            <input
              className="input"
              type="number"
              min={1}
              max={60}
              value={importMonths}
              onChange={(e) => setImportMonths(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="row">
          <button className="btn btn-primary" type="button" disabled={importing} onClick={() => void importRange()}>
            {importing ? "Importando..." : "Importar por periodo"}
          </button>
          <button className="btn" type="button" disabled={importing} onClick={() => void importLastMonths()}>
            Importar ultimos N meses
          </button>
          <button className="btn" type="button" disabled={importing} onClick={() => void importSinceLast()}>
            Importar desde a ultima importacao
          </button>
        </div>
      </section>
    </main>
  );
}
