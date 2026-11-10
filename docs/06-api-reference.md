# 6. REST API Reference

Base URL: `http://localhost:5000/api` (proxied through `http://localhost:5173/api` in dev).
All bodies are JSON. Protected routes need `Authorization: Bearer <token>`.
Errors look like `{ "error": "message", "code": "CONFLICT" }`.

## Auth
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | — | `200 { status: "ok", time }` |
| POST | `/auth/register` | `{ name, email, password, role: "student"\|"mentor", skills?: string[] }` | `201 { user, token }` |
| POST | `/auth/login` | `{ email, password }` | `200 { user, token }` |
| GET | `/auth/me` 🔒 | — | `200 { user }` |

## Bounties
| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/bounties` 🔒 | — | `{ bounties: [ {…, postedByName, eligible} ] }` open feed | |
| GET | `/bounties/mine` 🔒 | — | `{ bounties }` posted (student) / accepted (mentor) | |
| POST | `/bounties` 🔒 student | `{ title, description?, tags?, reward, sessionMinutes, acceptWindowMinutes? }` | `201 { bounty }` | 400, 402, 403 |
| GET | `/bounties/:id` 🔒 | — | `{ bounty }` | 404 |
| POST | `/bounties/:id/accept` 🔒 mentor | — | `{ bounty, room }` | 403, 404, 409 |
| POST | `/bounties/:id/complete` 🔒 poster | — | `{ bounty }` | 403, 409 |
| POST | `/bounties/:id/cancel` 🔒 poster | — | `{ bounty }` | 403, 409 |

## Rooms
| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/rooms/:id` 🔒 participant | — | `{ room: {…, locked, remainingSeconds, bounty, participantsInfo} }` | 403, 404 |
| POST | `/rooms/:id/messages` 🔒 | `{ text }` | `201 { message }` | 400, 403, 423 |
| PUT | `/rooms/:id/notes` 🔒 | `{ notes }` | `{ room }` | 400, 403, 423 |

The socket events are documented in [HLD §2.6](02-high-level-design.md#26-real-time-event-catalogue).

## Quick curl walkthrough

```bash
API=http://localhost:5000/api
S=$(curl -s -XPOST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Asha","email":"asha@x.com","password":"secret123","role":"student"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
M=$(curl -s -XPOST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Ravi","email":"ravi@x.com","password":"secret123","role":"mentor","skills":["docker"]}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

B=$(curl -s -XPOST $API/bounties -H "Authorization: Bearer $S" -H 'Content-Type: application/json' \
  -d '{"title":"Debug my Docker container","tags":["docker"],"reward":15,"sessionMinutes":120}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).bounty.id')

curl -s -XPOST $API/bounties/$B/accept -H "Authorization: Bearer $M"
curl -s -XPOST $API/bounties/$B/accept -H "Authorization: Bearer $M"   # → 409 already taken
```
