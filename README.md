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

## Stripe checkout setup

The Programs details modal includes a Buy Program flow that starts a Stripe Checkout session from the backend.

### 1) Add your Stripe publishable key

Create a `.env.local` file at the project root:

```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
VITE_CHECKOUT_SESSION_API_URL=/api/wodtrackr/billing/stripe/checkout-session/
```

Use your own Stripe account's publishable key from the Stripe dashboard:
- Developers -> API keys -> Publishable key

Never put your Stripe secret key in the frontend.

If your backend uses a different route or host, point `VITE_CHECKOUT_SESSION_API_URL` to that full URL instead.

### 2) Implement backend checkout session endpoint

Frontend request:
- `POST /api/wodtrackr/billing/stripe/checkout-session/`
- Auth: Bearer token (same as other protected endpoints)
- Body:

```json
{
  "program_id": 123,
  "program_title": "Strength Cycle",
  "success_url": "http://localhost:5173/programs?checkout=success&programId=123",
  "cancel_url": "http://localhost:5173/programs?checkout=cancel&programId=123"
}
```

Backend response (either format is supported):

```json
{ "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_..." }
```

or

```json
{ "session_id": "cs_test_..." }
```

### 3) Configure your Stripe account URLs

In Stripe Dashboard -> Developers -> Webhooks / Checkout settings, make sure local and deployed return URLs are allowed, including your `success_url` and `cancel_url` domains.

### 4) How unlock works in the UI

After Stripe returns to a success URL containing `checkout=success&programId=<id>`, the app marks that program as purchased in local storage and unlocks Workout Plan By Week in the details modal.

For production, this should be validated server-side as well (for example via webhook + purchase record lookup) so access is not based only on local storage.

### Troubleshooting 404 on checkout-session

If Buy Program returns 404, the frontend is reaching Django but Django does not have the route.

Check these in order:
1. Confirm your backend route exists for `POST /api/wodtrackr/billing/stripe/checkout-session/`.
2. If your backend path differs, set `VITE_CHECKOUT_SESSION_API_URL` to the correct path.
3. Restart the Vite dev server after editing `.env.local`.
