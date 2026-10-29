import {toast} from 'sonner';

export {toast};

// Toast with Confirm / Cancel buttons in place of window.confirm; resolves false when dismissed
export function confirmToast(title: string, opts: {description?: string; confirmLabel?: string} = {}): Promise<boolean> {
  return new Promise((resolve) => {
    toast(title, {
      description: opts.description,
      duration: Infinity,
      action: {label: opts.confirmLabel || 'Confirm', onClick: () => resolve(true)},
      cancel: {label: 'Cancel', onClick: () => resolve(false)},
      onDismiss: () => resolve(false)
    });
  });
}
