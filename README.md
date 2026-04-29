# WODTrackr — Front End

WODTrackr is a React + Vite web application for tracking CrossFit-style workouts (WODs). It connects to a Django REST Framework back end and provides views for workouts, an exercise library, programs, a training calendar, and user account management.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build |
| `npm run preview` | Locally preview the production build |
| `npm run lint` | Run ESLint |

## Project structure

```
src/
  App.jsx               # Root router
  components/
    Exercises.jsx       # Exercise Library (browse, add, edit)
    Calendar.jsx        # Training calendar
    Programs.jsx        # Program management
    Home.jsx            # Dashboard / home
    Profile.jsx         # User profile
    Settings.jsx        # Account settings
    Help.jsx            # Help page
    Login.jsx           # Login form
    Register.jsx        # Registration form
    Layout.jsx          # Shared shell (nav + outlet)
    Navbar.jsx          # Navigation bar
  CSS/                  # Component stylesheets
docs/
  exercise-library.md   # Exercise Library developer guide
```

## Authentication

The app stores the auth token in `localStorage` under the key `wodtrackrAuthToken` (or nested inside `wodtrackrUser` as `authToken`). Every API request that requires authentication includes the header:

```
Authorization: Bearer <token>
```

## Documentation

| Topic | File |
|---|---|
| Exercise Library (user flows, API, extension points) | [docs/exercise-library.md](docs/exercise-library.md) |

## Back-end requirements

The app expects a Django REST Framework API at `http://127.0.0.1:8000`. Update the `API_URL` constants in each component (or use `import.meta.env.VITE_*` variables) when deploying against a remote backend.
