# Running BountyHub Locally

Step-by-step guide for Windows, macOS and Linux.

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | **20 or newer** (22 LTS recommended) | `node -v` |
| npm | 10+ (comes with Node) | `npm -v` |
| Docker Desktop / Docker Engine | any recent version with Compose v2 | `docker compose version` |
| Git (optional) | | |

> Make sure Docker Desktop is **running** before step 3.

## 2. Unzip the project

```bash
unzip BountyHub-MERN.zip
cd bountyhub
```

`node_modules` were removed to keep the zip small. Step 4 reinstalls them.

## 3. Start MongoDB in Docker

From the project root (where `docker-compose.yml` is):

```bash
docker compose up -d mongo
docker compose ps          # STATUS should become "healthy"
```

This starts `mongo:7` as container **bountyhub-mongo** on `localhost:27017`, with data kept in the `mongo-data` volume.

Useful commands:

```bash
docker compose logs -f mongo                         # view logs
docker exec -it bountyhub-mongo mongosh bountyhub    # open a Mongo shell
docker compose down                                  # stop (keeps data)
docker compose down -v                               # stop and DELETE all data
```

## 4. Start the API server

```bash
cd server
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
npm install
npm run seed                  # optional: creates demo users
npm run dev                   # http://localhost:5000
```

You should see:

```
[db] connected to mongodb://localhost:27017/bountyhub
[api] BountyHub listening on http://localhost:5000
```

Check it: open http://localhost:5000/api/health and you should get `{"status":"ok",...}`.

### Environment variables (`server/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `5000` | API port |
| `MONGO_URI` | `mongodb://localhost:27017/bountyhub` | Mongo connection string |
| `JWT_SECRET` | `dev-only-change-me` | **change this** for anything beyond local dev |
| `JWT_EXPIRES_IN` | `7d` | token lifetime |
| `CORS_ORIGIN` | `http://localhost:5173` | allowed browser origin |
| `STARTER_TOKENS` | `100` | tokens given to new students |
| `EXPIRY_SWEEP_MS` | `30000` | how often un-accepted bounties are expired and refunded |
| `STORAGE` | *(mongo)* | set to `memory` to run with no database (demo only) |

## 5. Start the React client

In a **new terminal**:

```bash
cd client
npm install
npm run dev                   # http://localhost:5173
```

Vite proxies `/api` and `/socket.io` to `localhost:5000`, so no extra config is needed.

## 6. Try the full flow

Use **two different browser sessions** (e.g. a normal window + an incognito window, or two browsers), because each login is stored per browser.

| Demo account (after `npm run seed`) | Role | Skills |
|---|---|---|
| `student@bountyhub.dev` | Student (100 tokens) | — |
| `mentor@bountyhub.dev` | Mentor | docker, node, mongodb |
| `mentor2@bountyhub.dev` | Mentor | docker, react |
| `python@bountyhub.dev` | Mentor | python, django |

Password for all: **`password123`**

1. **Window A** → sign in as the student.
2. **Window B** → sign in as `mentor@bountyhub.dev`.
3. In A, post a bounty: title *"Debug my Docker container"*, skills `docker`, reward `15`, session *2 hours*. The balance drops to 85 (escrow).
4. In B, a **"New bounty"** toast appears instantly. Click **Accept**, and B jumps into the room.
5. In A, a toast says the mentor accepted. Click **Join room**.
6. Chat and type in the shared scratchpad; both sides update live. The countdown shows the time left.
7. In A, click **Mark complete & pay**. The mentor's balance becomes 15 and the room locks for both.

Things worth trying: open a third window as `mentor2@bountyhub.dev` and race to accept (only one wins), or sign in as `python@bountyhub.dev` (no push, and the card shows *Skills don't match*).

## 7. Run the tests

```bash
# Server: unit + REST + WebSocket integration (in-memory, no Docker needed)
cd server
npm test
npm run test:coverage

# Server: the same repository contract against real MongoDB
docker compose up -d mongo          # from the project root
MONGO_URI_TEST=mongodb://localhost:27017/bountyhub_test npm run test:mongo
#   Windows PowerShell:
#   $env:MONGO_URI_TEST="mongodb://localhost:27017/bountyhub_test"; npm run test:mongo

# Client: Vitest + React Testing Library
cd ../client
npm test

# Optional: browser end-to-end (keep server + client running)
cd ../e2e
npm install
npx playwright install chromium
npm test
```

## 8. Production build of the client (optional)

```bash
cd client
npm run build        # outputs client/dist
npm run preview      # serves the build on http://localhost:4173
```

## 9. Running without Docker (quick demo only)

If Docker isn't available you can still click through the app with in-memory storage. Data is lost on restart.

```bash
cd server
npm run dev:memory   # macOS / Linux
# Windows PowerShell:  $env:STORAGE="memory"; npm run dev
```

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `[fatal] connect ECONNREFUSED 127.0.0.1:27017` | MongoDB isn't running: `docker compose up -d mongo`, wait for *healthy* |
| `port is already allocated` on 27017 | A local MongoDB is already running. Stop it, or change the port mapping to `"27018:27017"` and set `MONGO_URI=mongodb://localhost:27018/bountyhub` |
| `EADDRINUSE :5000` / `:5173` | Something else uses the port. Change `PORT` in `.env` (and `VITE_API_PROXY=http://localhost:<port>` when starting the client) |
| Mentor gets no notification | Check the mentor's skills overlap the bounty tags, the mentor is logged in **in a separate browser session**, and the green "live" dot is visible |
| Logged out unexpectedly | JWT expired or `JWT_SECRET` changed. Sign in again |
| `npm run test:mongo` shows 1 skipped | `MONGO_URI_TEST` wasn't set in that shell |
