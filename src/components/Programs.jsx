import "../CSS/programs.css"
import { useMemo, useState } from "react"

const PROGRAMS_PER_PAGE = 6

const DUMMY_PROGRAMS = [
  {
    id: 1,
    name: "5x5 Strength Builder",
    description: "A classic 5x5 program focused on compound lifts to build raw strength and size.",
    difficulty: "Intermediate",
    duration_weeks: 12,
    category: "Strength",
    goal: "Muscle Gain",
    created_by: "coach_dave",
  },
  {
    id: 2,
    name: "Beginner CrossFit WOD",
    description: "An introductory CrossFit program with scalable workouts for new athletes.",
    difficulty: "Beginner",
    duration_weeks: 6,
    category: "CrossFit",
    goal: "General Fitness",
    created_by: "coach_sarah",
  },
  {
    id: 3,
    name: "Advanced Powerlifting Cycle",
    description: "A periodized powerlifting cycle targeting max squat, bench, and deadlift.",
    difficulty: "Advanced",
    duration_weeks: 16,
    category: "Powerlifting",
    goal: "Strength",
    created_by: "coach_mike",
  },
  {
    id: 4,
    name: "HIIT Fat Burner",
    description: "High-intensity interval training designed to maximize caloric burn and conditioning.",
    difficulty: "Intermediate",
    duration_weeks: 8,
    category: "Cardio",
    goal: "Weight Loss",
    created_by: "coach_lisa",
  },
  {
    id: 5,
    name: "Endurance Running Plan",
    description: "A structured plan to build aerobic endurance and improve running performance.",
    difficulty: "Beginner",
    duration_weeks: 10,
    category: "Cardio",
    goal: "Endurance",
    created_by: "coach_tom",
  },
  {
    id: 6,
    name: "Bodyweight Mastery",
    description: "Full body calisthenics program requiring no equipment — just your bodyweight.",
    difficulty: "Beginner",
    duration_weeks: 8,
    category: "Calisthenics",
    goal: "General Fitness",
    created_by: "coach_alex",
  },
  {
    id: 7,
    name: "Olympic Lifting Fundamentals",
    description: "Learn the snatch and clean & jerk with this technique-focused program.",
    difficulty: "Intermediate",
    duration_weeks: 12,
    category: "Olympic Lifting",
    goal: "Strength",
    created_by: "coach_dave",
  },
  {
    id: 8,
    name: "Zone 2 Conditioning",
    description: "Low-intensity aerobic work to steadily build your metabolic base over time.",
    difficulty: "Beginner",
    duration_weeks: 16,
    category: "Cardio",
    goal: "Endurance",
    created_by: "coach_sarah",
  },
  {
    id: 9,
    name: "Hypertrophy Blast",
    description: "High-volume training split targeting muscle hypertrophy and body composition.",
    difficulty: "Intermediate",
    duration_weeks: 10,
    category: "Bodybuilding",
    goal: "Muscle Gain",
    created_by: "coach_mike",
  },
  {
    id: 10,
    name: "Competition Prep 12-Week",
    description: "Comprehensive competition preparation for intermediate to advanced athletes.",
    difficulty: "Advanced",
    duration_weeks: 12,
    category: "CrossFit",
    goal: "Competition",
    created_by: "coach_lisa",
  },
  {
    id: 11,
    name: "Mobility & Recovery",
    description: "Daily mobility routines and active recovery sessions to improve flexibility.",
    difficulty: "Beginner",
    duration_weeks: 6,
    category: "Mobility",
    goal: "Recovery",
    created_by: "coach_tom",
  },
  {
    id: 12,
    name: "Conjugate Method Strength",
    description: "Max effort and dynamic effort days for well-rounded strength development.",
    difficulty: "Advanced",
    duration_weeks: 20,
    category: "Powerlifting",
    goal: "Strength",
    created_by: "coach_alex",
  },
  {
    id: 13,
    name: "Athletic Performance",
    description: "Speed, agility, and power training for sport-specific performance gains.",
    difficulty: "Intermediate",
    duration_weeks: 8,
    category: "Sports Performance",
    goal: "Athletic Performance",
    created_by: "coach_dave",
  },
  {
    id: 14,
    name: "Core & Stability",
    description: "Targeted core strengthening and stability work for injury prevention.",
    difficulty: "Beginner",
    duration_weeks: 6,
    category: "Strength",
    goal: "Injury Prevention",
    created_by: "coach_sarah",
  },
  {
    id: 15,
    name: "Wendler 5/3/1",
    description: "Jim Wendler's proven strength program using percentage-based progressive loading.",
    difficulty: "Intermediate",
    duration_weeks: 16,
    category: "Strength",
    goal: "Strength",
    created_by: "coach_mike",
  },
]

const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"]
const CATEGORIES = [...new Set(DUMMY_PROGRAMS.map((p) => p.category))].sort()
const GOALS = [...new Set(DUMMY_PROGRAMS.map((p) => p.goal))].sort()

function Programs() {
  const [searchName, setSearchName] = useState("")
  const [sortOrder, setSortOrder] = useState("asc")
  const [filters, setFilters] = useState({ difficulty: "", category: "", goal: "" })
  const [currentPage, setCurrentPage] = useState(1)

  const filteredAndSortedPrograms = useMemo(() => {
    let result = [...DUMMY_PROGRAMS]

    if (searchName.trim()) {
      const query = searchName.trim().toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query),
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
      const cmp = a.name.localeCompare(b.name)
      return sortOrder === "asc" ? cmp : -cmp
    })

    return result
  }, [searchName, sortOrder, filters])

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

  const getDifficultyClass = (difficulty) => {
    if (difficulty === "Beginner") return "programs-badge programs-badge-beginner"
    if (difficulty === "Intermediate") return "programs-badge programs-badge-intermediate"
    if (difficulty === "Advanced") return "programs-badge programs-badge-advanced"
    return "programs-badge"
  }

  return (
    <main className="programs-page" aria-label="Training Programs">
      <header className="programs-top-bar">
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
              {DIFFICULTIES.map((d) => (
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
              {CATEGORIES.map((c) => (
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
              {GOALS.map((g) => (
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
          {pagedPrograms.length === 0 ? (
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
                    <span className="programs-card-tag">{program.duration_weeks} weeks</span>
                  </div>
                  <p className="programs-card-creator">By {program.created_by}</p>
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
    </main>
  )
}

export default Programs
