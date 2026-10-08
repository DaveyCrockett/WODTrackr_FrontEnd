import { useState, useEffect } from "react"
import "../CSS/settings.css"

const PREFS_KEY = "wodtrackrPreferences"
const PROFILE_KEY = "wodtrackrProfile"
const USER_KEY = "wodtrackrUser"

const DEFAULT_PREFS = {
  theme: "light",
  language: "en",
  workoutReminders: true,
  progressUpdates: true,
  weeklyDigest: false,
  analytics: true,
}

const DEFAULT_PROFILE = {
  name: "Guest user",
  email: "guest@wodtrackr.com",
  phone: "",
  location: "Austin, TX",
  timezone: "UTC-5",
  bio: "Level up every week.",
  fitnessGoal: "Build strength",
}

const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
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

const loadProfile = () => {
  const storedUser = getStoredUser()

  try {
    const rawProfile = localStorage.getItem(PROFILE_KEY)
    const storedProfile = rawProfile ? JSON.parse(rawProfile) : {}
    return {
      ...DEFAULT_PROFILE,
      ...storedUser,
      ...storedProfile,
      name: storedProfile.name || storedUser.username || storedUser.name || DEFAULT_PROFILE.name,
      email: storedProfile.email || storedUser.email || DEFAULT_PROFILE.email,
    }
  } catch {
    return {
      ...DEFAULT_PROFILE,
      name: storedUser.username || storedUser.name || DEFAULT_PROFILE.name,
      email: storedUser.email || DEFAULT_PROFILE.email,
    }
  }
}

const saveProfile = (profile) => {
  const safeProfile = {
    ...DEFAULT_PROFILE,
    ...profile,
  }

  localStorage.setItem(PROFILE_KEY, JSON.stringify(safeProfile))

  const existingUser = getStoredUser()
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      ...existingUser,
      username: safeProfile.name || DEFAULT_PROFILE.name,
      email: safeProfile.email || DEFAULT_PROFILE.email,
    }),
  )
}

const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme)
  localStorage.setItem("wodtrackrTheme", theme)
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

