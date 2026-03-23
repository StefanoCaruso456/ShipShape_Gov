import { Command } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import type {
  FleetGraphPageContext,
  FleetGraphPageContextAction,
  FleetGraphPageContextActionIntent,
} from "@ship/shared";
import {
  beginFleetGraphNode,
  createFleetGraphCommand,
} from "../node-runtime.js";
import { inferFleetGraphQuestionTheme } from "../question-theme.js";
import type { FleetGraphState } from "../state.js";
import { createHandoff } from "../supervision.js";
import type { FleetGraphReasoning } from "../types.js";

type ReasonAboutCurrentViewTargets = "completeRun" | "fallback";
type FleetGraphCurrentViewAnswerMode = FleetGraphReasoning["answerMode"];
type IssueSurfaceQuestionIntent =
  | "attention"
  | "triage"
  | "stalled"
  | "cut"
  | "value_risk"
  | "impact"
  | "blockers"
  | "risk"
  | "next"
  | "summary"
  | "generic";

type ProjectsSurfaceQuestionIntent =
  | "attention"
  | "review"
  | "scope_change"
  | "risk"
  | "next"
  | "summary"
  | "generic";

function getAnswerMode(
  pageContext: FleetGraphPageContext,
): FleetGraphCurrentViewAnswerMode {
  switch (pageContext.kind) {
    case "issue_surface":
      return "execution";
    case "dashboard":
    case "programs":
    case "projects":
    case "issues":
    case "documents":
    case "team_directory":
    case "settings":
      return "launcher";
    case "my_week":
    case "document":
    case "person":
    case "generic":
    default:
      return "context";
  }
}

function getMetricValue(
  pageContext: FleetGraphPageContext,
  label: string,
): string | null {
  return (
    pageContext.metrics.find((metric) => metric.label === label)?.value ?? null
  );
}

function getMetricCount(
  pageContext: FleetGraphPageContext,
  label: string,
): number | null {
  const value = getMetricValue(pageContext, label);
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeQuestion(question: string | null): string {
  return question?.trim().toLowerCase() ?? "";
}

function questionIncludesAny(question: string, terms: string[]): boolean {
  return terms.some((term) => question.includes(term));
}

function splitDetail(detail: string | null | undefined): string[] {
  return (
    detail
      ?.split(" • ")
      .map((part) => part.trim())
      .filter(Boolean) ?? []
  );
}

function detailToSentences(detail: string | null | undefined): string | null {
  const parts = splitDetail(detail);
  if (parts.length === 0) {
    return null;
  }

  return `${parts.join(". ")}.`;
}

function getItemDetailValue(
  item: FleetGraphPageContext["items"][number] | null,
  prefix: string,
): string | null {
  if (!item?.detail) {
    return null;
  }

  const part = splitDetail(item.detail).find((segment) =>
    segment.startsWith(prefix),
  );
  return part ? part.slice(prefix.length).trim() : null;
}

function getIssueSurfaceQuestionIntent(
  question: string | null,
): IssueSurfaceQuestionIntent {
  const normalizedQuestion = normalizeQuestion(question);

  if (!normalizedQuestion) {
    return "generic";
  }

  if (
    questionIncludesAny(normalizedQuestion, ["block", "blocked", "dependency"])
  ) {
    return "blockers";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "cut",
      "defer",
      "move out",
      "reduce scope",
      "drop",
      "protect delivery",
    ])
  ) {
    return "cut";
  }

  if (questionIncludesAny(normalizedQuestion, ["triage"])) {
    return "triage";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "stalled",
      "stuck",
      "not moving",
      '"in progress"',
      "in progress",
    ])
  ) {
    return "stalled";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "impact",
      "value",
      "roi",
      "retention",
      "acquisition",
      "growth",
    ]) &&
    questionIncludesAny(normalizedQuestion, ["risk", "delivery", "at risk"])
  ) {
    return "value_risk";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "impact",
      "value",
      "roi",
      "retention",
      "acquisition",
      "growth",
    ])
  ) {
    return "impact";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "attention first",
      "needs attention",
      "attention",
      "look at first",
    ])
  ) {
    return "attention";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "next",
      "what should happen",
      "what do i do",
    ])
  ) {
    return "next";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "summarize",
      "what is on this page",
      "what am i looking at",
    ])
  ) {
    return "summary";
  }

  if (questionIncludesAny(normalizedQuestion, ["risk", "at risk"])) {
    return "risk";
  }

  return "generic";
}

function getProjectsSurfaceQuestionIntent(
  question: string | null,
): ProjectsSurfaceQuestionIntent {
  const normalizedQuestion = normalizeQuestion(question);

  if (!normalizedQuestion) {
    return "generic";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "review",
      "approval",
      "approve",
      "waiting on review",
      "waiting on approval",
    ])
  ) {
    return "review";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "added after sprint start",
      "after sprint start",
      "scope change",
      "scope changed",
      "what changed",
      "drift",
      "drifting",
    ])
  ) {
    return "scope_change";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "attention first",
      "needs attention",
      "attention",
      "open first",
      "which project",
    ])
  ) {
    return "attention";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "next",
      "what should happen",
      "what do i do",
    ])
  ) {
    return "next";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "summarize",
      "what is on this page",
      "what am i looking at",
    ])
  ) {
    return "summary";
  }

  if (
    questionIncludesAny(normalizedQuestion, [
      "risk",
      "at risk",
      "blocked",
      "stuck",
    ])
  ) {
    return "risk";
  }

  return "generic";
}

function getFirstAction(
  pageContext: FleetGraphPageContext,
  prefix: string,
): FleetGraphPageContextAction | null {
  return (
    pageContext.actions?.find((action) => action.label.startsWith(prefix)) ??
    null
  );
}

function isCutCandidateAction(action: FleetGraphPageContextAction): boolean {
  const corpus = `${action.label} ${action.reason ?? ""}`.toLowerCase();
  return corpus.includes("cut candidate");
}

function isRiskClusterAction(action: FleetGraphPageContextAction): boolean {
  const corpus = `${action.label} ${action.reason ?? ""}`.toLowerCase();
  return corpus.includes("risk cluster");
}

