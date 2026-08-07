import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from '../components/Toast';

const CATEGORIES = ['Semua', 'Premium', 'Free Range', 'Specialty', 'Standard', 'Bulk'];
const PAYMENT_METHODS = [
    { id: 'cash', icon: 'payments', label: 'Cash' },
    { id: 'qris', icon: 'qr_code_scanner', label: 'QRIS' },
    { id: 'transfer', icon: 'account_balance', label: 'Transfer' },
];

export default function Sales() {
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [catFilter, setCatFilter] = useState('Semua');
    const [customer, setCustomer] = useState('Walk-in Customer');
    const [payMethod, setPayMethod] = useState('cash');
    const [processing, setProcessing] = useState(false);
    const [successModal, setSuccessModal] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'products'), snap => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, []);

    const filtered = catFilter === 'Semua' ? products : products.filter(p => p.category === catFilter);

    const addToCart = (product) => {
        if ((product.stock || 0) <= 0) { showToast('Stok habis!', 'error'); return; }
        setCart(prev => {
            const existing = prev.find(i => i.id === product.id);
            if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
            return [...prev, { ...product, qty: 1 }];
        });
    };

    const updateQty = (id, delta) => {
        setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0));
    };

    const removeItem = (id) => setCart(prev => prev.filter(i => i.id !== id));

    const subtotal = cart.reduce((sum, i) => sum + (i.sellPrice || 0) * i.qty, 0);
    const tax = 0;
    const total = subtotal;

    const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

    const processTransaction = async () => {
        if (cart.length === 0) { showToast('Keranjang kosong!', 'error'); return; }
        setProcessing(true);
        try {
            await addDoc(collection(db, 'sales'), {
                items: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.sellPrice, buyPrice: i.buyPrice || 0, total: i.qty * i.sellPrice })),
                subtotal, tax, total,
                paymentMethod: payMethod,
                customer,
                date: serverTimestamp(),
            });
            // Update product stock
            await Promise.all(cart.map(i =>
                updateDoc(doc(db, 'products', i.id), { stock: increment(-i.qty) })
            ));
            // Add to finance transactions
            await addDoc(collection(db, 'transactions'), {
                type: 'income',
                amount: total,
                category: 'Sales Revenue',
                description: `Penjualan ke ${customer} (${cart.length} item)`,
                account: payMethod,
                date: serverTimestamp(),
                status: 'Completed',
            });
            setCart([]);
            setSuccessModal(true);
        } catch (e) {
            showToast('Transaksi gagal. Coba lagi.', 'error');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="sales-container">
            {/* Left: Product Selection */}
            <div className="sales-left">
                {/* Category Tabs */}
                <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setCatFilter(cat)}
                                style={{
                                    padding: '4px 14px', borderRadius: 99, fontSize: 'var(--fs-label-md)', fontWeight: 600, letterSpacing: 'var(--ls-label-md)',
                                    background: catFilter === cat ? 'var(--color-primary)' : 'var(--color-surface-container)',
                                    color: catFilter === cat ? 'var(--color-on-primary)' : 'var(--color-on-surface-variant)',
                                    border: catFilter === cat ? 'none' : '1px solid var(--color-outline-variant)',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}
                            >{cat}</button>
                        ))}
                    </div>
                </div>

                {/* Product Grid */}
                <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-lg)' }}>
                    {filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-on-surface-variant)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 48 }}>inventory_2</span>
                            <p>Belum ada produk di kategori ini.</p>
                        </div>
                    ) : (
                        <div className="sales-product-grid">
                            {filtered.map(p => {
                                const outOfStock = (p.stock || 0) <= 0;
                                const inCart = cart.find(i => i.id === p.id);
                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => !outOfStock && addToCart(p)}
                                        style={{
                                            background: 'var(--color-surface-container-lowest)',
                                            border: `1px solid ${inCart ? 'var(--color-primary-container)' : 'var(--color-outline-variant)'}`,
                                            borderRadius: 'var(--radius-lg)',
                                            padding: 'var(--space-md)',
                                            cursor: outOfStock ? 'not-allowed' : 'pointer',
                                            opacity: outOfStock ? 0.5 : 1,
                                            transition: 'all 0.15s',
                                            boxShadow: inCart ? '0 0 0 2px var(--color-primary-container)' : 'none',
                                        }}
                                    >
                                        <div style={{ width: '100%', aspectRatio: '1', background: 'var(--color-surface-container)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-sm)', position: 'relative' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--color-primary-fixed-dim)' }}>egg</span>
                                            <div style={{ position: 'absolute', top: 6, right: 6, background: outOfStock ? 'var(--color-error-container)' : 'rgba(255,255,255,0.9)', color: outOfStock ? 'var(--color-on-error-container)' : 'var(--color-primary)', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4 }}>
                                                {outOfStock ? 'Habis' : `${(p.stock || 0).toLocaleString('id-ID')} stok`}
                                            </div>
                                        </div>
                                        <div style={{ fontWeight: 600, fontSize: 'var(--fs-body-sm)', marginBottom: 2 }} title={p.name}>{p.name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--color-on-surface-variant)', marginBottom: 4 }}>{p.category}</div>
                                        <div className="text-mono" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{fmtRp(p.sellPrice)}</div>
                                        {inCart && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-tertiary)', fontWeight: 600 }}>✓ {inCart.qty} di keranjang</div>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Cart */}
            <div className="sales-cart">
                {/* Customer */}
                <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span className="material-symbols-outlined text-muted" style={{ fontSize: 16 }}>person</span>
                        <span className="form-label">Pelanggan</span>
                    </div>
                    <input
                        type="text"
                        className="form-input w-full"
                        value={customer}
                        onChange={e => setCustomer(e.target.value)}
                        placeholder="Nama pelanggan..."
                    />
                </div>

                {/* Cart Items */}
                <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {cart.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-on-surface-variant)', gap: 8 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.4 }}>shopping_cart</span>
                            <p style={{ fontSize: 'var(--fs-body-sm)' }}>Klik produk untuk menambahkan ke keranjang</p>
                        </div>
                    ) : cart.map(item => (
                        <div key={item.id} style={{ background: 'var(--color-surface-container-lowest)', border: '1px solid var(--color-outline-variant)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-sm) var(--space-md)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 'var(--fs-body-md)' }}>{item.name}</div>
                                    <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--color-on-surface-variant)' }}>{fmtRp(item.sellPrice)} / pcs</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div className="text-mono" style={{ fontWeight: 700 }}>{fmtRp(item.qty * item.sellPrice)}</div>
                                    <button onClick={() => removeItem(item.id)} style={{ color: 'var(--color-error)', fontSize: 12, cursor: 'pointer', marginTop: 2 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-outline-variant)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                                    <button onClick={() => updateQty(item.id, -1)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>remove</span>
                                    </button>
                                    <span className="text-mono" style={{ width: 32, textAlign: 'center', fontSize: 'var(--fs-body-sm)' }}>{item.qty}</span>
                                    <button onClick={() => updateQty(item.id, 1)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Totals and Payment */}
                <div className="sales-cart-footer">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--space-md)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-body-sm)', color: 'var(--color-on-surface-variant)' }}>
                            <span>Subtotal</span><span className="text-mono">{fmtRp(subtotal)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-outline-variant)', paddingTop: 8, marginTop: 4 }}>
                            <span style={{ fontSize: 'var(--fs-headline-sm)', fontWeight: 600 }}>Total</span>
                            <span className="text-mono" style={{ fontSize: 'var(--fs-display-lg)', fontWeight: 700, color: 'var(--color-primary)' }}>{fmtRp(total)}</span>
                        </div>
                    </div>
                    <div className="payment-methods" style={{ marginBottom: 'var(--space-md)' }}>
                        {PAYMENT_METHODS.map(m => (
                            <button
                                key={m.id}
                                className={`payment-method-btn${payMethod === m.id ? ' active' : ''}`}
                                onClick={() => setPayMethod(m.id)}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{m.icon}</span>
                                <span>{m.label}</span>
                            </button>
                        ))}
                    </div>
                    <button
                        style={{ width: '100%', background: 'var(--color-primary)', color: 'var(--color-on-primary)', fontSize: 'var(--fs-headline-sm)', fontWeight: 600, padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', cursor: processing || cart.length === 0 ? 'not-allowed' : 'pointer', opacity: processing || cart.length === 0 ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'opacity 0.2s' }}
                        onClick={processTransaction}
                        disabled={processing || cart.length === 0}
                    >
                        <span className="material-symbols-outlined">point_of_sale</span>
                        {processing ? 'Memproses...' : 'Proses Transaksi'}
                    </button>
                </div>
            </div>

            {/* Success Modal */}
            {successModal && (
                <div className="modal-overlay">
                    <div className="modal" style={{ textAlign: 'center', maxWidth: 360 }}>
                        <div style={{ padding: 'var(--space-xl)' }}>
                            <span className="material-symbols-outlined text-success" style={{ fontSize: 64 }}>check_circle</span>
                            <h2 style={{ fontSize: 'var(--fs-headline-md)', fontWeight: 600, margin: '16px 0 8px' }}>Transaksi Berhasil!</h2>
                            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--fs-body-md)' }}>
                                Pembayaran {fmtRp(total)} via {payMethod.toUpperCase()} telah diproses.
                            </p>
                            <button className="btn btn-primary" style={{ marginTop: 'var(--space-lg)', width: '100%' }} onClick={() => setSuccessModal(false)}>
                                Transaksi Baru
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
