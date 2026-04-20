"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api";

type Lead = {
  id: string;
  name: string;
  phone?: string | null;
  source: string;
  stage: string;
  score: number;
  notes?: string | null;
  nextFollowUpAt?: string | null;
};

const STAGES = ["new", "qualified", "contacted", "won", "lost"] as const;

export default function CrmLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const stage of STAGES) map.set(stage, []);
    for (const lead of leads) {
      const bucket = map.has(lead.stage) ? map.get(lead.stage)! : map.get("new")!;
      bucket.push(lead);
    }
    return map;
  }, [leads]);

  async function load() {
    try {
      setMessage("");
      const data = await apiFetch<Lead[]>("/leads");
      setLeads(data);
    } catch {
      setMessage("Nao foi possivel carregar leads.");
    }
  }

  async function moveStage(leadId: string, stage: string) {
    await apiFetch(`/leads/${leadId}`, {
      method: "PATCH",
      body: JSON.stringify({ stage })
    });
    await load();
  }

  return (
    <main className="container grid">
      <header className="card row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Leads</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Funil simples. Etapas padrao: {STAGES.join(", ")}.
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

      <section className="grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", alignItems: "start" }}>
        {STAGES.map((stage) => (
          <div key={stage} className="card grid" style={{ gap: 10 }}>
            <div>
              <strong style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 12 }}>{stage}</strong>
              <div className="muted" style={{ fontSize: 12 }}>
                {grouped.get(stage)?.length ?? 0} leads
              </div>
            </div>

            <div className="grid" style={{ gap: 10 }}>
              {(grouped.get(stage) ?? []).map((lead) => (
                <div key={lead.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 800 }}>{lead.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Score {lead.score} · {lead.source}
                  </div>
                  {lead.phone ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {lead.phone}
                    </div>
                  ) : null}

                  <label style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    <span className="muted" style={{ fontSize: 12 }}>
                      Mover
                    </span>
                    <select
                      className="input"
                      value={lead.stage}
                      onChange={(event) => void moveStage(lead.id, event.target.value)}
                    >
                      {STAGES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
