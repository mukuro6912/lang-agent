import { useState, useEffect } from "react";

const TOEIC_SW_DATE = new Date("2026-06-14");
const TOEIC_LR_DATE = new Date("2026-06-28");
const JLPT_DATE = new Date("2026-12-06");

function daysUntil(date) {
  return Math.max(0, Math.ceil((date - new Date()) / 86400000));
}
function weeksUntil(date) {
  return Math.max(0, Math.floor(daysUntil(date) / 7));
}

const TRACKS = [
  {
    id: "toeic_sw", label: "多益說寫", targetDate: TOEIC_SW_DATE,
    goal: "CEFR B2（說寫）", color: "#3B82F6", accent: "#93C5FD", icon: "🗣️",
    milestones: [
      { title: "起點診斷", desc: "完成模擬題，確認基準分" },
      { title: "口說基礎", desc: "短答題達 160 分水準" },
      { title: "寫作架構", desc: "郵件寫作錯誤率 < 20%" },
      { title: "全科整合", desc: "完整模擬測驗達標" },
    ],
    skills: ["口說流暢度", "寫作架構", "詞彙量", "語法準確性"],
  },
  {
    id: "toeic_lr", label: "多益聽讀", targetDate: TOEIC_LR_DATE,
    goal: "CEFR B2（聽讀）", color: "#10B981", accent: "#6EE7B7", icon: "👂",
    milestones: [
      { title: "弱點掃描", desc: "分析聽力 / 閱讀各部分得分" },
      { title: "聽力衝刺", desc: "Part 3/4 正確率 > 70%" },
      { title: "閱讀提速", desc: "Part 7 完成率 > 90%" },
      { title: "全真模考", desc: "目標分數模擬達標" },
    ],
    skills: ["聽力理解", "閱讀速度", "詞彙量", "長文理解"],
  },
  {
    id: "jlpt_n5", label: "日檢 N5", targetDate: JLPT_DATE,
    goal: "N5 合格", color: "#F59E0B", accent: "#FCD34D", icon: "🇯🇵",
    milestones: [
      { title: "五十音精通", desc: "平假名、片假名100%熟練" },
      { title: "文法基礎", desc: "完成 N5 文法 30 項" },
      { title: "詞彙累積", desc: "800 核心單字完成" },
      { title: "模擬測驗", desc: "三回模考平均 80 分" },
    ],
    skills: ["五十音", "基礎文法", "詞彙量", "漢字識讀"],
  },
];

const STORAGE_KEY = "lang_agent_v3";

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveToStorage(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function initData() {
  return { logs: [], weeklyCheckins: [], skills: { toeic_sw: {}, toeic_lr: {}, jlpt_n5: {} } };
}

async function callClaude(messages, system) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system, messages }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "（無回應）";
}

