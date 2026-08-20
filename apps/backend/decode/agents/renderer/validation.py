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
        violations.extend(_validate_stage_and_palette(scene, palette))

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


# The host paints the stage; an opaque fill anywhere turns the film back into
# slides. Any AbsoluteFill carrying a background — root or nested — and any
# absolutely-positioned full-frame element (`inset: 0`) with a background are
# the same violation wearing different markup.
_OPAQUE_FILL = re.compile(
    r"<AbsoluteFill[^>]{0,400}?\b(?:backgroundColor|background)\s*:", re.DOTALL
)
_OPAQUE_INSET = re.compile(
    r"\binset\s*:\s*['\"]?0\b[^}]{0,300}?\b(?:backgroundColor|background)\s*:"
    r"|\b(?:backgroundColor|background)\s*:[^}]{0,300}?\binset\s*:\s*['\"]?0\b",
    re.DOTALL,
)
_HEX = re.compile(r"#[0-9a-fA-F]{6}\b")
# Every way a color literal enters a style: 6- and 3-digit hex, rgb()/rgba(),
# hsl()/hsla(). The palette check must see all of them — rgba() is the natural
# spelling of the opacity-varied emphasis the prompt itself recommends.
_COLOR_LITERAL = re.compile(
    r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\b(?:rgba?|hsla?)\(\s*([^)]*)\)"
)
_PRIMITIVES = re.compile(
    r"<(?:Act|Stack|Row|Anchor|Label|Connector|Card|Arrow|Subject|Choreography"
    r"|Container|Grid|Badge|DataStream|CodeBlock|MetricCard|Database|Queue|Cloud|Timeline)\b"
)
# The cast ids a choreography script may name: every animateable element is
# wrapped in <Subject id="...">, so the script can be checked against them.
_SUBJECT_ID = re.compile(r"<Subject\b[^>]*\bid\s*=\s*[\"']([^\"']+)[\"']")
_FONT_SIZE = re.compile(r"\bfontSize\s*:\s*(\d+)")
_LABEL_SIZE = re.compile(r"<Label\b[^>]{0,400}?\bsize\s*=\s*\{?\s*(\d+)", re.DOTALL)
_SVG_BLOCK = re.compile(r"<svg\b.*?</svg>", re.DOTALL | re.IGNORECASE)
_TYPE_FLOOR = 20
# SVG diagrams position freely, but their text is read at the same distance as
# everything else — a slightly lower floor allows dense diagram callouts.
_SVG_FONT = re.compile(r"\bfont-?[sS]ize\s*[:=]\s*[\"']?(\d+)")
_SVG_TYPE_FLOOR = 16
# Strict SVG gates: the SVG interior is the one place the model positions
# freely, so it is where scenes go bad — clipped labels, off-brand fills,
# postage-stamp diagrams. All lexical, same ceiling as the rest of this file.
_SVG_OPEN_TAG = re.compile(r"<svg\b[^>]*>", re.IGNORECASE)
_SVG_VIEWBOX = re.compile(r"\bviewBox\s*=\s*[\"']\s*([\d.,\s-]+)[\"']")
_SVG_ELEMENT = re.compile(r"<(rect|circle|ellipse|line|text)\b([^>]*)>", re.IGNORECASE)
_SVG_NUM_ATTR = re.compile(
    r"\b(x|y|cx|cy|x1|y1|x2|y2|r|rx|ry|width|height)\s*=\s*[\"'{]?\s*(-?\d+(?:\.\d+)?)"
)
# Saturated CSS color names sidestep every hex/rgb/hsl palette check.
_NAMED_COLOR = re.compile(
    r"\b(?:fill|stroke|color|backgroundColor|background)\s*[:=]\s*[\"']"
    r"(red|blue|green|orange|yellow|purple|pink|cyan|magenta|lime|teal|gold|violet|indigo|crimson|coral|salmon|turquoise|orchid|khaki)[\"']",
    re.IGNORECASE,
)
_SVG_MIN_EXTENT = 400  # design px; below this a diagram is unreadable at 1080p
_ABSOLUTE_POSITION = re.compile(r"\bposition\s*:\s*[\"']absolute[\"']")
_TRANSLATE = re.compile(r"\btranslate([XY])\s*\(\s*\$?\{?\s*(-?\d+(?:\.\d+)?)(?:px)?\s*\)?", re.IGNORECASE)
_SCALE = re.compile(r"\bscale\s*\(\s*(\d+(?:\.\d+)?)\s*\)")


