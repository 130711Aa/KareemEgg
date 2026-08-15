import { useState, useEffect, useMemo } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  limit,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useToast } from "../components/Toast";

const ACCOUNTS = ["Petty Cash", "Bank Transfer (Jago)"];
const PERIODS = [
  { id: "today", label: "Hari ini" },
  { id: "7d", label: "7 hr trkhir" },
  { id: "thisMonth", label: "Bulan ini" },
  { id: "lastMonth", label: "Bulan lalu" },
  { id: "3m", label: "3 bln trkhir" },
  { id: "all", label: "Sepanjang Waktu" },
];
const emptyTxn = {
  type: "income",
  expenseSubType: "operational",
  amount: 0,
  category: "",
  description: "",
  account: "Bank Transfer (Jago)",
  fromAccount: "Petty Cash",
  toAccount: "Bank Transfer (Jago)",
  status: "Completed",
  rawMaterialProductId: "",
  rawMaterialQty: 1,
};
const fmtRp = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
const fmtDate = (ts) => {
  if (!ts?.toDate) return "—";
  return ts
    .toDate()
    .toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
};

const getDateRange = (range) => {
  const now = new Date();
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  let start;
  switch (range) {
    case "today":
      start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0,
      );
      break;
    case "7d":
      start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "thisMonth":
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      break;
    case "lastMonth":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end.setTime(
        new Date(
          now.getFullYear(),
          now.getMonth(),
          0,
          23,
          59,
          59,
          999,
        ).getTime(),
      );
      break;
    case "3m":
      start = new Date(end);
      start.setMonth(start.getMonth() - 2);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "all":
    default:
      start = new Date(0);
  }
  return { start, end };
};

function CashflowChart({ data, showNetOnly = false }) {
  if (!data || data.length === 0)
    return (
      <div className="analytics-empty-chart" style={{ padding: "20px" }}>
        Tidak ada data transaksi.
      </div>
    );
  const minVal = Math.min(0, ...data.map((d) => d.net));
  const maxVal = Math.max(
    1,
    ...data.map((d) =>
      Math.max(d.net, showNetOnly ? d.net : d.inflow, showNetOnly ? d.net : d.outflow)
    )
  );
  const range = maxVal - minVal;
  const W = 800, H = 200;

  const getY = (val) => H - ((val - minVal) / (range || 1)) * H;

  const getLP = (key) => {
    if (data.length === 1) return `M 0,${getY(data[0][key])}`;
    return data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${(i / (data.length - 1)) * W},${getY(d[key])}`)
      .join(" ");
  };
  return (
    <div style={{ position: "relative", marginTop: 12 }}>
      <div
        style={{
          position: "relative",
          height: H,
          paddingLeft: 42,
          paddingRight: 16,
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%", overflow: "visible" }}
        >
          {minVal < 0 && (
            <line x1="0" y1={getY(0)} x2={W} y2={getY(0)} stroke="var(--color-on-surface-variant)" opacity="0.3" strokeWidth="1" strokeDasharray="4,4" />
          )}
          {!showNetOnly && (
            <path
              d={getLP("inflow")}
              fill="none"
              stroke="#006c49"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {!showNetOnly && (
            <path
              d={getLP("outflow")}
              fill="none"
              stroke="#ba1a1a"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            d={getLP("net")}
            fill="none"
            stroke="#ffc107"
            strokeWidth="2"
            strokeDasharray="4,4"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {data.map((d, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${(i / (data.length - 1 || 1)) * 100}%`,
              bottom: -20,
              transform: "translateX(-50%)",
              fontSize: 10,
              color: "var(--color-on-surface-variant)",
              fontWeight: 600,
            }}
          >
            {d.label}
          </span>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 16,
          marginTop: 32,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {!showNetOnly && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  background: "#006c49",
                  borderRadius: 2,
                }}
              ></div>{" "}
              Masuk
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  background: "#ba1a1a",
                  borderRadius: 2,
                }}
              ></div>{" "}
              Keluar
            </div>
          </>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderBottom: "2px dashed #ffc107",
            }}
          ></div>{" "}
          Net
        </div>
      </div>
    </div>
  );
}

