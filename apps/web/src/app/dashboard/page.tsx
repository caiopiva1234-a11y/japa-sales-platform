"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";

type Kpis = {
  totalCustomers: number;
  monthlyRevenue: number;
  averageTicket: number;
  whatsappSuccessRate: number;
  repurchaseAlerts: number;
};

type Conversation = {
  id: string;
  status: string;
  customer: { id: string; name: string; phone?: string | null };
  messages: Array<{ content: string }>;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  templateKey?: string | null;
  createdAt: string;
};

type RecommendationResult = {
  repurchaseList: Array<{
    productName: string;
    suggestedQuantity: number;
    repurchaseScore: number;
    possibleForget: boolean;
  }>;
  crossSell: Array<{ id: string; name: string }>;
};

export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [templateKey, setTemplateKey] = useState("recompra_padrao");
  const [retentionData, setRetentionData] = useState<{
    tasksByLane: Record<string, number>;
    activeLeads: number;
    convertedLeads: number;
    leadConversionRate: number;
    successfulApproaches: number;
  } | null>(null);
  const [outreachTasks, setOutreachTasks] = useState<
    Array<{ id: string; lane: string; reason: string; suggestedText: string | null; priority: number }>
  >([]);
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversation),
    [conversations, selectedConversation]
  );

  async function loadData() {
    const [kpiData, convData, retentionKpis, tasks] = await Promise.all([
      apiFetch<Kpis>("/dashboard/kpis"),
      apiFetch<Conversation[]>("/conversations"),
      apiFetch<{
        tasksByLane: Record<string, number>;
        activeLeads: number;
        convertedLeads: number;
        leadConversionRate: number;
        successfulApproaches: number;
      }>("/dashboard/retention-capture"),
      apiFetch<Array<{ id: string; lane: string; reason: string; suggestedText: string | null; priority: number }>>(
        "/automation/outreach-tasks"
      )
    ]);
    setKpis(kpiData);
    setConversations(convData);
    setRetentionData(retentionKpis);
    setOutreachTasks(tasks);
    if (convData.length && !selectedConversation) {
      await onSelectConversation(convData[0].id, convData[0].customer.id);
    }
  }

  async function onSelectConversation(conversationId: string, customerId: string) {
    setSelectedConversation(conversationId);
    const [messageData, recommendationData] = await Promise.all([
      apiFetch<Message[]>(`/conversations/${conversationId}/messages`),
      apiFetch<RecommendationResult>(`/recommendations/${customerId}`)
    ]);
    setMessages(messageData);
    setRecommendations(recommendationData);
  }

  async function sendMessage() {
    if (!draft.trim() || !selectedConversation) return;
    await apiFetch("/whatsapp/send", {
      method: "POST",
      body: JSON.stringify({
        conversationId: selectedConversation,
        content: draft.trim(),
        templateKey
      })
    });
    setDraft("");
    if (activeConversation) {
      await onSelectConversation(selectedConversation, activeConversation.customer.id);
    }
  }

  async function runAnalysis() {
    if (!selectedConversation) return;
    await apiFetch(`/ai/analyze/${selectedConversation}`, { method: "POST" });
    alert("Analise concluida e registrada no dashboard.");
  }

  async function markOutcome(result: "sucesso" | "pendente" | "sem_sucesso" | "sem_resposta") {
    if (!selectedConversation) return;
    await apiFetch(`/conversations/${selectedConversation}/outcome`, {
      method: "POST",
      body: JSON.stringify({ result })
    });
    alert("Resultado da abordagem registrado.");
    await loadData();
  }

  async function refreshAutomation() {
    await apiFetch("/automation/run/retention-capture", { method: "POST" });
    await loadData();
  }

  return (
    <main className="container grid" style={{ gap: 20 }}>
      <header className="card">
        <h2>Painel Comercial - Japa Atacado</h2>
        <p>Recompra, atendimento e automacoes em uma unica plataforma.</p>
        <p>
          <a href="/settings">Ir para Configuracoes de Integracoes</a>
        </p>
      </header>

      <section className="grid grid-3">
        <div className="card">
          <strong>Clientes ativos</strong>
          <p>{kpis?.totalCustomers ?? 0}</p>
        </div>
        <div className="card">
          <strong>Faturamento do mes</strong>
          <p>R$ {(kpis?.monthlyRevenue ?? 0).toFixed(2)}</p>
        </div>
        <div className="card">
          <strong>Taxa de sucesso WhatsApp</strong>
          <p>{(kpis?.whatsappSuccessRate ?? 0).toFixed(1)}%</p>
        </div>
      </section>

      <section className="grid grid-3">
        <div className="card">
          <strong>Leads ativos</strong>
          <p>{retentionData?.activeLeads ?? 0}</p>
        </div>
        <div className="card">
          <strong>Conversao de captacao</strong>
          <p>{(retentionData?.leadConversionRate ?? 0).toFixed(1)}%</p>
        </div>
        <div className="card">
          <strong>Esteiras em andamento</strong>
          <p>
            {Object.entries(retentionData?.tasksByLane ?? {})
              .map(([lane, count]) => `${lane}: ${count}`)
              .join(" | ") || "Sem esteiras carregadas."}
          </p>
          <button className="btn" onClick={refreshAutomation}>
            Atualizar esteiras
          </button>
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: "320px 1fr 320px" }}>
        <aside className="card">
          <h3>Tenda de atendimento</h3>
          <div className="grid">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className="btn"
                style={{
                  textAlign: "left",
                  background: selectedConversation === conversation.id ? "#dbeafe" : "#f8fafc"
                }}
                onClick={() => onSelectConversation(conversation.id, conversation.customer.id)}
              >
                <strong>{conversation.customer.name}</strong>
                <div style={{ fontSize: 12 }}>
                  {conversation.messages[0]?.content ?? "Sem mensagens."}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className="card">
          <h3>Conversa</h3>
          <div style={{ minHeight: 320, maxHeight: 420, overflow: "auto" }}>
            {messages.map((message) => (
              <p
                key={message.id}
                style={{
                  textAlign: message.direction === "outbound" ? "right" : "left",
                  margin: "8px 0"
                }}
              >
                <span
                  style={{
                    background: message.direction === "outbound" ? "#bfdbfe" : "#e2e8f0",
                    borderRadius: 8,
                    padding: "6px 10px",
                    display: "inline-block"
                  }}
                >
                  {message.content}
                </span>
              </p>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: "220px 1fr auto auto" }}>
            <select
              className="input"
              value={templateKey}
              onChange={(event) => setTemplateKey(event.target.value)}
            >
              <option value="recompra_padrao">Template recompra padrao</option>
              <option value="reativacao_30d">Template reativacao 30d</option>
              <option value="captacao_primeiro_contato">Template captacao inicial</option>
            </select>
            <input
              className="input"
              placeholder="Digite a mensagem..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button className="btn btn-primary" onClick={sendMessage}>
              Enviar
            </button>
            <button className="btn" onClick={runAnalysis}>
              Analise IA
            </button>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(4, auto)", marginTop: 10 }}>
            <button className="btn" onClick={() => markOutcome("sucesso")}>
              Marcar sucesso
            </button>
            <button className="btn" onClick={() => markOutcome("pendente")}>
              Marcar pendente
            </button>
            <button className="btn" onClick={() => markOutcome("sem_sucesso")}>
              Marcar sem sucesso
            </button>
            <button className="btn" onClick={() => markOutcome("sem_resposta")}>
              Sem resposta
            </button>
          </div>
        </div>

        <aside className="card">
          <h3>Sugestao de venda</h3>
          <p style={{ fontSize: 13, color: "#475569" }}>
            Itens de recompra com chance de esquecimento e sugestoes de cross-sell.
          </p>
          <div className="grid">
            {recommendations?.repurchaseList?.slice(0, 8).map((item) => (
              <div key={`${item.productName}-${item.repurchaseScore}`}>
                <strong>{item.productName}</strong>
                <div style={{ fontSize: 12 }}>
                  Sugerir {item.suggestedQuantity} un. | Score {item.repurchaseScore.toFixed(0)}
                  {item.possibleForget ? " | Esquecimento" : ""}
                </div>
              </div>
            ))}
          </div>
          <hr style={{ margin: "14px 0", borderColor: "#e2e8f0" }} />
          <h4>Fila de abordagem</h4>
          <div className="grid">
            {outreachTasks.slice(0, 6).map((task) => (
              <div key={task.id}>
                <strong>{task.lane}</strong>
                <div style={{ fontSize: 12 }}>
                  Prioridade {task.priority} | {task.reason}
                </div>
                {task.suggestedText ? <div style={{ fontSize: 12 }}>{task.suggestedText}</div> : null}
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
