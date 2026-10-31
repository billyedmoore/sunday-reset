import { useEffect } from 'react'

/**
 * A centred popup in the same style as the "This overlaps" one; click away or press the button to close it.
 * With `onConfirm` it asks a question instead: the confirm button runs it and Cancel closes.
 */
export default function ErrorPopup({
  message,
  label = 'Error',
  onClose,
  onConfirm,
  confirmLabel = 'OK',
}: {
  message: string
  /** Accessible name of the dialog. */
  label?: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
}) {
  // Escape closes it, and focus goes back to whatever had it before the popup opened.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
    // Only the first `onClose` matters: it just clears the message that opened this popup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="pop-backdrop" onClick={onClose} />
      <div className="conflict-pop error-pop" role="alertdialog" aria-label={label}>
        <p>{message}</p>
        <div>
          <button className="btn small" onClick={onConfirm ?? onClose} autoFocus>
            {onConfirm ? confirmLabel : 'Dismiss'}
          </button>
          {onConfirm && (
            <button className="btn small ghost" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </>
  )
}