function SkillSlider({ label, value, onChange, color }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "#cbd5e1" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "monospace" }}>{value}/10</span>
      </div>
      <input type="range" min={1} max={10} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: color }} />
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(() => loadFromStorage() || initData());
  const [activeTrack, setActiveTrack] = useState("toeic_sw");
  const [tab, setTab] = useState("dashboard");
  const [aiReply, setAiReply] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [checkinSkills, setCheckinSkills] = useState({ toeic_sw: {}, toeic_lr: {}, jlpt_n5: {} });
  const [checkinNotes, setCheckinNotes] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [logForm, setLogForm] = useState({ track: "toeic_sw", activity: "", duration: 30 });

  useEffect(() => { saveToStorage(data); }, [data]);

  const track = TRACKS.find(t => t.id === activeTrack);
  const totalLogs = data.logs.length;
  const totalMinutes = data.logs.reduce((s, l) => s + (l.duration || 0), 0);
  const lastCheckin = data.weeklyCheckins[data.weeklyCheckins.length - 1];

  async function runCheckin() {
    setAiLoading(true);
    const skillsText = TRACKS.map(t =>
      `【${t.label}】${t.skills.map(s => `${s}:${checkinSkills[t.id][s] || 5}`).join("、")}`
    ).join("\n");

    const sys = `你是語言學習教練，擅長分析台灣學習者的多益與日檢備考策略。用繁體中文（台灣用詞）回答，語氣直接具體。`;
    const prompt = `學習者本週自評：\n${skillsText}\n\n備注：${checkinNotes || "無"}\n\n考試倒數：多益說寫${daysUntil(TOEIC_SW_DATE)}天、多益聽讀${daysUntil(TOEIC_LR_DATE)}天、日檢N5${daysUntil(JLPT_DATE)}天\n\n請提供：\n1. 各科目本週表現評估（各1-2句）\n2. 下週最優先3個行動項目（具體可執行）\n3. 每日時間分配建議\n4. 一句激勵語`;

    const reply = await callClaude([{ role: "user", content: prompt }], sys);
    setAiReply(reply);
    setData(prev => ({
      ...prev,
      weeklyCheckins: [...prev.weeklyCheckins, { date: new Date().toISOString(), skills: checkinSkills, notes: checkinNotes, ai: reply }]
    }));
    setAiLoading(false);
  }

  function addLog() {
    if (!logForm.activity.trim()) return;
    setData(prev => ({ ...prev, logs: [...prev.logs, { ...logForm, date: new Date().toISOString(), id: Date.now() }] }));
    setLogForm(f => ({ ...f, activity: "" }));
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const userMsg = { role: "user", content: chatInput };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setChatInput("");
    setAiLoading(true);

    const sys = `你是學習者的AI語言學習顧問。用繁體中文（台灣用詞）回答，直接給具體建議。
背景：多益說寫${daysUntil(TOEIC_SW_DATE)}天後、多益聽讀${daysUntil(TOEIC_LR_DATE)}天後、日檢N5${daysUntil(JLPT_DATE)}天後。累積學習${totalMinutes}分鐘。`;

    const reply = await callClaude(newHistory, sys);
    setChatHistory(h => [...h, { role: "assistant", content: reply }]);
    setAiLoading(false);
  }

  const s = {
    app: { fontFamily: "'Noto Sans TC', sans-serif", background: "#0f172a", minHeight: "100vh", color: "#e2e8f0", maxWidth: 720, margin: "0 auto", paddingBottom: 60 },
    card: { background: "#1e293b", borderRadius: 14, padding: 16, marginBottom: 12 },
    tab: (active) => ({ flex: 1, padding: "11px 4px", border: "none", background: "transparent", color: active ? "#6366f1" : "#64748b", fontWeight: active ? 700 : 400, fontSize: 13, cursor: "pointer", borderBottom: `2px solid ${active ? "#6366f1" : "transparent"}`, fontFamily: "inherit" }),
    btn: (color) => ({ width: "100%", padding: 12, borderRadius: 10, border: "none", background: color, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 10 }),
    input: { background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0", padding: "8px 12px", fontSize: 13, width: "100%", fontFamily: "inherit" },
  };

  return (
    <div style={s.app}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap'); * { box-sizing: border-box; } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {/* Header */}
      <div style={{ padding: "20px 20px 0", borderBottom: "1px solid #1e293b" }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#f8fafc", marginBottom: 2 }}>語言學習 Agent</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>雙軌備考 · 智慧追蹤 · 即時分析</div>
        <div style={{ display: "flex", gap: 8, paddingBottom: 12, overflowX: "auto" }}>
          {TRACKS.map(t => (
            <button key={t.id} onClick={() => setActiveTrack(t.id)} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: activeTrack === t.id ? t.color : "#1e293b", color: activeTrack === t.id ? "#fff" : "#94a3b8" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e293b", position: "sticky", top: 0, background: "#0f172a", zIndex: 10 }}>
        {[["dashboard","📊 總覽"],["checkin","✅ Check-in"],["log","📝 記錄"],["chat","💬 諮詢"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={s.tab(tab === id)}>{label}</button>
        ))}
      </div>

      <div style={{ padding: "18px 16px 0" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[["累積學習", `${Math.floor(totalMinutes/60)}h${totalMinutes%60}m`, "#6366f1"],["學習記錄", `${totalLogs}筆`, "#10B981"],["Check-in", `${data.weeklyCheckins.length}次`, "#F59E0B"]].map(([label, val, color]) => (
                <div key={label} style={{ background: "#1e293b", borderRadius: 12, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "monospace" }}>{val}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ ...s.card, border: `1px solid ${track.color}30` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>目前追蹤</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: track.color }}>{track.icon} {track.label}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{track.goal}</div>
                </div>
                <div style={{ background: `${track.color}18`, border: `1px solid ${track.color}40`, borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: track.color, fontFamily: "monospace" }}>{daysUntil(track.targetDate)}</div>
                  <div style={{ fontSize: 10, color: track.accent }}>天後（{weeksUntil(track.targetDate)}週）</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, fontWeight: 600 }}>里程碑</div>
              {track.milestones.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: i === 0 ? track.color : "#334155", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff", flexShrink: 0, fontWeight: 700 }}>{i === 0 ? "✓" : i+1}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: i === 0 ? track.color : "#cbd5e1" }}>{m.title}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{m.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, fontWeight: 600 }}>所有考試倒數</div>
            {TRACKS.map(t => (
              <div key={t.id} style={{ ...s.card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.color }}>{t.icon} {t.label}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{t.targetDate.toLocaleDateString("zh-TW")} · {t.goal}</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: t.color, fontFamily: "monospace" }}>{daysUntil(t.targetDate)}<span style={{ fontSize: 11, color: "#64748b" }}>天</span></div>
              </div>
            ))}

            {lastCheckin && (
              <div style={{ ...s.card, border: "1px solid #6366f130" }}>
                <div style={{ fontSize: 12, color: "#6366f1", fontWeight: 600, marginBottom: 6 }}>📋 上次 Check-in：{new Date(lastCheckin.date).toLocaleDateString("zh-TW")}</div>
                <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{lastCheckin.ai?.slice(0, 280)}{lastCheckin.ai?.length > 280 ? "..." : ""}</div>
              </div>
            )}
          </div>
        )}

        {/* CHECK-IN */}
        {tab === "checkin" && (
          <div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16, lineHeight: 1.6 }}>每週自評各科技能（1–10），AI 分析後給出下週行動建議。</div>
            {TRACKS.map(t => (
              <div key={t.id} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.color, marginBottom: 10 }}>{t.icon} {t.label}</div>
                {t.skills.map(skill => (
                  <SkillSlider key={skill} label={skill} color={t.color}
                    value={checkinSkills[t.id][skill] || 5}
                    onChange={v => setCheckinSkills(f => ({ ...f, [t.id]: { ...f[t.id], [skill]: v } }))} />
                ))}
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>本週備注（可選）</div>
              <textarea rows={3} value={checkinNotes} onChange={e => setCheckinNotes(e.target.value)}
                placeholder="這週遇到的困難、心得..." style={{ ...s.input, resize: "none" }} />
            </div>
            <button onClick={runCheckin} disabled={aiLoading} style={s.btn(aiLoading ? "#334155" : "#6366f1")}>
              {aiLoading ? "🤖 AI 分析中..." : "🚀 送出 · 取得 AI 建議"}
            </button>
            {aiReply && (
              <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, padding: 16, marginTop: 12, fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {aiReply}
              </div>
            )}
          </div>
        )}

        {/* LOG */}
        {tab === "log" && (
          <div>
            <div style={s.card}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>新增學習記錄</div>
              <select value={logForm.track} onChange={e => setLogForm(f => ({ ...f, track: e.target.value }))} style={{ ...s.input, marginBottom: 10 }}>
                {TRACKS.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>
              <input type="text" value={logForm.activity} placeholder="學習內容（如：多益 Part 3 練習）"
                onChange={e => setLogForm(f => ({ ...f, activity: e.target.value }))} style={{ ...s.input, marginBottom: 10 }} />
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>時間（分鐘）</div>
                <input type="number" value={logForm.duration} min={5} max={300}
                  onChange={e => setLogForm(f => ({ ...f, duration: Number(e.target.value) }))} style={{ ...s.input, width: 100 }} />
              </div>
              <button onClick={addLog} style={s.btn("#10B981")}>+ 新增記錄</button>
            </div>

            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10, fontWeight: 600 }}>學習記錄（共 {totalLogs} 筆）</div>
            {data.logs.length === 0 ? (
              <div style={{ textAlign: "center", color: "#475569", padding: 30, fontSize: 13 }}>尚無記錄，開始你的第一筆吧！</div>
            ) : [...data.logs].reverse().slice(0, 20).map(log => {
              const t = TRACKS.find(x => x.id === log.track);
              return (
                <div key={log.id} style={{ ...s.card, borderLeft: `3px solid ${t?.color || "#6366f1"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{log.activity}</span>
                    <span style={{ fontSize: 12, color: t?.color, fontFamily: "monospace" }}>{log.duration}m</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{t?.label} · {new Date(log.date).toLocaleDateString("zh-TW")}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* CHAT */}
        {tab === "chat" && (
          <div>
            <div style={{ ...s.card, maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, minHeight: 120 }}>
              {chatHistory.length === 0 && <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "16px 0" }}>你好！我了解你的備考計劃，直接問我任何問題吧。</div>}
              {chatHistory.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", background: m.role === "user" ? "#6366f1" : "#0f172a", borderRadius: 10, padding: "8px 12px", maxWidth: "85%", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", border: m.role === "assistant" ? "1px solid #334155" : "none" }}>
                  {m.content}
                </div>
              ))}
              {aiLoading && <div style={{ alignSelf: "flex-start", color: "#64748b", fontSize: 13, animation: "pulse 1.2s infinite" }}>🤖 思考中...</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <textarea rows={2} value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="輸入問題..." style={{ ...s.input, flex: 1, resize: "none" }} />
              <button onClick={sendChat} disabled={aiLoading} style={{ padding: "0 14px", borderRadius: 10, border: "none", background: "#6366f1", color: "#fff", fontSize: 18, cursor: "pointer" }}>↑</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {["每天應該讀幾個小時？","多益口說如何快速進步？","N5 最重要的文法？","推薦學習資源"].map(q => (
                <button key={q} onClick={() => setChatInput(q)} style={{ padding: "5px 10px", borderRadius: 16, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{q}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
