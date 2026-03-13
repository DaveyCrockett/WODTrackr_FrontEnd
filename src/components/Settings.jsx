import { useState, useEffect } from "react"
import "../CSS/settings.css"

const PREFS_KEY = "wodtrackrPreferences"

const DEFAULT_PREFS = {
  theme: "light",
  language: "en",
  workoutReminders: true,
  progressUpdates: true,
  weeklyDigest: false,
}

const loadPrefs = () => {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

const savePrefs = (prefs) => {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme)
}

const getStoredUser = () => {
  try {
    const raw = localStorage.getItem("wodtrackrUser")
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const TABS = ["General Preferences", "Account Settings", "Advanced Settings"]
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
]

function CollapsibleCard({ title, description, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="settings-card">
      <button
        type="button"
        className="settings-card-header"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <span className="settings-collapse-icon" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && <div className="settings-card-body">{children}</div>}
    </div>
  )
}

function Toggle({ id, checked, onChange, label, description }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </div>
      <label className="settings-toggle" aria-label={label}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="settings-toggle-track" />
      </label>
    </div>
  )
}

/* ── General Preferences tab ── */
function GeneralPreferences({ prefs, onChange, onSaved }) {
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    savePrefs(prefs)
    applyTheme(prefs.theme)
    setSaved(true)
    onSaved()
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="settings-section">
      <CollapsibleCard title="Appearance" description="Customize how WODTrackr looks.">
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Theme</strong>
            <span>Choose between light and dark mode</span>
          </div>
          <select
            className="settings-select"
            value={prefs.theme}
            onChange={(e) => onChange("theme", e.target.value)}
            aria-label="Theme"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Language</strong>
            <span>Select your preferred language</span>
          </div>
          <select
            className="settings-select"
            value={prefs.language}
            onChange={(e) => onChange("language", e.target.value)}
            aria-label="Language"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Notifications" description="Control how and when you receive alerts.">
        <Toggle
          id="pref-workout-reminders"
          checked={prefs.workoutReminders}
          onChange={(v) => onChange("workoutReminders", v)}
          label="Workout Reminders"
          description="Daily reminders to complete your scheduled workout"
        />
        <Toggle
          id="pref-progress-updates"
          checked={prefs.progressUpdates}
          onChange={(v) => onChange("progressUpdates", v)}
          label="Progress Updates"
          description="Notify me when I hit a personal record or milestone"
        />
        <Toggle
          id="pref-weekly-digest"
          checked={prefs.weeklyDigest}
          onChange={(v) => onChange("weeklyDigest", v)}
          label="Weekly Digest"
          description="Summary email with your training stats every Monday"
        />
      </CollapsibleCard>

      <div className="settings-save-bar">
        <button type="button" className="settings-primary-btn" onClick={handleSave}>
          Save Preferences
        </button>
        {saved && <span className="settings-success">Preferences saved!</span>}
      </div>
    </div>
  )
}

/* ── Account Settings tab ── */
function AccountSettings() {
  const user = getStoredUser()
  const email = user?.email || "guest@wodtrackr.com"
  const username = user?.username || "Guest user"

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" })
  const [pwMsg, setPwMsg] = useState(null)
  const [emailOpen, setEmailOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emailMsg, setEmailMsg] = useState(null)

  const handlePwChange = (e) => {
    setPwForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handlePwSubmit = (e) => {
    e.preventDefault()
    if (!pwForm.current) {
      setPwMsg({ type: "error", text: "Please enter your current password." })
      return
    }
    if (pwForm.next.length < 8) {
      setPwMsg({ type: "error", text: "New password must be at least 8 characters." })
      return
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({ type: "error", text: "Passwords do not match." })
      return
    }
    // Placeholder — real implementation would call the backend API
    setPwMsg({ type: "success", text: "Password updated successfully." })
    setPwForm({ current: "", next: "", confirm: "" })
    setTimeout(() => setPwMsg(null), 3000)
  }

  const handleEmailSubmit = (e) => {
    e.preventDefault()
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!newEmail || !emailPattern.test(newEmail)) {
      setEmailMsg({ type: "error", text: "Please enter a valid email address." })
      return
    }
    // Placeholder — real implementation would call the backend API
    setEmailMsg({ type: "success", text: "Verification email sent to " + newEmail })
    setNewEmail("")
    setEmailOpen(false)
    setTimeout(() => setEmailMsg(null), 3500)
  }

  return (
    <div className="settings-section">
      <CollapsibleCard title="Account Info" description="Your current account details.">
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Username</strong>
          </div>
          <span className="settings-code">{username}</span>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Email Address</strong>
            <span>
              {emailMsg?.type === "success" ? emailMsg.text : email}
            </span>
          </div>
          <button
            type="button"
            className="settings-secondary-btn"
            onClick={() => setEmailOpen((prev) => !prev)}
          >
            {emailOpen ? "Cancel" : "Change"}
          </button>
        </div>
        {emailOpen && (
          <form className="settings-form" onSubmit={handleEmailSubmit}>
            <div className="settings-field">
              <label htmlFor="new-email">New Email Address</label>
              <input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
            {emailMsg?.type === "error" && (
              <span className="settings-error">{emailMsg.text}</span>
            )}
            <button type="submit" className="settings-primary-btn">
              Send Verification
            </button>
          </form>
        )}
      </CollapsibleCard>

      <CollapsibleCard title="Change Password" description="Keep your account secure.">
        <form className="settings-form" onSubmit={handlePwSubmit}>
          <div className="settings-field">
            <label htmlFor="pw-current">Current Password</label>
            <input
              id="pw-current"
              type="password"
              name="current"
              value={pwForm.current}
              onChange={handlePwChange}
              autoComplete="current-password"
            />
          </div>
          <div className="settings-field">
            <label htmlFor="pw-next">New Password</label>
            <input
              id="pw-next"
              type="password"
              name="next"
              value={pwForm.next}
              onChange={handlePwChange}
              autoComplete="new-password"
            />
          </div>
          <div className="settings-field">
            <label htmlFor="pw-confirm">Confirm New Password</label>
            <input
              id="pw-confirm"
              type="password"
              name="confirm"
              value={pwForm.confirm}
              onChange={handlePwChange}
              autoComplete="new-password"
            />
          </div>
          {pwMsg && (
            <span className={pwMsg.type === "success" ? "settings-success" : "settings-error"}>
              {pwMsg.text}
            </span>
          )}
          <button type="submit" className="settings-primary-btn">
            Update Password
          </button>
        </form>
      </CollapsibleCard>

      <CollapsibleCard title="Subscription" description="Manage your WODTrackr plan.">
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Current Plan</strong>
            <span>Free tier — unlimited basic tracking</span>
          </div>
          <span className="settings-badge is-free">Free</span>
        </div>
        <div className="settings-btn-row">
          <button type="button" className="settings-primary-btn">
            Upgrade to Pro
          </button>
          <button type="button" className="settings-secondary-btn">
            View Plan Details
          </button>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Danger Zone" description="Irreversible account actions." defaultOpen={false}>
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Delete Account</strong>
            <span>Permanently remove your account and all data</span>
          </div>
          <button type="button" className="settings-danger-btn">
            Delete Account
          </button>
        </div>
      </CollapsibleCard>
    </div>
  )
}

