import type { CrewId, CrewMember, TabId } from "./types";

/**
 * The crew — one cohesive AI, presented as five named specialists.
 *
 * This is the single source that drives the sidebar mark, the header pill,
 * handoff cards, the drawer, and scene notes. Never label the AI "Assistant"
 * or "AI" — always the specific role.
 *
 * Five, not eight, and each one is a step you would actually sit down and
 * review. The test a department has to pass is simple: does it produce
 * something a person would open on its own, and does it need a different craft
 * from its neighbours? Anything that fails both is an implementation detail.
 *
 * Which means the count of *agents* is not the count of names here. Motion
 * Designer is two agents internally — one deciding what a scene should show,
 * one writing the HTML for it, with context isolation between them so the
 * HTML generator never sees the source document. You review the storyboard and
 * you review the render; you never review the handoff between them. Granularity
 * inside a department is an engineering decision, granularity you can see is a
 * product decision, and conflating the two is what turns six roles into ten.
 *
 * Two changes from the earlier six:
 *
 * - **Voice is not a department.** Choosing a voice is a setting, and speaking
 *   the script is the Writer's own output being rendered. So the Writer hands
 *   on script *and* narration — which is also what makes scene duration a
 *   measured number rather than an invented one, since the audio is what the
 *   timeline is built around.
 * - **Editor exists.** Syncing narration to animation — stretching a motion to
 *   land with a line, holding a beat after a reveal — had no owner, despite
 *   being the craft the product is actually selling.
 */
export const CREW: Record<CrewId, CrewMember> = {
  producer: {
    id: "producer",
    name: "Producer",
    initial: "P",
    color: "#C2410C",
    stage: "overview",
    artifact: "Production brief",
  },
  director: {
    id: "director",
    name: "Director",
    initial: "D",
    color: "#4C5B7A",
    stage: "plan",
    artifact: "Teaching Plan",
  },
  writer: {
    id: "writer",
    name: "Writer",
    initial: "W",
    color: "#7A5B4C",
    stage: "script",
    artifact: "Scene script · narration",
  },
  motion: {
    id: "motion",
    name: "Motion Designer",
    initial: "M",
    color: "#6B4F6B",
    stage: "edit",
    artifact: "Scene visuals",
  },
  editor: {
    id: "editor",
    name: "Editor",
    initial: "E",
    color: "#4A6472",
    stage: "edit",
    artifact: "Timeline",
  },
};

/**
 * Which specialist owns which stage.
 *
 * Edit is a shared room: the Motion Designer owns scene visuals while the
 * Editor owns the timeline. The Editor also owns finishing and export. That is
 * not a
 * gap in the model — final touches, music and export are an editor's job in
 * any real cut, and giving the last mile to someone who has not been watching
 * the whole thing is how continuity errors ship.
 */
export const STAGE_OWNER: Record<TabId, CrewMember> = {
  overview: CREW.producer,
  plan: CREW.director,
  script: CREW.writer,
  edit: CREW.editor,
  export: CREW.editor,
};
