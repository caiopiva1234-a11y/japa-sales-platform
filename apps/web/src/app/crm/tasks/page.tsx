"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type CrmTask = {
  id: string;
  lane: string;
  priority: number;
  reason: string;
  suggestedText?: string | null;
  dueAt: string;
  customer?: { id: string; name: string; phone?: string | null } | null;
  lead?: { id: string; name: string; phone?: string | null } | null;
};

export default function CrmTasksPage() {
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setMessage("");
      const data = await apiFetch<CrmTask[]>("/crm/tasks");
      setTasks(data);
    } catch {
      setMessage("Nao foi possivel carregar tarefas.");
    }
  }

  async function completeTask(id: string) {
    await apiFetch(`/automation/outreach-tasks/${id}/complete`, { method: "POST", body: JSON.stringify({}) });
    await load();
  }

  async function snoozeTask(id: string, hours: number) {
    await apiFetch(`/automation/outreach-tasks/${id}/snooze`, {
      method: "POST",
      body: JSON.stringify({ hours })
    });
    await load();
  }

  return (
    <main className="container grid">
      <header className="card row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Tarefas</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Fila operacional (retencao/captacao/recompra). Concluir libera foco; snooze respeita ritmo comercial.
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

      <section className="grid" style={{ gap: 12 }}>
        {tasks.map((task) => {
          const who = task.customer?.name ?? task.lead?.name ?? "Sem vinculo";
          const phone = task.customer?.phone ?? task.lead?.phone ?? "";

          return (
            <div key={task.id} className="card" style={{ padding: 14 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>
                    {task.lane} · {who}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Prioridade {task.priority} · Vence em {new Date(task.dueAt).toLocaleString("pt-BR")}
                  </div>
                  {phone ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {phone}
                    </div>
                  ) : null}
                </div>

                <div className="row">
                  <button className="btn" type="button" onClick={() => void snoozeTask(task.id, 4)}>
                    +4h
                  </button>
                  <button className="btn" type="button" onClick={() => void snoozeTask(task.id, 24)}>
                    +24h
                  </button>
                  <button className="btn btn-primary" type="button" onClick={() => void completeTask(task.id)}>
                    Concluir
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  Motivo
                </div>
                <div>{task.reason}</div>
              </div>

              {task.suggestedText ? (
                <div style={{ marginTop: 10 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Sugestao
                  </div>
                  <div>{task.suggestedText}</div>
                </div>
              ) : null}
            </div>
          );
        })}
      </section>
    </main>
  );
}
