import "../CSS/login.css"
import axios from "axios"
import { useEffect, useMemo, useState } from "react"

const normalizeChoices = (choices) =>
  Array.isArray(choices)
    ? choices.map(([value, label]) => ({ value, label }))
    : []

const formatTimestamp = (value) => {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
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
  const [isChoicesLoading, setIsChoicesLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categoryChoices, setCategoryChoices] = useState([])
  const [equipmentChoices, setEquipmentChoices] = useState([])
  const [formValues, setFormValues] = useState({
    name: "",
    description: "",
    category: "",
    equipment: "",
    created_by: "",
    is_public: false,
  })

  useEffect(() => {
    const loadExercises = async () => {
      setIsLoading(true)
      setErrorMessage("")

      try {
        const response = await axios.get(
          "http://127.0.0.1:8000/api/wodtrackr/exercises/",
          {
            params: {
              ...(searchName ? { search: searchName } : {}),
              ordering,
              ...(filters.category ? { category: filters.category } : {}),
              ...(filters.equipment ? { equipment: filters.equipment } : {}),
              ...(filters.muscle ? { muscle: filters.muscle } : {}),
              ...(filters.is_public ? { is_public: filters.is_public } : {}),
              ...(filters.mine ? { mine: filters.mine } : {}),
            },
          }
        )
        const payload = Array.isArray(response?.data?.data)
          ? response.data.data
          : []
        setExercises(payload)
      } catch (error) {
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
        const response = await axios.options(
          "http://127.0.0.1:8000/api/wodtrackr/exercises/"
        )
        const postActions = response?.data?.actions?.POST ?? {}
        const category = normalizeChoices(postActions.category?.choices)
        const equipment = normalizeChoices(postActions.equipment?.choices)

        if (category.length === 0 || equipment.length === 0) {
          throw new Error("Choices missing in OPTIONS response")
        }

        setCategoryChoices(category)
        setEquipmentChoices(equipment)
      } catch (error) {
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

    try {
      const response = await axios.post(
        "http://127.0.0.1:8000/api/wodtrackr/exercises/",
        {
          name: formValues.name,
          description: formValues.description,
          category: formValues.category,
          equipment: formValues.equipment,
          created_by: formValues.created_by,
          is_public: formValues.is_public,
        }
      )

      if (response?.data?.data) {
        setExercises((prev) => [response.data.data, ...prev])
      }

      setFormValues({
        name: "",
        description: "",
        category: "",
        equipment: "",
        created_by: "",
        is_public: false,
      })
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        "Unable to save exercise. Please check your inputs."
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
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
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-hero">
          <p className="auth-eyebrow">WODTrackr</p>
          <h1>Exercises.</h1>
          <p className="auth-lede">
            Build your exercise library and search by category or equipment.
          </p>
          <div className="auth-stats">
            <div>
              <span className="stat-value">{exercises.length}</span>
              <span className="stat-label">Total exercises</span>
            </div>
            <div>
              <span className="stat-value">{filteredExercises.length}</span>
              <span className="stat-label">Results</span>
            </div>
          </div>
        </div>
        <div className="auth-form">
          <div>
            <h2>Exercise library</h2>
            <p className="auth-subtitle">Search, add, and review exercises.</p>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                name="name"
                value={searchName}
                onChange={(event) => setSearchName(event.target.value)}
                placeholder="Search by name"
              />
            </label>
            <label className="field">
              <span>Category</span>
              <select
                name="category"
                value={filters.category}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, category: event.target.value }))
                }
                disabled={isChoicesLoading || categoryChoices.length === 0}
              >
                <option value="">
                  {isChoicesLoading ? "Loading categories..." : "All categories"}
                </option>
                {categoryChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Equipment</span>
              <select
                name="equipment"
                value={filters.equipment}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, equipment: event.target.value }))
                }
                disabled={isChoicesLoading || equipmentChoices.length === 0}
              >
                <option value="">
                  {isChoicesLoading ? "Loading equipment..." : "All equipment"}
                </option>
                {equipmentChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Muscle</span>
              <input
                type="text"
                name="muscle"
                value={filters.muscle}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, muscle: event.target.value }))
                }
                placeholder="Quads, shoulders"
              />
            </label>
            <label className="field">
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
            <label className="field">
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
                <option value="false">Public only</option>
              </select>
            </label>
          </div>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>Description</span>
              <input
                type="text"
                name="description"
                value={formValues.description}
                onChange={handleChange}
                placeholder="Optional details"
              />
            </label>
            <label className="field">
              <span>Created by</span>
              <input
                type="text"
                name="created_by"
                value={formValues.created_by}
                onChange={handleChange}
                placeholder="Coach name"
              />
            </label>
            <label className="field">
              <span>Sort by</span>
              <select
                name="ordering"
                value={ordering}
                onChange={(event) => setOrdering(event.target.value)}
              >
                <option value="name">Name (A-Z)</option>
                <option value="-name">Name (Z-A)</option>
                <option value="created_at">Created (oldest)</option>
5                <option value="-created_at">Created (newest)</option>
                <option value="updated_at">Updated (oldest)</option>
                <option value="-updated_at">Updated (newest)</option>
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                name="is_public"
                checked={formValues.is_public}
                onChange={handleChange}
              />
              Public exercise
            </label>
            {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
            <button className="primary-btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Searching..." : "Search"}
            </button>
          </form>
          <div className="exercise-list">
            {isLoading ? (
              <p className="auth-subtitle">Loading exercises...</p>
            ) : filteredExercises.length === 0 ? (
              <p className="auth-subtitle">No exercises found yet.</p>
            ) : (
              filteredExercises.map((exercise, index) => (
                <article className="exercise-item" key={exercise.id ?? index}>
                  <div className="exercise-header">
                    <h3>{exercise.name}</h3>
                    <span>
                      {categoryLookup[exercise.category] || exercise.category}
                    </span>
                  </div>
                  <p className="exercise-meta">
                    {equipmentLookup[exercise.equipment] || exercise.equipment} ·
                    {" "}
                    {exercise.primary_muscle_group}
                  </p>
                  <p className="exercise-meta">
                    Created by {exercise.created_by || "Unknown"} ·
                    {" "}
                    {exercise.is_public ? "Public" : "Private"}
                  </p>
                  <p className="exercise-meta">
                    Created {formatTimestamp(exercise.created_at)} · Updated
                    {" "}
                    {formatTimestamp(exercise.updated_at)}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

export default Exercises
