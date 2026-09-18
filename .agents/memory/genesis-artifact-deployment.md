---
name: GENESIS artifact deployment
description: Why GENESIS publishing must be configured as a runnable root artifact service.
---

GENESIS must be published as a runnable artifact service on `/`, with the API remaining on `/api`. Do not rely on the root `.replit` deployment run setting while artifact manifests exist.

**Why:** Replit enables artifact-mode deployment when artifact manifests are present. In that mode, it ignored the root run command, started only the API artifact, and the public root returned 404.

**How to apply:** Keep GENESIS registered as a Node service with a `/` startup health check and an explicit production `PORT`; verify the public root serves GENESIS after every republish.