/** Shown instead of the app on a phone, or in a window that's too thin for the planner. */
export default function UnsupportedScreen({ problem }: { problem: 'phone' | 'narrow' }) {
  return (
    <main className="unsupported" role="alert">
      <h1>Sunday Reset</h1>
      {problem === 'phone' ? (
        <>
          <p>Sunday Reset needs a tablet, laptop or desktop screen.</p>
          <p className="hint">Open it there to plan your week. Your data stays in that browser.</p>
        </>
      ) : (
        <>
          <p>This window is too narrow for a week of events.</p>
          <p className="hint">Make it wider. On an iPad, give Sunday Reset the whole screen.</p>
        </>
      )}
    </main>
  )
}