function getIssueItems(
  pageContext: FleetGraphPageContext,
  options?: {
    includeMarker?: string;
    excludeMarker?: string;
  },
): FleetGraphPageContext["items"] {
  return pageContext.items.filter((item) => {
    const normalizedLabel = item.label.toLowerCase();
    const detail = item.detail ?? "";

    if (!normalizedLabel.includes("#")) {
      return false;
    }

    if (options?.includeMarker && !detail.includes(options.includeMarker)) {
      return false;
    }

    if (options?.excludeMarker && detail.includes(options.excludeMarker)) {
      return false;
    }

    return true;
  });
}

function getProjectSurfaceItems(
  pageContext: FleetGraphPageContext,
  options?: {
    includeMarker?: string;
  },
): FleetGraphPageContext["items"] {
  return pageContext.items.filter((item) => {
    if (!options?.includeMarker) {
      return true;
    }

    return Boolean(item.detail?.includes(options.includeMarker));
  });
}

function getPreferredActionIntents(
  pageContext: FleetGraphPageContext,
  question: string | null,
): FleetGraphPageContextActionIntent[] {
  const normalizedQuestion = normalizeQuestion(question);

  if (
    normalizedQuestion.includes("impact") ||
    normalizedQuestion.includes("value") ||
    normalizedQuestion.includes("roi") ||
    normalizedQuestion.includes("retention") ||
    normalizedQuestion.includes("acquisition") ||
    normalizedQuestion.includes("growth")
  ) {
    return ["prioritize", "inspect", "follow_up"];
  }

  if (
    normalizedQuestion.includes("block") ||
    normalizedQuestion.includes("blocked") ||
    normalizedQuestion.includes("dependency")
  ) {
    return ["follow_up", "inspect", "prioritize"];
  }

  if (
    normalizedQuestion.includes("cut") ||
    normalizedQuestion.includes("defer") ||
    normalizedQuestion.includes("move out") ||
    normalizedQuestion.includes("reduce scope")
  ) {
    return ["prioritize", "follow_up", "inspect"];
  }

  if (normalizedQuestion.includes("triage")) {
    return ["prioritize", "inspect", "follow_up"];
  }

  if (
    normalizedQuestion.includes("stalled") ||
    normalizedQuestion.includes("stuck") ||
    normalizedQuestion.includes("not moving") ||
    normalizedQuestion.includes("in progress")
  ) {
    return ["follow_up", "inspect", "prioritize"];
  }

  if (
    normalizedQuestion.includes("follow-up") ||
    normalizedQuestion.includes("follow up") ||
    normalizedQuestion.includes("who") ||
    normalizedQuestion.includes("owner")
  ) {
    return ["follow_up", "prioritize", "inspect"];
  }

  if (
    normalizedQuestion.includes("review") ||
    normalizedQuestion.includes("approval") ||
    normalizedQuestion.includes("approve") ||
    normalizedQuestion.includes("waiting")
  ) {
    return ["follow_up", "inspect", "prioritize"];
  }

  if (
    normalizedQuestion.includes("added after sprint start") ||
    normalizedQuestion.includes("after sprint start") ||
    normalizedQuestion.includes("scope change") ||
    normalizedQuestion.includes("drift") ||
    normalizedQuestion.includes("changed")
  ) {
    return ["prioritize", "inspect", "follow_up"];
  }

  if (
    normalizedQuestion.includes("write") ||
    normalizedQuestion.includes("update") ||
    normalizedQuestion.includes("standup")
  ) {
    return ["write", "follow_up", "inspect"];
  }

  if (
    normalizedQuestion.includes("complete") ||
    normalizedQuestion.includes("finish") ||
    normalizedQuestion.includes("retro") ||
    normalizedQuestion.includes("plan")
  ) {
    return ["complete", "write", "inspect"];
  }

  if (pageContext.kind === "issue_surface") {
    return ["prioritize", "follow_up", "inspect"];
  }

  if (pageContext.kind === "my_week") {
    return ["follow_up", "write", "complete", "inspect"];
  }

  return ["inspect", "prioritize", "follow_up", "write", "complete"];
}

function getQuestionMatchBoost(
  action: FleetGraphPageContextAction,
  question: string | null,
): number {
  const normalizedQuestion = normalizeQuestion(question);
  const corpus = `${action.label} ${action.reason ?? ""}`.toLowerCase();

  if (
    normalizedQuestion.includes("impact") ||
    normalizedQuestion.includes("value") ||
    normalizedQuestion.includes("roi") ||
    normalizedQuestion.includes("retention") ||
    normalizedQuestion.includes("acquisition") ||
    normalizedQuestion.includes("growth")
  ) {
    return corpus.includes("highest-impact") ||
      corpus.includes("business value")
      ? 3
      : 0;
  }

  if (
    normalizedQuestion.includes("follow-up") ||
    normalizedQuestion.includes("follow up") ||
    normalizedQuestion.includes("who") ||
    normalizedQuestion.includes("owner")
  ) {
    return (
      (action.intent === "follow_up" ? 2 : 0) +
      (corpus.includes("owner") ? 1 : 0)
    );
  }

  if (
    normalizedQuestion.includes("review") ||
    normalizedQuestion.includes("approval") ||
    normalizedQuestion.includes("approve") ||
    normalizedQuestion.includes("waiting")
  ) {
    return corpus.includes("review queue") ||
      corpus.includes("waiting on review")
      ? 3
      : 0;
  }

  if (
    normalizedQuestion.includes("added after sprint start") ||
    normalizedQuestion.includes("after sprint start") ||
    normalizedQuestion.includes("scope change") ||
    normalizedQuestion.includes("drift") ||
    normalizedQuestion.includes("changed")
  ) {
    return corpus.includes("scope change") ||
      corpus.includes("added after sprint start")
      ? 3
      : 0;
  }

  if (
    normalizedQuestion.includes("block") ||
    normalizedQuestion.includes("blocked") ||
    normalizedQuestion.includes("dependency")
  ) {
    return corpus.includes("blocker") ||
      corpus.includes("dependency") ||
      action.intent === "follow_up"
      ? 3
      : 0;
  }

  if (
    normalizedQuestion.includes("cut") ||
    normalizedQuestion.includes("defer") ||
    normalizedQuestion.includes("move out") ||
    normalizedQuestion.includes("reduce scope")
  ) {
    return corpus.includes("cut candidate") || corpus.includes("move out")
      ? 3
      : 0;
  }

  if (
    normalizedQuestion.includes("stalled") ||
    normalizedQuestion.includes("stuck") ||
    normalizedQuestion.includes("not moving") ||
    normalizedQuestion.includes("in progress")
  ) {
    return corpus.includes("stalled") || corpus.includes("blocked") ? 3 : 0;
  }

  if (
    normalizedQuestion.includes("risk") ||
    normalizedQuestion.includes("blocked") ||
    normalizedQuestion.includes("stale") ||
    normalizedQuestion.includes("stuck")
  ) {
    return corpus.includes("risk cluster") ||
      corpus.includes("stale") ||
      corpus.includes("not started")
      ? 3
      : 0;
  }

  if (
    normalizedQuestion.includes("write") ||
    normalizedQuestion.includes("update") ||
    normalizedQuestion.includes("standup")
  ) {
    return action.intent === "write" ? 3 : 0;
  }

  if (
    normalizedQuestion.includes("complete") ||
    normalizedQuestion.includes("finish") ||
    normalizedQuestion.includes("retro") ||
    normalizedQuestion.includes("plan")
  ) {
    return action.intent === "complete" ? 3 : 0;
  }

  return 0;
}