function GeneralPreferences({ prefs, onChange, onSave, onReset, savedMessage }) {
  return (
    <div className="settings-section">
      <CollapsibleCard title="Appearance" description="Customize how WODTrackr looks.">
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Theme</strong>
            <span>Choose between light and dark mode</span>
          </div>
          <select
            id="settings-theme"
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
            id="settings-language"
            className="settings-select"
            value={prefs.language}
            onChange={(e) => onChange("language", e.target.value)}
            aria-label="Language"
          >
            {LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Notifications" description="Control how and when you receive alerts.">
        <Toggle
          id="pref-workout-reminders"
          checked={prefs.workoutReminders}
          onChange={(value) => onChange("workoutReminders", value)}
          label="Workout Reminders"
          description="Daily reminders to complete your scheduled workout"
        />
        <Toggle
          id="pref-progress-updates"
          checked={prefs.progressUpdates}
          onChange={(value) => onChange("progressUpdates", value)}
          label="Progress Updates"
          description="Notify me when I hit a personal record or milestone"
        />
        <Toggle
          id="pref-weekly-digest"
          checked={prefs.weeklyDigest}
          onChange={(value) => onChange("weeklyDigest", value)}
          label="Weekly Digest"
          description="Summary email with your training stats every Monday"
        />
      </CollapsibleCard>

      <div className="settings-save-bar">
        <button type="button" className="settings-primary-btn" onClick={onSave}>
          Save Preferences
        </button>
        <button type="button" className="settings-reset-btn" onClick={onReset}>
          Reset to defaults
        </button>
        {savedMessage && <span className="settings-success">{savedMessage}</span>}
      </div>
    </div>
  )
}

function AccountSettings({ profile, onProfileChange, onSaveProfile, onResetProfile, savedMessage }) {
  const [emailOpen, setEmailOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emailMsg, setEmailMsg] = useState(null)

  const handleEmailSubmit = (event) => {
    event.preventDefault()
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!newEmail || !emailPattern.test(newEmail)) {
      setEmailMsg({ type: "error", text: "Please enter a valid email address." })
      return
    }

    onProfileChange("email", newEmail)
    onSaveProfile()
    setEmailMsg({ type: "success", text: `Verification email sent to ${newEmail}.` })
    setNewEmail("")
    setEmailOpen(false)
    setTimeout(() => setEmailMsg(null), 3500)
  }

  return (
    <div className="settings-section">
      <CollapsibleCard title="Account Info" description="Review and update your public profile details.">
        <form className="settings-form" onSubmit={(event) => {
          event.preventDefault()
          onSaveProfile()
        }}>
          <div className="settings-form-grid">
            <div className="settings-field">
              <label htmlFor="profile-name">Full name</label>
              <input
                id="profile-name"
                type="text"
                value={profile.name}
                onChange={(event) => onProfileChange("name", event.target.value)}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="profile-email">Email address</label>
              <input
                id="profile-email"
                type="email"
                value={profile.email}
                onChange={(event) => onProfileChange("email", event.target.value)}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="profile-phone">Phone</label>
              <input
                id="profile-phone"
                type="tel"
                value={profile.phone}
                onChange={(event) => onProfileChange("phone", event.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="settings-field">
              <label htmlFor="profile-location">Location</label>
              <input
                id="profile-location"
                type="text"
                value={profile.location}
                onChange={(event) => onProfileChange("location", event.target.value)}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="profile-timezone">Timezone</label>
              <input
                id="profile-timezone"
                type="text"
                value={profile.timezone}
                onChange={(event) => onProfileChange("timezone", event.target.value)}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="profile-goal">Primary goal</label>
              <input
                id="profile-goal"
                type="text"
                value={profile.fitnessGoal}
                onChange={(event) => onProfileChange("fitnessGoal", event.target.value)}
              />
            </div>
          </div>

          <div className="settings-field">
            <label htmlFor="profile-bio">Bio</label>
            <textarea
              id="profile-bio"
              rows="3"
              value={profile.bio}
              onChange={(event) => onProfileChange("bio", event.target.value)}
            />
          </div>

          <div className="settings-save-bar">
            <button type="submit" className="settings-primary-btn">
              Save profile
            </button>
            <button type="button" className="settings-reset-btn" onClick={onResetProfile}>
              Reset profile
            </button>
            {savedMessage && <span className="settings-success">{savedMessage}</span>}
          </div>
        </form>
      </CollapsibleCard>

      <CollapsibleCard title="Email Preferences" description="Manage how we keep in touch.">
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Primary email</strong>
            <span>{profile.email}</span>
          </div>
          <button
            type="button"
            className="settings-secondary-btn"
            onClick={() => setEmailOpen((prev) => !prev)}
          >
            {emailOpen ? "Close" : "Change"}
          </button>
        </div>
        {emailOpen && (
          <form className="settings-form" onSubmit={handleEmailSubmit}>
            <div className="settings-field">
              <label htmlFor="new-email">New email address</label>
              <input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="your@email.com"
              />
            </div>
            {emailMsg?.type === "error" && <span className="settings-error">{emailMsg.text}</span>}
            <button type="submit" className="settings-primary-btn">
              Send verification
            </button>
          </form>
        )}
      </CollapsibleCard>

      <CollapsibleCard title="Change Password" description="Keep your account secure." defaultOpen={false}>
        <form className="settings-form">
          <div className="settings-field">
            <label htmlFor="pw-current">Current password</label>
            <input id="pw-current" type="password" autoComplete="current-password" />
          </div>
          <div className="settings-field">
            <label htmlFor="pw-next">New password</label>
            <input id="pw-next" type="password" autoComplete="new-password" />
          </div>
          <div className="settings-field">
            <label htmlFor="pw-confirm">Confirm new password</label>
            <input id="pw-confirm" type="password" autoComplete="new-password" />
          </div>
          <button type="button" className="settings-primary-btn">
            Update password
          </button>
        </form>
      </CollapsibleCard>
    </div>
  )
}

function AdvancedSettings({ analyticsEnabled, onAnalyticsToggle }) {
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
      </CollapsibleCard>

      <CollapsibleCard title="Data & Privacy" description="Control your data and export options." defaultOpen={false}>
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Analytics</strong>
            <span>Allow anonymous usage data to improve the platform</span>
          </div>
          <label className="settings-toggle" aria-label="Analytics">
            <input
              type="checkbox"
              checked={analyticsEnabled}
              onChange={(event) => onAnalyticsToggle(event.target.checked)}
            />
            <span className="settings-toggle-track" />
          </label>
        </div>
      </CollapsibleCard>
    </div>
  )
}

function Settings() {
  const [activeTab, setActiveTab] = useState(TABS[0])
  const [prefs, setPrefs] = useState(loadPrefs)
  const [profile, setProfile] = useState(loadProfile)
  const [savedMessage, setSavedMessage] = useState("")

  useEffect(() => {
    applyTheme(prefs.theme)
  }, [prefs.theme])

  useEffect(() => {
    if (!savedMessage) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => setSavedMessage(""), 2500)
    return () => window.clearTimeout(timeoutId)
  }, [savedMessage])

  const handlePrefChange = (key, value) => {
    setPrefs((prev) => ({ ...prev, [key]: value }))
  }

  const handlePrefSave = () => {
    savePrefs(prefs)
    applyTheme(prefs.theme)
    setSavedMessage("Preferences saved!")
  }

  const handleAnalyticsToggle = (checked) => {
    setPrefs((prev) => {
      const nextPrefs = { ...prev, analytics: checked }
      savePrefs(nextPrefs)
      return nextPrefs
    })
    setSavedMessage("Privacy preferences saved!")
  }

  const handleResetDefaults = () => {
    const nextPrefs = { ...DEFAULT_PREFS }
    setPrefs(nextPrefs)
    savePrefs(nextPrefs)
    applyTheme(nextPrefs.theme)

    const nextProfile = { ...DEFAULT_PROFILE }
    setProfile(nextProfile)
    saveProfile(nextProfile)
    setSavedMessage("Settings reset to defaults.")
  }

  const handleProfileChange = (key, value) => {
    setProfile((prev) => ({ ...prev, [key]: value }))
  }

  const handleProfileSave = () => {
    saveProfile(profile)
    setSavedMessage("Profile saved!")
  }

  const handleResetProfile = () => {
    const nextProfile = { ...DEFAULT_PROFILE }
    setProfile(nextProfile)
    saveProfile(nextProfile)
    setSavedMessage("Profile reset to defaults.")
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
        <GeneralPreferences
          prefs={prefs}
          onChange={handlePrefChange}
          onSave={handlePrefSave}
          onReset={handleResetDefaults}
          savedMessage={savedMessage}
        />
      )}
      {activeTab === "Account Settings" && (
        <AccountSettings
          profile={profile}
          onProfileChange={handleProfileChange}
          onSaveProfile={handleProfileSave}
          onResetProfile={handleResetProfile}
          savedMessage={savedMessage}
        />
      )}
      {activeTab === "Advanced Settings" && (
        <AdvancedSettings
          analyticsEnabled={prefs.analytics ?? true}
          onAnalyticsToggle={handleAnalyticsToggle}
        />
      )}
    </section>
  )
}

export default Settings
