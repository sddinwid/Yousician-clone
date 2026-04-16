from __future__ import annotations

import re
from typing import Any

from .models import (
    WebCheckpoint,
    WebChordDiagram,
    WebContentBlock,
    WebExerciseBlock,
    WebExerciseConfig,
    WebLesson,
    WebLessonMetadata,
    WebPracticeTarget,
    WebProgressGate,
    WebProgression,
    WebTabPosition,
)


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = _SLUG_RE.sub("-", value).strip("-")
    return value or "unknown"


def stable_lesson_id(legacy_lesson: dict) -> str:
    raw = str(legacy_lesson.get("lessonId") or legacy_lesson.get("id") or "")
    if raw.strip():
        return slugify(raw)
    title = str(((legacy_lesson.get("meta") or {}).get("titleText")) or "lesson")
    return slugify(title)


def _block_id(lesson_id: str, raw: str) -> str:
    return f"{lesson_id}:b:{slugify(raw)}"


def _target_id(lesson_id: str, kind: str, index: int) -> str:
    return f"{lesson_id}:t:{kind}:{index + 1}"


def legacy_lesson_to_web(legacy: dict) -> WebLesson:
    lesson_id = stable_lesson_id(legacy)

    meta = legacy.get("meta") or {}
    progress = legacy.get("progress") or {}
    practice = legacy.get("practice") or {}
    ui = legacy.get("ui") or {}

    metadata = WebLessonMetadata(
        title=str(meta.get("titleText") or "Untitled lesson"),
        description=meta.get("descText"),
        difficulty=meta.get("difficulty"),
        estimatedSeconds=meta.get("estimatedSecs"),
        tags=list(meta.get("skillTags") or []),
        locale=meta.get("locale"),
    )

    content: list[WebContentBlock] = []
    flow_index_to_block_id: dict[int, str] = {}

    hero_asset = ((ui.get("hero") or {}) or {}).get("asset")
    if hero_asset:
        content.append(
            WebContentBlock(
                id=_block_id(lesson_id, "hero"),
                type="image",
                imageAsset=str(hero_asset),
            )
        )

    targets: list[WebPracticeTarget] = []

    flow = legacy.get("flow") or []
    for flow_index, item in enumerate(flow):
        item_type = (item or {}).get("type")
        if item_type == "card":
            card_id = item.get("cardId") or f"card-{flow_index + 1}"
            copy = item.get("copy") or {}
            block_id = _block_id(lesson_id, card_id)
            flow_index_to_block_id[flow_index] = block_id
            content.append(
                WebContentBlock(
                    id=block_id,
                    type="text",
                    title=copy.get("h1"),
                    text=copy.get("body"),
                )
            )
            continue

        if item_type == "exercise":
            exercise_id = item.get("exerciseId") or f"exercise-{flow_index + 1}"
            screen = item.get("screen") or {}
            native_cfg = item.get("nativeCfg") or {}
            timeouts = item.get("timeouts") or {}

            per_target_timeout_ms = timeouts.get("perTargetMs")

            start_target_index = len(targets)
            target_ids: list[str] = []
            for offset, legacy_target in enumerate(item.get("targets") or []):
                parsed = _parse_legacy_target(legacy_target)
                target_kind = parsed["kind"]
                target_id = _target_id(lesson_id, target_kind, start_target_index + offset)
                target_ids.append(target_id)
                targets.append(
                    WebPracticeTarget(
                        id=target_id,
                        kind=target_kind,
                        label=parsed["label"],
                        note=parsed.get("note"),
                        chord=parsed.get("chord"),
                        diagram=parsed.get("diagram"),
                        tab=parsed.get("tab"),
                        timeoutMs=per_target_timeout_ms,
                    )
                )

            metronome = practice.get("metronome") or {}
            config = WebExerciseConfig(
                engine=native_cfg.get("engine"),
                tuning=native_cfg.get("tuning"),
                metronomeBpm=metronome.get("bpm") if metronome.get("enabled") else None,
                minStableMs=native_cfg.get("minStableMs"),
                strumWindowMs=native_cfg.get("strumWindowMs"),
                confidenceFloor=native_cfg.get("confidenceFloor"),
            )

            exercise_block = WebExerciseBlock(
                id=_block_id(lesson_id, exercise_id),
                title=screen.get("title"),
                hints=list(item.get("hints") or []),
                config=config,
                targetIds=target_ids,
            )
            block_id = _block_id(lesson_id, exercise_id)
            flow_index_to_block_id[flow_index] = block_id
            content.append(
                WebContentBlock(
                    id=block_id,
                    type="exercise",
                    title=screen.get("title"),
                    exercise=exercise_block,
                )
            )
            continue

        # Unknown legacy flow item types are ignored but shouldn't break the contract.

    web_checkpoints: list[WebCheckpoint] = []
    for idx, cp in enumerate(progress.get("checkpoints") or []):
        at_flow_index = cp.get("atFlowIndex")
        after_block_id = (
            flow_index_to_block_id.get(at_flow_index)
            if isinstance(at_flow_index, int)
            else None
        )
        gate = cp.get("gate") or {}
        kind = gate.get("kind") or "streak"
        if kind not in ("stars", "accuracy", "streak"):
            kind = "streak"
        web_gate = WebProgressGate(
            kind=kind,
            min=gate.get("min"),
            minPct=gate.get("minPct"),
        )
        web_checkpoints.append(
            WebCheckpoint(
                id=f"{lesson_id}:cp:{idx + 1}",
                afterBlockId=after_block_id,
                gate=web_gate,
            )
        )

    resume = progress.get("resume") or {}
    last_completed = resume.get("lastCompletedFlowIndex")
    resume_block_id = (
        flow_index_to_block_id.get(last_completed) if isinstance(last_completed, int) else None
    )

    progression = WebProgression(checkpoints=web_checkpoints, resumeBlockId=resume_block_id)

    return WebLesson(
        id=lesson_id,
        legacyId=str(legacy.get("lessonId") or ""),
        metadata=metadata,
        content=content,
        targets=targets,
        progression=progression,
    )