def _color_to_hue_sat(literal: str) -> tuple[float, float] | None:
    """Hue/saturation for any supported color literal; None if unparsable."""
    text = literal.strip()
    if text.startswith("#"):
        if len(text) == 4:  # #RGB → #RRGGBB
            text = "#" + "".join(ch * 2 for ch in text[1:])
        if len(text) != 7:
            return None
        return _hue_sat(text)
    match = re.match(r"(rgba?|hsla?)\(\s*([^)]*)\)", text)
    if not match:
        return None
    kind, body = match.groups()
    parts = [p.strip() for p in re.split(r"[,/]", body) if p.strip()]
    if len(parts) < 3:
        return None
    try:
        if kind.startswith("hsl"):
            hue = float(re.sub(r"deg$", "", parts[0]))
            sat = float(parts[1].rstrip("%")) / 100
            return hue % 360, sat
        channels = [
            float(p.rstrip("%")) / 100 if p.endswith("%") else float(p) / 255
            for p in parts[:3]
        ]
    except ValueError:
        return None
    r, g, b = (max(0.0, min(1.0, c)) for c in channels)
    return _hue_sat(f"#{round(r * 255):02x}{round(g * 255):02x}{round(b * 255):02x}")


def _hue_sat(hex_color: str) -> tuple[float, float]:
    r, g, b = (int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5))
    high, low = max(r, g, b), min(r, g, b)
    delta = high - low
    lightness = (high + low) / 2
    if delta == 0:
        return 0.0, 0.0
    sat = delta / (1 - abs(2 * lightness - 1)) if lightness not in (0, 1) else 0.0
    if high == r:
        hue = 60 * (((g - b) / delta) % 6)
    elif high == g:
        hue = 60 * ((b - r) / delta + 2)
    else:
        hue = 60 * ((r - g) / delta + 4)
    return hue, sat


def _element_extent(tag: str, attrs: dict[str, float]) -> tuple[float, float, float, float] | None:
    """Rough (left, top, right, bottom) for one SVG element's literal geometry."""
    if tag in ("rect", "text"):
        if "x" not in attrs or "y" not in attrs:
            return None
        left, top = attrs["x"], attrs["y"]
        return left, top, left + attrs.get("width", 0), top + attrs.get("height", 0)
    if tag == "circle":
        if "cx" not in attrs or "cy" not in attrs:
            return None
        r = attrs.get("r", 0)
        return attrs["cx"] - r, attrs["cy"] - r, attrs["cx"] + r, attrs["cy"] + r
    if tag == "ellipse":
        if "cx" not in attrs or "cy" not in attrs:
            return None
        rx, ry = attrs.get("rx", 0), attrs.get("ry", 0)
        return attrs["cx"] - rx, attrs["cy"] - ry, attrs["cx"] + rx, attrs["cy"] + ry
    if tag == "line":
        needed = ("x1", "y1", "x2", "y2")
        if any(key not in attrs for key in needed):
            return None
        return (
            min(attrs["x1"], attrs["x2"]),
            min(attrs["y1"], attrs["y2"]),
            max(attrs["x1"], attrs["x2"]),
            max(attrs["y1"], attrs["y2"]),
        )
    return None


def _validate_svg(scene: SceneModule) -> list[dict[str, str]]:
    """Strict gates on SVG interiors — the free-positioning zone.

    SVG clips to its viewBox by default, so a literal coordinate outside it is
    invisible content: a label the narration names but nobody ever sees.
    """
    source = scene.component_source or ""
    where = scene.beat_id
    found: list[dict[str, str]] = []
    for block in _SVG_BLOCK.findall(source):
        open_tag = _SVG_OPEN_TAG.search(block)
        header = open_tag.group(0) if open_tag else ""
        box = _SVG_VIEWBOX.search(header)
        if not box:
            found.append(
                _violation(
                    "svg_missing_viewbox",
                    f"{where}: an <svg> has no viewBox. Declare one so its coordinate "
                    "space is explicit and bounded.",
                )
            )
            continue
        try:
            min_x, min_y, view_w, view_h = (
                float(v) for v in box.group(1).replace(",", " ").split()
            )
        except ValueError:
            found.append(
                _violation(
                    "svg_missing_viewbox",
                    f"{where}: an <svg> viewBox is malformed; use 'minX minY width height'.",
                )
            )
            continue
        if view_w < _SVG_MIN_EXTENT or view_h < _SVG_MIN_EXTENT / 2:
            found.append(
                _violation(
                    "svg_too_small",
                    f"{where}: an <svg> viewBox is {view_w:g}x{view_h:g} — too small to read "
                    f"on the frame. A dominant diagram is 1200x650+; size shapes to use it.",
                )
            )
        clipped: list[str] = []
        for tag_match in _SVG_ELEMENT.finditer(block):
            tag = tag_match.group(1).lower()
            attrs = {
                name: float(value)
                for name, value in _SVG_NUM_ATTR.findall(tag_match.group(2))
            }
            extent = _element_extent(tag, attrs)
            if extent is None:
                continue
            left, top, right, bottom = extent
            pad = 2
            if (
                right < min_x - pad
                or bottom < min_y - pad
                or left > min_x + view_w + pad
                or top > min_y + view_h + pad
                # text anchors near the edge still draw glyphs past it; shapes
                # partially outside are also clipped content.
                or left < min_x - pad
                or top < min_y - pad
                or right > min_x + view_w + pad
                or bottom > min_y + view_h + pad
            ):
                clipped.append(tag)
        if clipped:
            found.append(
                _violation(
                    "svg_out_of_bounds",
                    f"{where}: SVG elements positioned outside the viewBox get clipped "
                    f"invisibly: {', '.join(sorted(set(clipped)))}. Keep every literal "
                    "coordinate inside the declared viewBox.",
                )
            )
    named = sorted({m.group(1).lower() for m in _NAMED_COLOR.finditer(source)})
    if named:
        found.append(
            _violation(
                "named_color",
                f"{where}: named CSS colors bypass the palette: {', '.join(named)}. "
                "Use the project palette's hex values.",
            )
        )
    return found


