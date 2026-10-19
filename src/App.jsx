import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
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


const EXERCISES_API_URL = "/api/wodtrackr/exercises/"


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

  const normalizeExercisesPayload = (data) => {
    if (Array.isArray(data?.data)) return data.data
    if (Array.isArray(data?.results)) return data.results
    if (Array.isArray(data)) return data
    return []
  }

  const loadExerciseLibrary = async (authToken) => {
    setExerciseLibraryState((prevState) => ({
      ...prevState,
      isExerciseLibraryLoading: true,
      exerciseLibraryError: '',
    }))
    console.log('Loading exercise library...')
    try {
      console.log("authToken:", authToken)
      const config = authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}
      const response = await axios.get(EXERCISES_API_URL, config)
      console.log('Exercise library loaded:', response?.data.all_exercises || response?.data || [])
      const nextNode = response?.data?.next
      setExerciseLibraryState((prevState) => ({
        ...prevState,
        isExerciseLibraryLoading: false,
        exerciseLibraryError: '',
        exerciseLibrary: normalizeExercisesPayload(response?.data.all_exercises || response?.data || [] ),
        hasMoreExercises: nextNode !== null,
      }))
    } catch (error) {
      console.error('API or Normalization Error:', error?.response || error?.message || error)
      setExerciseLibraryState((prevState) => ({
        ...prevState,
        isExerciseLibraryLoading: false,
        exerciseLibrary: [],
        exerciseLibraryError: 'Unable to load exercise library for workout planning.',
      }))
    }
  }



  return (
    <BrowserRouter>
      <Routes>
        <Route index path="/login" element={<Login saveUserSession={saveUserSession} />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Layout />}>
          <Route path="profile" element={<Profile />} />
          <Route path="exercises" element={<Exercises exerciseLibraryState={exerciseLibraryState} loadExerciseLibrary={loadExerciseLibrary} />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="programs" element={<Programs exerciseLibraryState={exerciseLibraryState} loadExerciseLibrary={loadExerciseLibrary} />} />
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
