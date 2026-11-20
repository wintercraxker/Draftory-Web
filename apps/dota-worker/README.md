# Draftory · Shared Dota Modules

<div align="center">

**The web server's interface to room and match coordination**

![JavaScript](https://img.shields.io/badge/JavaScript-ESM-F7DF1E?logo=javascript&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-data-4169E1?logo=postgresql&logoColor=white)

</div>

## 〢 💭 What is included?

Draftory's web routes and repositories import these modules to share rules for match requests, lobby state, and worker availability. Keeping that code with the web application preserves the boundary between a request recorded by the web server and an external action performed by a worker.

## 〢 ✨ Responsibilities

| Area | What the modules do |
| --- | --- |
| Match requests | Validate inputs and record jobs for eligible room transitions |
| Lobby state | Apply roster and launch rules and interpret recorded observations |
| Availability | Read capacity and health records used by the web interface |
| Results | Validate result state and enqueue eligible cleanup work |

Lobby access also imports a helper that reads encrypted credential records when a deployment supplies its own keys.

## 〢 🛠️ How it fits together

Web routes call server-side repositories in `src/lib/real/`. The repositories use these modules to validate state and read or write database records. A queue entry represents work requested by the web app. External execution and reconciliation belong to the separately deployed worker. This directory provides no standalone command or Steam session.

## 〢 ⚙️ Development

Use the [root README](../../README.md) to run the web demo. The demo uses sample data and needs neither the Steam Game Coordinator adapter nor worker credentials.
