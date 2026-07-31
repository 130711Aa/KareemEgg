import { useState, useEffect } from 'react';

let toastId = 0;
let addToastExternal = null;

export function useToast() {
    const showToast = (message, type = 'success') => {
        if (addToastExternal) addToastExternal({ id: toastId++, message, type });
    };
    return { showToast };
}

export default function Toast() {
    const [toasts, setToasts] = useState([]);

    useEffect(() => {
        addToastExternal = (toast) => {
            setToasts(prev => [...prev, toast]);
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== toast.id));
            }, 3500);
        };
        return () => { addToastExternal = null; };
    }, []);

    return (
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`toast ${t.type}`}>
                    <span className={`material-symbols-outlined toast-icon`}>
                        {t.type === 'success' ? 'check_circle' : t.type === 'error' ? 'error' : 'info'}
                    </span>
                    <span>{t.message}</span>
                </div>
            ))}
        </div>
    );
}
