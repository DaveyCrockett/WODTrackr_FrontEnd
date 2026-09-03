import { NavLink, useLocation, useNavigate } from "react-router-dom"
import homeIcon from "../assets/HomeIcon.png"
import exerciseIcon from "../assets/ExerciseIcon.png"
import calendarIcon from "../assets/CalendarIconWhite.png"
import programsIcon from "../assets/ProgramsIconWhite.png"
import settingsIcon from "../assets/SettingsIcon.png"
import helpIcon from "../assets/HelpIcon.png"
import WODTrackrIcon from "../assets/WLogo.png"
import DEFAULT_AVATAR from "../assets/DefaultAvatar.png"
const navItems = [
  { label: "Home", to: "/", icon: homeIcon },
  { label: "Exercise", to: "/exercises", icon: exerciseIcon },
  { label: "Calendar", to: "/calendar", icon: calendarIcon },
  { label: "Programs", to: "/programs", icon: programsIcon },
  { label: "Settings", to: "/settings", icon: settingsIcon },
  { label: "Help", to: "/help", icon: helpIcon },
]

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
    localStorage.removeItem("wodtrackrAuthToken")
    localStorage.removeItem("wodtrackrRefreshToken")
    navigate("/login")
  }

  return (
    <nav className="nav-rail">
      <div className="nav-logo">
        <NavLink to="/">
          <img src={WODTrackrIcon} alt="WODTrackr logo" />
        </NavLink>
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