def _validate_stage_and_palette(scene: SceneModule, palette: dict | None) -> list[dict[str, str]]:
    source = scene.component_source or ""
    found: list[dict[str, str]] = []
    found.extend(_validate_svg(scene))
    if not _PRIMITIVES.search(source):
        found.append(
            _violation(
                "no_primitives",
                f"{scene.beat_id}: compose placement with the relational layout primitives "
                "(Stack/Row/Anchor/Label/Connector from @decode/animation-api) instead of "
                "freehand coordinates — sibling groups in Stack/Row, captions in Anchor, "
                "between-labels in Connector, standalone text in Label.",
            )
        )
    if _OPAQUE_FILL.search(source) or _OPAQUE_INSET.search(source):
        found.append(
            _violation(
                "opaque_root",
                f"{scene.beat_id}: a full-frame element paints a background (an AbsoluteFill "
                "with a background, or an inset-0 layer). The host paints the stage; remove "
                "full-frame fills so the scene is transparent over it.",
            )
        )
    prose = _SVG_BLOCK.sub("", source)
    # Freehand absolute layout outside <svg> is the exact failure the
    # primitives exist to prevent; one decorative <Label> must not license it.
    # AbsoluteFill is the sanctioned frame anchor, so it doesn't count.
    freehand = len(_ABSOLUTE_POSITION.findall(prose))
    if freehand > 2:
        found.append(
            _violation(
                "freehand_absolute",
                f"{scene.beat_id}: {freehand} absolutely-positioned elements outside <svg>. "
                "Place elements relationally with Stack/Row/Anchor/Connector; absolute "
                "coordinates belong only inside an <svg> diagram.",
            )
        )
    # A literal transform larger than the frame is an authored off-screen
    # excursion the 800ms runtime sampler can miss entirely.
    excursions = sorted(
        {
            f"translate{axis}({value})"
            for axis, value in _TRANSLATE.findall(prose)
            if abs(float(value)) > (1920 if axis.upper() == "X" else 1080)
        }
        | {f"scale({value})" for value in _SCALE.findall(prose) if float(value) > 2}
    )
    if excursions:
        found.append(
            _violation(
                "transform_off_frame",
                f"{scene.beat_id}: transform literals leave the frame: "
                f"{', '.join(excursions)}. Animate within the frame — enter from just "
                "outside an element's region, not from beyond the bezel.",
            )
        )
    small = sorted(
        {
            int(value)
            for value in _FONT_SIZE.findall(prose) + _LABEL_SIZE.findall(prose)
            if int(value) < _TYPE_FLOOR
        }
    )
    svg_small = sorted(
        {
            int(value)
            for block in _SVG_BLOCK.findall(source)
            for value in _SVG_FONT.findall(block)
            if int(value) < _SVG_TYPE_FLOOR
        }
    )
    if svg_small:
        found.append(
            _violation(
                "svg_type_below_floor",
                f"{scene.beat_id}: SVG text sized below the {_SVG_TYPE_FLOOR}px floor: "
                f"{', '.join(str(v) for v in svg_small)}px. Diagram callouts are "
                f"{_SVG_TYPE_FLOOR}px+ so they stay readable in the frame.",
            )
        )
    if small:
        found.append(
            _violation(
                "type_below_floor",
                f"{scene.beat_id}: text sized below the {_TYPE_FLOOR}px floor: "
                f"{', '.join(str(v) for v in small)}px. Support text is 20px+, labels 24px+, "
                "focal words 64px+.",
            )
        )
    if palette:
        # Saturated hues must stay in a palette color's hue family; desaturated
        # values (surfaces, greys, near-blacks, off-whites) are always allowed.
        allowed = [_hue_sat(value)[0] for value in palette.values() if _HEX.fullmatch(value)]
        off = sorted(
            {
                literal
                for literal in (m.group(0) for m in _COLOR_LITERAL.finditer(source))
                for parsed in [_color_to_hue_sat(literal)]
                if parsed is not None
                and parsed[1] > 0.35
                and not any(
                    min(abs(parsed[0] - hue), 360 - abs(parsed[0] - hue)) <= 25
                    for hue in allowed
                )
            }
        )
        if off:
            found.append(
                _violation(
                    "off_palette",
                    f"{scene.beat_id}: colors outside the project palette: {', '.join(off)}. "
                    "Replace each with the palette slot (or a tint in its hue family) that "
                    "carries the same meaning.",
                )
            )
    return found
