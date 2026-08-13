import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from '../components/Toast';
import QRISModal from '../components/QRISModal';

const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const getTomorrowDateString = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const isSameDay = (d1, d2) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

export default function Orders() {
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('Pending'); // 'Pending' | 'Delivered' | 'Cancelled'

    // Add Order Modal state
    const [modal, setModal] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [deliveryDate, setDeliveryDate] = useState(getTomorrowDateString());
    const [orderCart, setOrderCart] = useState([]);

    // Fulfill / Konfirmasi Modal state
    const [fulfillModal, setFulfillModal] = useState(null); // order object or null
    const [fulfillPayMethod, setFulfillPayMethod] = useState('cash');
    const [fulfilling, setFulfilling] = useState(false);
    const [qrisModal, setQrisModal] = useState(false);

    // Add item form state in Modal
    const [selectedProductId, setSelectedProductId] = useState('');
    const [selectedQty, setSelectedQty] = useState(1);

    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        const unsubOrders = onSnapshot(collection(db, 'orders'), snap => {
            setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        const unsubProducts = onSnapshot(collection(db, 'products'), snap => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => { unsubOrders(); unsubProducts(); };
    }, []);

    // Filtered orders
    const filteredOrders = useMemo(() => {
        return orders
            .filter(o => o.status === activeTab)
            .sort((a, b) => new Date(a.deliveryDate) - new Date(b.deliveryDate));
    }, [orders, activeTab]);

    // Tomorrow Prep Summary calculation
    const tomorrowPrepSummary = useMemo(() => {
        const tomorrowStr = getTomorrowDateString();
        const tomorrowActiveOrders = orders.filter(o => o.status === 'Pending' && o.deliveryDate === tomorrowStr);

        const summary = {};
        tomorrowActiveOrders.forEach(o => {
            o.items?.forEach(item => {
                const name = item.name;
                summary[name] = (summary[name] || 0) + (item.qty || 0);
            });
        });
        return Object.entries(summary).map(([name, qty]) => ({ name, qty }));
    }, [orders]);

    const handleAddCartItem = () => {
        if (!selectedProductId) { showToast('Pilih produk terlebih dahulu!', 'error'); return; }
        const prod = products.find(p => p.id === selectedProductId);
        if (!prod) return;

        setOrderCart(prev => {
            const existing = prev.find(i => i.id === prod.id);
            if (existing) {
                return prev.map(i => i.id === prod.id ? { ...i, qty: i.qty + Number(selectedQty) } : i);
            }
            return [...prev, {
                id: prod.id,
                name: prod.name,
                qty: Number(selectedQty),
                price: prod.sellPrice || 0,
                buyPrice: prod.buyPrice || 0,
                total: Number(selectedQty) * (prod.sellPrice || 0)
            }];
        });
        setSelectedProductId('');
        setSelectedQty(1);
    };

    const handleRemoveCartItem = (id) => {
        setOrderCart(prev => prev.filter(i => i.id !== id));
    };

    const cartTotal = useMemo(() => {
        return orderCart.reduce((sum, item) => sum + item.total, 0);
    }, [orderCart]);

    const handleSaveOrder = async () => {
        if (!customerName.trim()) { showToast('Masukkan nama pelanggan!', 'error'); return; }
        if (orderCart.length === 0) { showToast('Tambahkan item pesanan terlebih dahulu!', 'error'); return; }
        if (!deliveryDate) { showToast('Pilih tanggal pengiriman!', 'error'); return; }

        setSaving(true);
        try {
            await addDoc(collection(db, 'orders'), {
                customerName: customerName.trim(),
                deliveryDate,
                items: orderCart,
                totalAmount: cartTotal,
                // paymentMethod sengaja kosong — baru diisi saat konfirmasi pengiriman
                status: 'Pending',
                createdAt: serverTimestamp()
            });

            showToast('Pesanan berhasil dicatat!');
            setModal(false);
            setCustomerName('');
            setDeliveryDate(getTomorrowDateString());
            setOrderCart([]);
        } catch (e) {
            showToast('Gagal menyimpan pesanan.', 'error');
        }
        setSaving(false);
    };

    // Buka dialog konfirmasi pengiriman
    const openFulfillModal = (order) => {
        setFulfillModal(order);
        setFulfillPayMethod('cash');
    };

    const closeFulfillModal = () => {
        setFulfillModal(null);
        setFulfillPayMethod('cash');
        setQrisModal(false);
    };

    // Saat klik "Konfirmasi & Lunas" — cek apakah QRIS
    const handleFulfillClick = () => {
        if (fulfillPayMethod === 'qris') {
            setQrisModal(true);
            return;
        }
        handleConfirmFulfill();
    };

    const handleConfirmFulfill = async () => {
        const order = fulfillModal;
        if (!order) return;

        // Cek stok dulu
        let stockSufficient = true;
        const insufficientProduct = [];
        order.items.forEach(item => {
            const prod = products.find(p => p.id === item.id);
            if (!prod || (prod.stock || 0) < item.qty) {
                stockSufficient = false;
                insufficientProduct.push(item.name);
            }
        });

        if (!stockSufficient) {
            showToast(`Stok tidak cukup untuk: ${insufficientProduct.join(', ')}`, 'error');
            return;
        }

        setFulfilling(true);
        try {
            // 1. Process POS Sale
            const saleRef = await addDoc(collection(db, 'sales'), {
                items: order.items,
                subtotal: order.totalAmount,
                tax: 0,
                total: order.totalAmount,
                paymentMethod: fulfillPayMethod,
                customer: order.customerName,
                date: serverTimestamp()
            });

            // 2. Deduct product stocks
            await Promise.all(order.items.map(item =>
                updateDoc(doc(db, 'products', item.id), {
                    stock: increment(-item.qty)
                })
            ));

            // 3. Record Finance transaction
            await addDoc(collection(db, 'transactions'), {
                type: 'income',
                amount: order.totalAmount,
                category: 'Sales Revenue',
                description: `Pemesanan Lunas ke ${order.customerName}`,
                account: fulfillPayMethod === 'qris' || fulfillPayMethod === 'transfer' ? 'Bank Transfer (Jago)' : 'Petty Cash',
                date: serverTimestamp(),
                status: 'Completed',
                saleId: saleRef.id,
            });

            // 4. Update order status + simpan metode bayar yang dipilih
            await updateDoc(doc(db, 'orders', order.id), {
                status: 'Delivered',
                paymentMethod: fulfillPayMethod,
                deliveredAt: serverTimestamp()
            });

            showToast(`Pesanan ${order.customerName} berhasil diselesaikan & lunas!`);
            closeFulfillModal();
        } catch (e) {
            showToast('Gagal memproses penyelesaian pesanan.', 'error');
        }
        setFulfilling(false);
    };

    const handleCancelOrder = async (orderId) => {
        if (window.confirm('Apakah Anda yakin ingin membatalkan pesanan ini?')) {
            try {
                await updateDoc(doc(db, 'orders', orderId), {
                    status: 'Cancelled'
                });
                showToast('Pesanan dibatalkan.');
            } catch (e) {
                showToast('Gagal membatalkan pesanan.', 'error');
            }
        }
    };

    const getDeliveryBadge = (dateStr) => {
        if (!dateStr) return null;
        const today = new Date();
        const dateObj = new Date(dateStr);

        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        if (isSameDay(dateObj, today)) {
            return <span className="badge badge-error" style={{ marginLeft: 8 }}>Hari Ini</span>;
        } else if (isSameDay(dateObj, tomorrow)) {
            return <span className="badge badge-warning" style={{ marginLeft: 8 }}>Besok</span>;
        }
        return null;
    };

    const payMethodLabel = (method) => {
        if (!method) return '—';
        const map = { cash: 'Cash', qris: 'QRIS', transfer: 'Transfer' };
        return map[method] || method;
    };

    return (
        <main className="page-canvas">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Pemesanan</h1>
                    <p className="page-subtitle">Kelola pesanan telur / booking pelanggan untuk diantar esok hari.</p>
                </div>
                <div className="page-header-actions">
                    <button className="btn btn-primary" onClick={() => setModal(true)}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                        Catat Pesanan Baru
                    </button>
                </div>
            </div>

            {/* Prep Summary Banner for Tomorrow */}
            {tomorrowPrepSummary.length > 0 && (
                <div className="card mb-xl" style={{ border: '1px solid var(--color-outline-variant)', background: 'var(--color-primary-container)15' }}>
                    <div style={{ padding: 'var(--space-md) var(--space-lg)', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px dashed var(--color-outline-variant)' }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--color-on-primary-container)', fontSize: 24 }}>inventory</span>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-on-primary-container)' }}>
                            Rangkuman Kebutuhan Telur Besok
                        </div>
                    </div>
                    <div style={{ padding: 'var(--space-md) var(--space-lg)', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                        {tomorrowPrepSummary.map(item => (
                            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface-container-lowest)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-outline-variant)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-primary)' }}>egg</span>
                                <span style={{ fontWeight: 600, fontSize: 13 }}>{item.name}:</span>
                                <span className="text-mono" style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 14 }}>{item.qty} pcs</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 'var(--space-md)' }}>
                {[['Pending', 'Aktif (Tertunda)'], ['Delivered', 'Selesai (Diantar)'], ['Cancelled', 'Batal']].map(([status, label]) => (
                    <button
                        key={status}
                        onClick={() => setActiveTab(status)}
                        className={`btn ${activeTab === status ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '6px 14px', fontSize: 13, borderRadius: 'var(--radius-md)' }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Orders Table/List */}
            <div className="card">
                <div className="overflow-x-auto">
                    <table className="data-table" style={{ minWidth: 700 }}>
                        <thead>
                            <tr>
                                <th>Pelanggan</th>
                                <th>Tanggal Pengantaran</th>
                                <th>Daftar Pembelian</th>
                                <th style={{ textAlign: 'right' }}>Total</th>
                                <th style={{ textAlign: 'center' }}>Metode Bayar</th>
                                {activeTab === 'Pending' && <th style={{ textAlign: 'center' }}>Aksi</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={activeTab === 'Pending' ? 6 : 5} style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                                        Loading pesanan...
                                    </td>
                                </tr>
                            ) : filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={activeTab === 'Pending' ? 6 : 5} style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-on-surface-variant)' }}>
                                        Tidak ada data pesanan.
                                    </td>
                                </tr>
                            ) : (
                                filteredOrders.map(order => {
                                    const itemsText = order.items?.map(i => `${i.name} (${i.qty} pcs)`).join(', ');
                                    return (
                                        <tr key={order.id}>
                                            <td style={{ fontWeight: 600 }}>{order.customerName}</td>
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {formatDate(order.deliveryDate)}
                                                {activeTab === 'Pending' && getDeliveryBadge(order.deliveryDate)}
                                            </td>
                                            <td className="text-muted" style={{ fontSize: 13, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={itemsText}>
                                                {itemsText}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700 }} className="text-mono">
                                                {fmtRp(order.totalAmount)}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {order.paymentMethod ? (
                                                    <span className="badge badge-neutral" style={{ textTransform: 'uppercase' }}>
                                                        {payMethodLabel(order.paymentMethod)}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted" style={{ fontSize: 12 }}>Belum ditentukan</span>
                                                )}
                                            </td>
                                            {activeTab === 'Pending' && (
                                                <td style={{ textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-tertiary-container)30', color: 'var(--color-tertiary)', border: 'none' }}
                                                            onClick={() => openFulfillModal(order)}
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>local_shipping</span>
                                                            Kirim & Lunas
                                                        </button>
                                                        <button
                                                            className="btn btn-icon"
                                                            style={{ color: 'var(--color-error)' }}
                                                            onClick={() => handleCancelOrder(order.id)}
                                                            title="Batalkan Pesanan"
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cancel</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ===== Add Order Modal ===== */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                    <div className="modal" style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <span className="modal-title">Catat Pesanan Baru</span>
                            <button className="btn btn-icon" onClick={() => setModal(false)}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div className="form-group">
                                <label className="form-label">Nama Pelanggan</label>
                                <input
                                    className="form-input w-full"
                                    value={customerName}
                                    onChange={e => setCustomerName(e.target.value)}
                                    placeholder="Masukkan nama pelanggan..."
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Tanggal Pengantaran *</label>
                                <input
                                    type="date"
                                    className="form-input w-full"
                                    value={deliveryDate}
                                    onChange={e => setDeliveryDate(e.target.value)}
                                />
                            </div>

                            {/* Metode bayar sengaja TIDAK ada di sini — pilih saat konfirmasi pengiriman */}

                            {/* Item Builder */}
                            <div style={{ background: 'var(--color-surface-container-low)', padding: 'var(--space-md)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-outline-variant)' }}>
                                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Pilih Telur & Jumlah</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Jenis Telur</label>
                                        <select
                                            className="form-input form-select w-full"
                                            value={selectedProductId}
                                            onChange={e => setSelectedProductId(e.target.value)}
                                        >
                                            <option value="">-- Pilih telur --</option>
                                            {products.map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.name} ({fmtRp(p.sellPrice)})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Jumlah (pcs)</label>
                                            <input
                                                type="number"
                                                className="form-input w-full"
                                                min={1}
                                                value={selectedQty}
                                                onChange={e => setSelectedQty(e.target.value)}
                                            />
                                        </div>
                                        <button className="btn btn-primary" onClick={handleAddCartItem} style={{ height: 38, padding: '0 16px' }}>
                                            Tambah Item
                                        </button>
                                    </div>
                                </div>

                                {/* Current Items in Order Cart */}
                                {orderCart.length > 0 && (
                                    <div style={{ marginTop: 'var(--space-md)', borderTop: '1px solid var(--color-outline-variant)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {orderCart.map(item => (
                                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                                                <div>
                                                    <span style={{ fontWeight: 600 }}>{item.name}</span>
                                                    <span className="text-muted" style={{ marginLeft: 6 }}>({item.qty} pcs)</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span className="text-mono" style={{ fontWeight: 600 }}>{fmtRp(item.total)}</span>
                                                    <button onClick={() => handleRemoveCartItem(item.id)} style={{ color: 'var(--color-error)', border: 'none', background: 'none', cursor: 'pointer' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--color-outline-variant)', paddingTop: 8, marginTop: 4, fontWeight: 700, fontSize: 13 }}>
                                            <span>Subtotal Pesanan:</span>
                                            <span className="text-mono text-success">{fmtRp(cartTotal)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setModal(false)}>Batal</button>
                            <button className="btn btn-primary" onClick={handleSaveOrder} disabled={saving}>
                                {saving ? 'Menyimpan...' : 'Simpan Pesanan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Konfirmasi Pengiriman & Pelunasan Modal ===== */}
            {fulfillModal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeFulfillModal()}>
                    <div className="modal" style={{ maxWidth: 420 }}>
                        <div className="modal-header">
                            <span className="modal-title">Konfirmasi Pengiriman</span>
                            <button className="btn btn-icon" onClick={closeFulfillModal}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Ringkasan pesanan */}
                            <div style={{ background: 'var(--color-surface-container-low)', padding: 'var(--space-md)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-outline-variant)' }}>
                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{fulfillModal.customerName}</div>
                                <div style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {fulfillModal.items?.map(item => (
                                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{item.name} × {item.qty} pcs</span>
                                            <span className="text-mono" style={{ fontWeight: 600 }}>{fmtRp(item.total)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ borderTop: '1px dashed var(--color-outline-variant)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                                    <span>Total Tagihan</span>
                                    <span className="text-mono text-success">{fmtRp(fulfillModal.totalAmount)}</span>
                                </div>
                            </div>

                            {/* Pilih metode bayar baru di sini */}
                            <div className="form-group">
                                <label className="form-label">
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}>payments</span>
                                    Metode Pembayaran
                                </label>
                                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                    {[['cash', 'Cash', 'payments'], ['qris', 'QRIS', 'qr_code_2'], ['transfer', 'Transfer', 'account_balance']].map(([val, label, icon]) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => setFulfillPayMethod(val)}
                                            style={{
                                                flex: 1,
                                                padding: '10px 6px',
                                                borderRadius: 'var(--radius-md)',
                                                border: `2px solid ${fulfillPayMethod === val ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
                                                background: fulfillPayMethod === val ? 'var(--color-primary-container)' : 'transparent',
                                                color: fulfillPayMethod === val ? 'var(--color-on-primary-container)' : 'var(--color-on-surface-variant)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: 4,
                                                fontSize: 12,
                                                fontWeight: fulfillPayMethod === val ? 700 : 400,
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{icon}</span>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', padding: '8px 12px', background: 'var(--color-surface-container-low)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-outline-variant)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>info</span>
                                Aksi ini akan mengurangi stok, mencatat penjualan, dan mencatat pemasukan keuangan secara otomatis.
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closeFulfillModal} disabled={fulfilling}>Batal</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleFulfillClick}
                                disabled={fulfilling}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{fulfillPayMethod === 'qris' ? 'qr_code_2' : 'local_shipping'}</span>
                                {fulfilling ? 'Memproses...' : (fulfillPayMethod === 'qris' ? 'Tampilkan QR & Lunas' : 'Konfirmasi & Lunas')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QRIS Modal — muncul saat metode bayar QRIS dipilih di fulfill */}
            {qrisModal && fulfillModal && (
                <QRISModal
                    amount={fulfillModal.totalAmount}
                    onConfirm={handleConfirmFulfill}
                    onCancel={() => setQrisModal(false)}
                    confirmLabel="Konfirmasi Sudah Bayar & Selesaikan Pesanan"
                />
            )}
        </main>
    );
}