function getPreferredAction(
  pageContext: FleetGraphPageContext,
  question: string | null,
): FleetGraphPageContextAction | null {
  const actions = pageContext.actions ?? [];
  if (actions.length === 0) {
    return null;
  }

  const preferredIntents = getPreferredActionIntents(pageContext, question);
  const rankedActions = [...actions].sort((left, right) => {
    const questionBoostDelta =
      getQuestionMatchBoost(right, question) -
      getQuestionMatchBoost(left, question);
    if (questionBoostDelta !== 0) {
      return questionBoostDelta;
    }

    const leftRank = preferredIntents.indexOf(left.intent ?? "inspect");
    const rightRank = preferredIntents.indexOf(right.intent ?? "inspect");
    return (
      (leftRank === -1 ? preferredIntents.length : leftRank) -
      (rightRank === -1 ? preferredIntents.length : rightRank)
    );
  });

  return rankedActions[0] ?? null;
}

function formatActionRecommendation(
  action: FleetGraphPageContextAction | null,
  fallback: string,
  extraWhenAction?: string | null,
): string {
  if (!action) {
    return fallback;
  }

  const parts = [
    action.label.endsWith(".") ? action.label : `${action.label}.`,
    action.reason,
    extraWhenAction,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" ");
}

function buildRecommendedNextStep(
  pageContext: FleetGraphPageContext,
  question: string | null,
): string | null {
  const normalizedQuestion = normalizeQuestion(question);
  const preferredAction = getPreferredAction(pageContext, question);
  const issueSurfaceIntent =
    pageContext.kind === "issue_surface"
      ? getIssueSurfaceQuestionIntent(question)
      : "generic";
  const projectsSurfaceIntent =
    pageContext.kind === "projects"
      ? getProjectsSurfaceQuestionIntent(question)
      : "generic";

  if (
    pageContext.kind === "issue_surface" &&
    issueSurfaceIntent === "blockers"
  ) {
    const blockerAction = getFirstAction(pageContext, "Follow up on blocker");
    if (blockerAction) {
      return formatActionRecommendation(
        blockerAction,
        "Then confirm the unblocker owner, the next checkpoint, and whether any scope should move out of the current week.",
        "Then confirm the unblocker owner, the next checkpoint, and whether any scope should move out of the current week.",
      );
    }
  }

  if (
    pageContext.kind === "issue_surface" &&
    issueSurfaceIntent === "stalled"
  ) {
    const stalledAction = getFirstAction(pageContext, "Follow up on stalled");
    if (stalledAction) {
      return formatActionRecommendation(
        stalledAction,
        "Then confirm whether it is a real blocker, stale ownership, or just a missing update on the current tab.",
        "Then confirm whether it is a real blocker, stale ownership, or just a missing update on the current tab.",
      );
    }

    const riskClusterAction = getFirstAction(pageContext, "Open risk cluster");
    return formatActionRecommendation(
      riskClusterAction,
      "No active issue looks clearly stalled from this tab, so the better move is to cut or re-triage untouched scope instead.",
      "No active issue looks clearly stalled from this tab, so the better move is to cut or re-triage untouched scope instead.",
    );
  }

  if (pageContext.kind === "issue_surface" && issueSurfaceIntent === "risk") {
    const riskClusterAction =
      getFirstAction(pageContext, "Open risk cluster") ??
      pageContext.actions?.find(isRiskClusterAction) ??
      null;

    if (riskClusterAction) {
      return formatActionRecommendation(
        riskClusterAction,
        "Then inspect the week or cluster with the most not-started, stale, or blocked work before considering any scope cuts.",
      );
    }

    const nonCutAction =
      pageContext.actions?.find((action) => !isCutCandidateAction(action)) ??
      null;
    if (nonCutAction) {
      return formatActionRecommendation(
        nonCutAction,
        "Then inspect the week or cluster that looks riskiest on this tab before considering any scope cuts.",
      );
    }

    return "Then inspect the week or cluster with the most not-started, stale, or blocked work before considering any scope cuts.";
  }

  if (pageContext.kind === "issue_surface" && issueSurfaceIntent === "cut") {
    const cutAction = getFirstAction(pageContext, "Review cut candidate");
    if (cutAction) {
      return formatActionRecommendation(
        cutAction,
        "Then confirm that moving it out will protect the highest-value work already in view.",
        "Then confirm that moving it out will protect the highest-value work already in view.",
      );
    }
  }

  if (pageContext.kind === "issue_surface" && issueSurfaceIntent === "triage") {
    const triageAction =
      getFirstAction(pageContext, "Open risk cluster") ??
      getFirstAction(pageContext, "Open highest-impact") ??
      preferredAction;

    return formatActionRecommendation(
      triageAction,
      "Then decide whether the untouched work needs clearer ownership, a same-day follow-up, or a scope cut before it pulls attention away from the highest-value work.",
    );
  }

  if (
    pageContext.kind === "issue_surface" &&
    issueSurfaceIntent === "attention"
  ) {
    const attentionAction =
      getFirstAction(pageContext, "Follow up on blocker") ??
      getFirstAction(pageContext, "Follow up on stalled") ??
      getFirstAction(pageContext, "Open highest-impact");
    if (attentionAction) {
      return formatActionRecommendation(
        attentionAction,
        "Then decide whether the second and third-ranked issues need follow-up today or can wait until the next checkpoint.",
        "Then decide whether the second and third-ranked issues need follow-up today or can wait until the next checkpoint.",
      );
    }
  }

  if (
    pageContext.kind === "issue_surface" &&
    (issueSurfaceIntent === "impact" || issueSurfaceIntent === "value_risk")
  ) {
    const highestImpactAction = getFirstAction(
      pageContext,
      "Open highest-impact",
    );
    if (highestImpactAction) {
      return formatActionRecommendation(
        highestImpactAction,
        "Then confirm whether its business case and delivery timing still justify keeping it at the top of the queue.",
        "Then confirm whether its business case and delivery timing still justify keeping it at the top of the queue.",
      );
    }
  }

  if (pageContext.kind === "projects" && projectsSurfaceIntent === "review") {
    const reviewAction =
      getFirstAction(pageContext, "Open review queue") ??
      getFirstAction(pageContext, "Open top attention") ??
      preferredAction;

    return formatActionRecommendation(
      reviewAction,
      "Then inspect the project issues view to see whether the wait is really review queue pressure or a missing owner decision.",
    );
  }

  if (
    pageContext.kind === "projects" &&
    projectsSurfaceIntent === "scope_change"
  ) {
    const scopeChangeAction =
      getFirstAction(pageContext, "Open scope change") ??
      getFirstAction(pageContext, "Open top attention") ??
      preferredAction;

    return formatActionRecommendation(
      scopeChangeAction,
      "Then inspect the project issues view to see whether the after-start additions are worth the delivery risk they add.",
    );
  }

  if (
    pageContext.kind === "projects" &&
    (projectsSurfaceIntent === "attention" || projectsSurfaceIntent === "risk")
  ) {
    const attentionAction =
      getFirstAction(pageContext, "Open top attention") ??
      getFirstAction(pageContext, "Open review queue") ??
      getFirstAction(pageContext, "Open scope change") ??
      preferredAction;

    return formatActionRecommendation(
      attentionAction,
      "Then inspect the project issues view to see whether the real drag is review wait, untouched scope, or stale open work.",
    );
  }

  if (pageContext.emptyState) {
    switch (pageContext.kind) {
      case "programs":
        return "Create the first program in this workspace or switch to the workspace that already has active work.";
      case "projects":
        return "Create a project, or open the owning program first if this workspace is still being structured.";
      case "issues":
        return "Create or capture the first issue so the team has a concrete backlog to review here.";
      case "documents":
        return "Create a document or open an existing one so FleetGraph has something concrete to reference on this surface.";
      default:
        return "Add work to this page or switch to a surface with active work before asking for deeper analysis.";
    }
  }

  switch (pageContext.kind) {
    case "my_week":
      return formatActionRecommendation(
        preferredAction,
        "Use this My Week surface to decide the next follow-up, weekly doc, or project that needs attention right now.",
      );
    case "issue_surface":
      return formatActionRecommendation(
        preferredAction,
        "Use this issues surface to move one visible todo issue forward, or cut scope from the busiest week or work cluster.",
      );
    case "programs":
      return "Open the program that looks most active or least clear so you can inspect its projects, issues, and current sprint.";
    case "projects":
      return "Open the project that needs the most attention, then use its sprint or weekly docs for deeper execution analysis.";
    case "issues":
      return "Triage the highest-signal issues first, then open the owning project or sprint if you need execution context.";
    case "documents":
      return "Open the document that best matches your question so FleetGraph can reason over the work in more detail.";
    case "team_directory":
      return "Open the person or team surface that owns this work if you need accountability, role, or follow-up context.";
    case "dashboard":
      return "Use this page to decide where to drill in next, then open the specific sprint, project, or document that needs action.";
    case "document":
    case "person":
      return "Stay on this document if you want doc-specific guidance, or open a related sprint/project view for execution risk analysis.";
    default:
      return "Use this page snapshot to decide the next document, person, or project you want to inspect.";
  }
}

