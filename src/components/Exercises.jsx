import "../CSS/exercises.css"
import axios from "axios"
import { useCallback, useEffect, useMemo, useState } from "react"

const API_URL = "http://127.0.0.1:8000/api/wodtrackr/exercises/"
const CHOICES_CACHE_KEY = "wodtrackrExerciseChoices"
const CHOICES_CACHE_TTL_MS = 1000 * 60 * 60 * 12

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

const getCurrentUsername = () => {
  try {
    const rawValue = localStorage.getItem("wodtrackrUser")
    const userData = rawValue ? JSON.parse(rawValue) : null
    return userData?.username || ""
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
    is_public: "",
    mine: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [nextUrl, setNextUrl] = useState(null)
  const [isChoicesLoading, setIsChoicesLoading] = useState(false)
  const [choicesError, setChoicesError] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categoryChoices, setCategoryChoices] = useState([])
  const [equipmentChoices, setEquipmentChoices] = useState([])
  const [muscleChoices, setMuscleChoices] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [selectedExercise, setSelectedExercise] = useState(null)
  const [formValues, setFormValues] = useState({
    name: "",
    description: "",
    category: "",
    equipment: "",
    primary_muscle_group: "",
    created_by: getCurrentUsername(),
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
      setNextUrl(null)

      try {
        const response = await axios.get(API_URL, {
          ...buildRequestConfig(),
          params: {
            ...(searchName ? { search: searchName } : {}),
            ordering,
            ...(filters.category ? { category: filters.category } : {}),
            ...(filters.equipment ? { equipment: filters.equipment } : {}),
            ...(filters.muscle ? { muscle: filters.muscle } : {}),
            ...(filters.is_public ? { is_public: filters.is_public } : {}),
            ...(filters.mine ? { mine: filters.mine } : {}),
          },
        })
        const data = response?.data
        const results = Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
          ? data
          : []
        setExercises(results)
        setTotalCount(data?.count ?? results.length)
        setNextUrl(data?.next ?? null)
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

  const handleLoadMore = async () => {
    if (!nextUrl || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const response = await axios.get(nextUrl, buildRequestConfig())
      const data = response?.data
      const results = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.data)
        ? data.data
        : []
      setExercises((prev) => [...prev, ...results])
      setNextUrl(data?.next ?? null)
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        "Unable to load more exercises. Please try again."
      setErrorMessage(message)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const loadChoices = useCallback(async () => {
    setIsChoicesLoading(true)
    setChoicesError("")

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
      const response = await axios.get(`${API_URL}choices/`, buildRequestConfig())

      if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
        setChoicesError("Could not load dropdown options (category, equipment, muscle). This is often caused by CORS middleware intercepting the OPTIONS request before it reaches DRF. Check your backend CORS configuration.")
        return
      }

      const category = getChoicesFromMetadata(response?.data, ["category"])
      const equipment = getChoicesFromMetadata(response?.data, ["equipment"])
      const muscle = getChoicesFromMetadata(response?.data, ["primary_muscle_group", "muscle"])

      if (category.length === 0 && equipment.length === 0 && muscle.length === 0) {
        setChoicesError("Dropdown options (category, equipment, muscle) could not be loaded from the API. Ensure the OPTIONS endpoint returns DRF field metadata with choices.")
        return
      }

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
        setChoicesError("Please log in to load filter options.")
        return
      }
      const message =
        error?.response?.data?.detail ||
        "Unable to load filter options. Please try again."
      setChoicesError(message)
    } finally {
      setIsChoicesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadChoices()
  }, [loadChoices])

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    setFormValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }))
  }

  const handleOpenEdit = () => {
    setFormValues({
      name: selectedExercise.name || "",
      description: selectedExercise.description || "",
      category: selectedExercise.category || "",
      equipment: selectedExercise.equipment || "",
      primary_muscle_group: selectedExercise.primary_muscle_group || "",
      created_by: selectedExercise.created_by || "",
      is_public: selectedExercise.is_public ?? false,
    })
    setIsEditMode(true)
    setIsModalOpen(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage("")
    setSuccessMessage("")
    setFieldErrors({})

    const payload = {
      name: formValues.name,
      description: formValues.description,
      category: formValues.category,
      equipment: formValues.equipment,
      primary_muscle_group: formValues.primary_muscle_group,
      created_by: formValues.created_by,
      is_public: formValues.is_public,
    }
    const successMsg = isEditMode ? "Exercise updated successfully." : "Exercise added successfully."

    try {
      let response
      if (isEditMode && selectedExercise?.id) {
        response = await axios.put(
          `${API_URL}${selectedExercise.id}/`,
          payload,
          buildRequestConfig(),
        )
        if (response?.data?.data) {
          setExercises((prev) =>
            prev.map((ex) => (ex.id === selectedExercise.id ? response.data.data : ex))
          )
          setSelectedExercise(response.data.data)
        }
      } else {
        response = await axios.post(API_URL, payload, buildRequestConfig())
        if (response?.data?.data) {
          setExercises((prev) => [response.data.data, ...prev])
        }
      }

      setFormValues({
        name: "",
        description: "",
        category: "",
        equipment: "",
        primary_muscle_group: "",
        created_by: getCurrentUsername(),
        is_public: false,
      })
      setIsModalOpen(false)
      setIsEditMode(false)
      setSuccessMessage(successMsg)
    } catch (error) {
      const extractedFieldErrors = getFieldErrorsFromResponse(error?.response?.data)
      if (Object.keys(extractedFieldErrors).length > 0) {
        setFieldErrors(extractedFieldErrors)
      }

      if (error?.response?.status === 401 || error?.response?.status === 403) {
        setErrorMessage("Please log in to save exercises.")
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
      is_public: "",
      mine: "",
    })
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setIsEditMode(false)
    setErrorMessage("")
    setSuccessMessage("")
    setFieldErrors({})
    setFormValues({
      name: "",
      description: "",
      category: "",
      equipment: "",
      primary_muscle_group: "",
      created_by: getCurrentUsername(),
      is_public: false,
    })
  }

  const filteredExercises = exercises

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
            <div className="exercise-panel-header-row">
              <h1>Exercise Library</h1>
              <button
                type="button"
                className="exercise-primary-btn"
                onClick={() => setIsModalOpen(true)}
              >
                + Add Exercise
              </button>
            </div>
            <p>Search and review your exercise list.</p>
            <div className="exercise-counts">
              <span>{totalCount} total</span>
              <span>{exercises.length} shown</span>
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

            <label className="exercise-field">
              <span>Visibility</span>
              <select
                name="is_public"
                value={filters.is_public}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, is_public: event.target.value }))
                }
              >
                <option value="">All</option>
                <option value="true">Public only</option>
                <option value="false">Private only</option>
              </select>
            </label>

            <label className="exercise-field">
              <span>Ownership</span>
              <select
                name="mine"
                value={filters.mine}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, mine: event.target.value }))
                }
              >
                <option value="">All</option>
                <option value="true">Mine</option>
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
            {choicesError ? (
              <button type="button" className="exercise-secondary-btn" onClick={loadChoices} disabled={isChoicesLoading}>
                {isChoicesLoading ? "Retrying..." : "Retry Filters"}
              </button>
            ) : null}
          </div>

          {choicesError ? <p className="exercise-choices-error">{choicesError}</p> : null}

          {successMessage ? <p className="exercise-success">{successMessage}</p> : null}
          {errorMessage ? <p className="exercise-error">{errorMessage}</p> : null}

          <div className="exercise-list">
            {isLoading ? (
              <p className="exercise-empty">Loading exercises...</p>
            ) : filteredExercises.length === 0 ? (
              <p className="exercise-empty">No exercises found.</p>
            ) : (
              filteredExercises.map((exercise, index) => (
                <article
                  className={`exercise-item${selectedExercise?.id === exercise.id ? " exercise-item-selected" : ""}`}
                  key={exercise.id ?? index}
                  onClick={() => setSelectedExercise(exercise)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedExercise(exercise)}
                >
                  <div className="exercise-header">
                    <h3>{exercise.name}</h3>
                    <span>{categoryLookup[exercise.category] || exercise.category}</span>
                  </div>
                  <p className="exercise-meta">
                    {equipmentLookup[exercise.equipment] || exercise.equipment} · {exercise.primary_muscle_group}
                  </p>
                  <p className="exercise-meta">
                    Created by {exercise.created_by_username || exercise.created_by || "Unknown"} · {exercise.is_public ? "Public" : "Private"}
                  </p>
                  <p className="exercise-meta">
                    Created {formatTimestamp(exercise.created_at)} · Updated {formatTimestamp(exercise.updated_at)}
                  </p>
                </article>
              ))
            )}
          </div>

          {nextUrl ? (
            <div className="exercise-load-more">
              <button
                type="button"
                className="exercise-secondary-btn"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : `Load more (${exercises.length} of ${totalCount})`}
              </button>
            </div>
          ) : null}
        </section>

        <aside className="exercise-detail-panel">
          {selectedExercise ? (
            <>
              <header className="exercise-panel-header">
                <div className="exercise-detail-header-row">
                  <div>
                    <h2>{selectedExercise.name}</h2>
                    <span className="exercise-detail-badge">
                      {categoryLookup[selectedExercise.category] || selectedExercise.category}
                    </span>
                  </div>
                  {selectedExercise.created_by_username && selectedExercise.created_by_username === getCurrentUsername() ? (
                    <button
                      type="button"
                      className="exercise-secondary-btn"
                      onClick={handleOpenEdit}
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
              </header>
              <dl className="exercise-detail-list">
                {selectedExercise.description ? (
                  <div className="exercise-detail-row exercise-detail-row-full">
                    <dt>Description</dt>
                    <dd>{selectedExercise.description}</dd>
                  </div>
                ) : null}
                <div className="exercise-detail-row">
                  <dt>Equipment</dt>
                  <dd>{equipmentLookup[selectedExercise.equipment] || selectedExercise.equipment || "—"}</dd>
                </div>
                <div className="exercise-detail-row">
                  <dt>Muscle Group</dt>
                  <dd>{selectedExercise.primary_muscle_group || "—"}</dd>
                </div>
                <div className="exercise-detail-row">
                  <dt>Created By</dt>
                  <dd>{selectedExercise.created_by_username || selectedExercise.created_by || "Unknown"}</dd>
                </div>
                <div className="exercise-detail-row">
                  <dt>Visibility</dt>
                  <dd>{selectedExercise.is_public ? "Public" : "Private"}</dd>
                </div>
                <div className="exercise-detail-row">
                  <dt>Created</dt>
                  <dd>{formatTimestamp(selectedExercise.created_at)}</dd>
                </div>
                <div className="exercise-detail-row">
                  <dt>Updated</dt>
                  <dd>{formatTimestamp(selectedExercise.updated_at)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="exercise-detail-empty">
              <p>Select an exercise from the list to view its details.</p>
            </div>
          )}
        </aside>
      </section>

      {isModalOpen ? (
        <div
          className="exercise-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) handleModalClose()
          }}
        >
          <div className="exercise-modal" role="dialog" aria-modal="true" aria-labelledby="exercise-modal-title">
            <div className="exercise-modal-header">
              <div>
                <h2 id="exercise-modal-title">{isEditMode ? "Edit Exercise" : "Add Exercise"}</h2>
                <p>{isEditMode ? "Update the exercise details below." : "Create a new exercise in your library."}</p>
              </div>
              <button
                type="button"
                className="exercise-modal-close"
                onClick={handleModalClose}
                aria-label="Close exercise form"
              >
                ✕
              </button>
            </div>
            <form className="exercise-form" onSubmit={handleSubmit}>
              {errorMessage ? <p className="exercise-error">{errorMessage}</p> : null}
              {choicesError ? (
                <div className="exercise-choices-warning">
                  <p>{choicesError}</p>
                  <button type="button" className="exercise-secondary-btn" onClick={loadChoices} disabled={isChoicesLoading}>
                    {isChoicesLoading ? "Retrying..." : "Retry"}
                  </button>
                </div>
              ) : null}
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
                  readOnly
                  className="exercise-field-readonly"
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
                {isSubmitting ? "Saving..." : isEditMode ? "Save Changes" : "Add Exercise"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default Exercises
