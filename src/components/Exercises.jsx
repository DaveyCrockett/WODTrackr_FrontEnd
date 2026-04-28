import "../CSS/exercises.css"
import axios from "axios"
import { useEffect, useMemo, useState } from "react"

const API_URL = "http://127.0.0.1:8000/api/wodtrackr/exercises/"
const CHOICES_CACHE_KEY = "wodtrackrExerciseChoices"
const CHOICES_CACHE_TTL_MS = 1000 * 60 * 60 * 12
const PAGE_SIZE = 12

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

const normalizeChoices = (choices) => {
  if (choices && typeof choices === "object" && !Array.isArray(choices)) {
    return Object.entries(choices)
      .map(([value, label]) => ({
        value,
        label: String(label),
      }))
      .filter((choice) => choice.value !== "" && choice.value !== null && choice.value !== undefined)
  }

  if (!Array.isArray(choices)) {
    return []
  }

  return choices
    .map((choice) => {
      if (Array.isArray(choice)) {
        const [value, label] = choice
        return {
          value: value ?? "",
          label: label ?? String(value ?? ""),
        }
      }

      if (choice && typeof choice === "object") {
        const value = choice.value ?? choice.id ?? choice.key ?? ""
        const label =
          choice.label ??
          choice.display_name ??
          choice.displayName ??
          choice.name ??
          String(value)

        return {
          value,
          label,
        }
      }

      return {
        value: choice,
        label: String(choice),
      }
    })
    .filter((choice) => choice.value !== "" && choice.value !== null && choice.value !== undefined)
}

const extractChoicesFromFieldConfig = (fieldConfig) => {
  if (!fieldConfig) {
    return []
  }

  const directChoices = normalizeChoices(fieldConfig?.choices)
  if (directChoices.length > 0) {
    return directChoices
  }

  const childChoices = normalizeChoices(fieldConfig?.child?.choices)
  if (childChoices.length > 0) {
    return childChoices
  }

  return []
}

const getChoicesFromMetadata = (metadata, fieldNames) => {
  if (!metadata || typeof metadata !== "object") {
    return []
  }

  const visited = new Set()
  const queue = [metadata]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || typeof current !== "object") {
      continue
    }

    if (visited.has(current)) {
      continue
    }
    visited.add(current)

    for (const fieldName of fieldNames) {
      const candidate = current?.[fieldName]

      if (Array.isArray(candidate)) {
        const mapped = normalizeChoices(candidate)
        if (mapped.length > 0) {
          return mapped
        }
      }

      const mapped = extractChoicesFromFieldConfig(candidate)
      if (mapped.length > 0) {
        return mapped
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        queue.push(value)
      }
    }
  }

  return []
}

