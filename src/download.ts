/** Save text as a file through the browser's download. */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.hidden = true
  // Older Safari ignores a click on a link that isn't in the page.
  document.body.append(a)
  a.click()
  a.remove()
  // Safari on iPad asks "Do you want to download…?" and only reads the file once that's answered, so
  // the link has to outlive the question. A few kilobytes held for five minutes costs nothing.
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
}

const asFile = (filename: string, text: string, type: string) => new File([text], filename, { type })

/**
 * Whether the system share sheet will take a file of this type. True on iPad and iPhone, where it
 * offers "Save to Files" and works in a home-screen app, which a plain download does not.
 */
export function canShareFile(type: string): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [asFile('test', '', type)] })
  } catch {
    return false
  }
}

/** Hand text to the system share sheet as a file. False if sharing failed; closing the sheet is not a failure. */
export async function shareText(filename: string, text: string, type: string): Promise<boolean> {
  try {
    await navigator.share({ files: [asFile(filename, text, type)] })
    return true
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError'
  }
}
