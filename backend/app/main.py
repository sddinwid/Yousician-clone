from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import AttemptCreate, Lesson, SaveAttemptResponse, WebLesson
from .store import (
    get_legacy_lesson,
    get_lesson,
    get_web_lesson,
    list_legacy_lessons,
    list_lessons,
    list_web_lessons,
    save_attempt,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/lessons", response_model=list[Lesson])
def lessons():
    return list_lessons()


@app.get("/lessons/{lesson_id}", response_model=Lesson)
def lesson_by_id(lesson_id: str):
    lesson = get_lesson(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail="lesson not found")
    return lesson


@app.get("/legacy/lessons")
def legacy_lessons():
    return list_legacy_lessons()


@app.get("/legacy/lessons/{lesson_id}")
def legacy_lesson_by_id(lesson_id: str):
    lesson = get_legacy_lesson(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail="lesson not found")
    return lesson


@app.get("/web/lessons", response_model=list[WebLesson])
def web_lessons():
    return list_web_lessons()


@app.get("/web/lessons/{lesson_id}", response_model=WebLesson)
def web_lesson_by_id(lesson_id: str):
    lesson = get_web_lesson(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail="lesson not found")
    return lesson


@app.post("/attempts", response_model=SaveAttemptResponse)
def create_attempt(payload: AttemptCreate):
    attempt = save_attempt(payload)
    return SaveAttemptResponse(ok=True, attempt=attempt)