def _parse_legacy_target(legacy_target: Any) -> dict[str, Any]:
    if not isinstance(legacy_target, dict):
        value = str(legacy_target)
        return {"kind": "note", "label": value, "note": value}

    if "note" in legacy_target:
        note = str(legacy_target.get("note"))
        return {"kind": "note", "label": note, "note": note}

    if "chordName" in legacy_target:
        chord = str(legacy_target.get("chordName"))
        diagram = legacy_target.get("diagram") or {}
        return {
            "kind": "chord",
            "label": chord,
            "chord": chord,
            "diagram": WebChordDiagram(
                strings=diagram.get("strings"),
                fingers=diagram.get("fingers"),
            )
            if isinstance(diagram, dict)
            else None,
        }

    if isinstance(legacy_target.get("target"), dict) and legacy_target["target"].get("name"):
        t = legacy_target["target"]
        chord = str(t.get("name"))
        shape = t.get("shape")
        display = t.get("display") or chord
        return {
            "kind": "chord",
            "label": str(display),
            "chord": chord,
            "diagram": WebChordDiagram(shape=str(shape)) if shape else None,
        }

    if legacy_target.get("chord"):
        chord = str(legacy_target.get("chord"))
        shape = legacy_target.get("shape") or {}
        diagram_shape = None
        if isinstance(shape, dict):
            diagram_shape = shape.get("grid") or shape.get("fingering")
        return {
            "kind": "chord",
            "label": chord,
            "chord": chord,
            "diagram": WebChordDiagram(shape=str(diagram_shape)) if diagram_shape else None,
        }

    if isinstance(legacy_target.get("tab"), dict):
        tab = legacy_target["tab"]
        try:
            string = int(tab.get("string"))
            fret = int(tab.get("fret"))
        except (TypeError, ValueError):
            string = 1
            fret = 0
        label = tab.get("label")
        return {
            "kind": "tab",
            "label": str(label or f"String {string}, fret {fret}"),
            "tab": WebTabPosition(string=string, fret=fret, label=label),
        }

    value = str(legacy_target.get("value") or legacy_target)
    return {"kind": "note", "label": value, "note": value}
