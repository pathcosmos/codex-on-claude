# Mini codebase for B7-arch

This is a 4-file mini-service used by `B7-arch`.

- `controller.js` — HTTP handler
- `service.js` — business logic
- `repository.js` — data access (currently has ad-hoc fetch + setTimeout retry)
- `client.js` — outbound HTTP client

The question (see `QUESTION.md`): where should retry logic live? Currently it's hardcoded inside `repository.js`; the spec calls out three layers as candidates. The model should pick one and justify with file citations.
