'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  iconClass?: string;
  hideCancel?: boolean;
};

type ConfirmContextType = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextType | null>(null);

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({
        title: options.title || 'Confirm Action',
        message: options.message,
        confirmText: options.confirmText || 'Yes',
        cancelText: options.cancelText || 'No',
        iconClass: options.iconClass || 'fa-solid fa-circle-question',
        hideCancel: options.hideCancel || false,
        resolve,
      });
    });
  }, []);

  const closeWith = (value: boolean) => {
    if (!pending) return;
    pending.resolve(value);
    setPending(null);
  };

  const contextValue = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={contextValue}>
      {children}

      {pending && (
        <div className="confirm-modal-overlay" onClick={() => closeWith(false)}>
          <div className="confirm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-icon">
              <i className={pending.iconClass}></i>
            </div>
            <h3 className="confirm-modal-title">{pending.title}</h3>
            <p className="confirm-modal-body">{pending.message}</p>
            <div className="confirm-modal-actions">
              {!pending.hideCancel && (
                <button className="confirm-btn confirm-btn-cancel" onClick={() => closeWith(false)}>
                  {pending.cancelText}
                </button>
              )}
              <button className="confirm-btn confirm-btn-accept" onClick={() => closeWith(true)}>
                {pending.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return context;
}
