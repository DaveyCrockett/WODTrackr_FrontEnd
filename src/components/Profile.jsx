import "../CSS/login.css"
import WODTrackrLogo from "../assets/WODTrackr_Logo.png"

function Profile() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-hero">
          <p className="auth-eyebrow">WODTrackr</p>
          <h1>Your profile.</h1>
          <p className="auth-lede">
            Review your training stats and manage your account.
          </p>
        </div>
        <div className="auth-form">
          <div>
            <img src={WODTrackrLogo} alt="WODTrackr Logo" />
            <p className="auth-subtitle">Welcome back to WODTrackr.</p>
          </div>
          <div className="form-grid">
            <div className="field">
              <span>Username</span>
              <span>Guest user</span>
            </div>
            <div className="field">
              <span>Member since</span>
              <span>Just now</span>
            </div>
            <button className="primary-btn" type="button">
              Edit profile
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default Profile
