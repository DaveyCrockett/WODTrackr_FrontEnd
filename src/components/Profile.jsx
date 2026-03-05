import { useState } from "react"
import { Link } from "react-router-dom"
import WODTrackrLogo from "../assets/WODTrackr_Logo.png"
import CalendarIconBlack from "../assets/CalendarIconBlack.png"
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
  const tabLabels = ["Activity", "Weigh In", "Notes", "Mood", "Macros", "Leaderboards"]
  const [activeTab, setActiveTab] = useState(tabLabels[0])

  const tabContent = {
    Activity: "Track completed workouts, rest days, and weekly consistency at a glance.",
    "Weigh In": "Log your bodyweight check-ins and compare week-over-week trends.",
    Notes: "Capture training notes, reminders, and key takeaways from each session.",
    Mood: "Mark daily energy and mood to identify recovery and performance patterns.",
    Macros: "Review your current nutrition targets and check adherence this week.",
    Leaderboards: "View your ranking against gym members for this week's challenges.",
  }

  return (
    <section className="profile-page">
      <div className="profile-grid">
        <article className="profile-card profile-weekly-card">
          <h2>
            <span>Weekly Summary</span>
            <Link to="/calendar" aria-label="Open calendar">
              <img src={CalendarIconBlack} alt="" aria-hidden="true" className="profile-weekly-icon" />
            </Link>
          </h2>
          <p className="profile-card-subtitle">Calendar preview for this week</p>
          <div className="profile-summary-list">
            <div>
              <dt>Sessions Planned</dt>
              <dd>5</dd>
            </div>
            <div>
              <dt>Sessions Completed</dt>
              <dd>3</dd>
            </div>
            <div>
              <dt>Next Workout</dt>
              <dd>Mon • Strength + Conditioning</dd>
            </div>
          </div>
        </article>

        <article className="profile-card profile-tabs-card">
          <div className="profile-tabs" role="tablist" aria-label="Tracking tabs">
            {tabLabels.map((tabLabel) => (
              <button
                key={tabLabel}
                type="button"
                role="tab"
                aria-selected={activeTab === tabLabel}
                className={`profile-tab-btn${activeTab === tabLabel ? " is-active" : ""}`}
                onClick={() => setActiveTab(tabLabel)}
              >
                {tabLabel}
              </button>
            ))}
          </div>
          <div className="profile-tab-panel" role="tabpanel" aria-live="polite">
            <h3>{activeTab}</h3>
            <p>{tabContent[activeTab]}</p>
          </div>
        </article>

        <article className="profile-card profile-info-card">
          {/* <h2>Profile Info</h2> */}
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
          <dl className="profile-details-list">
            <div>
              <dt>Email</dt>
              <dd>guest@wodtrackr.com</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>UTC -5</dd>
            </div>
            <div>
              <dt>Preferred Units</dt>
              <dd>LB / miles</dd>
            </div>
          </dl>
        </article>

        <article className="profile-card profile-fitness-card">
          <h2>Fitness Level</h2>
          <div className="profile-stats-grid profile-fitness-grid">
            <div>
              <p className="profile-stat-label">Current Level</p>
              <p className="profile-stat-value">Intermediate</p>
            </div>
            <div>
              <p className="profile-stat-label">Consistency</p>
              <p className="profile-stat-value">76%</p>
            </div>
            <div>
              <p className="profile-stat-label">Progression</p>
              <p className="profile-stat-value">+1 level</p>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}

export default Profile
