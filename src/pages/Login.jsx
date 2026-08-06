import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError('Email atau password salah. Silakan coba lagi.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <div className="login-logo-icon-wrap" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 64,
                        height: 64,
                        background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                        borderRadius: '20px',
                        boxShadow: '0 4px 12px rgba(217, 119, 6, 0.4)',
                        marginBottom: 12
                    }}>
                        <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.25))' }}>
                            <path d="M12 2C7.5 2 4 7 4 12s3.5 10 8 10 8-5 8-10S16.5 2 12 2z" fill="rgba(255,255,255,0.15)" />
                            <path d="M12 6a3 3 0 0 0-3 3" strokeWidth="1.5" strokeOpacity="0.8" strokeLinecap="round" />
                        </svg>
                    </div>
                    <div className="login-logo-title">KareeemEgg</div>
                    <div className="login-logo-sub">Farm-to-Finance Management System</div>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                            className="form-input"
                            type="email"
                            placeholder="admin@kareeemegg.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            className="form-input"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    {error && <div className="login-error">{error}</div>}
                    <button className="login-btn" type="submit" disabled={loading}>
                        {loading ? 'Masuk...' : 'Masuk ke Dashboard'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: 'var(--space-lg)', fontSize: 'var(--fs-body-sm)', color: 'var(--color-on-surface-variant)' }}>
                    Hubungi administrator untuk mendaftarkan akun baru.
                </p>
            </div>
        </div>
    );
}
