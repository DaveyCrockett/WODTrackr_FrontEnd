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
  const [sortOrder, setSortOrder] = useState("asc")
  const [currentPage, setCurrentPage] = useState(1)

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
          />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="programs" element={<Programs 
            exerciseLibraryState={exerciseLibraryState} 
            setExerciseLibraryState={setExerciseLibraryState}
            filteredAndSortedLibrary={filteredAndSortedLibrary}
            sortOrder={sortOrder}
            searchName={searchName}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            filters={filters}
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
