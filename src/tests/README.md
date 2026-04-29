# Exercise Library Test Suite

This directory contains comprehensive unit, integration, and E2E tests for the Exercise Library features.

## Test Files

### `setup.js`
Test environment configuration including:
- Jest DOM matchers setup
- localStorage mocking
- window.matchMedia mocking

### `utilities.test.js`
Unit tests for utility functions:
- `normalizeChoices()` - Handling various choice formats
- `formatTimestamp()` - Date/time formatting
- `getFieldErrorsFromResponse()` - Error extraction from API responses
- `getExerciseFormValues()` - Form value extraction

**Coverage:**
- Object choices normalization
- Array of tuples normalization
- Array of objects normalization
- Alternative property names (id, display_name, etc.)
- Empty value filtering
- Invalid input handling

### `Exercises.test.js`
Component unit and integration tests:
- **Rendering**: Page structure, controls, buttons
- **Exercise Grid**: List display, empty state, counts
- **Search**: Name search, debouncing
- **Filtering**: Category, equipment, muscle filters, clear filters
- **Sorting**: Sort order options
- **Pagination**: Load More button, incremental loading
- **Exercise Details**: Selected exercise display
- **Add Modal**: Modal opening, form submission
- **API Integration**: GET/OPTIONS requests, error handling, caching
- **Accessibility**: ARIA labels, keyboard navigation

### `Exercises.e2e.test.js`
End-to-end workflow tests:
- Search, filter, and sort workflows
- Add exercise complete workflow
- Pagination workflow
- Success message display
- Error handling workflows
- Complex filtering scenarios
- Filter combination and updates

### `Exercises.api.test.js`
API integration tests:
- **GET /exercises/**: Endpoint calls, parameters, authentication
- **OPTIONS /exercises/**: Choices loading, caching, TTL
- **POST /exercises/**: New exercise creation, validation errors
- **PATCH /exercises/{id}/**: Exercise updates, authorization
- **Error Handling**: Network errors, malformed responses, error clearing

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm test:ui

# Generate coverage report
npm test:coverage
```

## Test Coverage

The test suite covers:

### Features
- ✅ Exercise grid/list display
- ✅ Search functionality
- ✅ Multi-filter support
- ✅ Sorting options
- ✅ Pagination (Load More)
- ✅ Detail view
- ✅ Add exercise (modal + form)
- ✅ Edit exercise (authorization-aware)
- ✅ Cache management

### API Operations
- ✅ GET list with filters/search/sort
- ✅ OPTIONS for choice loading
- ✅ POST for creating exercises
- ✅ PATCH for updating exercises
- ✅ Authentication (Bearer token)
- ✅ Error responses (401, 403, 500, etc.)

### User Interactions
- ✅ Search input
- ✅ Filter selection
- ✅ Sort selection
- ✅ Load more button
- ✅ Modal opening/closing
- ✅ Keyboard navigation
- ✅ Focus management

### Error Scenarios
- ✅ Network errors
- ✅ 401 Unauthorized
- ✅ 403 Forbidden
- ✅ 500 Server errors
- ✅ Validation errors
- ✅ Malformed responses
- ✅ Missing auth token

### Accessibility
- ✅ ARIA labels and roles
- ✅ Semantic HTML
- ✅ Keyboard navigation
- ✅ Focus management
- ✅ Loading states

## Mocking Strategy

### axios
All HTTP requests are mocked using `vi.mock('axios')`. Mock implementations:
- `axios.get()` - Mocked for loading exercises
- `axios.options()` - Mocked for loading choices
- `axios.post()` - Mocked for creating exercises
- `axios.patch()` - Mocked for updating exercises

### localStorage
Mocked to test:
- Token storage and retrieval
- Cache management
- User data persistence

### CSS
CSS imports are mocked to avoid parsing errors during tests.

## Test Patterns

### Component Testing
Uses React Testing Library for:
- User-centric testing
- Query by accessible roles and labels
- Avoiding implementation details
- Focus on user behavior

### Async Handling
Uses `waitFor()` for:
- API request completion
- DOM updates
- State changes

### User Interactions
Uses `@testing-library/user-event` for:
- Realistic user input simulation
- Type delays for debounce testing
- Select option changes

## Best Practices

1. **Isolation**: Each test is independent with clear setup/teardown
2. **Descriptive**: Test names clearly describe what is being tested
3. **Realistic**: Tests simulate real user behavior
4. **Maintainable**: Uses fixtures and mocks appropriately
5. **Fast**: Tests run quickly with mocked dependencies
6. **Comprehensive**: Covers happy paths, edge cases, and errors

## Adding New Tests

When adding new tests:

1. Follow the existing structure and naming conventions
2. Mock external dependencies (axios, localStorage, etc.)
3. Use `waitFor()` for async operations
4. Query elements using accessible attributes (roles, labels)
5. Test user behavior, not implementation
6. Include both happy path and error scenarios
7. Document complex test scenarios with comments

## CI/CD Integration

These tests are designed to run in CI/CD pipelines:
- Fast execution (no real API calls)
- Consistent results (deterministic)
- Coverage reporting
- Easy to parallelize

To integrate with GitHub Actions or other CI systems:

```yaml
- name: Run tests
  run: npm test
  
- name: Generate coverage
  run: npm test:coverage
  
- name: Upload coverage
  uses: codecov/codecov-action@v3
```