/* ── Advanced Settings tab ── */
function AdvancedSettings() {
  const [apiKey] = useState("wt_••••••••••••••••••••••••••••••••")
  const [keyVisible, setKeyVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  const displayKey = keyVisible ? "wt_sk_example_key_replace_with_real" : apiKey

  const handleCopy = () => {
    navigator.clipboard.writeText(displayKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="settings-section">
      <CollapsibleCard title="API Access" description="Manage personal API keys for integrations.">
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>API Key</strong>
            <span>Use this key to authenticate third-party integrations</span>
          </div>
        </div>
        <div className="settings-key-row">
          <span className="settings-code">{displayKey}</span>
          <button
            type="button"
            className="settings-secondary-btn"
            onClick={() => setKeyVisible((prev) => !prev)}
          >
            {keyVisible ? "Hide" : "Reveal"}
          </button>
          <button type="button" className="settings-secondary-btn" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <div className="settings-btn-row" style={{ marginTop: "0.5rem" }}>
          <button type="button" className="settings-secondary-btn">
            Regenerate Key
          </button>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Integrations" description="Connect WODTrackr with external services." defaultOpen={false}>
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>MyFitnessPal</strong>
            <span>Sync nutrition data with your MFP account</span>
          </div>
          <button type="button" className="settings-secondary-btn">
            Connect
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Garmin Connect</strong>
            <span>Import activity data from your Garmin device</span>
          </div>
          <button type="button" className="settings-secondary-btn">
            Connect
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Apple Health</strong>
            <span>Share workouts and health metrics with Apple Health</span>
          </div>
          <button type="button" className="settings-secondary-btn">
            Connect
          </button>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Data & Privacy" description="Control your data and export options." defaultOpen={false}>
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Export Data</strong>
            <span>Download a copy of all your WODTrackr data as CSV</span>
          </div>
          <button type="button" className="settings-secondary-btn">
            Export
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Analytics</strong>
            <span>Allow anonymous usage data to improve the platform</span>
          </div>
          <label className="settings-toggle" aria-label="Analytics">
            <input type="checkbox" defaultChecked />
            <span className="settings-toggle-track" />
          </label>
        </div>
      </CollapsibleCard>
    </div>
  )
}

/* ── Main Settings component ── */
function Settings() {
  const [activeTab, setActiveTab] = useState(TABS[0])
  const [prefs, setPrefs] = useState(loadPrefs)

  // Apply persisted theme on mount
  useEffect(() => {
    applyTheme(prefs.theme)
  }, [prefs.theme])

  const handlePrefChange = (key, value) => {
    setPrefs((prev) => ({ ...prev, [key]: value }))
  }

  const handleSaved = () => {
    // Theme is applied inside GeneralPreferences; nothing extra needed here
  }

  return (
    <section className="settings-page">
      <header className="settings-header">
        <h1>Settings &amp; Preferences</h1>
        <p>Manage your account, appearance, notifications, and integrations.</p>
      </header>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`settings-tab-btn${activeTab === tab ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "General Preferences" && (
        <GeneralPreferences prefs={prefs} onChange={handlePrefChange} onSaved={handleSaved} />
      )}
      {activeTab === "Account Settings" && <AccountSettings />}
      {activeTab === "Advanced Settings" && <AdvancedSettings />}
    </section>
  )
}

export default Settings
