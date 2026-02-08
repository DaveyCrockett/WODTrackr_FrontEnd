import "../CSS/login.css"

function Guest() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-hero">
          <p className="auth-eyebrow">WODTrackr</p>
          <h1>Try it out.</h1>
          <p className="auth-lede">Explore the app with a guest session.</p>
        </div>
        <div className="auth-form">
          <div>
            <h2>Guest access</h2>
            <p className="auth-subtitle">No account needed to preview features.</p>
          </div>
          <div className="form-grid">
            <button className="primary-btn" type="button">
              Continue as guest
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default Guest
