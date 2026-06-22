import React from 'react';
import { useProject } from '../store/ProjectContext';

/**
 * Toast notification container
 */
export default function ToastContainer() {
  const { state } = useProject();

  if (state.toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {state.toasts.map(toast => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          {toast.type === 'success' && '✓ '}
          {toast.type === 'error' && '✕ '}
          {toast.type === 'info' && 'ℹ '}
          {toast.message}
        </div>
      ))}
    </div>
  );
}
