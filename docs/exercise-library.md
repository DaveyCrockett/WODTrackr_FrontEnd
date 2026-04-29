# Exercise Library — Developer Documentation

## Overview

The Exercise Library is a full-featured CRUD view available at the `/exercises` route. It lets authenticated users:

- Browse and search a paginated list of exercises
- Filter by category, equipment, and primary muscle group
- Sort by name or creation/update date
- View detailed metadata for any exercise
- Add new exercises to the library
- Edit exercises they own

The entire feature lives in `src/components/Exercises.jsx` and is styled by `src/CSS/exercises.css`.

---

## User Flows

### 1. Browse and search

1. The page loads and immediately fetches exercises from the API (with a 300 ms debounce).
2. Up to **12 exercises** are shown at once (configurable via `PAGE_SIZE`). Clicking **Load More** reveals the next 12.
3. The user can type in the **Search by name** field to filter server-side by name.
4. Skeleton cards are shown while the initial request is in flight. A slow-loading notice appears after 1.2 s.

### 2. Filter and sort

| Control | Query parameter sent | Default |
|---|---|---|
| Search by name | `search` | _(none)_ |
| Category dropdown | `category` | _(none / All)_ |
| Equipment dropdown | `equipment` | _(none / All)_ |
| Muscle dropdown | `muscle` | _(none / All)_ |
| Sort by | `ordering` | `name` |

Allowed `ordering` values: `name`, `-name`, `created_at`, `-created_at`, `updated_at`, `-updated_at`.

Click **Clear Filters** to reset all controls to their defaults.

### 3. Select and view details

Clicking an exercise card highlights it and displays full details in the **Exercise Details** panel on the right:

- Name, category, equipment, primary muscle group
- Description
- Creator username
- Visibility (public / private)
- Created and last-updated timestamps

Keyboard navigation is supported inside the list: `ArrowUp`, `ArrowDown`, `Home`, `End`, `Enter`, `Space`.

### 4. Add an exercise

1. Click **Add Exercise** to open the modal dialog.
2. Fill in the required fields: **Name**, **Category**, **Equipment**, and **Primary Muscle Group**.
3. Optionally add a **Description** and toggle **Make public**.
4. Submit the form. On success the new exercise is prepended to the list and a success toast appears for 3 s.
5. Press **Escape** or click **Close** to cancel without saving.

### 5. Edit an exercise