function buildSummary(
  pageContext: FleetGraphPageContext,
  question: string | null,
): string {
  const normalizedQuestion = normalizeQuestion(question);
  const summary = pageContext.summary;
  const answerMode = getAnswerMode(pageContext);
  const issueSurfaceIntent =
    pageContext.kind === "issue_surface"
      ? getIssueSurfaceQuestionIntent(question)
      : "generic";
  const projectsSurfaceIntent =
    pageContext.kind === "projects"
      ? getProjectsSurfaceQuestionIntent(question)
      : "generic";

  if (!normalizedQuestion) {
    if (answerMode === "launcher" && !pageContext.emptyState) {
      return `${summary} Use this surface to choose the next document, project, program, or person to open instead of treating the list itself as an execution-health verdict.`;
    }

    return summary;
  }

  if (
    pageContext.kind === "issue_surface" &&
    issueSurfaceIntent === "blockers"
  ) {
    const blockedIssues = getMetricCount(pageContext, "Blocked issues");
    const staleBlockers = getMetricCount(pageContext, "Stale blockers");
    const oldestBlocker = getMetricValue(pageContext, "Oldest blocker");
    const blockerItem =
      pageContext.items.find(
        (item) =>
          item.detail?.includes("Blocker:") || item.detail?.includes("Blocked"),
      ) ?? null;

    if (blockedIssues && blockerItem) {
      const detail = blockerItem.detail?.replaceAll(" • ", ". ") ?? null;
      return `${blockerItem.label} is the clearest visible blocker right now.${detail ? ` ${detail}.` : ""}${staleBlockers ? ` ${staleBlockers} visible blocker${staleBlockers === 1 ? "" : "s"} have been sitting for multiple days.` : ""}${oldestBlocker ? ` Oldest blocker: ${oldestBlocker}.` : ""}`;
    }

    return `${summary} FleetGraph does not see an explicitly logged blocker on this tab right now, so the visible risk is coming more from stale or not-started work than from a named dependency.`;
  }

  if (
    pageContext.kind === "issue_surface" &&
    issueSurfaceIntent === "attention"
  ) {
    const rankedIssues = getIssueItems(pageContext, {
      excludeMarker: "Cut candidate",
    }).slice(0, 3);
    if (rankedIssues.length > 0) {
      const leadReason = detailToSentences(rankedIssues[0]?.detail);
      return `Start with ${rankedIssues.map((item) => item.label).join(", then ")}.${leadReason ? ` ${leadReason}` : " That ordering balances blockers, freshness, and business value on this tab."}`;
    }

    return `${summary} Start with the work that combines the strongest delivery risk and business importance on this tab.`;
  }

  if (pageContext.kind === "issue_surface" && issueSurfaceIntent === "triage") {
    const notStarted = getMetricCount(pageContext, "Not started");
    const riskCluster = getMetricValue(pageContext, "Risk cluster");
    const highestImpactIssue = getMetricValue(
      pageContext,
      "Highest impact issue",
    );

    if (notStarted && notStarted > 0) {
      return `${riskCluster ?? "The visible backlog"} is where triage pressure is building. ${pluralize(notStarted, "issue")} ${notStarted === 1 ? "is" : "are"} still sitting in triage, backlog, or todo on this tab.${highestImpactIssue ? ` Protect ${highestImpactIssue} while you decide what should be clarified, moved, or cut first.` : ""}`;
    }

    return "This tab does not show much untouched scope right now, so the better move is to focus on the active or blocked work already underway.";
  }

  if (
    pageContext.kind === "issue_surface" &&
    issueSurfaceIntent === "stalled"
  ) {
    const stalledActiveCount = getMetricCount(pageContext, "Stalled active");
    const inProgressCount = getMetricCount(pageContext, "In progress") ?? 0;
    const notStartedCount = getMetricCount(pageContext, "Not started");
    const stalledItem =
      getIssueItems(pageContext, { includeMarker: "Stalled in progress" })[0] ??
      null;

    if (stalledItem) {
      return `${stalledItem.label} is the clearest in-progress issue that looks stalled right now.${detailToSentences(stalledItem.detail) ? ` ${detailToSentences(stalledItem.detail)}` : ""}${stalledActiveCount && stalledActiveCount > 1 ? ` ${pluralize(stalledActiveCount, "active issue")} look stalled on this tab.` : ""}`;
    }

    if (inProgressCount > 0) {
      return `None of the ${pluralize(inProgressCount, "in-progress issue")} looks clearly stalled from this tab. ${notStartedCount ? `The bigger risk is ${pluralize(notStartedCount, "issue")} still not started.` : "The bigger risk is the untouched scope around the active work."}`;
    }

    return `There is no in-progress work on this tab right now. The main delivery risk is the work that still has not started.`;
  }

  if (pageContext.kind === "issue_surface" && issueSurfaceIntent === "risk") {
    const riskCluster = getMetricValue(pageContext, "Risk cluster");
    const notStarted = getMetricCount(pageContext, "Not started");
    const blocked = getMetricCount(pageContext, "Blocked issues");
    const stalled =
      getMetricCount(pageContext, "Stalled active") ??
      getMetricCount(pageContext, "In progress");

    if (riskCluster) {
      const notStartedPhrase = notStarted
        ? `${pluralize(notStarted, "issue")} ${notStarted === 1 ? "is" : "are"} still not started.`
        : "";
      const blockedPhrase = blocked
        ? `${pluralize(blocked, "issue")} ${blocked === 1 ? "is" : "are"} blocked.`
        : "";
      const stalledPhrase = stalled
        ? `${pluralize(stalled, "issue")} ${stalled === 1 ? "is" : "are"} stalled or stale.`
        : "";

      return `${riskCluster} is the clearest risk cluster on this tab.${notStartedPhrase ? ` ${notStartedPhrase}` : ""}${blockedPhrase ? ` ${blockedPhrase}` : ""}${stalledPhrase ? ` ${stalledPhrase}` : ""}`;
    }

    return `${summary} FleetGraph is treating the riskiest week or cluster on this tab as the main place to inspect before considering any scope cuts.`;
  }

  if (pageContext.kind === "issue_surface" && issueSurfaceIntent === "cut") {
    const cutCandidates = getIssueItems(pageContext, {
      includeMarker: "Cut candidate",
    }).slice(0, 2);
    const highestImpactIssue = getMetricValue(
      pageContext,
      "Highest impact issue",
    );

    if (cutCandidates.length > 0) {
      return `If you need to cut scope, start with ${cutCandidates.map((item) => item.label).join(", then ")}. They are not started and lower value than ${highestImpactIssue ?? "the highest-impact work on this tab"}, so they are safer to move out first.`;
    }

    return `This tab does not show an obvious low-cost cut. Protect ${highestImpactIssue ?? "the highest-impact work"} and trim risk somewhere other than the active or blocked issues first.`;
  }

  if (
    pageContext.kind === "issue_surface" &&
    issueSurfaceIntent === "value_risk"
  ) {
    const highestImpactItem =
      pageContext.items.find((item) =>
        item.detail?.includes("Highest impact"),
      ) ?? null;
    const highestImpactIssue =
      highestImpactItem?.label ??
      getMetricValue(pageContext, "Highest impact issue");
    const businessValue = getItemDetailValue(
      highestImpactItem,
      "Business value: ",
    );
    const risk = getItemDetailValue(highestImpactItem, "Risk: ");
    const riskCluster = getMetricValue(pageContext, "Risk cluster");

    if (highestImpactIssue) {
      if (risk === "active and moving") {
        return `${highestImpactIssue} is still the highest-value visible issue, but it is not the main delivery problem right now because it is already active and moving. ${riskCluster ? `${riskCluster} is where the untouched scope is building instead.` : "The bigger drag is the untouched scope around it."}`;
      }

      return `${highestImpactIssue} is where delivery risk is hitting the most valuable work right now.${businessValue ? ` Business value: ${businessValue}.` : ""}${risk ? ` It is currently ${risk}.` : ""}`;
    }

    return `${summary} FleetGraph can see the highest-value work here, but this tab does not yet show a single place where value and delivery risk are colliding the hardest.`;
  }

  if (pageContext.kind === "issue_surface" && issueSurfaceIntent === "impact") {
    const highestImpactIssue = getMetricValue(
      pageContext,
      "Highest impact issue",
    );
    const highestImpactProject = getMetricValue(
      pageContext,
      "Highest impact project",
    );
    const businessValue = getMetricValue(pageContext, "Business value");

    if (highestImpactIssue) {
      return `${highestImpactIssue} is the highest-impact visible issue on this tab.${highestImpactProject ? ` It belongs to ${highestImpactProject},` : ""}${businessValue ? ` which carries the strongest business value signal here at ${businessValue}.` : " It carries the strongest business value signal here."}`;
    }

    return `${summary} FleetGraph can rank visible issues here by business value and execution attention, but this surface does not yet show a single standout item.`;
  }

  if (
    pageContext.kind === "projects" &&
    projectsSurfaceIntent === "attention"
  ) {
    const topAttentionProject =
      getMetricValue(pageContext, "Top attention project") ??
      pageContext.items[0]?.label ??
      null;
    const topAttentionItem =
      pageContext.items.find((item) => item.label === topAttentionProject) ??
      pageContext.items[0] ??
      null;

    if (topAttentionProject && topAttentionItem) {
      return `${topAttentionProject} needs attention first.${detailToSentences(topAttentionItem.detail) ? ` ${detailToSentences(topAttentionItem.detail)}` : ""}`;
    }

    return `${summary} Open the project with the strongest mix of review wait, scope change, and open work first.`;
  }

  if (pageContext.kind === "projects" && projectsSurfaceIntent === "review") {
    const reviewItems = getProjectSurfaceItems(pageContext, {
      includeMarker: "Waiting on review:",
    }).slice(0, 2);
    const waitingOnReview = getMetricCount(pageContext, "Waiting on review");

    if (reviewItems.length > 0) {
      return `Review wait is most visible in ${reviewItems.map((item) => item.label).join(", then ")}.${detailToSentences(reviewItems[0]?.detail) ? ` ${detailToSentences(reviewItems[0]?.detail)}` : ""} This surface shows review queue pressure directly; approval state beyond that is only inferred here.`;
    }

    if (waitingOnReview && waitingOnReview > 0) {
      return `${summary} ${pluralize(waitingOnReview, "issue")} are visible in review from this project list, but no single project stands out more than the rest.`;
    }

    return `${summary} FleetGraph does not see a visible review queue on this tab right now, so there is no clear review hotspot to open first.`;
  }

  if (
    pageContext.kind === "projects" &&
    projectsSurfaceIntent === "scope_change"
  ) {
    const scopeChangeItems = getProjectSurfaceItems(pageContext, {
      includeMarker: "Added after sprint start:",
    }).slice(0, 2);
    const addedAfterSprintStart = getMetricCount(
      pageContext,
      "Added after sprint start",
    );

    if (scopeChangeItems.length > 0) {
      return `After sprint start, scope changed most in ${scopeChangeItems.map((item) => item.label).join(", then ")}.${detailToSentences(scopeChangeItems[0]?.detail) ? ` ${detailToSentences(scopeChangeItems[0]?.detail)}` : ""}`;
    }

    if (addedAfterSprintStart && addedAfterSprintStart > 0) {
      return `${summary} ${pluralize(addedAfterSprintStart, "issue")} were added after sprint start across the visible projects, but the change is not concentrated in one project.`;
    }

    return `${summary} FleetGraph does not see clear after-start scope growth on this tab right now.`;
  }

  if (pageContext.kind === "projects" && projectsSurfaceIntent === "risk") {
    const topAttentionProject =
      getMetricValue(pageContext, "Top attention project") ??
      pageContext.items[0]?.label ??
      null;
    const waitingOnReview = getMetricCount(pageContext, "Waiting on review");
    const addedAfterSprintStart = getMetricCount(
      pageContext,
      "Added after sprint start",
    );

    if (topAttentionProject) {
      return `${topAttentionProject} is carrying the clearest project-level risk on this tab.${waitingOnReview ? ` ${pluralize(waitingOnReview, "issue")} are currently waiting on review across the visible projects.` : ""}${addedAfterSprintStart ? ` ${pluralize(addedAfterSprintStart, "issue")} were added after sprint start.` : ""}`;
    }

    return `${summary} FleetGraph is using the current projects surface to see whether risk is concentrated in one project or spread across the list.`;
  }

  if (
    normalizedQuestion.includes("next") ||
    normalizedQuestion.includes("what should happen") ||
    normalizedQuestion.includes("what do i do")
  ) {
    if (pageContext.kind === "issue_surface") {
      return `${summary} Use this issue surface to decide what to move, triage, cut, or follow up on next.`;
    }

    if (pageContext.kind === "my_week") {
      return pageContext.emptyState
        ? `${summary} There is no active weekly work in view yet, so start by creating or opening the plan, retro, or project that should anchor this week.`
        : `${summary} This My Week view is best used to decide the next follow-up, weekly artifact, or project action that should move today.`;
    }

    return pageContext.emptyState
      ? `${summary} There is no active work on this page yet, so the next move is to create or open the right work surface first.`
      : answerMode === "launcher"
        ? `${summary} This page is best used to decide what to open next, who to inspect next, or where to follow up from here.`
        : `${summary} This page is best used to decide what to open or follow up on next.`;
  }

  if (
    normalizedQuestion.includes("risk") ||
    normalizedQuestion.includes("at risk") ||
    normalizedQuestion.includes("blocked")
  ) {
    if (pageContext.kind === "issue_surface") {
      return summary;
    }

    if (pageContext.kind === "my_week") {
      return `${summary} This My Week view already shows weekly execution signals, so use it to spot what is slipping before you drill into the underlying document or project.`;
    }

    return answerMode === "launcher"
      ? `${summary} This is a launcher surface, so FleetGraph is using the visible page context to point you toward the right work to inspect next rather than claiming this list alone proves execution risk.`
      : `${summary} This page gives portfolio and navigation context rather than full sprint-risk evidence, so use it to identify the right work to inspect next.`;
  }

  if (
    normalizedQuestion.includes("summarize") ||
    normalizedQuestion.includes("what is on this page") ||
    normalizedQuestion.includes("what am i looking at")
  ) {
    return summary;
  }

  if (pageContext.kind === "issue_surface") {
    return `${summary} FleetGraph is grounding this answer in the visible issues on the current tab, not just the document shell around them.`;
  }

  return answerMode === "launcher"
    ? `${summary} FleetGraph is grounding this answer in the current page snapshot so it can guide the next thing to open from this surface.`
    : `${summary} FleetGraph is grounding this answer in the current page snapshot rather than a sprint-only view.`;
}

