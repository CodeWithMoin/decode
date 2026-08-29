"""Static checks on a generated scene module.

This is the first department whose output is code, so its gate is different in
kind from the Architect's arithmetic or the Author's word budget — but the same
in shape: exact answers, checked before anything is published, with one repair
turn to fix them.

Everything here is static. Nothing in this file executes the module, and nothing
downstream needs to in order to draw the settings panel: `CONTROLS` is generated
by Decode from the declared control list, so the panel reads JSON that was never
code. Running a module happens in exactly one place, the browser preview, and
later in a sandboxed export renderer.

Regex rather than a real parser is a deliberate ceiling. A Python worker has no
JS parser without either a fragile pure-Python one or a Node subprocess, and the
checks that actually matter — which module a scene imports from, and whether it
reaches for eval — are lexical. The escape it cannot see is an identifier
assembled at runtime, which is why the import allowlist is the load-bearing
check: code that cannot import anything dangerous has very little to assemble.
"""

from __future__ import annotations

import json
import re

from ...schemas import SceneControl, SceneModule, TeachingPlan
from .composition import stamp
from .lint import lint_composition

# A placeholder length used only to lint a composition's *validity* — structure
# and determinism are narration-independent, so a scene is checked before its
# real duration is known. The real length is stamped from the narration at
# resolve/render time (VISUALIZER-TO-HYPERFRAMES §3).
_LINT_PLACEHOLDER_DURATION = 10.0

# The one generated-code doorway. It re-exports the useful Remotion frame APIs
# unchanged and adds Decode's format/layout safety helpers; host-only composition
# and render infrastructure stay unavailable.
RUNTIME_MODULE = "@decode/animation-api"

# Widened for choreography: a scene may import the Layer-1 API and the Layer-2
# verb runtime, and nothing else. `remotion`, `react`, `gsap` and every other
# bare specifier stay outside the doorway.
ALLOWED_MODULES = {RUNTIME_MODULE, "@decode/motion-api"}

# Exported so the harness can stamp it on the artifact — a scene written against
# v1 stays readable when v2 lands.
RUNTIME_VERSION = "decode-animation-api-v2"

_IMPORT = re.compile(r"""\bfrom\s+['"]([^'"]+)['"]""")
_SIDE_EFFECT_IMPORT = re.compile(r"""\bimport\s+['"]([^'"]+)['"]""")
_DEFAULT_EXPORT = re.compile(r"\bexport\s+default\b")
_PROPS = re.compile(r"\bprops\.([A-Za-z_$][\w$]*)")
_DESTRUCTURED_PARAMS = re.compile(
    r"\bexport\s+default\s+function\s+\w*\s*\(\s*\{([^)}]*)\}"
    r"|\bfunction\s+Scene\s*\(\s*\{([^)}]*)\}"
)
_LITERAL_LAYOUT_FORMAT = re.compile(r"\bdefineLayout\s*\(\s*\{")
_DECODE_LAYOUT_HELPER = re.compile(r"\b(?:DesignCanvas|defineLayout|LayoutBox|LayoutText)\b")

# Ways to reach code or the outside world that an animation never needs.
_FORBIDDEN = {
    "eval": re.compile(r"\beval\s*\("),
    "function_constructor": re.compile(r"\bnew\s+Function\s*\("),
    "dynamic_import": re.compile(r"\bimport\s*\("),
    "require": re.compile(r"\brequire\s*\("),
    "fetch": re.compile(r"\bfetch\s*\("),
    "xhr": re.compile(r"\bXMLHttpRequest\b"),
    "websocket": re.compile(r"\bWebSocket\b"),
    "worker": re.compile(r"\bnew\s+Worker\s*\("),
    "timers": re.compile(r"\b(?:setTimeout|setInterval)\s*\("),
    "process": re.compile(r"\bprocess\.(?:env|exit|argv)\b"),
    "document_write": re.compile(r"\bdocument\.write\b"),
    "inner_html": re.compile(r"\bdangerouslySetInnerHTML\b"),
}

# CSS-driven motion. Remotion does not render `transition`, `animation`,
# `@keyframes` or Tailwind's `animate-` classes: they animate in a browser and
# produce wrong frames in an export.
#
# This is the worst failure shape available to us — correct in the preview the
# creator approves, wrong in the file they download — so it is a hard rejection
# rather than a note. Every moving value comes from `interpolate`.
_CSS_MOTION = re.compile(
    r"\b(?:transition|animation|animationName|animationDuration|transitionProperty)\s*:"
    r"|@keyframes"
    r"|class(?:Name)?\s*=\s*[\"'][^\"']*\banimate-"
)


