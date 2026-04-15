from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Union

from pydantic import BaseModel, Field


class MixedTarget(BaseModel):
    type: Literal["note", "chord"]
    value: str


LessonMode = Literal["note", "chord", "mixed"]


class Lesson(BaseModel):
    id: str
    title: str
    description: str
    mode: LessonMode
    targets: list[Union[str, MixedTarget]]
    timeoutMs: int | None = None


class AttemptScore(BaseModel):
    correct: int = 0
    missed: int = 0
    completionPercentage: int = Field(ge=0, le=100)


class AttemptCreate(BaseModel):
    lessonId: str
    completedAt: datetime
    score: AttemptScore
    targets: list[Any]
    results: list[str]


class Attempt(BaseModel):
    id: str
    receivedAt: datetime
    payload: AttemptCreate


class SaveAttemptResponse(BaseModel):
    ok: bool = True
    attempt: Attempt

