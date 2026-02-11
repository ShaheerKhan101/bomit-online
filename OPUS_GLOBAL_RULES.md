# OPUS_GLOBAL_RULES.md
## Purpose
These rules govern **all phases (1–3)** of the Bomb It Online project.  
Claude Opus must follow these rules strictly while operating in Cursor.

The goals are:
- Finish each phase **fast**
- Avoid overengineering
- Preserve context across phases
- Prevent refactors that break earlier work

---

## Global Principles
1. **Speed over elegance**
   - Prefer working code to “clean architecture”
   - Do not introduce abstractions unless explicitly required

2. **Incremental correctness**
   - Each phase must fully work before moving to the next
   - Never assume a later phase will “fix” earlier behavior

3. **Minimal surface area**
   - Fewer files > more files
   - Reuse existing files unless a new file is explicitly justified

4. **No silent refactors**
   - Do NOT reorganize folders, rename files, or change APIs unless the current phase explicitly requires it
   - If a refactor is unavoidable, explain why and keep it minimal

---

## Phase Boundaries (CRITICAL)
- **Only work on the currently provided phase MD file**
- Do NOT:
  - implement features from future phases
  - add “just in case” hooks
  - add TODOs referencing later phases
- Assume future phases will be loaded separately into context

---

## Code Scope Rules
### Allowed
- Creating new files specified in the current phase
- Editing files explicitly listed in the current phase
- Adding small helper functions inside existing files

### Forbidden
- Introducing new frameworks or libraries not listed in the phase
- Adding databases, auth, analytics, or persistence
- Introducing AI/ML libraries for NPCs
- Adding build tooling beyond what is required to run

---

## Gameplay Rules Enforcement
- **Server is authoritative** once multiplayer begins
- Clients must never decide:
  - bomb explosions
  - damage/death
  - block destruction
- Client logic must be limited to:
  - input collection
  - rendering
  - interpolation (optional)

---

## State Management Rules
1. **Deterministic state**
   - All randomness must be:
     - server-side (Phase 2+)
     - seeded if possible
2. **Single source of truth**
   - Never duplicate game logic on client and server
3. **Explicit transitions**
   - Game state changes must be visible in code (no magic timers hidden in callbacks)

---

## Performance Rules (Keep It Simple)
- NPC logic must run at a **lower frequency** than the main game loop
- Explosion visuals may be client-side only, but explosion *effects* must be server-side
- Use integers for grid positions (no floating-point drift)

---

## Networking Rules (Phase 2+)
- Prefer **state sync** over event spam
- Messages must be:
  - small
  - explicit
  - validated server-side
- Handle disconnects gracefully:
  - if a player disconnects mid-round, end the round

---

## Error Handling Rules
- Never fail silently
- Log server errors clearly
- Client errors should:
  - show a simple message
  - not crash the entire game

---

## Documentation Rules
- Each phase must update README with:
  - how to run
  - known limitations
- Inline comments only when logic is non-obvious
- Avoid long comment blocks

---

## Testing Rules
- Manual testing is sufficient
- Each acceptance test listed in the phase MD must be manually verifiable
- Do not add automated tests unless explicitly asked

---

## Style Rules
- Use clear, boring naming:
  - `player`, `bomb`, `map`, `npc`
- Avoid clever patterns
- Avoid premature generalization

---

## Deployment Rules (Phase 3)
- One service
- One URL
- One command to start
- If something requires multiple services or env vars, it must be justified or removed

---

## Final Constraint
If a decision is ambiguous:
> Choose the option that results in **less code**, **fewer files**, and **a working game sooner**.

Failure to follow these rules invalidates the phase.

END OF RULES