def controls_export(controls: list[SceneControl]) -> str:
    """Serialise the declared controls into the module's `CONTROLS` block.

    Decode writes this, not the model. It is the reason the settings panel can
    never disagree with the module: both come from the same list.
    """
    block = {
        control.name: {
            key: value
            for key, value in {
                "type": control.type,
                "default": control.default,
                "label": control.label,
                "min": control.minimum,
                "max": control.maximum,
                "step": control.step,
            }.items()
            if value is not None
        }
        for control in controls
    }
    return f"export const CONTROLS = {json.dumps(block, ensure_ascii=True, indent=2)};"


def module_source(scene: SceneModule) -> str:
    """The complete module a client would load: generated manifest, then code.

    React scenes only — a HyperFrames scene is an HTML composition, not a module.
    """
    return f"{controls_export(scene.controls)}\n\n{scene.component_source or ''}\n"


def validate_scenes(
    scenes: list[SceneModule], plan: TeachingPlan, palette: dict | None = None
) -> list[dict[str, str]]:
    """Return deterministic violations that a single repair turn can address."""

    violations: list[dict[str, str]] = []
    plan_ids = [beat.id for beat in plan.beats]
    scene_ids = [scene.beat_id for scene in scenes]

    if len(set(scene_ids)) != len(scene_ids):
        violations.append(_violation("duplicate_scenes", "Each beat may have only one scene."))
    missing = [beat_id for beat_id in plan_ids if beat_id not in set(scene_ids)]
    if missing:
        violations.append(
            _violation(
                "missing_scenes", f"Every beat needs a scene; missing: {', '.join(missing)}."
            )
        )
    unknown = [beat_id for beat_id in scene_ids if beat_id not in set(plan_ids)]
    if unknown:
        violations.append(
            _violation(
                "unknown_scenes",
                f"These scenes name beats the plan does not contain: {', '.join(unknown)}.",
            )
        )
    if scene_ids != plan_ids and not missing and not unknown:
        violations.append(_violation("scene_order", "Scenes must appear in the plan's beat order."))

    for scene in scenes:
        violations.extend(_validate_one(scene))
        # The freehand-era geometry/style/palette gates (_validate_stage_and_palette:
        # SVG interior, collision, off-palette hue, absolute-count) are retired: the
        # Node/Arrow/Label/tokens components make those failures impossible by
        # construction, and the frontend's runtime inspectScene still catches real
        # rendered-geometry issues. What survives here is correctness — imports,
        # determinism, default export, controls — in _validate_one.

    return violations


def _validate_one(scene: SceneModule) -> list[dict[str, str]]:
    """Check one scene against its substrate — HyperFrames via the real linter,
    legacy React via the static import-allowlist (a migration window: a set may
    hold both while scenes are ported)."""
    if scene.composition_html is not None:
        return _validate_composition(scene)
    if scene.component_source is not None:
        return _validate_react(scene)
    return [_violation("empty_scene", f"{scene.beat_id} has no renderable source.")]


def _validate_composition(scene: SceneModule) -> list[dict[str, str]]:
    """Gate a HyperFrames composition on the real `hyperframes lint` (validity —
    determinism/layout, not execution security, which is the sandbox, §4).

    The composition is duration-agnostic, so it is stamped with a placeholder
    length before linting; only its structure is judged here. If the linter can't
    run (offline / not installed) the run is not blocked — validity degrades to
    the sandbox boundary rather than failing generation on an absent CLI.
    """
    html = stamp(scene.composition_html or "", _LINT_PLACEHOLDER_DURATION, [])
    result = lint_composition(html)
    if not result.ran:
        return []
    return [
        _violation(f"hf_{finding.code or 'lint'}", f"{scene.beat_id}: {finding.message}")
        for finding in result.findings
        if finding.severity == "error"
    ]