function buildWhyNow(
  pageContext: FleetGraphPageContext,
  answerMode: FleetGraphCurrentViewAnswerMode,
  question: string | null,
): string {
  if (pageContext.kind === "issue_surface") {
    switch (getIssueSurfaceQuestionIntent(question)) {
      case "attention":
        return "I ranked the visible issues using blockers, freshness, state, and business value on this tab so the first answer is an order of operations, not a generic summary.";
      case "triage":
        return "I treated triage as the untouched work on this tab, then used risk clustering and business value to decide what should be clarified, moved, or protected first.";
      case "stalled":
        return "I only treated active work as stalled when it is still in progress and either has a logged blocker or has gone stale on the current tab.";
      case "risk":
        return "I ranked the current risk cluster first, then used not-started, blocked, and stale work to keep the recommendation on the riskiest week or cluster.";
      case "cut":
        return "I treated not-started, lower-value backlog work as safer to move out than blocked, active, or highest-impact work.";
      case "value_risk":
        return "I combined business value with execution attention to see whether the most valuable work is also where delivery risk is landing.";
      case "impact":
        return "I ranked visible work by business value first, then used execution attention to break ties on what matters most right now.";
      case "blockers":
        return "I used explicit blocker evidence, blocker age, and the latest issue ownership visible on this tab.";
      default:
        return "This answer is grounded in the visible issues on the current tab, including state mix, freshness, week grouping, and ownership in the worklist.";
    }
  }

  if (pageContext.kind === "my_week") {
    return "This answer is grounded in the work visible on your current My Week view, which can help you decide what to follow up on or open next without leaving the weekly workflow.";
  }

  if (pageContext.kind === "projects") {
    switch (getProjectsSurfaceQuestionIntent(question)) {
      case "attention":
        return "I ranked the visible projects using open work, review wait, after-start additions, stale movement, ownership clarity, and business value from the current projects surface.";
      case "review":
        return "I used the visible in-review queue on this tab as the strongest review signal. Approval state beyond that is only inferred here when the page lacks a clearer decision owner.";
      case "scope_change":
        return "I treated issues created after the current sprint start and already linked to active sprint work as after-start scope change on this tab.";
      case "risk":
        return "I compared project-level open work, review wait, after-start additions, stale movement, and business value to see where the strongest project-level risk is building.";
      default:
        return "This answer is grounded in the visible projects on this page, using project-level work mix and current sprint change signals to decide what to open next.";
    }
  }

  if (answerMode === "launcher") {
    return "This answer is grounded in the current page snapshot. FleetGraph is using this launcher surface to guide what to open next rather than score execution health from the list alone.";
  }

  return "This answer is grounded in the work visible on the page you are currently viewing.";
}

