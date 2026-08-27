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
const CHOICES_CACHE_KEY = "wodtrackrExerciseChoices"
const CHOICES_CACHE_TTL_MS = 1000 * 60 * 60 * 12


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
    difficulty: [],
    category: [], 
    goal: [], 
    equipment: [],
    muscle: [],
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
   const [isChoicesLoading, setIsChoicesLoading] = useState(false)

  const handleClearFilters = () => {
    setSearchName("")
    setSortOrder("asc")
    setFilters({ 
      difficulty: [],
      category: [], 
      goal: [], 
      equipment: [],
      muscle: [],
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
          const isCacheFresh = Date.now() - (parsedCache?.cachedAt || 0) < CHOICES_CACHE_TTL_MS

          if (isCacheFresh && parsedCache?.categoryChoices?.length > 0 && parsedCache?.equipmentChoices?.length > 0 && parsedCache?.muscleChoices?.length > 0 && parsedCache?.goalChoices?.length > 0 && parsedCache?.difficultyChoices?.length > 0) {
            setCategoryChoices(parsedCache.categoryChoices)
            setEquipmentChoices(parsedCache.equipmentChoices)
            setMuscleChoices(parsedCache.muscleChoices)
            setGoalChoices(parsedCache.goalChoices)
            setDifficultyChoices(parsedCache.difficultyChoices)
            setIsChoicesLoading(false)
            return
          }
        }
      } catch {
        localStorage.removeItem(CHOICES_CACHE_KEY)
      }

      try {
        const requestConfig = buildRequestConfig()
        const response = await axios.get(CHOICES_API_URL, requestConfig)
        const data = response?.data

        setCategoryChoices(data?.category)
        setEquipmentChoices(data?.equipment)
        setMuscleChoices(data?.primary_muscle_group)
        setGoalChoices(data?.goal)
        setDifficultyChoices(data?.difficulty)

        localStorage.setItem(
          CHOICES_CACHE_KEY,
          JSON.stringify({
            categoryChoices: data?.category,
            equipmentChoices: data?.equipment,
            muscleChoices: data?.primary_muscle_group,
            goalChoices: data?.goal,
            difficultyChoices: data?.difficulty,
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

  
  const filteredAndSortedLibrary = useMemo(() => {
    const library = exerciseLibraryState.exerciseLibrary || []
    let result = [...library]
    try {
      if (searchName.trim()) {
        const query = searchName.trim().toLowerCase()
        result = result.filter(
          (p) =>
            String(p?.name || "").toLowerCase().includes(query) ||
            String(p?.description || "").toLowerCase().includes(query),
        )
      }

      if (filters.difficulty.length > 0) {
        result = result.filter((p) => filters.difficulty.includes(p.difficulty))
        setExerciseLibraryState(prevState => ({
          ...prevState,
          exerciseLibrary: result,
        }))
        result = JSON.stringify(result)
      }
    
      if (Array.isArray(filters.category) && filters.category.length > 0) {
        result = result.filter((p) => filters.category.includes(p.category))
        setExerciseLibraryState(prevState => ({
          ...prevState,
          exerciseLibrary: result,
        }))
        result = JSON.stringify(result)
      }
      if (Array.isArray(filters.goal) && filters.goal.length > 0) {
        result = result.filter((p) => filters.goal.includes(p.goal))
        setExerciseLibraryState(prevState => ({
          ...prevState,
          exerciseLibrary: result,
        }))
        result = JSON.stringify(result)
      }
      if (Array.isArray(filters.equipment) && filters.equipment.length > 0) {
        result = result.filter((p) => {
          const programEquipment = getProgramEquipmentValues(p)
          return filters.equipment.some((selectedValue) => programEquipment.includes(normalizeEquipmentEntry(selectedValue)))
        })
        setExerciseLibraryState(prevState => ({
          ...prevState,
          exerciseLibrary: result,
        }))
        result = JSON.stringify(result)
      }
      if (Array.isArray(filters.muscle) && filters.muscle.length > 0) {
        result = result.filter((p) => {
          const programMuscles = getProgramMuscleValues(p)
          return filters.muscle.some((selectedValue) => programMuscles.includes(normalizeMuscleEntry(selectedValue)))
        })
        setExerciseLibraryState(prevState => ({
          ...prevState,
          exerciseLibrary: result,
        }))
        result = JSON.stringify(result)
      }

      result.sort((a, b) => {
        const cmp = String(a?.name || "").localeCompare(String(b?.name || ""))
        return sortOrder === "asc" ? cmp : -cmp
      })

      return result
    } catch (error) {
      console.error('Error filtering and sorting library:', error)
      return []
    }
  }, [exerciseLibraryState, searchName, sortOrder])

  
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
            searchName={searchName}
            sortOrder={sortOrder}
            filters={filters}
            isChoicesLoading={isChoicesLoading}
            setIsChoicesLoading={setIsChoicesLoading}
            goalChoices={goalChoices}
            difficultyChoices={difficultyChoices}
            categoryChoices={categoryChoices}
            equipmentChoices={equipmentChoices}
            muscleChoices={muscleChoices}
            choicesErrorMessage={choicesErrorMessage}
          />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="programs" element={<Programs 
            exerciseLibraryState={exerciseLibraryState} 
            setExerciseLibraryState={setExerciseLibraryState}
            sortOrder={sortOrder}
            searchName={searchName}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            filters={filters}
            isChoicesLoading={isChoicesLoading}
            goalChoices={goalChoices}
            difficultyChoices={difficultyChoices}
            categoryChoices={categoryChoices}
            equipmentChoices={equipmentChoices}
            muscleChoices={muscleChoices}
            choicesErrorMessage={choicesErrorMessage}
            isChoicesLoading={isChoicesLoading}
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
