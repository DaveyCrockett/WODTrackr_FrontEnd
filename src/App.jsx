import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import './CSS/app.css'
import Calendar from './components/Calendar'
import Exercises from './components/Exercises'
import Help from './components/Help'
import Layout from './components/Layout'
import Login from './components/Login'
import Profile from './components/Profile'
import Programs from './components/Programs'
import Register from './components/Register'
import Settings from './components/Settings'

const CHOICES_API_URL = "/api/wodtrackr/exercises/choices/"
const PROGRAM_CHOICES_API_URL = "/api/wodtrackr/exercise-programs/choices/"
const CHOICES_CACHE_KEY = "wodtrackrExerciseChoices"
const CHOICES_CACHE_VERSION = 2
const CHOICES_CACHE_TTL_MS = 1000 * 60 * 60 * 12

const canonicalizeEquipmentValue = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ")
  if (normalized === "bodyweight") return "body weight"
  return normalized
}

const normalizeChoiceArray = (choices) => {
  if (!Array.isArray(choices)) return []

  const seen = new Set()
  const normalized = []

  for (const choice of choices) {
    let value = ""
    let label = ""

    if (choice && typeof choice === "object" && !Array.isArray(choice)) {
      value = String(choice.value ?? "").trim()
      label = String(choice.label ?? choice.name ?? choice.display_name ?? value).trim()
    } else {
      value = String(choice ?? "").trim()
      label = value
    }

    if (!value) continue

    const canonicalValue = canonicalizeEquipmentValue(value)
    const normalizedValue = canonicalValue || value.toLowerCase()
    const finalValue = normalizedValue === "body weight" ? "body weight" : value
    const finalLabel = normalizedValue === "body weight" ? "Body Weight" : label

    const key = normalizedValue
    if (seen.has(key)) continue
    seen.add(key)

    normalized.push({ value: finalValue, label: finalLabel || finalValue })
  }

  return normalized.sort((left, right) => left.label.localeCompare(right.label))
}


