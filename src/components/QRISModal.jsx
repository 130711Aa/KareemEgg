import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { convertQRIS } from '../qris/converter';
import { STATIC_QRIS } from '../qris/config';

const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

/**
 * Modal QRIS — generate dynamic QRIS dari QRIS statis penjual,
 * render QR code untuk ditunjukkan ke pembeli.
 *
 * Props:
 *   amount      : number  — nominal yang harus dibayar
 *   onConfirm   : fn      — dipanggil saat penjual tekan "Konfirmasi Sudah Bayar"
 *   onCancel    : fn      — dipanggil saat modal ditutup / batal
 *   confirmLabel: string  — opsional, override label tombol konfirmasi
 */
export default function QRISModal({ amount, onConfirm, onCancel, confirmLabel }) {
    const dynamicQris = useMemo(() => {
        try {
            return convertQRIS(STATIC_QRIS, { amount });
        } catch (e) {
            console.error('Gagal generate dynamic QRIS:', e);
            return null;
        }
    }, [amount]);

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
            <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }}>
                <div className="modal-header">
                    <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-primary)' }}>qr_code_2</span>
                        Pembayaran QRIS
                    </span>
                    <button className="btn btn-icon" onClick={onCancel}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 8 }}>
                    {/* Nominal */}
                    <div style={{
                        background: 'var(--color-primary-container)',
                        color: 'var(--color-on-primary-container)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '10px 24px',
                        width: '100%',
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>Total yang harus dibayar</div>
                        <div className="text-mono" style={{ fontSize: 26, fontWeight: 700 }}>{fmtRp(amount)}</div>
                    </div>

                    {/* QR Code */}
                    {dynamicQris ? (
                        <div style={{
                            padding: 16,
                            background: '#fff',
                            borderRadius: 'var(--radius-lg)',
                            border: '2px solid var(--color-outline-variant)',
                            display: 'inline-block',
                        }}>
                            <QRCodeSVG
                                value={dynamicQris}
                                size={240}
                                level="M"
                                includeMargin={false}
                            />
                        </div>
                    ) : (
                        <div style={{ padding: 32, color: 'var(--color-error)', fontSize: 13 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>error</span>
                            Gagal generate QR code. Periksa QRIS statis di config.
                        </div>
                    )}

                    {/* Label merchant */}
                    <div style={{ fontSize: 12, color: 'var(--color-on-surface-variant)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>store</span>
                        Scan QRIS di atas menggunakan aplikasi e-wallet / m-banking
                    </div>
                </div>

                <div className="modal-footer" style={{ flexDirection: 'column', gap: 8 }}>
                    <button
                        className="btn btn-primary"
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        onClick={onConfirm}
                        disabled={!dynamicQris}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                        {confirmLabel || 'Konfirmasi Sudah Bayar'}
                    </button>
                    <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onCancel}>
                        Batal
                    </button>
                </div>
            </div>
        </div>
    );
}
