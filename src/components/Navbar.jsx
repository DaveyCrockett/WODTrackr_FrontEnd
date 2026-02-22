import { NavLink } from "react-router-dom"

const navItems = [
  { label: "Home", to: "/", icon: "/HomeIcon.png" },
  { label: "Exercise", to: "/exercises", icon: "/ExerciseIcon.png" },
  { label: "Calendar", to: "/calendar", icon: "/CalendarIcon.png" },
  { label: "Programs", to: "/programs" },
  { label: "Settings", to: "/settings", icon: "/SettingsIcon.png" },
  { label: "Help", to: "/help", icon: "/HelpIcon.png" },
]

const DEFAULT_AVATAR = "/WLogo.png"

const getStoredUser = () => {
  try {
    const rawValue = localStorage.getItem("wodtrackrUser")
    return rawValue ? JSON.parse(rawValue) : null
  } catch {
    return null
  }
}

function Navbar() {
  const user = getStoredUser()
  const profileAvatar = user?.avatarUrl || DEFAULT_AVATAR
  const profileAlt = user?.username ? `${user.username} profile` : "Profile"

  return (
    <nav className="nav-rail">
      <div className="nav-logo">
        <img src="/WLogo.png" alt="WODTrackr logo" />
      </div>
      <div className="nav-links">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `nav-profile-link${isActive ? " is-active" : ""}`
          }
        >
          <img
            src={profileAvatar}
            alt={profileAlt}
            onError={(event) => {
              event.currentTarget.onerror = null
              event.currentTarget.src = DEFAULT_AVATAR
            }}
          />
        </NavLink>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `nav-link${isActive ? " is-active" : ""}`
            }
          >
            {item.icon ? (
              <img className="nav-icon" src={item.icon} alt={`${item.label} icon`} />
            ) : (
              item.label
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default Navbar