def _validate_react(scene: SceneModule) -> list[dict[str, str]]:
    source = scene.component_source or ""
    found: list[dict[str, str]] = []
    where = scene.beat_id

    imported = set(_IMPORT.findall(source)) | set(_SIDE_EFFECT_IMPORT.findall(source))
    outside = sorted(name for name in imported if name not in ALLOWED_MODULES)
    if outside:
        found.append(
            _violation(
                "forbidden_import",
                f"{where} imports from {', '.join(outside)}; only {RUNTIME_MODULE} "
                "and @decode/motion-api are allowed.",
            )
        )

    for name, pattern in _FORBIDDEN.items():
        if pattern.search(source):
            found.append(
                _violation("forbidden_api", f"{where} uses {name}, which a scene may not do.")
            )

    if _CSS_MOTION.search(source):
        found.append(
            _violation(
                "css_motion",
                f"{where} animates with CSS. Remotion does not render `transition`, `animation`, "
                "`@keyframes` or `animate-` classes — they would look right in the preview and be "
                "wrong in the export. Drive every moving value with `interpolate`.",
            )
        )

    if not _DEFAULT_EXPORT.search(source):
        found.append(_violation("no_default_export", f"{where} has no default export."))

    if "export const CONTROLS" in source:
        found.append(
            _violation(
                "declares_controls",
                f"{where} exports CONTROLS itself. Declare controls as structured data; Decode "
                "writes that block.",
            )
        )

    if _LITERAL_LAYOUT_FORMAT.search(source):
        found.append(
            _violation(
                "literal_layout_format",
                f"{where} passes a literal format to defineLayout. Call useFormat() and pass its "
                "complete result so safe-area regions have valid bounds.",
            )
        )

    if _DECODE_LAYOUT_HELPER.search(source):
        found.append(
            _violation(
                "decode_layout_helper",
                f"{where} uses a Decode layout helper. Compose with ordinary React, CSS, and SVG "
                "using standard Remotion frame APIs.",
            )
        )

    declared = {control.name for control in scene.controls}
    used = set(_PROPS.findall(source))
    # `function Scene({ speed, showLabels })` reads controls without ever
    # writing `props.` — collect the destructured names too, or the check
    # is blind to the idiomatic signature.
    destructured = _DESTRUCTURED_PARAMS.search(source)
    if destructured:
        params = destructured.group(1) or destructured.group(2) or ""
        used |= {
            name.strip().split("=")[0].split(":")[0].strip()
            for name in params.split(",")
            if name.strip()
        }
    # `script` and `words` are the choreography contract's own props — the
    # prompt REQUIRES `function Scene({ script, words })` — so counting them
    # as undeclared controls made every choreography scene unrepairable:
    # the model could satisfy the prompt or this gate, never both.
    undeclared = sorted(used - declared - {"progress", "script", "words"})
    if undeclared:
        found.append(
            _violation(
                "undeclared_control",
                f"{where} reads props.{', props.'.join(undeclared)} without declaring them as "
                "controls.",
            )
        )
    # A declared control whose name never appears in the source is a dead
    # slider: the creator drags it and nothing happens. Choreography scenes are
    # exempt — their knobs are the verb script, and blocking a whole scene over
    # an unwired slider cost nine placeholders in one build.
    choreography = bool(scene.script) or "<Choreography" in source
    unused = (
        []
        if choreography
        else sorted(name for name in declared if not re.search(rf"\b{re.escape(name)}\b", source))
    )
    if unused:
        found.append(
            _violation(
                "unused_control",
                f"{where} declares controls the component never reads: {', '.join(unused)}. "
                "Wire each into the scene or drop it.",
            )
        )

    found.extend(_validate_script(scene))

    return found


def _validate_script(scene: SceneModule) -> list[dict[str, str]]:
    """Structural checks on a choreography script, mirroring the runtime's
    contract: every verb names an element the cast declares, and `connect` /
    `transform` verbs name a far end. Regex over `<Subject id="...">` is the same
    deliberate ceiling as the rest of this file — the model emits literal ids."""
    verbs = scene.script
    if not verbs:
        return []
    where = scene.beat_id
    found: list[dict[str, str]] = []
    subject_ids = set(_SUBJECT_ID.findall(scene.component_source or ""))
    if not subject_ids:
        found.append(
            _violation(
                "script_without_subjects",
                f"{where}: a script names no <Subject id> in the cast. Wrap each "
                "animateable element in <Subject id> so the verbs have a target.",
            )
        )
    for verb in verbs:
        if verb.type in ("connect", "transform") and not verb.secondary_target_id:
            found.append(
                _violation(
                    "verb_missing_far_end",
                    f"{where}: {verb.type} verb {verb.id} names no secondary target.",
                )
            )
        for role, target in (("target", verb.target_id), ("far end", verb.secondary_target_id)):
            if target and subject_ids and target not in subject_ids:
                found.append(
                    _violation(
                        "verb_unknown_target",
                        f"{where}: verb {verb.id} {role} '{target}' is not a "
                        "<Subject id> in the cast.",
                    )
                )
    return found


def repair_message(violations: list[dict[str, str]], guidance: str) -> str:
    return (
        f"{guidance}\n\nDeterministic violations:\n"
        f"{json.dumps(violations, ensure_ascii=True, indent=2)}"
    )


def _violation(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


# The cast ids a choreography script may name: every animateable element is
# wrapped in <Subject id="...">, so the script can be checked against them.
_SUBJECT_ID = re.compile(r"<Subject\b[^>]*\bid\s*=\s*[\"']([^\"']+)[\"']")
