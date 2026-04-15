# Yousician Prototype

Minimal fullstack starter for a real-time music learning prototype.

## Setup

### Frontend (Vite + React)

```bash
cd frontend
npm install
npm run dev
```

If `npm` is blocked in PowerShell, use `npm.cmd` instead:

```bash
cd frontend
npm.cmd install
npm.cmd run dev
```

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\\Scripts\\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

If PowerShell script execution prevents activation, run uvicorn via the venv’s Python:

```bash
cd backend
.venv\\Scripts\\python -m uvicorn app.main:app --reload
```

## Run both (two terminals)

**Terminal 1**

```bash
cd backend
uvicorn app.main:app --reload
```

**Terminal 2**

```bash
cd frontend
npm run dev
```
