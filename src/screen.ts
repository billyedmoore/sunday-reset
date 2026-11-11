/** A device whose screen is shorter than this on its short side is a phone; tablets start at about 600. */
export const PHONE_SHORT_SIDE = 600
/** Below this window width a week of seven day columns is too cramped to read or drag in. */
export const MIN_WIDTH = 700

export interface Screen {
  /** Width of the browser window in CSS pixels. */
  width: number
  /** The shorter side of the whole device screen in CSS pixels, whichever way up it is held. */
  shortSide: number
}

/**
 * Sunday Reset needs room for a week of events, so it runs on tablets, laptops and desktops.
 *
 * A phone is recognised by the size of its screen, not by touch: tablets and many laptops are touch
 * screens too, and a big phone turned sideways is as wide as a small tablet. The screen's short side
 * doesn't change with rotation, so a phone stays a phone and an iPad stays an iPad either way up.
 *
 * Returns 'phone' for a phone, 'narrow' for a big screen whose window is too thin (a small desktop
 * window, or an iPad sharing the screen with another app), or null when the planner fits.
 */
export function screenProblem({ width, shortSide }: Screen): 'phone' | 'narrow' | null {
  if (shortSide < PHONE_SHORT_SIDE) return 'phone'
  if (width < MIN_WIDTH) return 'narrow'
  return null
}