function buildIssueSurfaceEvidence(
  pageContext: FleetGraphPageContext,
  intent: IssueSurfaceQuestionIntent,
): string[] {
  const metricLabelsByIntent: Record<IssueSurfaceQuestionIntent, string[]> = {
    attention: [
      "Blocked issues",
      "Stalled active",
      "Highest impact issue",
      "Business value",
      "Risk cluster",
    ],
    triage: [
      "Visible issues",
      "Not started",
      "Risk cluster",
      "Highest impact issue",
      "Business value",
    ],
    stalled: ["In progress", "Stalled active", "Blocked issues", "Not started"],
    cut: [
      "Not started",
      "Risk cluster",
      "Highest impact issue",
      "Business value",
    ],
    value_risk: [
      "Highest impact issue",
      "Highest impact project",
      "Business value",
      "Risk cluster",
      "Not started",
    ],
    impact: [
      "Highest impact issue",
      "Highest impact project",
      "Business value",
      "Risk cluster",
    ],
    blockers: [
      "Blocked issues",
      "Stale blockers",
      "Oldest blocker",
      "Risk cluster",
    ],
    risk: [
      "Blocked issues",
      "Stalled active",
      "Stale open",
      "Not started",
      "Risk cluster",
    ],
    next: [
      "Blocked issues",
      "Stalled active",
      "Highest impact issue",
      "Risk cluster",
    ],
    summary: ["Visible issues", "In progress", "Not started", "Risk cluster"],
    generic: ["Visible issues", "In progress", "Not started", "Risk cluster"],
  };
  const metricEvidence = metricLabelsByIntent[intent]
    .map((label) => {
      const value = getMetricValue(pageContext, label);
      return value ? `${label}: ${value}` : null;
    })
    .filter((value): value is string => Boolean(value));

  const itemEvidence = (() => {
    switch (intent) {
      case "blockers":
        return getIssueItems(pageContext, { includeMarker: "Blocker:" }).slice(
          0,
          2,
        );
      case "stalled":
        return getIssueItems(pageContext, {
          includeMarker: "Stalled in progress",
        }).slice(0, 2);
      case "triage":
      case "cut":
        return getIssueItems(pageContext, {
          includeMarker: "Cut candidate",
        }).slice(0, 2);
      case "value_risk":
      case "impact":
        return pageContext.items
          .filter((item) => item.detail?.includes("Highest impact"))
          .slice(0, 1);
      case "attention":
        return getIssueItems(pageContext, {
          excludeMarker: "Cut candidate",
        }).slice(0, 3);
      default:
        return getIssueItems(pageContext).slice(0, 2);
    }
  })().map((item) =>
    item.detail ? `${item.label}: ${item.detail}` : item.label,
  );

  return [...metricEvidence, ...itemEvidence].slice(0, 6);
}