const formatTimestamp = (value) => {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

const getFieldErrorsFromResponse = (data) => {
  if (!data || typeof data !== "object") {
    return {}
  }

  const possibleFields = ["name", "description", "category", "equipment", "primary_muscle_group", "created_by", "is_public"]
  return possibleFields.reduce((accumulator, fieldName) => {
    const rawValue = data[fieldName]
    if (!rawValue) {
      return accumulator
    }

    accumulator[fieldName] = Array.isArray(rawValue) ? rawValue.join(" ") : String(rawValue)
    return accumulator
  }, {})
}

function Exercises() {
  const [exercises, setExercises] = useState([])
  const [searchName, setSearchName] = useState("")
  const [ordering, setOrdering] = useState("name")
  const [filters, setFilters] = useState({
    category: "",
    equipment: "",
    muscle: "",
  })
  const [selectedExerciseId, setSelectedExerciseId] = useState(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isChoicesLoading, setIsChoicesLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categoryChoices, setCategoryChoices] = useState([])
  const [equipmentChoices, setEquipmentChoices] = useState([])
  const [muscleChoices, setMuscleChoices] = useState([])
  const [formValues, setFormValues] = useState({
    name: "",
    description: "",
    category: "",
    equipment: "",
    primary_muscle_group: "",
    created_by: "",
    is_public: false,
  })

  useEffect(() => {
    if (!successMessage) {
      return undefined
    }

    const timer = setTimeout(() => {
      setSuccessMessage("")
    }, 3000)

    return () => clearTimeout(timer)
  }, [successMessage])

  useEffect(() => {
    const loadExercises = async () => {
      setIsLoading(true)
      setErrorMessage("")
      setSuccessMessage("")
      setVisibleCount(PAGE_SIZE)

      try {
        const response = await axios.get(API_URL, {
          ...buildRequestConfig(),
          params: {
            ...(searchName ? { search: searchName } : {}),
            ordering,
            ...(filters.category ? { category: filters.category } : {}),
            ...(filters.equipment ? { equipment: filters.equipment } : {}),
            ...(filters.muscle ? { muscle: filters.muscle } : {}),
          },
        })
        const payload = Array.isArray(response?.data?.data)
          ? response.data.data
          : []
        setExercises(payload)
      } catch (error) {
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          setErrorMessage("Please log in to load exercises and categories.")
          return
        }
        const message =
          error?.response?.data?.detail ||
          "Unable to load exercises. Please try again."
        setErrorMessage(message)
      } finally {
        setIsLoading(false)
      }
    }

    const timer = setTimeout(() => {
      loadExercises()
    }, 300)

    return () => clearTimeout(timer)
  }, [filters, ordering, searchName])

  useEffect(() => {
    const loadChoices = async () => {
      setIsChoicesLoading(true)
      setErrorMessage("")

      try {
        const cachedRawValue = localStorage.getItem(CHOICES_CACHE_KEY)
        if (cachedRawValue) {
          const parsedCache = JSON.parse(cachedRawValue)
          const isCacheFresh = Date.now() - (parsedCache?.cachedAt || 0) < CHOICES_CACHE_TTL_MS

          if (isCacheFresh && parsedCache?.categoryChoices?.length && parsedCache?.equipmentChoices?.length) {
            setCategoryChoices(parsedCache.categoryChoices)
            setEquipmentChoices(parsedCache.equipmentChoices)
            setMuscleChoices(parsedCache?.muscleChoices || [])
            setIsChoicesLoading(false)
            return
          }
        }
      } catch {
        localStorage.removeItem(CHOICES_CACHE_KEY)
      }

      try {
        const response = await axios.options(API_URL, buildRequestConfig())
        const category = getChoicesFromMetadata(response?.data, ["category"])
        const equipment = getChoicesFromMetadata(response?.data, ["equipment"])
        const muscle = getChoicesFromMetadata(response?.data, ["primary_muscle_group", "muscle"])

        setCategoryChoices(category)
        setEquipmentChoices(equipment)
        setMuscleChoices(muscle)
        localStorage.setItem(
          CHOICES_CACHE_KEY,
          JSON.stringify({
            categoryChoices: category,
            equipmentChoices: equipment,
            muscleChoices: muscle,
            cachedAt: Date.now(),
          }),
        )
      } catch (error) {
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          setErrorMessage("Please log in to load exercises and categories.")
          return
        }
        const message =
          error?.response?.data?.detail ||
          "Unable to load choices. Please refresh and try again."
        setErrorMessage(message)
      } finally {
        setIsChoicesLoading(false)
      }
    }

    loadChoices()
  }, [])

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
    setSuccessMessage("")
    setFieldErrors({})

    try {
      const response = await axios.post(
        API_URL,
        {
          name: formValues.name,
          description: formValues.description,
          category: formValues.category,
          equipment: formValues.equipment,
          primary_muscle_group: formValues.primary_muscle_group,
          created_by: formValues.created_by,
          is_public: formValues.is_public,
        },
        buildRequestConfig(),
      )

      if (response?.data?.data) {
        setExercises((prev) => [response.data.data, ...prev])
      }

      setFormValues({
        name: "",
        description: "",
        category: "",
        equipment: "",
        primary_muscle_group: "",
        created_by: "",
        is_public: false,
      })
      setSuccessMessage("Exercise added successfully.")
      setIsAddModalOpen(false)
    } catch (error) {
      const extractedFieldErrors = getFieldErrorsFromResponse(error?.response?.data)
      if (Object.keys(extractedFieldErrors).length > 0) {
        setFieldErrors(extractedFieldErrors)
      }

      if (error?.response?.status === 401 || error?.response?.status === 403) {
        setErrorMessage("Please log in before adding exercises.")
        return
      }
      const message =
        error?.response?.data?.detail ||
        "Unable to save exercise. Please check your inputs."
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClearFilters = () => {
    setSearchName("")
    setOrdering("name")
    setFilters({
      category: "",
      equipment: "",
      muscle: "",
    })
    setVisibleCount(PAGE_SIZE)
  }

  const handleOpenAddModal = () => {
    setErrorMessage("")
    setFieldErrors({})
    setSuccessMessage("")
    setIsAddModalOpen(true)
  }

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false)
  }

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + PAGE_SIZE)
  }

  const filteredExercises = exercises
  const displayedExercises = filteredExercises.slice(0, visibleCount)
  const hasMoreExercises = filteredExercises.length > displayedExercises.length
  const selectedExercise = filteredExercises.find((exercise) => (exercise.id ?? null) === selectedExerciseId) || null

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [searchName, ordering, filters])

  useEffect(() => {
    if (filteredExercises.length === 0) {
      setSelectedExerciseId(null)
      return
    }

    const hasSelectedExercise = filteredExercises.some((exercise) => (exercise.id ?? null) === selectedExerciseId)
    if (!hasSelectedExercise) {
      const fallbackId = filteredExercises[0]?.id ?? null
      setSelectedExerciseId(fallbackId)
    }
  }, [filteredExercises, selectedExerciseId])

  const categoryLookup = useMemo(
    () => Object.fromEntries(categoryChoices.map((choice) => [choice.value, choice.label])),
    [categoryChoices]
  )
  const equipmentLookup = useMemo(
    () => Object.fromEntries(equipmentChoices.map((choice) => [choice.value, choice.label])),
    [equipmentChoices]
  )

  return (
    <main className="exercise-page">
      <section className="exercise-shell">
        <section className="exercise-library-panel">
          <header className="exercise-panel-header">
            <div className="exercise-panel-header-top">
              <div>
                <h1>Exercise Library</h1>
                <p>Search and review your exercise list.</p>
              </div>
              <div className="exercise-header-actions">
                <button type="button" className="exercise-primary-btn" onClick={handleOpenAddModal}>
                  Add Exercise
                </button>
              </div>
            </div>
            <div className="exercise-counts">
              <span>{exercises.length} total</span>
              <span>{displayedExercises.length} shown</span>
            </div>
          </header>

          <div className="exercise-search-grid">
            <label className="exercise-field exercise-field-wide">
              <span>Search by name</span>
              <input
                type="text"
                name="name"
                value={searchName}
                onChange={(event) => setSearchName(event.target.value)}
                placeholder="Back squat, pull-up, row"
              />
            </label>

            <label className="exercise-field">
              <span>Category</span>
              <select
                name="category"
                value={filters.category}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, category: event.target.value }))
                }
                disabled={isChoicesLoading}
              >
                <option value="">{isChoicesLoading ? "Loading..." : "All"}</option>
                {categoryChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="exercise-field">
              <span>Equipment</span>
              <select
                name="equipment"
                value={filters.equipment}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, equipment: event.target.value }))
                }
                disabled={isChoicesLoading}
              >
                <option value="">{isChoicesLoading ? "Loading..." : "All"}</option>
                {equipmentChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="exercise-field">
              <span>Muscle</span>
              <select
                name="muscle"
                value={filters.muscle}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, muscle: event.target.value }))
                }
                disabled={isChoicesLoading}
              >
                <option value="">{isChoicesLoading ? "Loading..." : "All"}</option>
                {muscleChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="exercise-field exercise-field-wide">
              <span>Sort by</span>
              <select
                name="ordering"
                value={ordering}
                onChange={(event) => setOrdering(event.target.value)}
              >
                <option value="name">Name (A-Z)</option>
                <option value="-name">Name (Z-A)</option>
                <option value="created_at">Created (oldest)</option>
                <option value="-created_at">Created (newest)</option>
                <option value="updated_at">Updated (oldest)</option>
                <option value="-updated_at">Updated (newest)</option>
              </select>
            </label>
          </div>

          <div className="exercise-search-actions">
            <button type="button" className="exercise-secondary-btn" onClick={handleClearFilters}>
              Clear Filters
            </button>
          </div>

          {errorMessage ? <p className="exercise-error">{errorMessage}</p> : null}

          <div className="exercise-list">
            {isLoading ? (
              <p className="exercise-empty">Loading exercises...</p>
            ) : filteredExercises.length === 0 ? (
              <p className="exercise-empty">No exercises found.</p>
            ) : (
              displayedExercises.map((exercise, index) => (
                <article
                  className={`exercise-item ${(exercise.id ?? null) === selectedExerciseId ? "exercise-item-selected" : ""}`}
                  key={exercise.id ?? index}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedExerciseId(exercise.id ?? null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setSelectedExerciseId(exercise.id ?? null)
                    }
                  }}
                >
                  <div className="exercise-header">
                    <h3>{exercise.name}</h3>
                    <span>{categoryLookup[exercise.category] || exercise.category}</span>
                  </div>
                  <p className="exercise-meta">
                    {equipmentLookup[exercise.equipment] || exercise.equipment} · {exercise.primary_muscle_group}
                  </p>
                  <p className="exercise-meta">
                    Created by {exercise.created_by || "Unknown"} · {exercise.is_public ? "Public" : "Private"}
                  </p>
                  <p className="exercise-meta">
                    Created {formatTimestamp(exercise.created_at)} · Updated {formatTimestamp(exercise.updated_at)}
                  </p>
                </article>
              ))
            )}
          </div>

          {!isLoading && hasMoreExercises ? (
            <div className="exercise-list-actions">
              <button type="button" className="exercise-secondary-btn" onClick={handleLoadMore}>
                Load More
              </button>
            </div>
          ) : null}
        </section>

        <aside className="exercise-form-panel">
          <header className="exercise-panel-header">
            <h2>Exercise Details</h2>
            <p>Select an exercise from the library to review details.</p>
          </header>

          {selectedExercise ? (
            <section className="exercise-details" aria-live="polite">
              <h3>{selectedExercise.name}</h3>
              <p className="exercise-meta">
                <strong>Category:</strong> {categoryLookup[selectedExercise.category] || selectedExercise.category || "N/A"}
              </p>
              <p className="exercise-meta">
                <strong>Equipment:</strong> {equipmentLookup[selectedExercise.equipment] || selectedExercise.equipment || "N/A"}
              </p>
              <p className="exercise-meta">
                <strong>Muscle:</strong> {selectedExercise.primary_muscle_group || "N/A"}
              </p>
              <p className="exercise-meta">
                <strong>Description:</strong> {selectedExercise.description || "No description provided."}
              </p>
              <p className="exercise-meta">
                <strong>Created by:</strong> {selectedExercise.created_by || "Unknown"}
              </p>
              <p className="exercise-meta">
                <strong>Visibility:</strong> {selectedExercise.is_public ? "Public" : "Private"}
              </p>
              <p className="exercise-meta">
                <strong>Created:</strong> {formatTimestamp(selectedExercise.created_at)}
              </p>
              <p className="exercise-meta">
                <strong>Updated:</strong> {formatTimestamp(selectedExercise.updated_at)}
              </p>
            </section>
          ) : (
            <p className="exercise-empty">No exercise selected.</p>
          )}
        </aside>
      </section>

      {isAddModalOpen ? (
        <div className="exercise-modal-backdrop" role="presentation" onClick={handleCloseAddModal}>
          <aside
            className="exercise-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exercise-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="exercise-modal-header">
              <div>
                <h2 id="exercise-modal-title">Add Exercise</h2>
                <p>Create a new exercise in your library.</p>
              </div>
              <button
                type="button"
                className="exercise-secondary-btn"
                onClick={handleCloseAddModal}
              >
                Close
              </button>
            </header>

            <form className="exercise-form" onSubmit={handleSubmit}>
              {successMessage ? <p className="exercise-success">{successMessage}</p> : null}
              {errorMessage ? <p className="exercise-error">{errorMessage}</p> : null}

              <label className="exercise-field">
                <span>Name</span>
                <input
                  type="text"
                  name="name"
                  value={formValues.name}
                  onChange={handleChange}
                  placeholder="Exercise name"
                  required
                />
                {fieldErrors.name ? <small className="exercise-field-error">{fieldErrors.name}</small> : null}
              </label>

              <label className="exercise-field">
                <span>Description</span>
                <input
                  type="text"
                  name="description"
                  value={formValues.description}
                  onChange={handleChange}
                  placeholder="Optional details"
                />
                {fieldErrors.description ? <small className="exercise-field-error">{fieldErrors.description}</small> : null}
              </label>

              <label className="exercise-field">
                <span>Category</span>
                <select
                  name="category"
                  value={formValues.category}
                  onChange={handleChange}
                  disabled={isChoicesLoading}
                  required
                >
                  <option value="">{isChoicesLoading ? "Loading categories..." : "Select category"}</option>
                  {categoryChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.category ? <small className="exercise-field-error">{fieldErrors.category}</small> : null}
              </label>

              <label className="exercise-field">
                <span>Equipment</span>
                <select
                  name="equipment"
                  value={formValues.equipment}
                  onChange={handleChange}
                  disabled={isChoicesLoading}
                  required
                >
                  <option value="">{isChoicesLoading ? "Loading equipment..." : "Select equipment"}</option>
                  {equipmentChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.equipment ? <small className="exercise-field-error">{fieldErrors.equipment}</small> : null}
              </label>

              <label className="exercise-field">
                <span>Created by</span>
                <input
                  type="text"
                  name="created_by"
                  value={formValues.created_by}
                  onChange={handleChange}
                  placeholder="Coach or athlete"
                />
                {fieldErrors.created_by ? <small className="exercise-field-error">{fieldErrors.created_by}</small> : null}
              </label>

              <label className="exercise-field">
                <span>Muscle</span>
                <select
                  name="primary_muscle_group"
                  value={formValues.primary_muscle_group}
                  onChange={handleChange}
                  disabled={isChoicesLoading}
                  required
                >
                  <option value="">{isChoicesLoading ? "Loading muscle groups..." : "Select muscle group"}</option>
                  {muscleChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.primary_muscle_group ? <small className="exercise-field-error">{fieldErrors.primary_muscle_group}</small> : null}
              </label>

              <label className="exercise-checkbox">
                <input
                  type="checkbox"
                  name="is_public"
                  checked={formValues.is_public}
                  onChange={handleChange}
                />
                Public exercise
              </label>
              {fieldErrors.is_public ? <small className="exercise-field-error">{fieldErrors.is_public}</small> : null}

              <button className="exercise-primary-btn" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Add Exercise"}
              </button>
            </form>
          </aside>
        </div>
      ) : null}
    </main>
  )
}

export default Exercises
