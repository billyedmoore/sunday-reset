import { describe, expect, it } from 'vitest'
import { isUnsupportedScreen } from './screen'

describe('isUnsupportedScreen', () => {
  it('blocks phones, with or without a touch pointer', () => {
    expect(isUnsupportedScreen(390, true)).toBe(true)
    expect(isUnsupportedScreen(430, false)).toBe(true)
  })

  it('blocks a small touch screen even if it is wider than a phone', () => {
    expect(isUnsupportedScreen(820, true)).toBe(true)
  })

  it('allows laptops and desktops', () => {
    expect(isUnsupportedScreen(1280, false)).toBe(false)
    expect(isUnsupportedScreen(1440, false)).toBe(false)
  })

  it('allows a narrow-ish desktop window and a large touch laptop', () => {
    expect(isUnsupportedScreen(900, false)).toBe(false)
    expect(isUnsupportedScreen(1024, true)).toBe(false)
  })

  it('draws the line at 760px for a mouse', () => {
    expect(isUnsupportedScreen(759, false)).toBe(true)
    expect(isUnsupportedScreen(760, false)).toBe(false)
  })
})