export default function Finance() {
  const [transactions, setTransactions] = useState([]);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [periodFilter, setPeriodFilter] = useState("7d");
  const [accountFilter, setAccountFilter] = useState("all");
  const [txnTypeFilter, setTxnTypeFilter] = useState("Semua");
  const [mainTab, setMainTab] = useState("cashflow");
  const [initialBalances, setInitialBalances] = useState({
    "Petty Cash": 0,
    "Bank Transfer (Jago)": 0,
  });
  const [initBalanceModal, setInitBalanceModal] = useState(false);
  const [tempBalances, setTempBalances] = useState({});
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyTxn);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const q = query(
      collection(db, "transactions"),
      orderBy("date", "desc"),
      limit(1500),
    );
    const unsub = onSnapshot(q, (snap) =>
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    const unsub2 = onSnapshot(collection(db, "products"), (snap) =>
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    const unsub3 = onSnapshot(collection(db, "sales"), (snap) =>
      setSales(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    const unsub4 = onSnapshot(
      doc(db, "settings", "initial_balances"),
      (snap) => {
        if (snap.exists()) setInitialBalances(snap.data());
      },
    );
    return () => {
      unsub();
      unsub2();
      unsub3();
      unsub4();
    };
  }, []);

  const normalizeAccountName = (a) => {
    if (!a) return "Bank Transfer (Jago)";
    const l = a.toLowerCase();
    if (l === "cash" || l === "petty cash") return "Petty Cash";
    return "Bank Transfer (Jago)";
  };

  const getAccountBalance = (accountName) => {
    const tgt = normalizeAccountName(accountName);
    let netChange = 0;
    transactions.forEach((t) => {
      if (t.status !== "Completed") return;
      if (
        (t.type === "income" || t.type === "capital_in") &&
        normalizeAccountName(t.account) === tgt
      )
        netChange += t.amount || 0;
      if (
        (t.type === "expense" || t.type === "capital_out") &&
        normalizeAccountName(t.account) === tgt
      )
        netChange -= t.amount || 0;
      if (t.type === "transfer") {
        if (normalizeAccountName(t.fromAccount) === tgt)
          netChange -= t.amount || 0;
        if (normalizeAccountName(t.toAccount) === tgt)
          netChange += t.amount || 0;
      }
    });
    return (initialBalances[tgt] || 0) + netChange;
  };

  const cashBalance = getAccountBalance("Petty Cash");
  const digitalBalance = ACCOUNTS.filter((a) => a !== "Petty Cash").reduce(
    (s, a) => s + getAccountBalance(a),
    0,
  );
  const totalCash = cashBalance + digitalBalance;

  const { start: pStart, end: pEnd } = getDateRange(periodFilter);
  const filteredTxn = useMemo(() => {
    return transactions.filter((t) => {
      const d = t.date?.toDate?.();
      if (!d || d < pStart || d > pEnd) return false;
      if (accountFilter !== "all") {
        if (t.type === "transfer")
          return (
            normalizeAccountName(t.fromAccount) ===
            normalizeAccountName(accountFilter) ||
            normalizeAccountName(t.toAccount) ===
            normalizeAccountName(accountFilter)
          );
        return (
          normalizeAccountName(t.account) ===
          normalizeAccountName(accountFilter)
        );
      }
      return true;
    });
  }, [transactions, pStart, pEnd, accountFilter]);

  // Opex
  const moneyIn = filteredTxn
    .filter((t) => t.type === "income" && t.status === "Completed")
    .reduce((s, t) => s + (t.amount || 0), 0);
  const moneyOut = filteredTxn
    .filter((t) => t.type === "expense" && t.status === "Completed")
    .reduce((s, t) => s + (t.amount || 0), 0);
  const netCashflow = moneyIn - moneyOut;
  let nfCash = 0,
    nfBank = 0;
  filteredTxn.forEach((t) => {
    if (t.status !== "Completed") return;
    const amt = t.amount || 0;
    if (t.type === "income") {
      if (normalizeAccountName(t.account) === "Petty Cash") nfCash += amt;
      else nfBank += amt;
    } else if (t.type === "expense") {
      if (normalizeAccountName(t.account) === "Petty Cash") nfCash -= amt;
      else nfBank -= amt;
    } else if (t.type === "transfer") {
      if (normalizeAccountName(t.fromAccount) === "Petty Cash") nfCash -= amt;
      else nfBank -= amt;
      if (normalizeAccountName(t.toAccount) === "Petty Cash") nfCash += amt;
      else nfBank += amt;
    }
  });

  const expByCat = {};
  filteredTxn
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      let cat = t.category || "Lainnya";
      if (
        cat === "Raw Material" &&
        t.expenseSubType === "raw_material" &&
        t.rawMaterialProductId
      ) {
        const p = products.find((p) => p.id === t.rawMaterialProductId);
        if (p) cat = `Bahan (${p.name})`;
      }
      expByCat[cat] = (expByCat[cat] || 0) + (t.amount || 0);
    });
  const sortedExp = Object.entries(expByCat).sort((a, b) => b[1] - a[1]);
  const totExp = sortedExp.reduce((s, c) => s + c[1], 0);

  // Investment & Accrual Accounting
  const inventoryValue = products.reduce((s, p) => s + ((p.stock || 0) * (p.buyPrice || 0)), 0);
  const totalAssets = totalCash + inventoryValue;

  const dbCapIn = transactions
    .filter((t) => t.type === "capital_in" && t.status === "Completed")
    .reduce((s, t) => s + (t.amount || 0), 0);
  const dbCapOut = transactions
    .filter((t) => t.type === "capital_out" && t.status === "Completed")
    .reduce((s, t) => s + (t.amount || 0), 0);

  const allTimeIncome = transactions
    .filter((t) => t.type === "income" && t.status === "Completed")
    .reduce((s, t) => s + (t.amount || 0), 0);
  const allTimeExpense = transactions
    .filter((t) => t.type === "expense" && t.status === "Completed")
    .reduce((s, t) => s + (t.amount || 0), 0);

  const initialCap = (initialBalances["Petty Cash"] || 0) + (initialBalances["Bank Transfer (Jago)"] || 0);
  const currInv = initialCap + dbCapIn - dbCapOut;
  const allNetProfit = totalAssets - currInv;
  const roi = currInv > 0 ? (allNetProfit / currInv) * 100 : 0;

  const chartData = useMemo(() => {
    const days = Math.round((pEnd - pStart) / 86400000) + 1;
    let b = [];
    let lFn = null;
    if (days <= 31) {
      b = Array.from({ length: days }, (_, i) => {
        const d = new Date(pStart);
        d.setDate(d.getDate() + i);
        return {
          label: d.toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
          }),
          key: d.toDateString(),
          inflow: 0,
          outflow: 0,
          net: 0,
        };
      });
      lFn = (d) => d.toDateString();
    } else {
      const weeks = Math.ceil(days / 7);
      b = Array.from({ length: weeks }, (_, i) => ({
        label: `Mg ${i + 1}`,
        key: i,
        inflow: 0,
        outflow: 0,
        net: 0,
      }));
      lFn = (d) => Math.floor((d - pStart) / (7 * 86400000));
    }
    filteredTxn
      .filter((t) => t.status === "Completed")
      .forEach((t) => {
        const d = t.date?.toDate?.();
        if (!d) return;
        const bk = b.find((x) => String(x.key) === String(lFn(d)));
        if (!bk) return;
        if (mainTab === "cashflow") {
          if (t.type === "income") {
            bk.inflow += t.amount;
            bk.net += t.amount;
          }
          if (t.type === "expense") {
            bk.outflow += t.amount;
            bk.net -= t.amount;
          }
        } else {
          if (t.type === "income") {
            bk.inflow += t.amount;
            bk.net += t.amount;
          }
          if (t.type === "expense") {
            bk.outflow += t.amount;
            bk.net -= t.amount;
          }
        }
      });
    // Build cumulative net over time?
    if (mainTab === "investment") {
      let cum = 0;
      b.forEach((bk) => {
        cum += bk.net;
        bk.net = cum;
        bk.inflow = 0;
        bk.outflow = 0;
      });
    }
    return b;
  }, [filteredTxn, pStart, pEnd, mainTab]);

  const handleSave = async () => {
    const amt = Number(form.amount || 0);
    if (amt <= 0) {
      showToast("Masukkan jumlah!", "error");
      return;
    }
    if (
      form.type === "transfer" &&
      (!form.fromAccount ||
        !form.toAccount ||
        form.fromAccount === form.toAccount)
    ) {
      showToast("Pilih akun berbeda!", "error");
      return;
    }
    const isRaw =
      form.type === "expense" && form.expenseSubType === "raw_material";
    if (isRaw && !form.rawMaterialProductId) {
      showToast("Pilih produk!", "error");
      return;
    }
    if (!isRaw && form.type !== "transfer" && !form.description) {
      showToast("Masukkan deskripsi!", "error");
      return;
    }

    setSaving(true);
    try {
      let desc = form.description;
      let cat = form.category;
      if (form.type === "transfer") {
        desc = `Transfer ${form.fromAccount} -> ${form.toAccount}`;
        cat = "Transfer";
      } else if (form.type === "capital_in") {
        cat = "Modal Masuk";
      } else if (form.type === "capital_out") {
        cat = "Tarik Dividen";
      } else if (isRaw) {
        const prod = products.find((p) => p.id === form.rawMaterialProductId);
        desc = `Beli ${form.rawMaterialQty} ${prod?.unit || "pcs"} ${prod?.name}`;
        cat = prod ? `Bahan (${prod.name})` : "Operasional";
      } else {
        cat = form.category || "Lainnya";
      }

      await addDoc(collection(db, "transactions"), {
        ...form,
        description: desc,
        category: cat,
        amount: amt,
        date: serverTimestamp(),
      });
      if (isRaw && form.rawMaterialProductId)
        await updateDoc(doc(db, "products", form.rawMaterialProductId), {
          stock: increment(Number(form.rawMaterialQty)),
        });
      showToast("Tersimpan!");
      setModal(false);
      setForm(emptyTxn);
    } catch (e) {
      showToast("Gagal.", "error");
    }
    setSaving(false);
  };

  const handleDelete = async (txn) => {
    if (!window.confirm("Yakin hapus?")) return;
    try {
      await deleteDoc(doc(db, "transactions", txn.id));
      if (txn.saleId) {
        const sDoc = await getDoc(doc(db, "sales", txn.saleId));
        if (sDoc.exists()) {
          const sd = sDoc.data();
          if (sd.items)
            await Promise.all(
              sd.items.map((i) =>
                updateDoc(doc(db, "products", i.id), {
                  stock: increment(i.qty),
                }),
              ),
            );
          await deleteDoc(doc(db, "sales", txn.saleId));
        }
      }
      showToast("Dihapus!");
    } catch (e) {
      showToast("Gagal.", "error");
    }
  };

  const tTxn = filteredTxn.filter((t) => {
    if (txnTypeFilter === "Uang Masuk")
      return t.type === "income" || t.type === "capital_in";
    if (txnTypeFilter === "Uang Keluar")
      return t.type === "expense" || t.type === "capital_out";
    if (txnTypeFilter === "Transfer/Modal")
      return (
        t.type === "transfer" ||
        t.type === "capital_in" ||
        t.type === "capital_out"
      );
    return true;
  });

  return (
    <main className="page-canvas">
      <div
        className="page-header"
        style={{
          borderBottom: "1px solid var(--color-surface-container-highest)",
          paddingBottom: "var(--space-md)",
        }}
      >
        <div>
          <h1 className="page-title">Keuangan</h1>
          <p className="page-subtitle">
            Pantau arus kas dan performa laba rugi.
          </p>
        </div>
        <div className="page-header-actions">
          <select
            className="form-input form-select"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: "var(--radius-md)",
            }}
          >
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            className="form-input form-select"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: "var(--radius-md)",
            }}
          >
            <option value="all">Semua Akun</option>
            {ACCOUNTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={() => {
              setForm(emptyTxn);
              setModal(true);
            }}
            style={{ padding: "6px 16px", fontSize: 13 }}
          >
            + Transaksi
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <button
          onClick={() => setMainTab("cashflow")}
          className={`btn ${mainTab === "cashflow" ? "btn-primary" : "btn-secondary"}`}
          style={{ borderRadius: 20 }}
        >
          Arus Kas Opex
        </button>
        <button
          onClick={() => setMainTab("investment")}
          className={`btn ${mainTab === "investment" ? "btn-primary" : "btn-secondary"}`}
          style={{ borderRadius: 20 }}
        >
          Investasi & Performa
        </button>
      </div>

      {mainTab === "cashflow" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(210px, 1fr))",
            gap: "var(--space-md)",
          }}
          className="mb-xl resp-fin-grid"
        >
          <div
            className="kpi-card"
            style={{ background: "var(--color-surface-container-low)" }}
          >
            <div className="kpi-card-header">
              <span className="kpi-card-label">Petty Cash (Fisik)</span>
              <div
                className="kpi-card-icon"
                style={{ background: "rgba(255,255,255,0.5)" }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: "var(--color-primary)" }}
                >
                  payments
                </span>
              </div>
            </div>
            <div
              className="kpi-card-value"
              style={{ color: "var(--color-on-surface)" }}
            >
              {fmtRp(cashBalance)}
            </div>
            <div className="kpi-card-trend neutral">Uang tunai kasir</div>
          </div>
          <div
            className="kpi-card"
            style={{ background: "var(--color-surface-container-low)" }}
          >
            <div className="kpi-card-header">
              <span className="kpi-card-label">Bank / Digital</span>
              <div
                className="kpi-card-icon"
                style={{ background: "rgba(255,255,255,0.5)" }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: "var(--color-secondary)" }}
                >
                  account_balance
                </span>
              </div>
            </div>
            <div
              className="kpi-card-value"
              style={{ color: "var(--color-on-surface)" }}
            >
              {fmtRp(digitalBalance)}
            </div>
            <div className="kpi-card-trend neutral">Seluruh akun bank</div>
          </div>
          <div
            className="kpi-card"
            style={{ background: "var(--color-primary-container)" }}
          >
            <div className="kpi-card-header">
              <span
                className="kpi-card-label"
                style={{ color: "var(--color-on-primary-container)" }}
              >
                Total Uang Anda
              </span>
              <div
                className="kpi-card-icon"
                style={{
                  background: "rgba(255,255,255,0.2)",
                  color: "var(--color-on-primary-container)",
                }}
              >
                <span className="material-symbols-outlined">
                  account_balance_wallet
                </span>
              </div>
            </div>
            <div
              className="kpi-card-value"
              style={{ color: "var(--color-on-primary-container)" }}
            >
              {fmtRp(totalCash)}
            </div>
            <div
              className="kpi-card-trend neutral"
              style={{
                color: "var(--color-on-primary-container)",
                opacity: 0.8,
              }}
            >
              Dompet + Bank
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-card-label">Net Cashflow</span>
              <div
                className="kpi-card-icon"
                style={{
                  background:
                    netCashflow >= 0
                      ? "rgba(0,108,73,0.1)"
                      : "rgba(186,26,26,0.1)",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    color:
                      netCashflow >= 0
                        ? "var(--color-tertiary)"
                        : "var(--color-error)",
                  }}
                >
                  swap_vert
                </span>
              </div>
            </div>
            <div
              className="kpi-card-value"
              style={{
                color:
                  netCashflow < 0
                    ? "var(--color-error)"
                    : "var(--color-tertiary)",
              }}
            >
              {netCashflow > 0 ? "+" : ""}
              {fmtRp(netCashflow)}
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 12,
                paddingTop: 8,
                borderTop: "1px solid var(--color-surface-container-highest)",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--color-on-surface-variant)",
                  }}
                >
                  CASH
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      nfCash < 0
                        ? "var(--color-error)"
                        : "var(--color-tertiary)",
                  }}
                >
                  {nfCash > 0 ? "+" : ""}
                  {fmtRp(nfCash)}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--color-on-surface-variant)",
                  }}
                >
                  BANK
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      nfBank < 0
                        ? "var(--color-error)"
                        : "var(--color-tertiary)",
                  }}
                >
                  {nfBank > 0 ? "+" : ""}
                  {fmtRp(nfBank)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(210px, 1fr))",
            gap: "var(--space-md)",
          }}
          className="mb-xl resp-fin-grid"
        >
          <div
            className="kpi-card"
            style={{ background: "var(--color-secondary-container)" }}
          >
            <div className="kpi-card-header">
              <span
                className="kpi-card-label"
                style={{ color: "var(--color-on-secondary-container)" }}
              >
                Total Aset (Valuasi)
              </span>
              <div
                className="kpi-card-icon"
                style={{
                  background: "rgba(255,255,255,0.2)",
                  color: "var(--color-on-secondary-container)",
                }}
              >
                <span className="material-symbols-outlined">inventory</span>
              </div>
            </div>
            <div
              className="kpi-card-value"
              style={{ color: "var(--color-on-secondary-container)" }}
            >
              {fmtRp(totalAssets)}
            </div>
            <div
              className="kpi-card-trend neutral"
              style={{
                color: "var(--color-on-secondary-container)",
                opacity: 0.8,
              }}
            >
              (Kas: {fmtRp(totalCash)}) + (Stok: {fmtRp(inventoryValue)})
            </div>
          </div>
          <div
            className="kpi-card"
            style={{ background: "var(--color-surface-container-low)" }}
          >
            <div className="kpi-card-header">
              <span className="kpi-card-label">Modal Aktif (Investasi)</span>
              <div
                className="kpi-card-icon"
                style={{ background: "rgba(255,255,255,0.5)" }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: "var(--color-secondary)" }}
                >
                  trending_up
                </span>
              </div>
            </div>
            <div
              className="kpi-card-value"
              style={{ color: "var(--color-on-surface)" }}
            >
              {fmtRp(currInv)}
            </div>
            <div className="kpi-card-trend neutral">
              Total Setor Modal - Dividen
            </div>
          </div>
          <div
            className="kpi-card"
            style={{ background: "var(--color-surface-container-low)" }}
          >
            <div className="kpi-card-header">
              <span className="kpi-card-label">Total Pendapatan</span>
              <div
                className="kpi-card-icon"
                style={{ background: "rgba(0,108,73,0.1)", color: "var(--color-tertiary)" }}
              >
                <span className="material-symbols-outlined">payments</span>
              </div>
            </div>
            <div className="kpi-card-value" style={{ color: "var(--color-on-surface)" }}>
              {fmtRp(allTimeIncome)}
            </div>
            <div className="kpi-card-trend neutral">Akumulasi seluruh penjualan</div>
          </div>
          <div
            className="kpi-card"
            style={{ background: "var(--color-surface-container-low)" }}
          >
            <div className="kpi-card-header">
              <span className="kpi-card-label">Total Pengeluaran</span>
              <div
                className="kpi-card-icon"
                style={{ background: "rgba(186,26,26,0.1)", color: "var(--color-error)" }}
              >
                <span className="material-symbols-outlined">shopping_cart</span>
              </div>
            </div>
            <div className="kpi-card-value" style={{ color: "var(--color-on-surface)" }}>
              {fmtRp(allTimeExpense)}
            </div>
            <div className="kpi-card-trend neutral">Bahan baku & pakan operasional</div>
          </div>
          <div
            className="kpi-card"
            style={{
              border: "2px solid var(--color-tertiary)",
              background: "transparent",
            }}
          >
            <div className="kpi-card-header">
              <span className="kpi-card-label">
                Real Net Profit
              </span>
              <div
                className="kpi-card-icon"
                style={{
                  background: "rgba(0,108,73,0.1)",
                  color: "var(--color-tertiary)",
                }}
              >
                <span className="material-symbols-outlined">attach_money</span>
              </div>
            </div>
            <div
              className="kpi-card-value"
              style={{ color: "var(--color-on-surface)" }}
            >
              {allNetProfit >= 0 ? '+' : ''}{fmtRp(allNetProfit)}
            </div>
            <div className="kpi-card-trend neutral">
              Total Aset - Modal Aktif
            </div>
          </div>
          <div
            className="kpi-card"
            style={{ background: "var(--color-primary-container)" }}
          >
            <div className="kpi-card-header">
              <span
                className="kpi-card-label"
                style={{ color: "var(--color-on-primary-container)" }}
              >
                ROI (Return on Investment)
              </span>
              <div
                className="kpi-card-icon"
                style={{
                  background: "rgba(255,255,255,0.2)",
                  color: "var(--color-on-primary-container)",
                }}
              >
                <span className="material-symbols-outlined">monitoring</span>
              </div>
            </div>
            <div
              className="kpi-card-value"
              style={{
                color: "var(--color-on-primary-container)",
                fontSize: 32,
              }}
            >
              {roi.toFixed(1)}%
            </div>
            <div
              className="kpi-card-trend neutral"
              style={{
                color: "var(--color-on-primary-container)",
                opacity: 0.8,
              }}
            >
              Laba Bersih / Investasi Berjalan
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 340px",
          gap: "var(--space-xl)",
          marginBottom: "var(--space-xl)",
        }}
        className="resp-fin-grid"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-xl)",
          }}
        >
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                {mainTab === "cashflow"
                  ? "Arus Kas Operasional"
                  : "Tren Laba Bersih Berkala"}
              </span>
            </div>
            <div
              style={{
                padding: "var(--space-md) var(--space-lg) var(--space-lg)",
              }}
            >
              <CashflowChart
                data={chartData}
                showNetOnly={mainTab === "investment"}
              />
            </div>
          </div>
          <div className="card">
            <div className="card-header" style={{ borderBottom: "none" }}>
              <span className="card-title">Transaksi Laporan Pembukuan</span>
            </div>
            <div
              style={{
                padding: "0 var(--space-lg) var(--space-md)",
                display: "flex",
                gap: "var(--space-sm)",
              }}
            >
              {["Semua", "Uang Masuk", "Uang Keluar", "Transfer/Modal"].map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => setTxnTypeFilter(t)}
                    className={`btn ${txnTypeFilter === t ? "btn-primary" : "btn-secondary"}`}
                    style={{
                      padding: "4px 12px",
                      fontSize: 12,
                      borderRadius: 20,
                    }}
                  >
                    {t}
                  </button>
                ),
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="data-table" style={{ minWidth: 600 }}>
                <thead>
                  <tr>
                    <th>Tgl</th>
                    <th>Deskripsi</th>
                    <th>Kategori</th>
                    <th>Akun</th>
                    <th style={{ textAlign: "right" }}>Jumlah</th>
                    <th style={{ textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {tTxn.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          textAlign: "center",
                          padding: "var(--space-xl)",
                        }}
                      >
                        Hening...
                      </td>
                    </tr>
                  ) : (
                    tTxn.slice(0, 30).map((t) => {
                      const isInc =
                        t.type === "income" || t.type === "capital_in";
                      const isTr = t.type === "transfer";
                      return (
                        <tr key={t.id}>
                          <td
                            className="text-mono text-muted"
                            style={{ fontSize: 12 }}
                          >
                            {fmtDate(t.date)}
                          </td>
                          <td style={{ fontWeight: 500 }}>{t.description}</td>
                          <td>
                            <span className="badge badge-neutral">
                              {isTr ? "Transfer" : t.category}
                            </span>
                          </td>
                          <td className="text-muted" style={{ fontSize: 13 }}>
                            {isTr
                              ? `${t.fromAccount} → ${t.toAccount}`
                              : t.account}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <span
                              className={`text-mono ${isTr ? "text-primary" : isInc ? "text-success" : "text-error"}`}
                              style={{ fontWeight: 600 }}
                            >
                              {isTr ? "" : isInc ? "+" : "-"} {fmtRp(t.amount)}
                            </span>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "center",
                                gap: 4,
                              }}
                            >
                              <button
                                className="btn btn-icon"
                                onClick={() => handleDelete(t)}
                                style={{ color: "var(--color-error)" }}
                              >
                                <span
                                  className="material-symbols-outlined"
                                  style={{ fontSize: 16 }}
                                >
                                  delete
                                </span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-xl)",
          }}
        >
          {mainTab === "cashflow" ? (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Pengeluaran Operasional</span>
              </div>
              <div
                style={{
                  padding: "var(--space-md) var(--space-lg) var(--space-lg)",
                }}
              >
                {sortedExp.length === 0 ? (
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-on-surface-variant)",
                      textAlign: "center",
                    }}
                  >
                    Tidak ada pengeluaran.
                  </p>
                ) : (
                  sortedExp.map(([cat, val]) => (
                    <div key={cat} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          {cat}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--color-on-surface-variant)",
                          }}
                        >
                          {((val / totExp) * 100).toFixed(0)}%{" "}
                          <span
                            className="text-mono"
                            style={{
                              marginLeft: 4,
                              fontWeight: 600,
                              color: "var(--color-on-surface)",
                            }}
                          >
                            {fmtRp(val)}
                          </span>
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: "var(--color-surface-container-highest)",
                          borderRadius: 99,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            borderRadius: 99,
                            background: "var(--color-error)",
                            opacity: 0.8,
                            width: `${(val / totExp) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Aksi Modal</span>
              </div>
              <div style={{ padding: "var(--space-md)" }}>
                <button
                  className="btn btn-secondary w-full"
                  onClick={() => {
                    setForm({ ...emptyTxn, type: "capital_in" });
                    setModal(true);
                  }}
                  style={{ marginBottom: 12 }}
                >
                  Suntik Modal Baru
                </button>
                <button
                  className="btn btn-secondary w-full"
                  onClick={() => {
                    setForm({ ...emptyTxn, type: "capital_out" });
                    setModal(true);
                  }}
                >
                  Tarik Profit / Dividen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setModal(false)}
        >
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Transaksi Keuangan</span>
              <button className="btn btn-icon" onClick={() => setModal(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tipe Transaksi</label>
                <select
                  className="form-input form-select"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="income">Pendapatan (+)</option>
                  <option value="expense">Pengeluaran (-)</option>
                  <option value="transfer">Transfer Akun (~)</option>
                  <option value="capital_in">Suntik Modal (Investasi)</option>
                  <option value="capital_out">Tarik Profit (Dividen)</option>
                </select>
              </div>

              {form.type === "transfer" ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                      marginBottom: 16,
                    }}
                  >
                    <div className="form-group">
                      <label className="form-label">Dari</label>
                      <select
                        className="form-input form-select"
                        value={form.fromAccount}
                        onChange={(e) =>
                          setForm({ ...form, fromAccount: e.target.value })
                        }
                      >
                        {ACCOUNTS.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Ke</label>
                      <select
                        className="form-input form-select"
                        value={form.toAccount}
                        onChange={(e) =>
                          setForm({ ...form, toAccount: e.target.value })
                        }
                      >
                        {ACCOUNTS.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Jumlah (Rp)</label>
                    <input
                      className="form-input"
                      type="number"
                      min={0}
                      value={form.amount}
                      onChange={(e) =>
                        setForm({ ...form, amount: e.target.value })
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  {form.type === "expense" && (
                    <div
                      className="form-group"
                      style={{ display: "flex", gap: 8 }}
                    >
                      {[
                        { val: "operational", label: "Biaya Operasional" },
                        { val: "raw_material", label: "Beli Stok Telur" },
                      ].map((st) => (
                        <button
                          key={st.val}
                          onClick={() =>
                            setForm({
                              ...form,
                              expenseSubType: st.val,
                              rawMaterialProductId: "",
                              amount: 0,
                            })
                          }
                          className={`btn ${form.expenseSubType === st.val ? "btn-primary" : "btn-secondary"}`}
                          style={{ flex: 1 }}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {form.type === "expense" &&
                    form.expenseSubType === "raw_material" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "2fr 1fr",
                          gap: 16,
                        }}
                      >
                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: 11 }}>
                            Produk (+stok)
                          </label>
                          <select
                            className="form-input form-select"
                            value={form.rawMaterialProductId}
                            onChange={(e) => {
                              const p = products.find(
                                (prod) => prod.id === e.target.value,
                              );
                              setForm({
                                ...form,
                                rawMaterialProductId: e.target.value,
                                amount: p
                                  ? Number(form.rawMaterialQty || 1) *
                                  (p.buyPrice || 0)
                                  : 0,
                              });
                            }}
                          >
                            <option value="">-- Pilih --</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: 11 }}>Kuantitas</label>
                          <input
                            className="form-input"
                            type="number"
                            min={1}
                            value={form.rawMaterialQty || ""}
                            placeholder="0"
                            onChange={(e) => {
                              const q = e.target.value;
                              const p = products.find((prod) => prod.id === form.rawMaterialProductId);
                              setForm({
                                ...form,
                                rawMaterialQty: q,
                                amount: p ? Number(q || 0) * (p.buyPrice || 0) : 0,
                              });
                            }}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: 11 }}>Total (Rp)</label>
                        <input
                          className="form-input"
                          type="number"
                          min={0}
                          value={form.amount}
                          onChange={(e) =>
                            setForm({ ...form, amount: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="form-group">
                        <label className="form-label">
                          Keterangan Singkat *
                        </label>
                        <input
                          className="form-input"
                          value={form.description}
                          onChange={(e) =>
                            setForm({ ...form, description: e.target.value })
                          }
                        />
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)",
                          gap: 16,
                        }}
                      >
                        {form.type === "income" || form.type === "expense" ? (
                          <div className="form-group">
                            <label className="form-label">Kategori</label>
                            <input
                              className="form-input"
                              list="cat-list"
                              value={form.category}
                              onChange={(e) =>
                                setForm({ ...form, category: e.target.value })
                              }
                            />
                            <datalist id="cat-list">
                              <option value="Operasional" />
                              <option value="Lainnya" />
                            </datalist>
                          </div>
                        ) : (
                          <div />
                        )}
                        <div className="form-group">
                          <label className="form-label">Nominal (Rp) *</label>
                          <input
                            className="form-input"
                            type="number"
                            min={0}
                            value={form.amount}
                            onChange={(e) =>
                              setForm({ ...form, amount: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    </>
                  )}
                  <div className="form-group" style={{ marginTop: 16 }}>
                    <label className="form-label">
                      Simpan di Akun (Sumber Dana)
                    </label>
                    <select
                      className="form-input form-select"
                      value={form.account}
                      onChange={(e) =>
                        setForm({ ...form, account: e.target.value })
                      }
                    >
                      {ACCOUNTS.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setModal(false)}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Menyimpan..." : "Simpan Trx"}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@media (max-width: 900px) { .resp-fin-grid { grid-template-columns: 1fr !important; } }`}</style>
    </main>
  );
}
