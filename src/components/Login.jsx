import "../CSS/login.css"
import axios from "axios"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import WODTrackrLogo from "../assets/WODTrackr_Logo.png"

function Login() {
  const navigate = useNavigate()
  const [formValues, setFormValues] = useState({
    username: "",
    password: "",
    remember_me: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGuestSubmitting, setIsGuestSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const saveUserSession = saveUserSession => {
    const userData = saveUserSession?.user ?? saveUserSession ?? {}
    const authToken = saveUserSession?.access ?? saveUserSession?.token ?? saveUserSession?.key ?? saveUserSession?.auth_token ?? userData?.access ?? userData?.token ?? userData?.key ?? userData?.auth_token ?? ""

    const refreshToken = saveUserSession?.refresh ?? userData?.refresh ?? ""
    const avatarUrl = userData?.avatar_url ?? userData?.avatarUrl ?? userData?.profile_image ?? userData?.profileImage ?? null
    const username = userData?.username ?? userData?.name ?? "Guest user"

    localStorage.setItem(
      "wodtrackrUser",
      JSON.stringify({
        username,
        avatarUrl,
        authToken,
        refreshToken,
      })
    )

    if (authToken) {
      localStorage.setItem("wodtrackrAuthToken", authToken)
    } else {
      localStorage.removeItem("wodtrackrAuthToken")
    }

    if (refreshToken) {
      localStorage.setItem("wodtrackrRefreshToken", refreshToken)
    } else {
      localStorage.removeItem("wodtrackrRefreshToken")
    }
  }

  
  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    setFormValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage("")

    try {
      const loginPayload = {
        username: formValues.username,
        password: formValues.password,
        remember_me: formValues.remember_me,
      }

      let response
      try {
        response = await axios.post(
          "http://127.0.0.1:8000/api/users/auth/login/",
          loginPayload,
          { withCredentials: true },
        )
      } catch (primaryError) {
        if (!primaryError?.response) {
          response = await axios.post(
            "http://127.0.0.1:8000/api/users/auth/login/",
            loginPayload,
          )
        } else {
          throw primaryError
        }
      }

      saveUserSession(response.data, formValues.username)
      navigate("/profile")
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        "Login failed. Please check your credentials and try again."
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGuestLogin = async () => {
    setIsGuestSubmitting(true)
    setErrorMessage("")

    try {
      let response
      try {
        response = await axios.post(
          "http://127.0.0.1:8000/api/users/auth/guest/",
          {},
          { withCredentials: true },
        )
      } catch (primaryError) {
        if (!primaryError?.response) {
          response = await axios.post("http://127.0.0.1:8000/api/users/auth/guest/")
        } else {
          throw primaryError
        }
      }

      saveUserSession(response.data, "Guest user")
      navigate("/exercises")
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        "Guest login failed. Please try again."
      setErrorMessage(message)
    } finally {
      setIsGuestSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-hero">
          <p className="auth-eyebrow">WODTrackr</p>
          <h1>Train with focus.</h1>
          <p className="auth-lede">
            Log your workouts, track personal records, and keep your streak
            alive.
          </p>
          <div className="auth-stats">
            <div>
              <span className="stat-value">4x</span>
              <span className="stat-label">Weekly streak</span>
            </div>
            <div>
              <span className="stat-value">21</span>
              <span className="stat-label">Workouts logged</span>
            </div>
          </div>
        </div>
        <div className="auth-form">
          <div>
            <img src={WODTrackrLogo} alt="WODTrackr Logo" />
            <p className="auth-subtitle">Sign in to continue your progress.</p>
          </div>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                value={formValues.username}
                onChange={handleChange}
                placeholder="Your username"
                autoComplete="username"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                value={formValues.password}
                onChange={handleChange}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                name="remember_me"
                checked={formValues.remember_me}
                onChange={handleChange}
              />
              Remember me
            </label>
            {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
            <div className="auth-actions">
              <button className="primary-btn" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Logging in..." : "Log in"}
              </button>
              <Link className="secondary-btn" to="/register">
                Register
              </Link>
            </div>
          </form>
          <div className="auth-footer">
            <span>Don't have an account?</span>
            <button
              className="link-btn"
              type="button"
              onClick={handleGuestLogin}
              disabled={isGuestSubmitting}
            >
              {isGuestSubmitting ? "Starting guest..." : "Guest Login"}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default Login
