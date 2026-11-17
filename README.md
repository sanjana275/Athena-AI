# Athena AI &mdash; Intelligent Full-Stack AI Platform

An intelligent, multi-user AI assistant platform featuring real-time streaming, multimodal vision, image generation, document RAG, and native document/presentation exports.

---

## 🌟 Highlights

- **⚡ Blazing Fast Inference:** Powered by Groq LPU accelerators running `llama-3.3-70b-versatile` and `llama-3.1-8b-instant`.
- **👁️ Multimodal Vision & Image Creation:** Analyze uploaded photos with Cloud Vision AI and create high-resolution imagery via FLUX.1 diffusion.
- **📑 Native Document & Slide Exports:** Export any conversation or roadmap into publication-ready **PDFs** and native Microsoft PowerPoint (**`.pptx`**) presentations.
- **📚 RAG Knowledge Base:** Upload PDFs, DOCX, CSV, TXT, or JSON files with vector chunking and semantic citation.
- **🔒 Secure Authentication:** Argon2id password hashing, Google OAuth 2.0, server-side session management in HTTP-only cookies.
- **⚙️ Complete Settings Suite:**
  - **Account & Security:** Profile updates, password changes, builder handle, and session management.
  - **Real-Time Usage:** Live prompt allowance tracking, monthly quotas, and performance analytics.
  - **Appearance:** Light, Dark, and System themes with smooth transitions.
  - **Archived Chats:** Archive and unarchive past conversations.
  - **Personalization:** Tailored tone/style preferences and AI-synthesized memory summaries.

---

## 🏗️ Architecture & Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons |
| **Backend** | FastAPI, Python 3.10+, SQLAlchemy 2, Pydantic v2, Uvicorn |
| **Database** | SQLite (development) / PostgreSQL with pgvector (production) |
| **AI / LLM** | Groq API (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`), FastEmbed / BAAI |
| **Exports** | `python-pptx` (native OpenXML slides), browser print pipeline |
| **Auth** | Authlib, Google OAuth 2.0, Argon2 password hashing |

---

## 🚀 Quick Start

### 1. Clone & Set Up Backend

```bash
cd backend
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file in `backend/` (or copy from `.env.example`):

```ini
DATABASE_URL=sqlite:///./chatgpt.db
SECRET_KEY=dev-secret-change-me
FRONTEND_URL=http://localhost:3000

COOKIE_SECURE=false
COOKIE_SAMESITE=lax

LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=your_groq_api_key_here
LLM_MODEL=llama-3.3-70b-versatile

EMBED_PROVIDER=fastembed
EMBED_MODEL=BAAI/bge-small-en-v1.5
EMBED_DIM=384

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
```

Run the backend server:

```bash
python main.py
# or: uvicorn main:app --reload --port 8000
```

### 2. Set Up Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to start using Athena AI!

---

## 📄 License

This project is licensed under the MIT License.
