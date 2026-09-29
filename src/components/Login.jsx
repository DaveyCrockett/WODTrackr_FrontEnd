import "../CSS/login.css"
import axios from "axios"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import WODTrackrLogo from "../assets/WODTrackr_Logo.png"

const USERS_API_BASE_URL = String(import.meta.env.VITE_USERS_API_BASE_URL || "/api/users").replace(/\/+$/, "")
const LOGIN_API_URL = `${USERS_API_BASE_URL}/auth/login/`

function Login({ setUserSession, userSession }) {
  console.log("Current user session on Login component mount:", userSession)
  const navigate = useNavigate()
  const [formValues, setFormValues] = useState({
    username: "",
    password: "",
    remember_me: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
const saveUserSession = userSession => {
    const userData = userSession?.user ?? userSession ?? {}
    console.log("User data extracted from saveUserSession input:", userData)
    console.log("Raw saveUserSession input:", userSession)
    
    const authToken = userSession?.data?.access ?? userSession?.token ?? userSession?.key ?? userSession?.auth_token ?? userData?.data?.access ?? userData?.token ?? userData?.key ?? userData?.auth_token ?? ""
    const refreshToken = userSession?.data?.refresh ?? userData?.data?.refresh ?? ""
    const avatarUrl = userData?.data?.avatar_url ?? userData?.data?.avatarUrl ?? userData?.data?.profile_image ?? userData?.data?.profileImage ?? null

    let configData = userSession?.config?.data ?? userData?.config?.data;
    if (typeof configData === 'string') {
      try {
        configData = JSON.parse(configData);
      } catch (e) {
        configData = null;
      }
    }
    
    const username = configData?.username ?? 
                     userSession?.data?.username ?? 
                     userData?.data?.username ?? 
                     userData?.username ?? 
                     userData?.name ?? "";

    console.log("Canonicalized user session values:", {
      username,
      avatarUrl,
      authToken,
      refreshToken,
    })

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
    
    if (username) {
      localStorage.setItem("wodtrackrUsername", username)
    } else {
      localStorage.removeItem("wodtrackrUsername")
    }
    
    console.log("Saved user session:", {
      username,
      avatarUrl,
      authToken,
      refreshToken,
    })

    localStorage.setItem(
      "wodtrackrUser",
      JSON.stringify({
        username,
        avatarUrl,
        authToken,
        refreshToken,
      })
    )
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
      console.log('Login payload:', loginPayload)

      let response
      try {
        response = await axios.post(
          LOGIN_API_URL,
          loginPayload,
          { withCredentials: true },
        )
        console.log("Primary login response:", response)
      } catch (primaryError) {
        if (!primaryError?.response) {
          response = await axios.post(
            LOGIN_API_URL,
            loginPayload,
          )
          console.log("Fallback login response:", response)
        } else {
          throw primaryError
        }
      }
      console.log("Final login response data:", response.config.data)
      saveUserSession(response)
      console.log("User session saved.", {
        username: response.config.data?.username,
        avatarUrl: response.data?.user?.avatar_url ?? null,
        authToken: response.data?.access ?? response.data?.token ?? response.data?.key ?? response.data?.auth_token ?? "",
        refreshToken: response.data?.refresh ?? "",
      })
      const activeUser = JSON.parse(localStorage.getItem("wodtrackrUser"))
      setUserSession(activeUser)
      navigate("/profile")
    } catch (error) {
      console.error("Login error:", error)
      const message =
        error?.response?.data?.detail ||
        "Login failed. Please check your credentials and try again."
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
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
        </div>
      </section>
    </main>
  )
}

export default Login
