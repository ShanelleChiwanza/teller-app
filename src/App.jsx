import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Search, ArrowDownToLine, ArrowUpFromLine, Check, AlertTriangle,
  UserPlus, Globe, Coins, Loader2, Users, HandCoins,
} from "lucide-react";

// ---- Supabase connection ----
const SUPABASE_URL = "https://ngvdbhvtgbohekoptwqu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ndmRiaHZ0Z2JvaGVrb3B0d3F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNzk2MjIsImV4cCI6MjEwMzY1NTYyMn0.Rgcy3FLUjurpgDD0i7QO3Kn0d0l0thslk1MS5JF8DMk";

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  if (!res.ok) {
    const msg = (data && (data.message || data.hint || data.details)) || raw || res.statusText;
    throw new Error(msg);
  }
  return data;
}

const SINGLE = { Accept: "application/vnd.pgrst.object+json" };
const PLATFORMS = ["EcoCash", "Omari", "InnBucks", "OneMoney"];

const fmt = (n) =>
  (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const timeOf = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function TellerDashboard() {
  const [accounts, setAccounts] = useState({}); // {EcoCash: 0, Cash: 0, ...}
  const [transactions, setTransactions] = useState([]);
  const [openChange, setOpenChange] = useState([]);
  const [openDebtors, setOpenDebtors] = useState([]);
  const [openFloat, setOpenFloat] = useState([]);

  const [initLoading, setInitLoading] = useState(true);
  const [connError, setConnError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [platform, setPlatform] = useState("EcoCash");
  const [phone, setPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [clientLookup, setClientLookup] = useState(null);
  const [type, setType] = useState("IN");
  const [amount, setAmount] = useState("");
  const [flash, setFlash] = useState(null);
  const [flow, setFlow] = useState(null);
  const [isOffsite, setIsOffsite] = useState(false);

  const [openChangeForm, setOpenChangeForm] = useState(false);
  const [changeAmt, setChangeAmt] = useState("");

  const [floatForm, setFloatForm] = useState(false);
  const [floatParty, setFloatParty] = useState("Munya");
  const [floatDir, setFloatDir] = useState("LENT");
  const [floatAmt, setFloatAmt] = useState("");
  const [floatComment, setFloatComment] = useState("");

  const [debtForm, setDebtForm] = useState(false);
  const [debtName, setDebtName] = useState("");
  const [debtAmt, setDebtAmt] = useState("");

  const loadAccounts = useCallback(async () => {
    const rows = await sb("accounts?select=account_name,balance");
    const map = {};
    rows.forEach((r) => (map[r.account_name] = Number(r.balance)));
    setAccounts(map);
  }, []);

  const loadTransactions = useCallback(async () => {
    const rows = await sb(
      "mobile_money_transactions?select=tx_id,type,amount,is_offsite,created_at,clients(full_name,phone_number),accounts(account_name)&order=created_at.desc&limit=15"
    );
    setTransactions(
      rows.map((r) => ({
        id: r.tx_id,
        name: r.clients?.full_name ?? "Unknown",
        phone: r.clients?.phone_number ?? "",
        platform: r.accounts?.account_name ?? "",
        type: r.type,
        amt: Number(r.amount),
        offsite: r.is_offsite,
        time: timeOf(r.created_at),
      }))
    );
  }, []);

  const loadOpenChange = useCallback(async () => {
    const rows = await sb(
      "customer_change?select=change_id,amount_owed,clients(full_name,phone_number)&status=eq.Open&order=created_at.desc"
    );
    setOpenChange(
      rows.map((r) => ({ id: r.change_id, name: r.clients?.full_name ?? "Unknown", phone: r.clients?.phone_number ?? "", amount: Number(r.amount_owed) }))
    );
  }, []);

  const loadDebtors = useCallback(async () => {
    const rows = await sb("debtors?select=debtor_id,debtor_name,amount_owed,note&status=eq.Open&order=created_at.desc");
    setOpenDebtors(rows.map((r) => ({ id: r.debtor_id, name: r.debtor_name, amount: Number(r.amount_owed), note: r.note })));
  }, []);

  const loadFloat = useCallback(async () => {
    const rows = await sb(
      "counterparty_float_ledger?select=entry_id,direction,amount,comment,counterparties(name)&status=eq.Open&order=created_at.desc"
    );
    setOpenFloat(
      rows.map((r) => ({ id: r.entry_id, name: r.counterparties?.name ?? "Unknown", direction: r.direction, amount: Number(r.amount), comment: r.comment }))
    );
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadAccounts(), loadTransactions(), loadOpenChange(), loadDebtors(), loadFloat()]);
      } catch (err) {
        setConnError(err.message);
      } finally {
        setInitLoading(false);
      }
    })();
  }, [loadAccounts, loadTransactions, loadOpenChange, loadDebtors, loadFloat]);

  useEffect(() => {
    const p = phone.trim();
    if (p.length < 9) {
      setClientLookup(null);
      return;
    }
    let cancelled = false;
    sb(`clients?phone_number=eq.${encodeURIComponent(p)}&select=full_name,phone_number`)
      .then((rows) => {
        if (cancelled) return;
        setClientLookup(rows[0] ? { found: true, name: rows[0].full_name } : { found: false });
      })
      .catch(() => {
        if (!cancelled) setClientLookup({ found: false });
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  const client = clientLookup?.found ? { name: clientLookup.name, phone: phone.trim() } : null;
  const isNewClient = clientLookup?.found === false;
  const amt = parseFloat(amount) || 0;

  const walletBal = accounts[platform] ?? 0;
  const cashBal = accounts["Cash"] ?? 0;
  const available = type === "IN" ? walletBal : cashBal;
  const blocked = amt > 0 && amt > available;

  async function confirm() {
    if (!phone.trim()) return setFlash({ type: "error", msg: "Enter a phone number first." });
    if (isNewClient && !newName.trim()) return setFlash({ type: "error", msg: "New client — enter a name to save them." });
    if (amt <= 0) return setFlash({ type: "error", msg: "Enter an amount." });
    if (blocked) {
      setFlash({
        type: "error",
        msg: type === "IN" ? `Blocked: exceeds ${platform} wallet balance of ${fmt(walletBal)}` : `Blocked: exceeds physical cash at hand of ${fmt(cashBal)}`,
      });
      return;
    }
    setSaving(true);
    try {
      await sb("rpc/process_mobile_money_transaction", {
        method: "POST",
        headers: SINGLE,
        body: JSON.stringify({
          p_platform: platform,
          p_phone: phone.trim(),
          p_full_name: newName.trim() || null,
          p_type: type,
          p_amount: amt,
          p_is_offsite: isOffsite,
        }),
      });
      setFlow({ type, amt });
      setTimeout(async () => {
        try {
          await Promise.all([loadAccounts(), loadTransactions()]);
          setFlash({ type: "ok", msg: `${type === "IN" ? "Cash In" : "Cash Out"} of ${fmt(amt)} (${platform})${isOffsite ? " — offsite/debtor" : ""} confirmed.` });
        } catch (err) {
          setFlash({ type: "error", msg: err.message });
        }
        setFlow(null);
        setPhone("");
        setNewName("");
        setAmount("");
        setIsOffsite(false);
      }, 650);
    } catch (err) {
      setFlash({ type: "error", msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function saveChange() {
    if (!client || !changeAmt) return;
    const val = parseFloat(changeAmt);
    if (!val) return;
    setSaving(true);
    try {
      await sb("rpc/leave_change", {
        method: "POST",
        headers: SINGLE,
        body: JSON.stringify({ p_phone: client.phone, p_tx_id: null, p_amount: val }),
      });
      await loadOpenChange();
      setChangeAmt("");
      setOpenChangeForm(false);
      setFlash({ type: "ok", msg: `${fmt(val)} change logged for ${client.name}.` });
    } catch (err) {
      setFlash({ type: "error", msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function collect(c) {
    setSaving(true);
    try {
      await sb("rpc/collect_change", { method: "POST", headers: SINGLE, body: JSON.stringify({ p_change_id: c.id }) });
      await Promise.all([loadAccounts(), loadOpenChange()]);
      setFlash({ type: "ok", msg: `${fmt(c.amount)} change paid out to ${c.name}.` });
    } catch (err) {
      setFlash({ type: "error", msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function saveFloat() {
    if (!floatAmt) return;
    setSaving(true);
    try {
      await sb("rpc/record_counterparty_float", {
        method: "POST",
        headers: SINGLE,
        body: JSON.stringify({ p_counterparty_name: floatParty, p_direction: floatDir, p_amount: parseFloat(floatAmt), p_rate: null, p_comment: floatComment || null }),
      });
      await loadFloat();
      setFloatAmt("");
      setFloatComment("");
      setFloatForm(false);
      setFlash({ type: "ok", msg: `Float entry logged with ${floatParty}.` });
    } catch (err) {
      setFlash({ type: "error", msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function settleFloat(entryId) {
    setSaving(true);
    try {
      await sb("rpc/settle_counterparty_float", { method: "POST", headers: SINGLE, body: JSON.stringify({ p_entry_id: entryId }) });
      await loadFloat();
      setFlash({ type: "ok", msg: "Float entry settled." });
    } catch (err) {
      setFlash({ type: "error", msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function saveDebt() {
    if (!debtName.trim() || !debtAmt) return;
    setSaving(true);
    try {
      await sb("rpc/record_debt", {
        method: "POST",
        headers: SINGLE,
        body: JSON.stringify({ p_debtor_name: debtName.trim(), p_amount: parseFloat(debtAmt), p_note: null }),
      });
      await loadDebtors();
      setDebtName("");
      setDebtAmt("");
      setDebtForm(false);
      setFlash({ type: "ok", msg: `Debt logged for ${debtName}.` });
    } catch (err) {
      setFlash({ type: "error", msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function settleDebt(debtorId) {
    setSaving(true);
    try {
      await sb("rpc/settle_debt", { method: "POST", headers: SINGLE, body: JSON.stringify({ p_debtor_id: debtorId }) });
      await Promise.all([loadAccounts(), loadDebtors()]);
      setFlash({ type: "ok", msg: "Debt settled — cash updated." });
    } catch (err) {
      setFlash({ type: "error", msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#12161B", color: "#F2F5F8", minHeight: "100%", padding: "24px", borderRadius: 16 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap');
        .num { font-family: 'Space Grotesk', sans-serif; }
        .btn { transition: transform .12s ease, filter .12s ease; }
        .btn:active { transform: scale(0.97); }
        .btn:disabled { opacity: .6; }
        .keyval:hover { filter: brightness(1.15); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 11, color: connError ? "#EF4444" : "#22C55E" }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: connError ? "#EF4444" : "#22C55E", display: "inline-block" }} />
        {connError ? "Not connected" : initLoading ? "Connecting…" : "Live — connected to Supabase"}
      </div>

      {connError && (
        <div style={{ background: "#2A1418", border: "1px solid #EF4444", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: "#FCA5A5" }}>
          Couldn't reach the database: {connError}
        </div>
      )}

      {initLoading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#7A8493", fontSize: 13, padding: "20px 0" }}>
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading live balances…
        </div>
      ) : (
        <>
          {/* Cash — the big card */}
          <div style={{ background: "#181D24", border: `1px solid ${flow ? "#22C55E" : "#232A33"}`, borderRadius: 12, padding: "16px 18px", marginBottom: 10, transition: "border-color .3s ease" }}>
            <div style={{ fontSize: 12, color: "#7A8493", marginBottom: 6 }}>Cash at hand b/d</div>
            <div className="num" style={{ fontSize: 28, fontWeight: 700, color: "#22C55E" }}>${fmt(cashBal)}</div>
          </div>

          {/* Platform wallet cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
            {PLATFORMS.map((p) => (
              <button
                key={p}
                className="btn"
                onClick={() => setPlatform(p)}
                style={{
                  textAlign: "left",
                  background: "#181D24",
                  border: `1.5px solid ${platform === p ? "#3B82F6" : "#232A33"}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 11, color: "#7A8493", marginBottom: 4 }}>{p}</div>
                <div className="num" style={{ fontSize: 17, fontWeight: 700, color: platform === p ? "#3B82F6" : "#F2F5F8" }}>${fmt(accounts[p] ?? 0)}</div>
              </button>
            ))}
          </div>

          {flow && (
            <div style={{ textAlign: "center", marginBottom: 16, color: flow.type === "IN" ? "#3B82F6" : "#22C55E", fontWeight: 600, fontSize: 14, animation: "pulse 0.65s ease" }}>
              {flow.type === "IN" ? `→ ${fmt(flow.amt)} moving: ${platform} → Drawer` : `→ ${fmt(flow.amt)} moving: Drawer → ${platform}`}
            </div>
          )}

          {/* Phone lookup */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ position: "relative" }}>
              <Search size={16} style={{ position: "absolute", left: 12, top: 14, color: "#7A8493" }} />
              <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Customer phone number" style={inputStyle(38)} />
            </div>
            {phone.trim().length >= 9 && (
              <div style={{ marginTop: 8 }}>
                {clientLookup === null ? (
                  <div style={{ fontSize: 12, color: "#6B7280" }}>Checking…</div>
                ) : client ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#22C55E", fontSize: 14 }}><Check size={16} /> {client.name}</div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <UserPlus size={16} color="#F59E0B" />
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New customer — enter name to save" style={inputStyle(8, true)} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* IN / OUT toggle */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <ActionButton label="CASH IN" icon={<ArrowDownToLine size={18} />} active={type === "IN"} color="#3B82F6" onClick={() => setType("IN")} />
            <ActionButton label="CASH OUT" icon={<ArrowUpFromLine size={18} />} active={type === "OUT"} color="#22C55E" onClick={() => setType("OUT")} />
          </div>

          <button
            className="btn"
            onClick={() => setIsOffsite((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, marginBottom: 14, cursor: "pointer",
              border: `1.5px solid ${isOffsite ? "#F59E0B" : "#232A33"}`, background: isOffsite ? "#F59E0B1A" : "#181D24",
              color: isOffsite ? "#F59E0B" : "#7A8493", fontSize: 13, fontWeight: 600, width: "100%",
            }}
          >
            <Globe size={15} /> Offsite / Debtor Collection
            {isOffsite && <span style={{ marginLeft: "auto", fontSize: 11 }}>ON — will be tagged</span>}
          </button>

          {/* Amount */}
          <div style={{ marginBottom: 10 }}>
            <input
              type="text" inputMode="decimal" autoComplete="off" value={amount}
              onChange={(e) => { const v = e.target.value; if (/^\d*\.?\d{0,2}$/.test(v)) setAmount(v); }}
              placeholder="0.00"
              style={{ ...inputStyle(14), fontSize: 26, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, borderColor: blocked ? "#EF4444" : "#2A323C" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {[10, 20, 50, 100].map((v) => (
                <button key={v} className="btn keyval" onClick={() => setAmount(String(v))} style={quickAmtStyle}>{v}</button>
              ))}
            </div>
          </div>

          {blocked && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#EF4444", fontSize: 13, marginBottom: 10 }}>
              <AlertTriangle size={15} /> {type === "IN" ? `Exceeds ${platform} wallet (${fmt(walletBal)} available)` : `Exceeds cash at hand (${fmt(cashBal)} available)`}
            </div>
          )}

          <button
            className="btn" onClick={confirm} disabled={blocked || saving}
            style={{
              width: "100%", padding: "14px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 15, letterSpacing: 0.3,
              cursor: blocked || saving ? "not-allowed" : "pointer",
              background: blocked ? "#2A323C" : type === "IN" ? "#3B82F6" : "#22C55E", color: blocked ? "#6B7280" : "#0B0D10",
            }}
          >
            {saving ? "SAVING…" : `CONFIRM ${type === "IN" ? "CASH IN" : "CASH OUT"} — ${platform}`}
          </button>

          {flash && <div style={{ marginTop: 12, fontSize: 13, color: flash.type === "ok" ? "#22C55E" : "#EF4444", fontWeight: 500 }}>{flash.msg}</div>}

          {/* Owed customer change */}
          <Panel title="Owed Customer Change" icon={<Coins size={16} />} color="#F59E0B" onToggle={() => setOpenChangeForm((v) => !v)} open={openChangeForm} toggleLabel="Log change">
            {openChangeForm && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input value={changeAmt} onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setChangeAmt(e.target.value)} placeholder="Amount left behind" inputMode="decimal" style={inputStyle(12)} />
                  <SaveBtn disabled={!client || !changeAmt || saving} onClick={saveChange} color="#F59E0B" />
                </div>
                {!client && <div style={{ fontSize: 12, color: "#EF4444", marginTop: -6, marginBottom: 10 }}>Look up a customer above first.</div>}
              </>
            )}
            {openChange.length === 0 ? (
              <Empty text="No change currently owed to customers." />
            ) : (
              openChange.map((c) => (
                <Row key={c.id} left={<><div>{c.name}</div><div style={{ color: "#6B7280", fontSize: 11 }}>{c.phone}</div></>}>
                  <span className="num" style={{ color: "#F59E0B", fontWeight: 700 }}>{fmt(c.amount)}</span>
                  <ActionBtn disabled={c.amount > cashBal || saving} onClick={() => collect(c)} label="Collect" color="#22C55E" blocked={c.amount > cashBal} />
                </Row>
              ))
            )}
          </Panel>

          {/* Counterparty float */}
          <Panel title="Counterparty Float (Munya/Lawrence/Tamuka)" icon={<Users size={16} />} color="#A78BFA" onToggle={() => setFloatForm((v) => !v)} open={floatForm} toggleLabel="Log float">
            {floatForm && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                <select value={floatParty} onChange={(e) => setFloatParty(e.target.value)} style={inputStyle(12)}>
                  {["Munya", "Lawrence", "Tamuka"].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => setFloatDir("LENT")} style={pillStyle(floatDir === "LENT", "#3B82F6")}>We lent them</button>
                  <button className="btn" onClick={() => setFloatDir("BORROWED")} style={pillStyle(floatDir === "BORROWED", "#22C55E")}>We borrowed</button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={floatAmt} onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setFloatAmt(e.target.value)} placeholder="Amount" inputMode="decimal" style={inputStyle(12)} />
                  <SaveBtn disabled={!floatAmt || saving} onClick={saveFloat} color="#A78BFA" />
                </div>
                <input value={floatComment} onChange={(e) => setFloatComment(e.target.value)} placeholder="Comment (optional)" style={inputStyle(12)} />
              </div>
            )}
            {openFloat.length === 0 ? (
              <Empty text="No open float trades." />
            ) : (
              openFloat.map((f) => (
                <Row key={f.id} left={<><div>{f.name}</div><div style={{ color: "#6B7280", fontSize: 11 }}>{f.direction === "LENT" ? "they owe us" : "we owe them"}{f.comment ? ` · ${f.comment}` : ""}</div></>}>
                  <span className="num" style={{ color: f.direction === "LENT" ? "#3B82F6" : "#22C55E", fontWeight: 700 }}>{fmt(f.amount)}</span>
                  <ActionBtn disabled={saving} onClick={() => settleFloat(f.id)} label="Settle" color="#A78BFA" />
                </Row>
              ))
            )}
          </Panel>

          {/* Debtors */}
          <Panel title="Debtors" icon={<HandCoins size={16} />} color="#F87171" onToggle={() => setDebtForm((v) => !v)} open={debtForm} toggleLabel="Log debt">
            {debtForm && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                <input value={debtName} onChange={(e) => setDebtName(e.target.value)} placeholder="Debtor name" style={inputStyle(12)} />
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={debtAmt} onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setDebtAmt(e.target.value)} placeholder="Amount owed" inputMode="decimal" style={inputStyle(12)} />
                  <SaveBtn disabled={!debtName.trim() || !debtAmt || saving} onClick={saveDebt} color="#F87171" />
                </div>
              </div>
            )}
            {openDebtors.length === 0 ? (
              <Empty text="No open debtors." />
            ) : (
              openDebtors.map((d) => (
                <Row key={d.id} left={<div>{d.name}</div>}>
                  <span className="num" style={{ color: "#F87171", fontWeight: 700 }}>{fmt(d.amount)}</span>
                  <ActionBtn disabled={saving} onClick={() => settleDebt(d.id)} label="Paid" color="#22C55E" />
                </Row>
              ))
            )}
          </Panel>

          {/* Recent transactions */}
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, color: "#7A8493", marginBottom: 10, textTransform: "uppercase" }}>Recent</div>
            {transactions.length === 0 && <div style={{ color: "#4B5563", fontSize: 13 }}>No transactions yet.</div>}
            {transactions.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1E242B", fontSize: 14 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 500 }}>{t.name}</span>
                    <span style={{ fontSize: 10, color: "#7A8493", border: "1px solid #2A323C", borderRadius: 4, padding: "1px 5px" }}>{t.platform}</span>
                    {t.offsite && <span style={{ fontSize: 10, color: "#F59E0B", border: "1px solid #F59E0B", borderRadius: 4, padding: "1px 5px" }}>OFFSITE</span>}
                  </div>
                  <div style={{ color: "#6B7280", fontSize: 12 }}>{t.phone} · {t.time}</div>
                </div>
                <div className="num" style={{ fontWeight: 700, color: t.type === "IN" ? "#3B82F6" : "#22C55E" }}>{t.type === "IN" ? "+" : "−"}{fmt(t.amt)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Panel({ title, icon, color, onToggle, open, toggleLabel, children }) {
  return (
    <div style={{ marginTop: 18, background: "#181D24", border: "1px solid #232A33", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color }}>{icon} {title}</div>
        <button className="btn" onClick={onToggle} style={{ fontSize: 12, color, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
          {open ? "Cancel" : `+ ${toggleLabel}`}
        </button>
      </div>
      {children}
    </div>
  );
}

function Row({ left, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1E242B", fontSize: 13 }}>
      <div>{left}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{children}</div>
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ color: "#4B5563", fontSize: 13 }}>{text}</div>;
}

function SaveBtn({ disabled, onClick, color }) {
  return (
    <button className="btn" disabled={disabled} onClick={onClick} style={{ padding: "0 16px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, background: disabled ? "#2A323C" : color, color: disabled ? "#6B7280" : "#0B0D10", cursor: disabled ? "not-allowed" : "pointer" }}>
      Save
    </button>
  );
}

function ActionBtn({ disabled, onClick, label, color, blocked }) {
  return (
    <button className="btn" disabled={disabled} onClick={onClick} title={blocked ? "Not enough cash at hand" : label}
      style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: `1px solid ${color}`, background: disabled ? "#2A323C" : `${color}1A`, color: disabled ? "#6B7280" : color, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600 }}>
      {label}
    </button>
  );
}

function pillStyle(active, color) {
  return { flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${active ? color : "#2A323C"}`, background: active ? `${color}1A` : "#181D24", color: active ? color : "#9CA3AF", fontSize: 12, fontWeight: 700, cursor: "pointer" };
}

function ActionButton({ label, icon, active, color, onClick }) {
  return (
    <button className="btn" onClick={onClick} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px 14px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${active ? color : "#232A33"}`, background: active ? `${color}1A` : "#181D24", color: active ? color : "#9CA3AF", fontWeight: 700, fontSize: 14 }}>
      {icon} {label}
    </button>
  );
}

function inputStyle(padLeft, warn) {
  return { width: "100%", boxSizing: "border-box", padding: `10px 12px 10px ${padLeft}px`, borderRadius: 8, border: `1px solid ${warn ? "#F59E0B" : "#2A323C"}`, background: "#181D24", color: "#F2F5F8", fontSize: 14, outline: "none" };
}

const quickAmtStyle = { flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid #2A323C", background: "#181D24", color: "#9CA3AF", fontSize: 13, cursor: "pointer" };
