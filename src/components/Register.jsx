import "../CSS/login.css"
import axios from "axios"
import { useState } from "react"
import WODTrackrLogo from "../assets/WODTrackr_Logo.png"

function Register() {
  const [formValues, setFormValues] = useState({
    username: "",
    email: "",
    password: "",
    password2: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormValues((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage("")

    try {
      await axios.post("http://127.0.0.1:8000/api/users/auth/register/", {
        username: formValues.username,
        email: formValues.email,
        password: formValues.password,
        password2: formValues.password2,
      })
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        "Registration failed. Please try again."
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
          <h1>Start strong.</h1>
          <p className="auth-lede">Create an account to track every PR.</p>
        </div>
        <div className="auth-form">
          <div>
            <img src={WODTrackrLogo} alt="WODTrackr Logo" />
            <h2>Create your account</h2>
            <p className="auth-subtitle">Join the training log built for you.</p>
          </div>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                value={formValues.username}
                onChange={handleChange}
                placeholder="yourusername"
                autoComplete="username"
                required
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                value={formValues.email}
                onChange={handleChange}
                placeholder="you@example.com"
                autoComplete="email"
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
                autoComplete="new-password"
                required
              />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                name="password2"
                value={formValues.password2}
                onChange={handleChange}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </label>
            {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
            <button className="primary-btn" type="submit">
              {isSubmitting ? "Registering..." : "Register"}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}

export default Register
