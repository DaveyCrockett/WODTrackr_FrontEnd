import { NavLink, useLocation, useNavigate } from "react-router-dom"

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
  const location = useLocation()
  const navigate = useNavigate()
  const user = getStoredUser()
  const profileAvatar = user?.avatarUrl || DEFAULT_AVATAR
  const profileAlt = user?.username ? `${user.username} profile` : "Profile"
  const isProfileActive = location.pathname.startsWith("/profile")

  const handleLogout = () => {
    localStorage.removeItem("wodtrackrUser")
    navigate("/login")
  }

  return (
    <nav className="nav-rail">
      <div className="nav-logo">
        <img src="/WLogo.png" alt="WODTrackr logo" />
      </div>
      <div className="nav-links">
        <div className="nav-profile-menu">
          <button
            className={`nav-profile-link${isProfileActive ? " is-active" : ""}`}
            type="button"
            aria-label="Open profile menu"
          >
            <img
              src={profileAvatar}
              alt={profileAlt}
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = DEFAULT_AVATAR
              }}
            />
          </button>
          <div className="nav-profile-dropdown" role="menu" aria-label="Profile menu">
            <NavLink to="/profile" className="nav-profile-option" role="menuitem">
              Profile
            </NavLink>
            <button
              type="button"
              className="nav-profile-option nav-profile-logout"
              onClick={handleLogout}
              role="menuitem"
            >
              Log out
            </button>
          </div>
        </div>
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
