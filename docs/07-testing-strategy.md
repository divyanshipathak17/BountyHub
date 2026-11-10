# 7. Testing Strategy (TDD)

The project was built **test-first**: for each module the spec was written, run to see it fail (red), then the minimum implementation was added to make it pass (green), then refactored.

## 7.1 Test pyramid

| Layer | Location | Tool | What it proves | Needs infra? |
|---|---|---|---|---|
| Repository contract | `server/tests/contract` + `unit/memoryRepositories.test.js` | Jest | Every adapter honours the same behaviour (atomic claim, guarded balance, filters, ordering) | No |
| Repository contract on MongoDB | `server/tests/mongo` | Jest + Mongoose | The **same** contract against real MongoDB | Docker Mongo |
| Services (business rules) | `server/tests/unit/*Service.test.js` | Jest + fake clock + recording notifier | Escrow, eligibility, first-wins, time lock, expiry/refund, payouts, permissions | No |
| REST integration | `server/tests/integration/api.test.js` | Supertest | Routing, auth middleware, status codes, full lifecycle over HTTP | No |
| Realtime integration | `server/tests/integration/realtime.test.js` | real `socket.io-client` sockets on an ephemeral port | Handshake auth, targeted push, race (200 vs 409), room join/deny, live chat and notes | No |
| UI components | `client/src/**/*.test.{js,jsx}` | Vitest + React Testing Library | Form parsing/validation, card actions per role, toasts, API client, time formatting | No |
| End-to-end smoke | `e2e/smoke.e2e.cjs` | Playwright (optional) | 3 browsers: student posts → 2 mentors get the push → race → chat/notes → complete → payout | Running app |

## 7.2 Test doubles

- **Fake clock** (`createFakeClock`): `clock.advanceMinutes(31)` checks expiry and the room lock without waiting.
- **Recording notifier**: services push events into an array, and tests assert who was notified with what (`notifier.find('bounty:new')[0].userIds`).
- **In-memory repositories**: real behaviour, no I/O. They pass the same contract as the Mongo adapter.

## 7.3 Notable test cases

- `concurrent accepts: exactly one wins` fires two `acceptBounty` calls with `Promise.allSettled` and expects one fulfilled and one 409. This is repeated over real HTTP + WebSocket in `realtime.test.js`.
- `rejects when the student cannot afford the reward` checks the balance is unchanged afterwards (no partial escrow).
- `completing twice pays only once` guards against double payout.
- `after the time lock expires the room is read-only` checks 423 for messages and notes, and `remainingSeconds === 0`.
- `eligible mentors receive a push … others do not` uses a Python-only mentor socket that must **not** receive `bounty:new`.

## 7.4 Running

```bash
# server: unit + integration (no DB needed)
cd server && npm test
npm run test:coverage

# server: repository contract against real MongoDB
docker compose up -d mongo
MONGO_URI_TEST=mongodb://localhost:27017/bountyhub_test npm run test:mongo

# client
cd client && npm test

# optional browser E2E (app must be running on :5173 / :5000)
cd e2e && npm install && npx playwright install chromium && npm test
```

## 7.5 Results at hand-off

| Suite | Result |
|---|---|
| Server (unit + integration) | **74 passed**, 1 skipped (Mongo contract, needs `MONGO_URI_TEST`) |
| Client (Vitest) | **20 passed** |
| E2E smoke (Playwright, 3 browser sessions) | passed |