const saveUserSession = (data, fallbackUsername) => {
  const userData = data?.user ?? data ?? {}
  const authToken =
    data?.access ??
    data?.token ??
    data?.key ??
    data?.auth_token ??
    userData?.access ??
    userData?.token ??
    userData?.key ??
    userData?.auth_token ??
    ""

  const refreshToken = data?.refresh ?? userData?.refresh ?? ""
  const avatarUrl =
    userData?.avatar_url ??
    userData?.avatarUrl ??
    userData?.profile_image ??
    userData?.profileImage ??
    null

  const username =
    userData?.username ?? userData?.name ?? fallbackUsername ?? "Guest user"

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


function BillingReturnRedirect({ status }) {
  const location = useLocation()
  const query = new URLSearchParams(location.search)

  if (!query.get('checkout')) {
    query.set('checkout', status)
  }

  const nextQuery = query.toString()
  return <Navigate to={`/programs${nextQuery ? `?${nextQuery}` : ''}`} replace />
}

function App() {

  
  const [exerciseLibraryState, setExerciseLibraryState] = useState({
      exerciseLibrary: [],
      isExerciseLibraryLoading: false,
      exerciseLibraryError: '',
      hasMoreExercises: false,
    })
  const [filters, setFilters] = useState({ 
    searchName: "",
    difficulty: [],
    category: [], 
    goal: [], 
    equipment: [],
    muscle: [],
    bodyPart: [],
    target: [],
   })
  const [searchName, setSearchName] = useState("")
  const [choicesErrorMessage, setChoicesErrorMessage] = useState("")
  const [sortOrder, setSortOrder] = useState("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [categoryChoices, setCategoryChoices] = useState([])
  const [goalChoices, setGoalChoices] = useState([])
  const [difficultyChoices, setDifficultyChoices] = useState([])
  const [equipmentChoices, setEquipmentChoices] = useState([])
  const [muscleChoices, setMuscleChoices] = useState([])
  const [bodyPartChoices, setBodyPartChoices] = useState([])
  const [targetChoices, setTargetChoices] = useState([])
  const [isChoicesLoading, setIsChoicesLoading] = useState(false)

  const handleFilterChange = (filterName, selectedValues) => {
    setFilters((prev) => ({
      ...prev,
      [filterName]: selectedValues,
    }))
    setCurrentPage(1)
  }


  const handleClearFilters = () => {
    setSortOrder("asc")
    setFilters({ 
      searchName: "",
      difficulty: [],
      category: [], 
      goal: [], 
      equipment: [],
      muscle: [],
      bodyPart: [],
      target: [],
    })
    setCurrentPage(1)
  }

  useEffect(() => {
    const loadChoices = async () => {
      setIsChoicesLoading(true)
      setChoicesErrorMessage("")

      try {
        const cachedRawValue = localStorage.getItem(CHOICES_CACHE_KEY)
        if (cachedRawValue) {
          const parsedCache = JSON.parse(cachedRawValue)
          console.log("Loaded choices from cache: ", parsedCache)
          const isCacheFresh = Date.now() - (parsedCache?.cachedAt || 0) < CHOICES_CACHE_TTL_MS

          const isCacheCompatible = parsedCache?.version === CHOICES_CACHE_VERSION

          if (isCacheFresh && isCacheCompatible && parsedCache?.categoryChoices?.length > 0 && parsedCache?.equipmentChoices?.length > 0 && parsedCache?.muscleChoices?.length > 0) {
            setCategoryChoices(normalizeChoiceArray(parsedCache.categoryChoices))
            setEquipmentChoices(normalizeChoiceArray(parsedCache.equipmentChoices))
            setMuscleChoices(normalizeChoiceArray(parsedCache.muscleChoices))
            setBodyPartChoices(Array.isArray(parsedCache?.bodyPartChoices) ? normalizeChoiceArray(parsedCache.bodyPartChoices) : [])
            setTargetChoices(Array.isArray(parsedCache?.targetChoices) ? normalizeChoiceArray(parsedCache.targetChoices) : [])
            setGoalChoices(Array.isArray(parsedCache?.goalChoices) ? normalizeChoiceArray(parsedCache.goalChoices) : [])
            setDifficultyChoices(Array.isArray(parsedCache?.difficultyChoices) ? normalizeChoiceArray(parsedCache.difficultyChoices) : [])
            setIsChoicesLoading(false)
            return
          }
        }
      } catch {
        localStorage.removeItem(CHOICES_CACHE_KEY)
      }

      try {
        const [exerciseChoicesResponse, programChoicesResponse] = await Promise.all([
          axios.get(CHOICES_API_URL),
          axios.get(PROGRAM_CHOICES_API_URL).catch(() => ({ data: {} })),
        ])
        const exerciseChoicesData = exerciseChoicesResponse?.data || {}
        const programChoicesData = programChoicesResponse?.data || {}

        const nextCategoryChoices = normalizeChoiceArray(exerciseChoicesData?.category)
        const nextEquipmentChoices = normalizeChoiceArray(exerciseChoicesData?.equipment)
        const nextMuscleChoices = Array.isArray(exerciseChoicesData?.muscle_group)
          ? normalizeChoiceArray(exerciseChoicesData.muscle_group)
          : Array.isArray(exerciseChoicesData?.primary_muscle_group)
            ? normalizeChoiceArray(exerciseChoicesData.primary_muscle_group)
            : []
        const nextBodyPartChoices = normalizeChoiceArray(exerciseChoicesData?.body_part)
        const nextTargetChoices = normalizeChoiceArray(exerciseChoicesData?.target)
        const nextGoalChoices = normalizeChoiceArray(programChoicesData?.goal)
        const nextDifficultyChoices = normalizeChoiceArray(programChoicesData?.difficulty)

        setCategoryChoices(nextCategoryChoices)
        setEquipmentChoices(nextEquipmentChoices)
        setMuscleChoices(nextMuscleChoices)
        setBodyPartChoices(nextBodyPartChoices)
        setTargetChoices(nextTargetChoices)
        setGoalChoices(nextGoalChoices)
        setDifficultyChoices(nextDifficultyChoices)

        localStorage.setItem(
          CHOICES_CACHE_KEY,
          JSON.stringify({
            version: CHOICES_CACHE_VERSION,
            categoryChoices: nextCategoryChoices,
            equipmentChoices: nextEquipmentChoices,
            muscleChoices: nextMuscleChoices,
            bodyPartChoices: nextBodyPartChoices,
            targetChoices: nextTargetChoices,
            goalChoices: nextGoalChoices,
            difficultyChoices: nextDifficultyChoices,
            cachedAt: Date.now(),
          }),
        )
      } catch (error) {
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          setChoicesErrorMessage("Please log in to load exercises and categories.")
          return
        }
        const message = error?.response?.data?.detail || "Unable to load choices. Please refresh and try again."
        setChoicesErrorMessage(message)
      } finally {
        setIsChoicesLoading(false)
      }
    }

    loadChoices()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route index path="/login" element={<Login saveUserSession={saveUserSession} />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Layout />}>
          <Route path="profile" element={<Profile />} />
          <Route path="exercises" element={<Exercises 
            exerciseLibraryState={exerciseLibraryState} 
            setExerciseLibraryState={setExerciseLibraryState}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            handleClearFilters={handleClearFilters}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            filters={filters}
            isChoicesLoading={isChoicesLoading}
            setIsChoicesLoading={setIsChoicesLoading}
            goalChoices={goalChoices}
            difficultyChoices={difficultyChoices}
            categoryChoices={categoryChoices}
            equipmentChoices={equipmentChoices}
            muscleChoices={muscleChoices}
            bodyPartChoices={bodyPartChoices}
            targetChoices={targetChoices}
            choicesErrorMessage={choicesErrorMessage}
            setFilters={setFilters}
            handleFilterChange={handleFilterChange}
          />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="programs" element={<Programs 
            exerciseLibraryState={exerciseLibraryState} 
            setExerciseLibraryState={setExerciseLibraryState}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            handleClearFilters={handleClearFilters}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            filters={filters}
            isChoicesLoading={isChoicesLoading}
            setIsChoicesLoading={setIsChoicesLoading}
            goalChoices={goalChoices}
            difficultyChoices={difficultyChoices}
            categoryChoices={categoryChoices}
            equipmentChoices={equipmentChoices}
            muscleChoices={muscleChoices}
            choicesErrorMessage={choicesErrorMessage}
            setFilters={setFilters}
            handleFilterChange={handleFilterChange}
          />} />
          <Route path="billing/success" element={<BillingReturnRedirect status="success" />} />
          <Route path="billing/cancel" element={<BillingReturnRedirect status="cancel" />} />
          <Route path="settings" element={<Settings />} />
          <Route path="help" element={<Help />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