function buildProjectsSurfaceEvidence(
  pageContext: FleetGraphPageContext,
  intent: ProjectsSurfaceQuestionIntent,
): string[] {
  const metricLabelsByIntent: Record<ProjectsSurfaceQuestionIntent, string[]> =
    {
      attention: [
        "Visible projects",
        "Needs attention",
        "Waiting on review",
        "Added after sprint start",
        "Top attention project",
      ],
      review: ["Waiting on review", "Needs attention", "Top attention project"],
      scope_change: [
        "Added after sprint start",
        "Needs attention",
        "Top attention project",
      ],
      risk: [
        "Needs attention",
        "Waiting on review",
        "Added after sprint start",
        "Top attention project",
        "Highest value project",
      ],
      next: [
        "Needs attention",
        "Top attention project",
        "Highest value project",
      ],
      summary: [
        "Visible projects",
        "Open issues",
        "Needs attention",
        "Top attention project",
      ],
      generic: [
        "Visible projects",
        "Open issues",
        "Needs attention",
        "Top attention project",
      ],
    };

  const metricEvidence = metricLabelsByIntent[intent]
    .map((label) => {
      const value = getMetricValue(pageContext, label);
      return value ? `${label}: ${value}` : null;
    })
    .filter((value): value is string => Boolean(value));

  const itemEvidence = (() => {
    switch (intent) {
      case "review":
        return getProjectSurfaceItems(pageContext, {
          includeMarker: "Waiting on review:",
        }).slice(0, 2);
      case "scope_change":
        return getProjectSurfaceItems(pageContext, {
          includeMarker: "Added after sprint start:",
        }).slice(0, 2);
      case "attention":
      case "risk":
        return pageContext.items.slice(0, 3);
      default:
        return pageContext.items.slice(0, 2);
    }
  })().map((item) =>
    item.detail ? `${item.label}: ${item.detail}` : item.label,
  );

  return [...metricEvidence, ...itemEvidence].slice(0, 6);
}

