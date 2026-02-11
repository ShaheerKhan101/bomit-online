# PHASE_3_DEPLOY.md
## Goal
Deploy the game so it is **playable by link** — one URL that hosts everything.

---

## Hosting Target
Pick the simplest: **Render Web Service** for Node server.
- The Node/Colyseus server should also serve the built client files (static).
- Result: **one URL** that hosts everything.

---

## Deployment Requirements
- `npm run build` builds client into a `/dist` folder.
- Server serves `/dist` for the website.
- WebSocket endpoints work under the same domain.

---

## Render Setup (Implementation Expectations)
- `Build Command`: install + build (client + server)
- `Start Command`: start server on `process.env.PORT`
- Ensure WebSocket works (Colyseus)

---

## Acceptance Tests (must pass)
1) Visiting the URL loads the game in a browser.
2) Two devices on different networks can join the same room code and play.
3) All Phase 2 gameplay works identically when hosted.

---

## Non-Goals (keep scope tight)
- No accounts/login
- No matchmaking ladder
- No persistent stats/DB
- No mobile polish (optional)

---

## Deliverable
- Deployed URL
- README section:
  - how to run locally
  - how to deploy
  - known limitations

