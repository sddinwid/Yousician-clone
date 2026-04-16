from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from .models import Attempt, AttemptCreate, Lesson, MixedTarget
from .transformers import legacy_lesson_to_web, slugify, stable_lesson_id

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

# Mock "legacy" app-oriented lesson payloads (mobile/desktop). These are intentionally
# awkward and UI-coupled to simulate a migration scenario.
_LEGACY_LESSONS: list[dict] = [
    {
        "lessonId": "L-1001",
        "client": "ios",
        "rev": 7,
        "meta": {
            "titleText": "Open Strings (App v1)",
            "descText": "Pluck each open string cleanly. The app shows string hints per target.",
            "skillTags": ["fundamentals", "timing"],
            "difficulty": 1,
            "estimatedSecs": 240,
            "locale": "en-US",
        },
        "ui": {
            "hero": {"asset": "gtr_open_strings.png", "bg": "#0b1020"},
            "cta": {"primary": "Start", "secondary": "Skip"},
            "trackColor": "teal",
        },
        "flow": [
            {
                "type": "card",
                "cardId": "c_intro",
                "copy": {"h1": "Warm up", "body": "Use your thumb for the low strings."},
                "analytics": {"event": "lesson_intro_seen"},
            },
            {
                "type": "exercise",
                "exerciseId": "ex_notes_1",
                "screen": {"title": "Pluck each string"},
                "nativeCfg": {
                    "engine": "pitchy",
                    "tuning": "E2 A2 D3 G3 B3 E4",
                    "mode": "monophonic",
                    "minStableMs": 180,
                },
                "targets": [
                    {"note": "E2", "uiHint": "6th string (open)"},
                    {"note": "A2", "uiHint": "5th string (open)"},
                    {"note": "D3", "uiHint": "4th string (open)"},
                    {"note": "G3", "uiHint": "3rd string (open)"},
                    {"note": "B3", "uiHint": "2nd string (open)"},
                    {"note": "E4", "uiHint": "1st string (open)"},
                ],
                "scoring": {"mode": "streak", "minCorrect": 5, "resetOnMiss": True},
                "timeouts": {"perTargetMs": 2600},
            },
            {
                "type": "card",
                "cardId": "c_tip",
                "copy": {"h1": "Tip", "body": "Keep your wrist relaxed and breathe."},
                "ui": {"badge": "ProTip"},
            },
        ],
        "progress": {
            "checkpoints": [
                {"atFlowIndex": 1, "gate": {"kind": "stars", "min": 1}},
                {"atFlowIndex": 1, "gate": {"kind": "accuracy", "minPct": 75}},
            ],
            "resume": {"lastCompletedFlowIndex": 0},
            "xp": {"base": 30, "bonusForPerfect": 20},
        },
        "practice": {
            "targetsRef": "flow[1].targets",
            "goal": {"kind": "sequence", "repeat": 1},
            "metronome": {"enabled": True, "bpm": 60},
        },
    },
    {
        "lessonId": "L-2002",
        "client": "android",
        "rev": 12,
        "meta": {
            "titleText": "Chord Changes (App v2)",
            "descText": "Switch between open chords. Legacy clients embed diagrams inconsistently.",
            "skillTags": ["chords", "rhythm"],
            "difficulty": 2,
            "estimatedSecs": 360,
            "locale": "en-US",
        },
        "ui": {
            "hero": {"asset": "gtr_open_chords.png", "bg": "#10240b"},
            "cta": {"primary": "Play", "secondary": "Later"},
            "targetStyle": "bigChords",
        },
        "flow": [
            {
                "type": "card",
                "cardId": "c_intro",
                "copy": {
                    "h1": "Chord changes",
                    "body": "Strum once per chord. Focus on clean fretting hand changes.",
                },
                "ui": {"badge": "New"},
            },
            {
                "type": "exercise",
                "exerciseId": "ex_chords_2",
                "screen": {"title": "Switch chords"},
                "nativeCfg": {
                    "engine": "chord_infer",
                    "strumWindowMs": 420,
                    "allowedVoicings": ["open", "partial"],
                    "confidenceFloor": 0.6,
                },
                "targets": [
                    {
                        "chordName": "Em",
                        "diagram": {
                            "strings": [0, 2, 2, 0, 0, 0],
                            "fingers": [0, 2, 3, 0, 0, 0],
                        },
                    },
                    {"target": {"name": "G", "shape": "320003", "display": "G"}},
                    {"chord": "C", "shape": {"grid": "x32010", "fingering": "032010"}},
                    {"tab": {"string": 1, "fret": 3, "label": "high G"}},
                ],
                "hints": ["Strum all strings", "Keep a steady tempo"],
                "scoring": {"mode": "streak", "minCorrect": 3, "resetOnMiss": False},
                "timeouts": {"perTargetMs": 4200},
            },
            {
                "type": "card",
                "cardId": "c_outro",
                "copy": {"h1": "Nice!", "body": "Try speeding up the chord changes next time."},
                "analytics": {"event": "lesson_outro_seen"},
            },
        ],
        "progress": {
            "checkpoints": [{"atFlowIndex": 1, "gate": {"kind": "streak", "min": 3}}],
            "resume": {"lastCompletedFlowIndex": 0},
            "xp": {"base": 45, "bonusForPerfect": 25},
        },
        "practice": {
            "goal": {"kind": "loop", "loops": 2},
            "metronome": {"enabled": False},
        },
    },
]


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


def list_legacy_lessons() -> list[dict]:
    return _LEGACY_LESSONS


def get_legacy_lesson(lesson_id: str) -> dict | None:
    for lesson in _LEGACY_LESSONS:
        if lesson.get("lessonId") == lesson_id:
            return lesson
    return None


def list_web_lessons():
    return [legacy_lesson_to_web(lesson) for lesson in _LEGACY_LESSONS]


def get_web_lesson(lesson_id: str):
    normalized = slugify(lesson_id)
    for lesson in _LEGACY_LESSONS:
        if lesson.get("lessonId") == lesson_id:
            return legacy_lesson_to_web(lesson)
        if stable_lesson_id(lesson) == normalized:
            return legacy_lesson_to_web(lesson)
    return None