function buildEvidence(
  pageContext: FleetGraphPageContext,
  question: string | null,
): string[] {
  if (pageContext.kind === "issue_surface") {
    return buildIssueSurfaceEvidence(
      pageContext,
      getIssueSurfaceQuestionIntent(question),
    );
  }

  if (pageContext.kind === "projects") {
    return buildProjectsSurfaceEvidence(
      pageContext,
      getProjectsSurfaceQuestionIntent(question),
    );
  }

  const metricEvidence = pageContext.metrics.map(
    (metric) => `${metric.label}: ${metric.value}`,
  );
  const itemEvidence = pageContext.items
    .map((item) => (item.detail ? `${item.label}: ${item.detail}` : item.label))
    .slice(0, 4);

  return [...metricEvidence, ...itemEvidence].slice(0, 6);
}

function buildReasoning(
  pageContext: FleetGraphPageContext,
  question: string | null,
): FleetGraphReasoning {
  const evidence = buildEvidence(pageContext, question);
  const answerMode = getAnswerMode(pageContext);

  return {
    answerMode,
    summary: buildSummary(pageContext, question),
    evidence,
    whyNow: buildWhyNow(pageContext, answerMode, question),
    recommendedNextStep: buildRecommendedNextStep(pageContext, question),
    confidence:
      evidence.length >= 3 ? "high" : evidence.length > 0 ? "medium" : "low",
  };
}

export async function reasonAboutCurrentViewNode(
  state: FleetGraphState,
  config?: RunnableConfig,
): Promise<Command<ReasonAboutCurrentViewTargets>> {
  const started = beginFleetGraphNode(state, config, {
    nodeName: "reasonAboutCurrentView",
    phase: "reasoning",
    guardFailureTarget: "fallback",
  });
  const runtime = started.runtime;

  if ("command" in started) {
    return started.command;
  }

  const pageContext = state.prompt?.pageContext ?? null;

  if (!pageContext) {
    return createFleetGraphCommand(started.context, "completeRun", {
      stage: "current_view_reasoning_skipped",
      handoff: createHandoff(
        "reasonAboutCurrentView",
        "completeRun",
        "no page context was available for current-view reasoning",
      ),
    });
  }

  runtime.logger.debug("Reasoning about FleetGraph current-view page context", {
    kind: pageContext.kind,
    route: pageContext.route,
    title: pageContext.title,
    emptyState: pageContext.emptyState,
  });

  const question = state.prompt?.question ?? null;
  const deterministicReasoning = buildReasoning(pageContext, question);
  let reasoning = deterministicReasoning;
  let reasoningSource: FleetGraphState["reasoningSource"] = "deterministic";

  if (state.mode === "on_demand" && runtime.reasoner) {
    try {
      const modelReasoning = await runtime.reasoner.reasonAboutCurrentView(
        {
          activeViewRoute: state.activeView?.route ?? pageContext.route ?? null,
          question,
          questionTheme: inferFleetGraphQuestionTheme(question),
          workPersona: state.actor?.workPersona ?? null,
          pageContext,
          deterministicDraft: deterministicReasoning,
        },
        {
          runnableConfig: config,
          traceMetadata: {
            reasoning_scope: "current_view",
            active_view_route: state.activeView?.route ?? pageContext.route ?? null,
            page_context_kind: pageContext.kind,
          },
        },
      );

      if (modelReasoning) {
        reasoning = modelReasoning;
        reasoningSource = "model";
      }
    } catch (error) {
      runtime.logger.warn(
        "FleetGraph current-view model reasoning failed; using deterministic fallback",
        {
          route: pageContext.route,
          kind: pageContext.kind,
          message:
            error instanceof Error
              ? error.message
              : "Unknown FleetGraph current-view reasoning failure",
        },
      );
    }
  }

  return createFleetGraphCommand(started.context, "completeRun", {
    stage: "current_view_reasoned",
    reasoning,
    reasoningSource,
    attempts: {
      ...state.attempts,
      reasoning: state.attempts.reasoning + 1,
    },
    handoff: createHandoff(
      "reasonAboutCurrentView",
      "completeRun",
      "generated a grounded answer from the current page snapshot",
    ),
  });
}
