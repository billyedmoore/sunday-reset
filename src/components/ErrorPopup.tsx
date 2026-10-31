/**
 * A centred popup in the same style as the "This overlaps" one; click away or press the button to close it.
 * With `onConfirm` it asks a question instead: the confirm button runs it and Cancel closes.
 */
export default function ErrorPopup({
  message,
  onClose,
  onConfirm,
  confirmLabel = 'OK',
}: {
  message: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
}) {
  return (
    <>
      <div className="pop-backdrop" onClick={onClose} />
      <div className="conflict-pop error-pop" role="alertdialog" aria-label={onConfirm ? 'Before you shuffle' : 'Error'}>
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