1. Select an exercise you own (the **Edit Exercise** button appears only when the logged-in username matches the exercise's `created_by` field).
2. Click **Edit Exercise** to open the edit modal, pre-populated with the exercise's current values.
3. Modify any field and submit. On success the list item is updated in place.
4. Press **Escape** or click **Close** to cancel without saving.

---

## API Integration

### Base URL

```
http://127.0.0.1:8000/api/wodtrackr/exercises/
```

The constant `API_URL` at the top of `Exercises.jsx` controls this value. Update it (or replace it with an environment variable) when deploying to a non-local backend.

### Authentication

Every request that requires authentication includes a Bearer token retrieved from `localStorage`:

```
Authorization: Bearer <token>
```

Token resolution order (`getAuthToken`):

1. `localStorage.getItem("wodtrackrAuthToken")` — direct string value
2. `JSON.parse(localStorage.getItem("wodtrackrUser"))?.authToken` — nested in a user object

If no token is found the header is omitted entirely (unauthenticated requests still work for read-only public data, depending on server policy).

### Endpoints

#### `GET /api/wodtrackr/exercises/`

Fetch the exercise list. All parameters are optional.

| Query param | Type | Description |
|---|---|---|
| `search` | string | Case-insensitive name search |
| `ordering` | string | Sort field (prefix `-` for descending) |
| `category` | string | Filter by category value |
| `equipment` | string | Filter by equipment value |
| `muscle` | string | Filter by primary muscle group |

**Expected response shape:**

```json
{
  "data": [
    {
      "id": 1,
      "name": "Back Squat",
      "description": "Barbell squat with bar on upper back.",
      "category": "strength",
      "equipment": "barbell",
      "primary_muscle_group": "Quadriceps",
      "created_by_username": "coach_dave",
      "is_public": true,
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-03-20T14:30:00Z"
    }
  ]
}
```

The component reads `response.data.data` (an array). If that path is missing or not an array, the list is set to `[]`.

#### `OPTIONS /api/wodtrackr/exercises/`

Used **once on mount** to retrieve the available choices for Category, Equipment, and Muscle dropdowns. The component walks the full OPTIONS metadata with a BFS traversal, looking for `choices` arrays nested anywhere in the response.

Results are cached in `localStorage` under the key `wodtrackrExerciseChoices` for **12 hours** (`CHOICES_CACHE_TTL_MS`). The cache entry shape:

```json
{
  "categoryChoices":  [{ "value": "strength", "label": "Strength" }],
  "equipmentChoices": [{ "value": "barbell",  "label": "Barbell"  }],
  "muscleChoices":    [{ "value": "quads",    "label": "Quadriceps" }],
  "cachedAt": 1700000000000
}
```

#### `POST /api/wodtrackr/exercises/`

Create a new exercise.

**Request body:**

```json
{
  "name": "Back Squat",
  "description": "Barbell squat with bar on upper back.",
  "category": "strength",
  "equipment": "barbell",
  "primary_muscle_group": "Quadriceps",
  "created_by": "coach_dave",
  "is_public": false
}
```

**Expected response shape:**

```json
{ "data": { /* exercise object */ } }
```

The new exercise is read from `response.data.data` and prepended to the local list.

#### `PATCH /api/wodtrackr/exercises/{id}/`

Update an existing exercise. Sends the same body shape as POST.

**Expected response shape:**

```json
{ "data": { /* updated exercise object */ } }
```

If `response.data.data` is missing the component falls back to `response.data` directly.

### Error handling

| HTTP status | Behaviour |
|---|---|
| `401` / `403` | Shows "Please log in …" message, stops further processing |
| Field-level errors | Per-field error messages rendered under the relevant input |
| Other errors | Falls back to `response.data.detail` or a generic message |

---

## Data Model

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | — | Server-assigned |
| `name` | string | ✓ | Display name |
| `description` | string | | Optional free-text |
| `category` | string | ✓ | Enum, validated server-side |
| `equipment` | string | ✓ | Enum, validated server-side |
| `primary_muscle_group` | string | ✓ | Enum, validated server-side |
| `created_by` / `created_by_username` | string | | Username of creator |
| `is_public` | boolean | | `false` by default |
| `created_at` | ISO 8601 string | — | Server-assigned |
| `updated_at` | ISO 8601 string | — | Server-assigned |

---

## Choices Normalization

The helper `normalizeChoices` accepts choices in any of these formats returned by the API:

| Format | Example |
|---|---|
| Plain object (value → label map) | `{ "strength": "Strength", "cardio": "Cardio" }` |
| Array of `[value, label]` tuples | `[["strength", "Strength"], ["cardio", "Cardio"]]` |
| Array of objects with `value`/`label` keys | `[{ "value": "strength", "label": "Strength" }]` |
| Array of objects with `id`/`display_name` variants | `[{ "id": "strength", "display_name": "Strength" }]` |
| Scalar array | `["strength", "cardio"]` |

Empty, `null`, and `undefined` values are filtered out before the choices are stored.

---

## Extension Points

### Changing the API base URL

Replace the `API_URL` constant at the top of `Exercises.jsx`:

```js
const API_URL = import.meta.env.VITE_EXERCISES_API_URL ?? "http://127.0.0.1:8000/api/wodtrackr/exercises/"
```

### Adjusting pagination

Change `PAGE_SIZE` (default `12`) to control how many exercises appear per page:

```js
const PAGE_SIZE = 20
```

### Changing the choices cache TTL

Change `CHOICES_CACHE_TTL_MS` (default 12 hours) to control how often the OPTIONS request is re-issued:

```js
const CHOICES_CACHE_TTL_MS = 1000 * 60 * 60 * 24 // 24 hours
```

### Adding new filter fields

1. Add the filter key to the `filters` state object.
2. Add the corresponding query param in the `loadExercises` `params` block.
3. Add a `<select>` (or `<input>`) in the search grid JSX.
4. Add the new choice key to `getChoicesFromMetadata` if choices come from the OPTIONS response.
5. Add `resetFilters` to `handleClearFilters`.

### Extending the exercise form

Add the new field to:

1. `EMPTY_EXERCISE_FORM_VALUES` — default value
2. `getExerciseFormValues` — populate edit form from existing exercise
3. `handleSubmit` POST body
4. `handleEditSubmit` PATCH body
5. `getFieldErrorsFromResponse` — list of fields to extract errors for
6. The Add and Edit form JSX

### Swapping the HTTP client

The component uses `axios`. To replace it with the native `fetch` API, update `loadExercises`, `loadChoices`, `handleSubmit`, and `handleEditSubmit`. The expected response shape (`response.data`) would become the resolved promise value directly.

---

## Accessibility

- The exercise list uses `role="listbox"` and `role="option"` with `aria-selected` for screen-reader compatibility.
- Keyboard navigation (arrow keys, Home, End) is handled on the list container.
- Both modals trap Tab focus and return focus to the trigger button on close.
- Live regions (`aria-live="polite"`, `role="alert"`, `role="status"`) announce loading states, errors, and success messages.
- Skeleton cards carry `aria-hidden="true"` so they are not announced.
