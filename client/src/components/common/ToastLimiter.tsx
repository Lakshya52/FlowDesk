import { useLayoutEffect } from "react";
import { toast, useToasterStore } from "react-hot-toast";

const MAX_VISIBLE_TOASTS = 3;

/**
 * Keeps at most three toasts visible at once.
 *
 * react-hot-toast stores toasts newest-first, so any entries past the limit
 * are the oldest ones. Dismissing those immediately keeps the queue FIFO
 * instead of waiting for their normal timeout.
 */
export const ToastLimiter = () => {
  const { toasts } = useToasterStore();

  useLayoutEffect(() => {
    const visibleToasts = toasts.filter(
      (item) => item.visible && !item.dismissed
    );

    if (visibleToasts.length <= MAX_VISIBLE_TOASTS) return;

    visibleToasts
      .slice(MAX_VISIBLE_TOASTS)
      .forEach(({ id }) => toast.dismiss(id));
  }, [toasts]);

  return null;
};
