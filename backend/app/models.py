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


# --- Migration-focused web lesson contract ---


class WebLessonMetadata(BaseModel):
    title: str
    description: str | None = None
    difficulty: int | None = Field(default=None, ge=1, le=10)
    estimatedSeconds: int | None = Field(default=None, ge=0)
    tags: list[str] = Field(default_factory=list)
    locale: str | None = None


class WebChordDiagram(BaseModel):
    shape: str | None = None
    strings: list[int] | None = None
    fingers: list[int] | None = None


class WebTabPosition(BaseModel):
    string: int = Field(ge=1, le=6)
    fret: int = Field(ge=0, le=24)
    label: str | None = None


class WebPracticeTarget(BaseModel):
    id: str
    kind: Literal["note", "chord", "tab"]
    label: str
    note: str | None = None
    chord: str | None = None
    diagram: WebChordDiagram | None = None
    tab: WebTabPosition | None = None
    timeoutMs: int | None = Field(default=None, ge=0)


class WebExerciseConfig(BaseModel):
    engine: str | None = None
    tuning: str | None = None
    metronomeBpm: int | None = Field(default=None, ge=1, le=400)
    minStableMs: int | None = Field(default=None, ge=0)
    strumWindowMs: int | None = Field(default=None, ge=0)
    confidenceFloor: float | None = Field(default=None, ge=0.0, le=1.0)


class WebExerciseBlock(BaseModel):
    id: str
    title: str | None = None
    hints: list[str] = Field(default_factory=list)
    config: WebExerciseConfig = Field(default_factory=WebExerciseConfig)
    targetIds: list[str] = Field(default_factory=list)


class WebContentBlock(BaseModel):
    id: str
    type: Literal["text", "image", "exercise"]
    title: str | None = None
    text: str | None = None
    imageAsset: str | None = None
    exercise: WebExerciseBlock | None = None


class WebProgressGate(BaseModel):
    kind: Literal["stars", "accuracy", "streak"]
    min: int | None = Field(default=None, ge=0)
    minPct: int | None = Field(default=None, ge=0, le=100)


class WebCheckpoint(BaseModel):
    id: str
    afterBlockId: str | None = None
    gate: WebProgressGate


class WebProgression(BaseModel):
    checkpoints: list[WebCheckpoint] = Field(default_factory=list)
    resumeBlockId: str | None = None


class WebLesson(BaseModel):
    id: str
    legacyId: str
    metadata: WebLessonMetadata
    content: list[WebContentBlock] = Field(default_factory=list)
    targets: list[WebPracticeTarget] = Field(default_factory=list)
    progression: WebProgression = Field(default_factory=WebProgression)
