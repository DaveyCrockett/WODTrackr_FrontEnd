import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import WODTrackrLogo from "../assets/WODTrackr_Logo.png"
import CalendarIconBlack from "../assets/CalendarIconBlack.png"
import CalendarEventModal from "./CalendarEventModal"
import useCalendarEntries from "../hooks/useCalendarEntries"
import { dayLabels, getWeekDates, toDateKey } from "../utils/calendarUtils"
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
  const [entriesByDate] = useCalendarEntries()
  const [selectedWorkout, setSelectedWorkout] = useState(null)
  const today = useMemo(() => new Date(), [])
  const todayKey = toDateKey(today)

  const tabContent = {
    Activity: "Track completed workouts, rest days, and weekly consistency at a glance.",
    "Weigh In": "Log your bodyweight check-ins and compare week-over-week trends.",
    Notes: "Capture training notes, reminders, and key takeaways from each session.",
    Mood: "Mark daily energy and mood to identify recovery and performance patterns.",
    Macros: "Review your current nutrition targets and check adherence this week.",
    Leaderboards: "View your ranking against gym members for this week's challenges.",
  }

  const weekEntries = useMemo(
    () =>
      getWeekDates(today).map((dateValue) => {
        const dateKey = toDateKey(dateValue)
        return {
          dateKey,
          dateValue,
          entries: entriesByDate[dateKey] || [],
        }
      }),
    [entriesByDate, today],
  )

  const workoutsPlanned = weekEntries.reduce((total, day) => total + day.entries.length, 0)
  const scheduledDays = weekEntries.filter((day) => day.entries.length > 0).length
  const nextWorkout = weekEntries
    .flatMap((day) =>
      day.entries.map((entry) => ({
        ...entry,
        dateValue: day.dateValue,
      })),
    )
    .find((entry) => toDateKey(entry.dateValue) >= todayKey)

  return (
    <section className="profile-page">
      <div className="profile-grid">
        <article className="profile-card profile-weekly-card">
          <h2>
            <span>Week at a Glance</span>
            <Link to="/calendar" className="profile-calendar-link" aria-label="Open calendar page">
              <img src={CalendarIconBlack} alt="" aria-hidden="true" className="profile-weekly-icon" />
            </Link>
          </h2>
          <p className="profile-card-subtitle">Current week synced with your calendar.</p>
          <div className="profile-summary-list profile-week-summary" aria-label="Current week summary">
            <div>
              <dt>Workouts This Week</dt>
              <dd>{workoutsPlanned}</dd>
            </div>
            <div>
              <dt>Days Scheduled</dt>
              <dd>{scheduledDays}</dd>
            </div>
            <div>
              <dt>Next Workout</dt>
              <dd>{nextWorkout ? `${dayLabels[nextWorkout.dateValue.getDay()]} • ${nextWorkout.title}` : "No upcoming workouts"}</dd>
            </div>
          </div>
          <div className="profile-week-grid" aria-label="Current week workouts">
            {weekEntries.map((day) => {
              const isToday = day.dateKey === todayKey

              return (
                <section
                  key={day.dateKey}
                  className={`profile-week-day${isToday ? " is-today" : ""}`}
                  aria-current={isToday ? "date" : undefined}
                >
                  <header>
                    <p>{dayLabels[day.dateValue.getDay()]}</p>
                    <span>{day.dateValue.getDate()}</span>
                  </header>
                  {day.entries.length === 0 ? (
                    <p className="profile-week-empty">No workout</p>
                  ) : (
                    <ul>
                      {day.entries.map((entry) => (
                        <li key={entry.id}>
                          <button
                            type="button"
                            className="profile-week-entry"
                            onClick={() =>
                              setSelectedWorkout({
                                ...entry,
                                dateLabel: day.dateValue.toLocaleDateString(undefined, {
                                  weekday: "long",
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                }),
                              })
                            }
                          >
                            <span>{entry.title}</span>
                            <small>{entry.time || "No time set"}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
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

      <CalendarEventModal
        entry={selectedWorkout}
        dateLabel={selectedWorkout?.dateLabel}
        onClose={() => setSelectedWorkout(null)}
      />
    </section>
  )
}

export default Profile
