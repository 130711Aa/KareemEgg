import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, getDoc, updateDoc, deleteDoc, setDoc, query, where, orderBy, limit, getDocs, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from '../components/Toast';

const ACCOUNTS = ['Petty Cash', 'Bank Transfer (Jago)'];
const emptyTxn = { type: 'income', expenseSubType: 'operational', amount: 0, category: '', description: '', account: 'Bank Transfer (Jago)', status: 'Completed', rawMaterialProductId: '', rawMaterialQty: 1 };

export default function Finance() {
    const [transactions, setTransactions] = useState([]);
    const [products, setProducts] = useState([]);
    const [sales, setSales] = useState([]);
    const [tab, setTab] = useState('transactions'); // 'transactions' | 'sales'
    const [selectedSale, setSelectedSale] = useState(null);
    const [initialBalances, setInitialBalances] = useState({
        'Petty Cash': 0,
        'Bank Transfer (Jago)': 0
    });
    const [initBalanceModal, setInitBalanceModal] = useState(false);
    const [tempBalances, setTempBalances] = useState({});
    const [accounts] = useState([
        { name: 'Petty Cash', balance: 0, icon: 'payments', color: 'var(--color-primary-container)' },
        { name: 'Bank Transfer (Jago)', balance: 0, icon: 'account_balance', color: 'var(--color-secondary-container)' },
    ]);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(emptyTxn);
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        const q = query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(50));
        const unsub = onSnapshot(q, snap => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsub2 = onSnapshot(collection(db, 'products'), snap => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsub3 = onSnapshot(collection(db, 'sales'), snap => {
            setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsub4 = onSnapshot(doc(db, 'settings', 'initial_balances'), (docSnap) => {
            if (docSnap.exists()) {
                setInitialBalances(docSnap.data());
            }
        });
        return () => { unsub(); unsub2(); unsub3(); unsub4(); };
    }, []);

    const normalizeAccountName = (accName) => {
        if (!accName) return 'Bank Transfer (Jago)';
        const lower = accName.toLowerCase();
        if (lower === 'cash' || lower === 'petty cash') {
            return 'Petty Cash';
        }
        return 'Bank Transfer (Jago)';
    };

    // Helper to compute dynamic account balances (Initial Balance + Completed changes)
    const getAccountBalance = (accountName) => {
        const targetStandard = normalizeAccountName(accountName);
        const initial = initialBalances[targetStandard] || 0;
        const netChange = transactions
            .filter(t => normalizeAccountName(t.account) === targetStandard && t.status === 'Completed')
            .reduce((sum, t) => sum + (t.type === 'income' ? (t.amount || 0) : -(t.amount || 0)), 0);
        return initial + netChange;
    };

    // Compute KPIs from transactions
    const receivables = transactions.filter(t => t.status === 'Pending' && t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
    const payables = transactions.filter(t => t.status === 'Pending' && t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);

    const cashBalance = getAccountBalance('Petty Cash');
    const digitalBalance = ACCOUNTS.filter(name => name !== 'Petty Cash').reduce((sum, name) => sum + getAccountBalance(name), 0);

    // Keuntungan Penjualan (HPP produk terjual dikurangi harga jual)
    const salesProfit = sales.reduce((sum, sale) => {
        let saleProfit = 0;
        sale.items?.forEach(item => {
            const prod = products.find(p => p.id === item.id);
            const buyPrice = item.buyPrice !== undefined ? item.buyPrice : (prod?.buyPrice || 0);
            const sellPrice = item.price || 0;
            saleProfit += item.qty * (sellPrice - buyPrice);
        });
        return sum + saleProfit;
    }, 0);

    // Biaya Operasional (pengeluaran non beli-stok)
    const operExpenses = transactions
        .filter(t => t.type === 'expense' && t.expenseSubType === 'operational')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

    const netProfit = salesProfit - operExpenses;

    // Expense breakdown
    const expenseByCategory = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
        let categoryName = t.category;
        if (categoryName === 'Raw Material' && t.expenseSubType === 'raw_material' && t.rawMaterialProductId) {
            const prod = products.find(p => p.id === t.rawMaterialProductId);
            if (prod) {
                categoryName = `Raw Material (${prod.name})`;
            }
        }
        expenseByCategory[categoryName] = (expenseByCategory[categoryName] || 0) + (t.amount || 0);
    });
    const maxExpense = Math.max(...Object.values(expenseByCategory), 1);

    const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
    const fmtShort = (n) => { n = n || 0; if (n >= 1e9) return 'Rp ' + parseFloat((n / 1e9).toFixed(1)) + 'M'; if (n >= 1e6) return 'Rp ' + parseFloat((n / 1e6).toFixed(1)) + 'jt'; return 'Rp ' + parseFloat((n / 1e3).toFixed(1)) + 'rb'; };
    const fmtDate = (ts) => { if (!ts?.toDate) return '—'; const d = ts.toDate(); return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); };

    const handleSave = async () => {
        const isRawMaterial = form.type === 'expense' && form.expenseSubType === 'raw_material';
        const selectedProduct = isRawMaterial ? products.find(p => p.id === form.rawMaterialProductId) : null;

        // Validation
        if (isRawMaterial && !selectedProduct) { showToast('Pilih produk terlebih dahulu!', 'error'); return; }
        if (!form.amount || Number(form.amount) <= 0) { showToast('Masukkan jumlah pembayaran!', 'error'); return; }
        if (!isRawMaterial && !form.description) { showToast('Masukkan deskripsi!', 'error'); return; }

        setSaving(true);
        try {
            const autoDesc = isRawMaterial
                ? `Beli ${form.rawMaterialQty} ${selectedProduct?.unit || 'pcs'} ${selectedProduct?.name}`
                : form.description;
            const autoCategory = isRawMaterial && selectedProduct ? `Raw Material (${selectedProduct.name})` : (form.category || 'Operational');

            await addDoc(collection(db, 'transactions'), {
                ...form,
                description: autoDesc,
                category: autoCategory,
                amount: Number(form.amount),
                date: serverTimestamp(),
            });

            // If Raw Material → auto-increment product stock
            if (isRawMaterial && selectedProduct) {
                await updateDoc(doc(db, 'products', selectedProduct.id), {
                    stock: increment(Number(form.rawMaterialQty)),
                });
                showToast(`Stok ${selectedProduct.name} bertambah ${form.rawMaterialQty} pcs!`);
            } else {
                showToast('Transaksi berhasil ditambahkan!');
            }

            setModal(false);
            setForm(emptyTxn);
        } catch (e) {
            showToast('Gagal menyimpan.', 'error');
        }
        setSaving(false);
    };

    const handleCompleteTransaction = async (id) => {
        try {
            await updateDoc(doc(db, 'transactions', id), { status: 'Completed' });
            showToast('Status transaksi diperbarui menjadi Selesai (Lunas)!');
        } catch (e) {
            showToast('Gagal memperbarui status.', 'error');
        }
    };

    const handleDeleteTransaction = async (txn) => {
        const confirmMsg = txn.saleId
            ? 'Hapus transaksi ini? Karena ini terhubung ke penjualan POS, data penjualan & stok juga akan dikembalikan.'
            : 'Apakah Anda yakin ingin menghapus transaksi ini?';
        if (!window.confirm(confirmMsg)) return;
        try {
            // Delete the transaction itself
            await deleteDoc(doc(db, 'transactions', txn.id));

            // If this transaction is linked to a sale, cascade delete it and restore stock
            if (txn.saleId) {
                const saleDocRef = doc(db, 'sales', txn.saleId);
                const saleDoc = await getDoc(saleDocRef);
                if (saleDoc.exists()) {
                    const saleData = saleDoc.data();
                    // Restore product stock
                    if (saleData.items && saleData.items.length > 0) {
                        await Promise.all(saleData.items.map(item =>
                            updateDoc(doc(db, 'products', item.id), {
                                stock: increment(item.qty)
                            })
                        ));
                    }
                    // Delete the sale document
                    await deleteDoc(saleDocRef);
                }
                showToast('Transaksi & penjualan terkait berhasil dihapus, stok dikembalikan!');
            } else {
                showToast('Transaksi berhasil dihapus!');
            }
        } catch (e) {
            console.error(e);
            showToast('Gagal menghapus transaksi.', 'error');
        }
    };

    const handleDeleteSale = async (sale) => {
        if (!window.confirm('Hapus penjualan ini? Stok produk akan dikembalikan dan transaksi keuangan terkait juga akan dihapus.')) return;
        try {
            // 1. Delete from sales collection
            await deleteDoc(doc(db, 'sales', sale.id));

            // 2. Restore product stock for each item
            if (sale.items && sale.items.length > 0) {
                await Promise.all(sale.items.map(item =>
                    updateDoc(doc(db, 'products', item.id), {
                        stock: increment(item.qty)
                    })
                ));
            }

            // 3. Find and delete the linked Sales Revenue transaction
            // First try by precise saleId (new sales), then fallback to heuristic (old data)
            const byIdSnap = await getDocs(query(
                collection(db, 'transactions'),
                where('saleId', '==', sale.id)
            ));
            if (!byIdSnap.empty) {
                await Promise.all(byIdSnap.docs.map(txnDoc => deleteDoc(doc(db, 'transactions', txnDoc.id))));
            } else {
                // Fallback for historical sales without saleId: match by amount + customer name
                const fallbackSnap = await getDocs(query(
                    collection(db, 'transactions'),
                    where('type', '==', 'income'),
                    where('category', '==', 'Sales Revenue'),
                    where('amount', '==', sale.total)
                ));
                const deletePromises = [];
                fallbackSnap.forEach(txnDoc => {
                    const desc = txnDoc.data().description || '';
                    if (sale.customer && desc.includes(sale.customer)) {
                        deletePromises.push(deleteDoc(doc(db, 'transactions', txnDoc.id)));
                    }
                });
                // If still nothing matched by customer, delete first match
                if (deletePromises.length === 0) {
                    fallbackSnap.forEach(txnDoc => {
                        if (deletePromises.length === 0)
                            deletePromises.push(deleteDoc(doc(db, 'transactions', txnDoc.id)));
                    });
                }
                await Promise.all(deletePromises);
            }

            if (selectedSale?.id === sale.id) setSelectedSale(null);
            showToast('Penjualan berhasil dihapus & stok dikembalikan!');
        } catch (e) {
            console.error(e);
            showToast('Gagal menghapus penjualan. Coba lagi.', 'error');
        }
    };

    const handlePrintReceipt = (sale) => {
        const printWindow = window.open('', '_blank', 'width=600,height=800');
        const itemsHtml = sale.items?.map(item => `
            <tr>
                <td style="padding: 6px 0;">${item.name}</td>
                <td style="text-align: center; padding: 6px 0;">${item.qty}</td>
                <td style="text-align: right; padding: 6px 0;">Rp ${(item.price || 0).toLocaleString('id-ID')}</td>
                <td style="text-align: right; padding: 6px 0;">Rp ${(item.total || 0).toLocaleString('id-ID')}</td>
            </tr>
        `).join('') || '';

        const dateStr = sale.date?.toDate?.() ? sale.date.toDate().toLocaleString('id-ID') : '—';

        printWindow.document.write(`
            <html>
            <head>
                <title>Struk Penjualan #${sale.id.slice(0, 8)}</title>
                <style>
                    body { font-family: 'Courier New', Courier, monospace; color: #000; padding: 20px; font-size: 14px; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .header h1 { margin: 0; font-size: 20px; }
                    .info { margin-bottom: 15px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
                    .info p { margin: 4px 0; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                    th { border-bottom: 1px dashed #000; text-align: left; padding: 6px 0; }
                    .totals { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; }
                    .totals-row { display: flex; justify-content: space-between; margin: 4px 0; }
                    .footer { text-align: center; margin-top: 30px; border-top: 1px dashed #000; padding-top: 10px; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>EGG ERP</h1>
                    <p>Farm-to-Finance System</p>
                </div>
                <div class="info">
                    <p><b>ID Transaksi:</b> #${sale.id}</p>
                    <p><b>Tanggal:</b> ${dateStr}</p>
                    <p><b>Pelanggan:</b> ${sale.customer || 'Walk-in Customer'}</p>
                    <p><b>Metode:</b> ${sale.paymentMethod?.toUpperCase()}</p>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th style="text-align: center;">Qty</th>
                            <th style="text-align: right;">Harga</th>
                            <th style="text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
                <div class="totals">
                    <div class="totals-row"><span>Subtotal:</span> <span>Rp ${(sale.subtotal || 0).toLocaleString('id-ID')}</span></div>
                    <div class="totals-row"><span>Pajak (0%):</span> <span>Rp 0</span></div>
                    <div class="totals-row" style="font-weight: bold; font-size: 16px;"><span>TOTAL:</span> <span>Rp ${(sale.total || 0).toLocaleString('id-ID')}</span></div>
                </div>
                <div class="footer">
                    <p>Terima kasih atas pembelian Anda!</p>
                    <p>KareeemEgg - Selalu segar dari peternakan</p>
                </div>
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(function() { window.close(); }, 500);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    const exportCSV = () => {
        const rows = [['Tanggal', 'Deskripsi', 'Kategori', 'Akun', 'Jumlah', 'Tipe', 'Status']];
        transactions.forEach(t => rows.push([fmtDate(t.date), t.description, t.category, t.account, t.amount, t.type, t.status]));
        const csv = rows.map(r => r.join(',')).join('\n');
        const link = document.createElement('a'); link.href = 'data:text/csv,' + encodeURIComponent(csv); link.download = 'transaksi.csv'; link.click();
    };

    return (
        <main className="page-canvas">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Keuangan</h1>
                    <p className="page-subtitle">Arus kas dan status buku besar secara real-time.</p>
                </div>
                <div className="page-header-actions">
                    <button className="btn btn-secondary" onClick={exportCSV}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
                        Export CSV
                    </button>
                    <button className="btn btn-primary" onClick={() => setModal(true)}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                        Tambah Transaksi
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'var(--space-md)' }} className="mb-xl">
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Saldo Kas Fisik (Cash)</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">payments</span></div>
                    </div>
                    <div className="kpi-card-value">{fmtShort(cashBalance)}</div>
                    <div className="kpi-card-trend neutral">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>savings</span>
                        Brankas Petty Cash
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Saldo Rekening (Digital)</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">account_balance</span></div>
                    </div>
                    <div className="kpi-card-value">{fmtShort(digitalBalance)}</div>
                    <div className="kpi-card-trend neutral">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>credit_card</span>
                        Bank Jago (Termasuk QRIS)
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Keuntungan Bersih</span>
                        <div className="kpi-card-icon" style={{ background: netProfit >= 0 ? 'rgba(0,108,73,0.12)' : 'rgba(186,26,26,0.1)' }}>
                            <span className="material-symbols-outlined" style={{ color: netProfit >= 0 ? 'var(--color-tertiary)' : 'var(--color-error)' }}>
                                {netProfit >= 0 ? 'trending_up' : 'trending_down'}
                            </span>
                        </div>
                    </div>
                    <div className="kpi-card-value" style={{ color: netProfit < 0 ? 'var(--color-error)' : 'inherit' }}>{fmtShort(netProfit)}</div>
                    <div className={`kpi-card-trend ${netProfit >= 0 ? 'up' : 'down'}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, fontSize: 11, fontWeight: 500, color: 'inherit' }}>
                        <div>Laba Kotor: {fmtShort(salesProfit)}</div>
                        <div style={{ color: 'var(--color-on-surface-variant)' }}>Biaya Operasional: {fmtShort(operExpenses)}</div>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Piutang (Pending In)</span>
                        <div className="kpi-card-icon"><span className="material-symbols-outlined">request_quote</span></div>
                    </div>
                    <div className="kpi-card-value">{fmtShort(receivables)}</div>
                    <div className="kpi-card-trend neutral">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>pending</span>
                        Belum cair
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-header">
                        <span className="kpi-card-label">Hutang (Pending Out)</span>
                        <div className="kpi-card-icon" style={{ background: 'rgba(186,26,26,0.1)' }}>
                            <span className="material-symbols-outlined" style={{ color: 'var(--color-error)' }}>receipt_long</span>
                        </div>
                    </div>
                    <div className="kpi-card-value text-error">{fmtShort(payables)}</div>
                    <div className="kpi-card-trend down">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
                        Harus dibayar
                    </div>
                </div>
            </div>

            {/* Secondary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }} className="resp-fin-grid">
                {/* Account Balances */}
                <div className="card">
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="card-title">Saldo Akun</span>
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                setTempBalances({ ...initialBalances });
                                setInitBalanceModal(true);
                            }}
                            style={{ padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, borderRadius: 'var(--radius-sm)' }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit_note</span>
                            Saldo Awal
                        </button>
                    </div>
                    <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                        {accounts.map(a => (
                            <div key={a.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-md)', background: 'var(--color-surface-container-low)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-outline-variant)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{a.icon}</span>
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 'var(--fs-label-md)' }}>{a.name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--color-on-surface-variant)' }}>Saldo berjalan</div>
                                    </div>
                                </div>
                                <div className="text-mono" style={{ fontWeight: 600 }}>{fmtRp(getAccountBalance(a.name))}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Expense Breakdown */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Rincian Pengeluaran</span>
                    </div>
                    <div style={{ padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                        {Object.entries(expenseByCategory).length === 0 ? (
                            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--fs-body-sm)', textAlign: 'center', padding: 'var(--space-lg) 0' }}>Belum ada data pengeluaran.</p>
                        ) : (
                            Object.entries(expenseByCategory).map(([cat, val]) => (
                                <div key={cat}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 'var(--fs-label-md)', fontWeight: 600 }}>{cat}</span>
                                        <span className="text-mono" style={{ fontSize: 'var(--fs-label-md)' }}>{fmtRp(val)}</span>
                                    </div>
                                    <div style={{ height: 6, background: 'var(--color-surface-container-highest)', borderRadius: 99, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', borderRadius: 99, background: 'var(--color-primary-fixed-dim)', width: `${(val / maxExpense) * 100}%`, transition: 'width 0.5s ease' }} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs for Transactions / Sales History */}
            <div className="card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button
                            className={`btn ${tab === 'transactions' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setTab('transactions')}
                            style={{ padding: '6px 14px', fontSize: 13, borderRadius: 'var(--radius-md)' }}
                        >
                            Log Transaksi Keuangan
                        </button>
                        <button
                            className={`btn ${tab === 'sales' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setTab('sales')}
                            style={{ padding: '6px 14px', fontSize: 13, borderRadius: 'var(--radius-md)' }}
                        >
                            Riwayat Penjualan (POS)
                        </button>
                    </div>
                    <span style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--color-on-surface-variant)' }}>
                        {tab === 'transactions' ? `${transactions.length} transaksi` : `${sales.length} penjualan`}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    {tab === 'transactions' ? (
                        <table className="data-table finance-txn-table" style={{ minWidth: 700 }}>
                            <thead>
                                <tr>
                                    <th>Tanggal</th>
                                    <th>Deskripsi</th>
                                    <th>Kategori</th>
                                    <th>Akun</th>
                                    <th style={{ textAlign: 'right' }}>Jumlah</th>
                                    <th style={{ textAlign: 'center' }}>Status</th>
                                    <th style={{ textAlign: 'center' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.length === 0 ? (
                                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-on-surface-variant)' }}>Belum ada transaksi.</td></tr>
                                ) : transactions.slice(0, 20).map(t => (
                                    <tr key={t.id}>
                                        <td className="text-mono text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                                        <td style={{ fontWeight: 500 }}>{t.description}</td>
                                        <td><span className="badge badge-neutral">{t.category}</span></td>
                                        <td className="text-muted">{t.account}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <span className={`text-mono ${t.type === 'income' ? 'text-success' : 'text-error'}`} style={{ fontWeight: 600 }}>
                                                {t.type === 'income' ? '+' : '-'} {fmtRp(t.amount)}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className={`badge ${t.status === 'Completed' ? 'badge-success' : t.status === 'Pending' ? 'badge-warning' : 'badge-error'}`}>{t.status}</span>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                                                {t.status === 'Pending' && (
                                                    <button
                                                        className="btn btn-icon"
                                                        onClick={() => handleCompleteTransaction(t.id)}
                                                        title="Tandai Selesai / Lunas"
                                                        style={{ color: 'var(--color-tertiary)' }}
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>done</span>
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-icon"
                                                    onClick={() => handleDeleteTransaction(t)}
                                                    title="Hapus Transaksi"
                                                    style={{ color: 'var(--color-error)' }}
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (() => {
                        const sortedSales = [...sales].sort((a, b) => {
                            const da = a.date?.toDate?.() || 0;
                            const dbVal = b.date?.toDate?.() || 0;
                            return dbVal - da;
                        });

                        return (
                            <table className="data-table finance-sales-table" style={{ minWidth: 700 }}>
                                <thead>
                                    <tr>
                                        <th>Tanggal</th>
                                        <th>Pelanggan</th>
                                        <th>Metode</th>
                                        <th>Daftar Item</th>
                                        <th style={{ textAlign: 'right' }}>Total</th>
                                        <th style={{ textAlign: 'center' }}>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedSales.length === 0 ? (
                                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-on-surface-variant)' }}>Belum ada riwayat penjualan.</td></tr>
                                    ) : sortedSales.slice(0, 20).map(s => {
                                        const itemsSummary = s.items?.map(item => `${item.name} (${item.qty} pcs)`).join(', ');
                                        return (
                                            <tr key={s.id}>
                                                <td className="text-mono text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(s.date)}</td>
                                                <td style={{ fontWeight: 500 }}>{s.customer || 'Walk-in Customer'}</td>
                                                <td><span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>{s.paymentMethod}</span></td>
                                                <td className="text-muted" style={{ fontSize: 13, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={itemsSummary}>
                                                    {itemsSummary}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 600 }} className="text-mono text-success">
                                                    {fmtRp(s.total)}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                                                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)' }} onClick={() => setSelectedSale(s)}>
                                                            Detail
                                                        </button>
                                                        <button
                                                            className="btn btn-icon"
                                                            style={{ color: 'var(--color-error)' }}
                                                            onClick={() => handleDeleteSale(s)}
                                                            title="Hapus Penjualan (kembalikan stok)"
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        );
                    })()}
                </div>
            </div>

            {/* Add Transaction Modal */}
            {modal && (() => {
                const isExpense = form.type === 'expense';
                const isRawMaterial = isExpense && form.expenseSubType === 'raw_material';
                const selectedProduct = products.find(p => p.id === form.rawMaterialProductId);
                const autoAmount = isRawMaterial && selectedProduct
                    ? Number(form.rawMaterialQty || 0) * (selectedProduct.buyPrice || 0)
                    : form.amount;

                return (
                    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                        <div className="modal">
                            <div className="modal-header">
                                <span className="modal-title">Tambah Transaksi</span>
                                <button className="btn btn-icon" onClick={() => setModal(false)}><span className="material-symbols-outlined">close</span></button>
                            </div>
                            <div className="modal-body">
                                {/* Income vs Expense */}
                                <div className="form-group">
                                    <label className="form-label">Tipe Transaksi</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        {[{ val: 'income', label: 'Pemasukan', icon: 'trending_up', color: 'var(--color-tertiary)' },
                                        { val: 'expense', label: 'Pengeluaran', icon: 'trending_down', color: 'var(--color-error)' }].map(t => (
                                            <button
                                                key={t.val}
                                                onClick={() => setForm(f => ({ ...f, type: t.val, expenseSubType: 'operational' }))}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                    padding: 'var(--space-sm)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                                    border: `2px solid ${form.type === t.val ? t.color : 'var(--color-outline-variant)'}`,
                                                    background: form.type === t.val ? `${t.color}15` : 'var(--color-surface)',
                                                    color: form.type === t.val ? t.color : 'var(--color-on-surface-variant)',
                                                    fontWeight: 600, fontSize: 'var(--fs-label-md)',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{t.icon}</span>
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Expense Sub-type: Operational vs Raw Material */}
                                {isExpense && (
                                    <div className="form-group">
                                        <label className="form-label">Tipe Pengeluaran</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            {[{ val: 'operational', label: 'Operational', icon: 'settings', desc: 'Bensin, gaji, dll.' },
                                            { val: 'raw_material', label: 'Raw Material', icon: 'egg', desc: 'Beli produk/stok' }].map(st => (
                                                <button
                                                    key={st.val}
                                                    onClick={() => setForm(f => ({ ...f, expenseSubType: st.val, rawMaterialProductId: '', rawMaterialQty: 1, amount: 0 }))}
                                                    style={{
                                                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                                                        padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                                        border: `2px solid ${form.expenseSubType === st.val ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
                                                        background: form.expenseSubType === st.val ? 'rgba(255,193,7,0.1)' : 'var(--color-surface)',
                                                        transition: 'all 0.15s', textAlign: 'left',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 'var(--fs-label-md)', color: form.expenseSubType === st.val ? 'var(--color-primary)' : 'var(--color-on-surface)' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{st.icon}</span>
                                                        {st.label}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: 'var(--color-on-surface-variant)', marginTop: 2 }}>{st.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* RAW MATERIAL: Product Picker */}
                                {isRawMaterial ? (
                                    <>
                                        <div className="form-group">
                                            <label className="form-label">Pilih Produk *</label>
                                            <select
                                                className="form-input form-select"
                                                value={form.rawMaterialProductId}
                                                onChange={e => {
                                                    const prod = products.find(p => p.id === e.target.value);
                                                    setForm(f => ({
                                                        ...f,
                                                        rawMaterialProductId: e.target.value,
                                                        amount: prod ? Number(form.rawMaterialQty || 1) * (prod.buyPrice || 0) : 0,
                                                    }));
                                                }}
                                            >
                                                <option value="">-- Pilih produk --</option>
                                                {products.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name} ({p.category}) — stok: {p.stock || 0} pcs
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {selectedProduct && (
                                            <div style={{ background: 'var(--color-surface-container-low)', border: '1px solid var(--color-outline-variant)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{selectedProduct.name}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--color-on-surface-variant)' }}>Harga beli: Rp {(selectedProduct.buyPrice || 0).toLocaleString('id-ID')} / pcs</div>
                                                    <div style={{ fontSize: 11, color: 'var(--color-on-surface-variant)' }}>Stok sekarang: {selectedProduct.stock || 0} pcs</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 11, color: 'var(--color-on-surface-variant)' }}>Setelah pembelian</div>
                                                    <div className="text-mono text-success" style={{ fontWeight: 700, fontSize: 18 }}>
                                                        {(selectedProduct.stock || 0) + Number(form.rawMaterialQty || 0)} pcs
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                                            <div className="form-group">
                                                <label className="form-label">Jumlah Beli (pcs)</label>
                                                <input
                                                    className="form-input"
                                                    type="number" min={1}
                                                    value={form.rawMaterialQty}
                                                    onChange={e => {
                                                        const qty = Number(e.target.value);
                                                        setForm(f => ({
                                                            ...f,
                                                            rawMaterialQty: e.target.value,
                                                            amount: selectedProduct ? qty * (selectedProduct.buyPrice || 0) : f.amount,
                                                        }));
                                                    }}
                                                    style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Total Bayar (Rp)</label>
                                                <input
                                                    className="form-input"
                                                    type="number" min={0}
                                                    value={form.amount}
                                                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                                    placeholder="Auto dari harga beli"
                                                />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    /* OPERATIONAL / INCOME: normal fields */
                                    <>
                                        <div className="form-group">
                                            <label className="form-label">Deskripsi *</label>
                                            <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={isExpense ? 'Beli bensin, bayar gaji...' : 'Penjualan ke pelanggan...'} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Kategori</label>
                                            <input
                                                className="form-input"
                                                list="kategori-list"
                                                value={form.category}
                                                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                                placeholder="Bensin, Gaji, Sales Revenue..."
                                            />
                                            <datalist id="kategori-list">
                                                {[...new Set(transactions.map(t => t.category).filter(Boolean))].map(c => (
                                                    <option key={c} value={c} />
                                                ))}
                                            </datalist>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Jumlah (Rp) *</label>
                                            <input className="form-input" type="number" min={0} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                                        </div>
                                    </>
                                )}

                                {/* Common fields: Status & Account */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select className="form-input form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                                            <option value="Completed">Completed</option>
                                            <option value="Pending">Pending</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Akun</label>
                                        <select className="form-input form-select" value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))}>
                                            {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setModal(false)}>Batal</button>
                                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Menyimpan...' : isRawMaterial ? '✓ Beli & Update Stok' : 'Simpan Transaksi'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Detail Penjualan Modal */}
            {selectedSale && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedSale(null)}>
                    <div className="modal" style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <span className="modal-title">Detail Invoice #${selectedSale.id.slice(0, 8)}</span>
                            <button className="btn btn-icon" onClick={() => setSelectedSale(null)}><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="modal-body" style={{ padding: 'var(--space-lg)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px dashed var(--color-outline-variant)', paddingBottom: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span className="text-muted">Pelanggan</span>
                                    <span style={{ fontWeight: 600 }}>{selectedSale.customer || 'Walk-in Customer'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span className="text-muted">Tanggal</span>
                                    <span className="text-mono" style={{ fontSize: 12 }}>{selectedSale.date?.toDate?.() ? selectedSale.date.toDate().toLocaleString('id-ID') : '—'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span className="text-muted">Metode Pembayaran</span>
                                    <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>{selectedSale.paymentMethod}</span>
                                </div>
                            </div>

                            <table style={{ width: '100%', marginBottom: 'var(--space-lg)' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-outline-variant)' }}>
                                        <th style={{ padding: '8px 0', fontSize: 12 }} className="text-muted">Item</th>
                                        <th style={{ padding: '8px 0', fontSize: 12, textAlign: 'center' }} className="text-muted">Qty</th>
                                        <th style={{ padding: '8px 0', fontSize: 12, textAlign: 'right' }} className="text-muted">Harga</th>
                                        <th style={{ padding: '8px 0', fontSize: 12, textAlign: 'right' }} className="text-muted">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedSale.items?.map((item, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--color-surface-container-highest)' }}>
                                            <td style={{ padding: '8px 0', fontWeight: 500 }}>{item.name}</td>
                                            <td style={{ padding: '8px 0', textAlign: 'center' }} className="text-mono">{item.qty}</td>
                                            <td style={{ padding: '8px 0', textAlign: 'right' }} className="text-mono">{fmtRp(item.price)}</td>
                                            <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }} className="text-mono">{fmtRp(item.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--color-surface-container-low)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                    <span>Subtotal</span>
                                    <span className="text-mono">{fmtRp(selectedSale.subtotal)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontfontSize: 13 }}>
                                    <span>Pajak (0%)</span>
                                    <span className="text-mono">Rp 0</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-outline-variant)', paddingTop: 8, marginTop: 4, fontWeight: 700, fontSize: 15 }}>
                                    <span>Total Belanja</span>
                                    <span className="text-mono text-success">{fmtRp(selectedSale.total)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                            <button className="btn btn-secondary" onClick={() => setSelectedSale(null)}>Tutup</button>
                            <button className="btn btn-primary" onClick={() => handlePrintReceipt(selectedSale)}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 6 }}>print</span>
                                Cetak Struk
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Initial Balances Modal */}
            {initBalanceModal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setInitBalanceModal(false)}>
                    <div className="modal" style={{ maxWidth: 380 }}>
                        <div className="modal-header">
                            <span className="modal-title">Atur Saldo Awal Akun</span>
                            <button className="btn btn-icon" onClick={() => setInitBalanceModal(false)}><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--color-on-surface-variant)', marginBottom: 'var(--space-md)' }}>
                                Masukkan nominal saldo awal masing-masing akun untuk memastikan nominal kas pada monitor sinkron dengan uang riil Anda.
                            </p>
                            {ACCOUNTS.map(name => (
                                <div key={name} className="form-group">
                                    <label className="form-label">{name}</label>
                                    <input
                                        className="form-input text-mono"
                                        type="number"
                                        value={tempBalances[name] || 0}
                                        onChange={e => setTempBalances(p => ({ ...p, [name]: Number(e.target.value || 0) }))}
                                        placeholder="0"
                                        style={{ fontWeight: 600 }}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setInitBalanceModal(false)}>Batal</button>
                            <button className="btn btn-primary" onClick={async () => {
                                try {
                                    await setDoc(doc(db, 'settings', 'initial_balances'), tempBalances);
                                    showToast('Saldo awal berhasil diperbarui!');
                                    setInitBalanceModal(false);
                                } catch (e) {
                                    showToast('Gagal memperbarui saldo awal', 'error');
                                }
                            }}>
                                Simpan
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        @media (max-width: 900px) { .resp-fin-grid { grid-template-columns: 1fr !important; } }
      `}</style>
        </main>
    );
}
