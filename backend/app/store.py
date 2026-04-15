from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from .models import Attempt, AttemptCreate, Lesson, MixedTarget

_LESSONS: list[Lesson] = [
    Lesson(
        id="open-strings",
        title="Open string practice",
        description="Pluck each open string cleanly. One target at a time.",
        mode="note",
        targets=["E2", "A2", "D3", "G3", "B3", "E4"],
        timeoutMs=2600,
    ),
    Lesson(
        id="open-chords",
        title="Basic open chord practice",
        description="Strum the chord and let the heuristic inference settle.",
        mode="chord",
        targets=["Em", "G", "C", "D"],
        timeoutMs=4200,
    ),
    Lesson(
        id="mixed-quick",
        title="Mixed quick practice",
        description="A short mix of notes and chords for a quick demo run.",
        mode="mixed",
        targets=[
            MixedTarget(type="note", value="E2"),
            MixedTarget(type="chord", value="Em"),
            MixedTarget(type="note", value="G3"),
            MixedTarget(type="chord", value="C"),
            MixedTarget(type="note", value="E4"),
        ],
        timeoutMs=3400,
    ),
]

_ATTEMPTS: list[Attempt] = []


def list_lessons() -> list[Lesson]:
    return _LESSONS


def get_lesson(lesson_id: str) -> Lesson | None:
    for lesson in _LESSONS:
        if lesson.id == lesson_id:
            return lesson
    return None


def save_attempt(payload: AttemptCreate) -> Attempt:
    attempt = Attempt(
        id=str(uuid4()),
        receivedAt=datetime.now(timezone.utc),
        payload=payload,
    )
    _ATTEMPTS.append(attempt)
    return attempt

