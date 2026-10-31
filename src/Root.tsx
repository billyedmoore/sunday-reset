import { useEffect, useState } from 'react'
import App from './App'
import UnsupportedScreen from './components/UnsupportedScreen'
import { isUnsupportedScreen } from './screen'

const touch = () => window.matchMedia('(pointer: coarse)')

/** Shows the app, or an explanation on screens that are too small for it; follows window resizes. */
export default function Root() {
  const [unsupported, setUnsupported] = useState(() => isUnsupportedScreen(window.innerWidth, touch().matches))
  useEffect(() => {
    const update = () => setUnsupported(isUnsupportedScreen(window.innerWidth, touch().matches))
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return unsupported ? <UnsupportedScreen /> : <App />
}
