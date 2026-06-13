import React, { useEffect } from 'react';

export default function ToastContainer({ toasts, removeToast }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        zIndex: 9999,
        pointerEvents: 'none',
        maxWidth: '380px',
        width: 'calc(100% - 48px)',
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }) {
  const { id, message, type } = toast;

  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [id, onRemove]);

  let iconClass = 'fa-circle-check';
  let iconColor = 'var(--bullish)';
  let borderLeft = '3px solid var(--bullish)';

  if (type === 'error') {
    iconClass = 'fa-circle-exclamation';
    iconColor = 'var(--bearish)';
    borderLeft = '3px solid var(--bearish)';
  } else if (type === 'warning') {
    iconClass = 'fa-triangle-exclamation';
    iconColor = '#f59e0b';
    borderLeft = '3px solid #f59e0b';
  } else if (type === 'info') {
    iconClass = 'fa-circle-info';
    iconColor = 'var(--cyan)';
    borderLeft = '3px solid var(--cyan)';
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 18px',
        background: 'rgba(10, 15, 30, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderLeft: borderLeft,
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: 'var(--radius-md)',
        color: '#fff',
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        fontSize: '13px',
        pointerEvents: 'auto',
        animation: 'slideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
      }}
    >
      <i className={`fa-solid ${iconClass}`} style={{ fontSize: '16px', color: iconColor }}></i>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{message}</span>
      <button
        onClick={() => onRemove(id)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: '4px',
          fontSize: '14px',
          marginLeft: '6px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
}
