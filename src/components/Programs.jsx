import "../CSS/programs.css"
import axios from "axios"
import { useEffect, useMemo, useState } from "react"

const API_URL = "/api/wodtrackr/exercise-programs/"
const PROGRAMS_PER_PAGE = 6
const DEFAULT_DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"]
const EMPTY_PROGRAM_FORM_VALUES = {
  name: "",
  description: "",
  difficulty: "",
  duration_weeks: "",
  category: "",
  goal: "",
  is_public: false,
}

const getAuthToken = () => {
  const directToken = localStorage.getItem("wodtrackrAuthToken")
  if (directToken) {
    return directToken
  }

  try {
    const rawValue = localStorage.getItem("wodtrackrUser")
    const userData = rawValue ? JSON.parse(rawValue) : null
    return userData?.authToken || ""
  } catch {
    return ""
  }
}

const buildRequestConfig = (overrides = {}) => {
  const authToken = getAuthToken()
  return {
    ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
    ...overrides,
  }
}

const normalizeProgramsPayload = (data) => {
  if (Array.isArray(data?.data)) {
    return data.data
  }

  if (Array.isArray(data?.results)) {
    return data.results
  }

  if (Array.isArray(data)) {
    return data
  }

  return []
}

const normalizeProgramDetailPayload = (data) => {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data?.data ?? data?.result ?? data
  }

  return null
}

const formatTimestamp = (value) => {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString()
}

