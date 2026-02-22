import WODTrackrLogo from "../assets/WODTrackr_Logo.png"
import "../CSS/profile.css"

const getStoredUser = () => {
  try {
    const rawValue = localStorage.getItem("wodtrackrUser")
    return rawValue ? JSON.parse(rawValue) : null
  } catch {
    return null
  }
}

function Profile() {
  const user = getStoredUser()
  const username = user?.username || "Guest user"
  const avatarUrl = user?.avatarUrl || WODTrackrLogo

  return (
    <section className="profile-page">
      <header className="profile-header">
        <div>
          <p className="profile-eyebrow">WODTrackr</p>
          <h1>Profile</h1>
          <p className="profile-subtitle">
            Review your training details and account information.
          </p>
        </div>
        <button className="profile-edit-btn" type="button">
          Edit profile
        </button>
      </header>

      <div className="profile-grid">
        <article className="profile-card profile-summary-card">
          <div className="profile-identity">
            <img
              src={avatarUrl}
              alt={`${username} avatar`}
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = WODTrackrLogo
              }}
            />
            <div>
              <h2>{username}</h2>
              <p>Member since Jan 2026</p>
            </div>
          </div>
          <dl className="profile-summary-list">
            <div>
              <dt>Current Program</dt>
              <dd>Foundations</dd>
            </div>
            <div>
              <dt>Weekly Goal</dt>
              <dd>4 sessions</dd>
            </div>
            <div>
              <dt>Streak</dt>
              <dd>6 days</dd>
            </div>
          </dl>
        </article>

        <article className="profile-card">
          <h2>Training stats</h2>
          <div className="profile-stats-grid">
            <div>
              <p className="profile-stat-label">Workouts logged</p>
              <p className="profile-stat-value">28</p>
            </div>
            <div>
              <p className="profile-stat-label">This week</p>
              <p className="profile-stat-value">3</p>
            </div>
            <div>
              <p className="profile-stat-label">Personal records</p>
              <p className="profile-stat-value">12</p>
            </div>
            <div>
              <p className="profile-stat-label">Programs completed</p>
              <p className="profile-stat-value">2</p>
            </div>
          </div>
        </article>

        <article className="profile-card profile-details-card">
          <h2>Account details</h2>
          <div className="profile-details-grid">
            <div className="profile-detail-item">
              <span>Email</span>
              <strong>guest@wodtrackr.com</strong>
            </div>
            <div className="profile-detail-item">
              <span>Timezone</span>
              <strong>UTC -5</strong>
            </div>
            <div className="profile-detail-item">
              <span>Preferred units</span>
              <strong>LB / miles</strong>
            </div>
            <div className="profile-detail-item">
              <span>Notifications</span>
              <strong>Enabled</strong>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}

export default Profile
