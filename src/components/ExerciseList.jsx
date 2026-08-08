
import { useState, useEffect } from "react"
export default function ExerciseList({ exercises, isLoading, onExerciseClick }) {
  const [exerciseLibrary, setExerciseLibrary] = useState([])
  const [isExerciseLibraryLoading, setIsExerciseLibraryLoading] = useState(false)
  const [exerciseLibraryError, setExerciseLibraryError] = useState("")

 useEffect(() => {
    const loadExerciseLibrary = async () => {
      setIsExerciseLibraryLoading(true)
      setExerciseLibraryError("")

      try {
        const response = await axios.get(EXERCISES_API_URL, buildRequestConfig())
        setExerciseLibrary(normalizeExercisesPayload(response?.data))
      } catch {
        setExerciseLibrary([])
        setExerciseLibraryError("Unable to load exercise library for workout planning.")
      } finally {
        setIsExerciseLibraryLoading(false)
      }
    }

    loadExerciseLibrary()
  }, [])

  return (