function Programs() {
  const [programs, setPrograms] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createFormValues, setCreateFormValues] = useState(EMPTY_PROGRAM_FORM_VALUES)
  const [createFieldErrors, setCreateFieldErrors] = useState({})
  const [createErrorMessage, setCreateErrorMessage] = useState("")
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false)
  const [searchName, setSearchName] = useState("")
  const [sortOrder, setSortOrder] = useState("asc")
  const [filters, setFilters] = useState({ difficulty: "", category: "", goal: "" })
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedProgramId, setSelectedProgramId] = useState(null)
  const [programDetailsById, setProgramDetailsById] = useState({})
  const [detailErrorById, setDetailErrorById] = useState({})
  const [detailLoadingId, setDetailLoadingId] = useState(null)
  const [reuseLoadingId, setReuseLoadingId] = useState(null)
  const [reuseMessageById, setReuseMessageById] = useState({})

  useEffect(() => {
    const loadPrograms = async () => {
      setIsLoading(true)
      setErrorMessage("")

      try {
        const response = await axios.get(API_URL, buildRequestConfig())
        setPrograms(normalizeProgramsPayload(response?.data))
      } catch (error) {
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          setErrorMessage("Please log in to load training programs.")
        } else {
          const message = error?.response?.data?.detail || "Unable to load programs. Please try again."
          setErrorMessage(message)
        }
        setPrograms([])
      } finally {
        setIsLoading(false)
      }
    }

    loadPrograms()
  }, [])

  const difficulties = useMemo(
    () => {
      const fromPrograms = programs.map((p) => p?.difficulty).filter(Boolean)
      return [...new Set([...DEFAULT_DIFFICULTIES, ...fromPrograms])].sort()
    },
    [programs],
  )
  const categories = useMemo(
    () => [...new Set(programs.map((p) => p?.category).filter(Boolean))].sort(),
    [programs],
  )
  const goals = useMemo(
    () => [...new Set(programs.map((p) => p?.goal).filter(Boolean))].sort(),
    [programs],
  )

  const filteredAndSortedPrograms = useMemo(() => {
    let result = [...programs]

    if (searchName.trim()) {
      const query = searchName.trim().toLowerCase()
      result = result.filter(
        (p) =>
          String(p?.name || "").toLowerCase().includes(query) ||
          String(p?.description || "").toLowerCase().includes(query),
      )
    }

    if (filters.difficulty) {
      result = result.filter((p) => p.difficulty === filters.difficulty)
    }
    if (filters.category) {
      result = result.filter((p) => p.category === filters.category)
    }
    if (filters.goal) {
      result = result.filter((p) => p.goal === filters.goal)
    }

    result.sort((a, b) => {
      const cmp = String(a?.name || "").localeCompare(String(b?.name || ""))
      return sortOrder === "asc" ? cmp : -cmp
    })

    return result
  }, [programs, searchName, sortOrder, filters])

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedPrograms.length / PROGRAMS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedPrograms = filteredAndSortedPrograms.slice(
    (safePage - 1) * PROGRAMS_PER_PAGE,
    safePage * PROGRAMS_PER_PAGE,
  )

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setCurrentPage(1)
  }

  const handleSearchChange = (event) => {
    setSearchName(event.target.value)
    setCurrentPage(1)
  }

  const handleSortChange = (event) => {
    setSortOrder(event.target.value)
    setCurrentPage(1)
  }

  const handleClearFilters = () => {
    setSearchName("")
    setSortOrder("asc")
    setFilters({ difficulty: "", category: "", goal: "" })
    setCurrentPage(1)
  }

  const handleOpenCreateModal = () => {
    setCreateFormValues(EMPTY_PROGRAM_FORM_VALUES)
    setCreateFieldErrors({})
    setCreateErrorMessage("")
    setIsCreateModalOpen(true)
  }

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false)
  }

  const handleCreateFieldChange = (event) => {
    const { name, type, checked, value } = event.target
    const nextValue = type === "checkbox" ? checked : value

    setCreateFormValues((prev) => ({ ...prev, [name]: nextValue }))
    setCreateFieldErrors((prev) => ({ ...prev, [name]: "" }))
  }

  const validateCreateForm = () => {
    const nextErrors = {}

    if (!createFormValues.name.trim()) {
      nextErrors.name = "Program name is required."
    }
    if (!createFormValues.description.trim()) {
      nextErrors.description = "Description is required."
    }
    if (!createFormValues.difficulty) {
      nextErrors.difficulty = "Difficulty is required."
    }
    if (!createFormValues.category.trim()) {
      nextErrors.category = "Category is required."
    }
    if (!createFormValues.goal.trim()) {
      nextErrors.goal = "Goal is required."
    }

    const durationValue = Number(createFormValues.duration_weeks)
    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      nextErrors.duration_weeks = "Duration must be greater than 0."
    }

    return nextErrors
  }

  const handleCreateProgram = async (event) => {
    event.preventDefault()
    setCreateErrorMessage("")

    const nextErrors = validateCreateForm()
    if (Object.keys(nextErrors).length > 0) {
      setCreateFieldErrors(nextErrors)
      return
    }

    setIsCreateSubmitting(true)
    try {
      const payload = {
        name: createFormValues.name.trim(),
        description: createFormValues.description.trim(),
        difficulty: createFormValues.difficulty,
        duration_weeks: Number(createFormValues.duration_weeks),
        category: createFormValues.category.trim(),
        goal: createFormValues.goal.trim(),
        is_public: Boolean(createFormValues.is_public),
      }

      const response = await axios.post(API_URL, payload, buildRequestConfig())
      const createdProgram = normalizeProgramDetailPayload(response?.data)

      if (createdProgram && createdProgram.id) {
        setPrograms((prev) => [createdProgram, ...prev])
      }

      setIsCreateModalOpen(false)
      setCreateFormValues(EMPTY_PROGRAM_FORM_VALUES)
      setCreateFieldErrors({})
    } catch (error) {
      const fieldErrors = {}
      const responseData = error?.response?.data
      if (responseData && typeof responseData === "object") {
        const knownFields = ["name", "description", "difficulty", "duration_weeks", "category", "goal", "is_public"]
        for (const fieldName of knownFields) {
          const rawValue = responseData[fieldName]
          if (!rawValue) {
            continue
          }
          fieldErrors[fieldName] = Array.isArray(rawValue) ? rawValue.join(" ") : String(rawValue)
        }
      }

      setCreateFieldErrors(fieldErrors)
      setCreateErrorMessage(error?.response?.data?.detail || "Unable to create program. Please review your inputs.")
    } finally {
      setIsCreateSubmitting(false)
    }
  }

  const handleViewDetails = async (programId) => {
    if (selectedProgramId === programId) {
      setSelectedProgramId(null)
      return
    }

    setSelectedProgramId(programId)
    if (programDetailsById[programId]) {
      return
    }

    setDetailLoadingId(programId)
    setDetailErrorById((prev) => ({ ...prev, [programId]: "" }))

    try {
      const response = await axios.get(`${API_URL}${programId}/`, buildRequestConfig())
      const detail = normalizeProgramDetailPayload(response?.data)
      if (!detail) {
        throw new Error("No detail payload")
      }
      setProgramDetailsById((prev) => ({ ...prev, [programId]: detail }))
    } catch (error) {
      const message = error?.response?.data?.detail || "Unable to load program details."
      setDetailErrorById((prev) => ({ ...prev, [programId]: message }))
    } finally {
      setDetailLoadingId(null)
    }
  }

  const handleReuseProgram = async (programId) => {
    setReuseLoadingId(programId)
    setReuseMessageById((prev) => ({ ...prev, [programId]: "" }))

    try {
      const response = await axios.post(`${API_URL}${programId}/reuse/`, {}, buildRequestConfig())
      const message = response?.data?.detail || "Program reused successfully."
      setReuseMessageById((prev) => ({ ...prev, [programId]: message }))
    } catch (error) {
      const message = error?.response?.data?.detail || "Unable to reuse this program."
      setReuseMessageById((prev) => ({ ...prev, [programId]: message }))
    } finally {
      setReuseLoadingId(null)
    }
  }

  const getDifficultyClass = (difficulty) => {
    if (difficulty === "Beginner") return "programs-badge programs-badge-beginner"
    if (difficulty === "Intermediate") return "programs-badge programs-badge-intermediate"
    if (difficulty === "Advanced") return "programs-badge programs-badge-advanced"
    return "programs-badge"
  }

  return (
    <main className="programs-page" aria-label="Training Programs">
      <header className="programs-top-bar">
        <div className="programs-top-actions">
          <button type="button" className="programs-new-btn" onClick={handleOpenCreateModal}>
            New Program
          </button>
        </div>
        <div className="programs-search-area">
          <label className="programs-field-label" htmlFor="program-search">
            Search Programs
          </label>
          <input
            id="program-search"
            type="text"
            className="programs-search-input"
            value={searchName}
            onChange={handleSearchChange}
            placeholder="Search by name or description..."
          />
        </div>
        <div className="programs-sort-area">
          <label className="programs-field-label" htmlFor="program-sort">
            Sort
          </label>
          <select
            id="program-sort"
            className="programs-sort-select"
            value={sortOrder}
            onChange={handleSortChange}
          >
            <option value="asc">Name (A–Z)</option>
            <option value="desc">Name (Z–A)</option>
          </select>
        </div>
      </header>

      <div className="programs-shell">
        <aside className="programs-filter-panel" aria-label="Program Filters">
          <div className="programs-filter-header">
            <h2>Filters</h2>
            <button type="button" className="programs-clear-btn" onClick={handleClearFilters}>
              Clear
            </button>
          </div>

          <div className="programs-filter-group">
            <span className="programs-filter-label">Difficulty</span>
            <div className="programs-filter-radios">
              <label className="programs-radio-label">
                <input
                  type="radio"
                  name="difficulty"
                  value=""
                  checked={filters.difficulty === ""}
                  onChange={() => handleFilterChange("difficulty", "")}
                />
                All
              </label>
              {difficulties.map((d) => (
                <label key={d} className="programs-radio-label">
                  <input
                    type="radio"
                    name="difficulty"
                    value={d}
                    checked={filters.difficulty === d}
                    onChange={() => handleFilterChange("difficulty", d)}
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>

          <div className="programs-filter-group">
            <label className="programs-filter-label" htmlFor="filter-category">
              Category
            </label>
            <select
              id="filter-category"
              className="programs-filter-select"
              value={filters.category}
              onChange={(e) => handleFilterChange("category", e.target.value)}
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="programs-filter-group">
            <label className="programs-filter-label" htmlFor="filter-goal">
              Goal
            </label>
            <select
              id="filter-goal"
              className="programs-filter-select"
              value={filters.goal}
              onChange={(e) => handleFilterChange("goal", e.target.value)}
            >
              <option value="">All</option>
              {goals.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <p className="programs-results-count" aria-live="polite">
            {filteredAndSortedPrograms.length} program{filteredAndSortedPrograms.length !== 1 ? "s" : ""} found
          </p>
        </aside>

        <section className="programs-main">
          {isLoading ? (
            <p className="programs-empty" role="status">
              Loading programs...
            </p>
          ) : errorMessage ? (
            <p className="programs-empty" role="alert">
              {errorMessage}
            </p>
          ) : pagedPrograms.length === 0 ? (
            <p className="programs-empty" role="status">
              No programs match your filters.
            </p>
          ) : (
            <div className="programs-grid">
              {pagedPrograms.map((program) => (
                <article key={program.id} className="programs-card">
                  <div className="programs-card-header">
                    <h3 className="programs-card-title">{program.name}</h3>
                    <span className={getDifficultyClass(program.difficulty)}>{program.difficulty}</span>
                  </div>
                  <p className="programs-card-description">{program.description}</p>
                  <div className="programs-card-tags">
                    <span className="programs-card-tag">{program.category}</span>
                    <span className="programs-card-tag">{program.goal}</span>
                    <span className="programs-card-tag">{program.duration_weeks ?? "?"} weeks</span>
                  </div>
                  <p className="programs-card-creator">By {program.created_by_username || program.created_by || "Unknown"}</p>

                  <div className="programs-card-actions">
                    <button
                      type="button"
                      className="programs-card-action-btn"
                      onClick={() => handleViewDetails(program.id)}
                      disabled={detailLoadingId === program.id}
                    >
                      {detailLoadingId === program.id
                        ? "Loading..."
                        : selectedProgramId === program.id
                          ? "Hide Details"
                          : "View Details"}
                    </button>
                    <button
                      type="button"
                      className="programs-card-action-btn programs-card-action-btn-primary"
                      onClick={() => handleReuseProgram(program.id)}
                      disabled={reuseLoadingId === program.id}
                    >
                      {reuseLoadingId === program.id ? "Reusing..." : "Reuse Program"}
                    </button>
                  </div>

                  {reuseMessageById[program.id] ? (
                    <p className="programs-card-feedback" role="status">{reuseMessageById[program.id]}</p>
                  ) : null}

                  {selectedProgramId === program.id ? (
                    <section className="programs-card-detail" aria-label={`Details for ${program.name}`}>
                      {detailErrorById[program.id] ? (
                        <p className="programs-card-feedback" role="alert">{detailErrorById[program.id]}</p>
                      ) : (
                        <>
                          <p className="programs-card-detail-line">
                            <strong>Updated:</strong> {formatTimestamp(programDetailsById[program.id]?.updated_at) || "N/A"}
                          </p>
                          <p className="programs-card-detail-line">
                            <strong>Visibility:</strong> {programDetailsById[program.id]?.is_public ? "Public" : "Private"}
                          </p>
                          <p className="programs-card-detail-line">
                            <strong>Exercises:</strong> {Array.isArray(programDetailsById[program.id]?.exercises) ? programDetailsById[program.id].exercises.length : "N/A"}
                          </p>
                        </>
                      )}
                    </section>
                  ) : null}
                </article>
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <nav className="programs-pagination" aria-label="Program pages">
              <button
                type="button"
                className="programs-page-btn"
                onClick={() => setCurrentPage((p) => p - 1)}
                disabled={safePage === 1}
                aria-label="Previous page"
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`programs-page-btn${page === safePage ? " programs-page-btn-active" : ""}`}
                  onClick={() => setCurrentPage(page)}
                  aria-label={`Page ${page}`}
                  aria-current={page === safePage ? "page" : undefined}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                className="programs-page-btn"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={safePage === totalPages}
                aria-label="Next page"
              >
                ›
              </button>
            </nav>
          ) : null}
        </section>
      </div>

      {isCreateModalOpen ? (
        <div className="programs-modal-backdrop" role="presentation" onClick={handleCloseCreateModal}>
          <aside
            className="programs-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="programs-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="programs-modal-header">
              <h2 id="programs-modal-title">Create New Program</h2>
              <button type="button" className="programs-modal-secondary-btn" onClick={handleCloseCreateModal}>
                Close
              </button>
            </header>

            <form className="programs-modal-form" onSubmit={handleCreateProgram}>
              {createErrorMessage ? (
                <p className="programs-modal-error" role="alert">{createErrorMessage}</p>
              ) : null}

              <label className="programs-modal-field">
                <span>Name</span>
                <input
                  type="text"
                  name="name"
                  value={createFormValues.name}
                  onChange={handleCreateFieldChange}
                  placeholder="Program name"
                  required
                />
                {createFieldErrors.name ? <small className="programs-modal-error">{createFieldErrors.name}</small> : null}
              </label>

              <label className="programs-modal-field">
                <span>Description</span>
                <textarea
                  name="description"
                  value={createFormValues.description}
                  onChange={handleCreateFieldChange}
                  placeholder="What this program is for"
                  rows={3}
                  required
                />
                {createFieldErrors.description ? <small className="programs-modal-error">{createFieldErrors.description}</small> : null}
              </label>

              <div className="programs-modal-grid">
                <label className="programs-modal-field">
                  <span>Difficulty</span>
                  <select
                    name="difficulty"
                    value={createFormValues.difficulty}
                    onChange={handleCreateFieldChange}
                    required
                  >
                    <option value="">Select difficulty</option>
                    {difficulties.map((difficulty) => (
                      <option key={difficulty} value={difficulty}>
                        {difficulty}
                      </option>
                    ))}
                  </select>
                  {createFieldErrors.difficulty ? <small className="programs-modal-error">{createFieldErrors.difficulty}</small> : null}
                </label>

                <label className="programs-modal-field">
                  <span>Duration (weeks)</span>
                  <input
                    type="number"
                    min={1}
                    name="duration_weeks"
                    value={createFormValues.duration_weeks}
                    onChange={handleCreateFieldChange}
                    placeholder="8"
                    required
                  />
                  {createFieldErrors.duration_weeks ? <small className="programs-modal-error">{createFieldErrors.duration_weeks}</small> : null}
                </label>

                <label className="programs-modal-field">
                  <span>Category</span>
                  <input
                    type="text"
                    name="category"
                    value={createFormValues.category}
                    onChange={handleCreateFieldChange}
                    placeholder="Strength"
                    required
                  />
                  {createFieldErrors.category ? <small className="programs-modal-error">{createFieldErrors.category}</small> : null}
                </label>

                <label className="programs-modal-field">
                  <span>Goal</span>
                  <input
                    type="text"
                    name="goal"
                    value={createFormValues.goal}
                    onChange={handleCreateFieldChange}
                    placeholder="General Fitness"
                    required
                  />
                  {createFieldErrors.goal ? <small className="programs-modal-error">{createFieldErrors.goal}</small> : null}
                </label>
              </div>

              <label className="programs-modal-checkbox">
                <input
                  type="checkbox"
                  name="is_public"
                  checked={createFormValues.is_public}
                  onChange={handleCreateFieldChange}
                />
                Public program
              </label>

              <div className="programs-modal-actions">
                <button type="button" className="programs-modal-secondary-btn" onClick={handleCloseCreateModal}>
                  Cancel
                </button>
                <button type="submit" className="programs-modal-primary-btn" disabled={isCreateSubmitting}>
                  {isCreateSubmitting ? "Creating..." : "Create Program"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </main>
  )
}

export default Programs
