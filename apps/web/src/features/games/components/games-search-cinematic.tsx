"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { DotaMatchMode } from "@reviewo/shared";

import { OpiniaIcon } from "../../../components/opinia-icon";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import {
  createDotaProfile,
  createGuestDotaProfile,
  setDotaLfgLooking
} from "../../dota/api/dota-api";
import { DotaMmrField } from "../../dota/components/dota-mmr-field";
import {
  DOTA_PROFILE_CINEMATIC_ARRIVED_EVENT,
  DOTA_PROFILE_CREATED_EVENT,
  type DotaProfileCreatedEventDetail
} from "../../dota/hooks/use-my-dota-profile-nav";
import {
  formatDotaMmr,
  formatDotaMmrRange,
  getDotaPositionLabel,
  isValidDotaMmrInput,
  resolveDotaMmrMode
} from "../../dota/lib/labels";
import { stashDotaRecovery } from "../../dota/lib/recovery-storage";
import type { DotaProfile } from "../../dota/types/dota";
import { useTranslation } from "../../i18n/locale-provider";
import { createGameParty, disbandGameParty } from "../../social/api/social-api";
import type { DotaPositionRole, GameParty } from "../../social/types/social";
import type { IntentMode } from "./games-search-onboarding-types";
import type {
  GamesSearchCinematicPhase,
  GamesSearchCinematicResult,
  GamesSearchCinematicVisualPhase
} from "./games-search-cinematic-types";
import styles from "./games-search-cinematic.module.css";

const ROLE_POSITIONS = ["1", "2", "3", "4", "5"] as const satisfies readonly DotaPositionRole[];
const MATCH_MODE_STORAGE_KEY = "opinia.matchMode";

interface PreparedContext {
  accessToken: string;
  party: GameParty | null;
  profile: DotaProfile;
}

interface GamesSearchCinematicProps {
  onComplete: (result: GamesSearchCinematicResult) => void;
  onPrepared: (result: GamesSearchCinematicResult) => void;
  onVisualPhase: (phase: GamesSearchCinematicVisualPhase) => void;
}

type QuestionnaireState = "center" | "docking" | "hidden";

export function GamesSearchCinematic({
  onComplete,
  onPrepared,
  onVisualPhase
}: GamesSearchCinematicProps) {
  const t = useTranslation();
  const { authSession, storeAuthSession } = useAuthSession();
  const [phase, setPhase] = useState<GamesSearchCinematicPhase>("intent");
  const [questionnaireState, setQuestionnaireState] = useState<QuestionnaireState>("center");
  const [intentMode, setIntentMode] = useState<IntentMode>("join");
  const [selectedIntent, setSelectedIntent] = useState<IntentMode | null>(null);
  const [matchMode, setMatchMode] = useState<DotaMatchMode | null>(null);
  const [selectedMatchMode, setSelectedMatchMode] = useState<DotaMatchMode | null>(null);
  const [mmrFrom, setMmrFrom] = useState("");
  const [mmrTo, setMmrTo] = useState("");
  const [roles, setRoles] = useState<DotaPositionRole[]>([]);
  const [recruitedRoles, setRecruitedRoles] = useState<DotaPositionRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stepLeaving, setStepLeaving] = useState(false);
  const [stepTransitioning, setStepTransitioning] = useState(false);
  const preparedRef = useRef<PreparedContext | null>(null);
  const questionnaireRef = useRef<HTMLElement | null>(null);
  const confirmationRef = useRef<HTMLDivElement | null>(null);
  const stepTransitioningRef = useRef(false);
  const mountedRef = useRef(true);

  const mmr = formatDotaMmrRange(mmrFrom, mmrTo) ?? "";
  const isBusy = phase === "creating";
  const showAnswerSummary = phase !== "intent" && phase !== "mmr";
  const confirmationVisible =
    phase === "ready" ||
    phase === "reveal" ||
    phase === "profileMorph" ||
    phase === "layoutBirth";

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== "mmr" && phase !== "roles" && phase !== "recruitRoles" && phase !== "matchMode") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      questionnaireRef.current
        ?.querySelector<HTMLElement>("input, button[aria-pressed], button[type='button']")
        ?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [phase]);

  async function transitionToPhase(
    nextPhase: GamesSearchCinematicPhase,
    holdDuration = 0
  ): Promise<boolean> {
    if (stepTransitioningRef.current) {
      return false;
    }

    stepTransitioningRef.current = true;
    setStepTransitioning(true);

    if (holdDuration > 0) {
      await wait(holdDuration);
    }

    if (!mountedRef.current) {
      return false;
    }

    setStepLeaving(true);
    await wait(300);

    if (!mountedRef.current) {
      return false;
    }

    setPhase(nextPhase);
    setStepLeaving(false);
    setStepTransitioning(false);
    stepTransitioningRef.current = false;
    return true;
  }

  function chooseIntent(nextIntent: IntentMode) {
    if (selectedIntent || isBusy || stepTransitioningRef.current) {
      return;
    }

    setSelectedIntent(nextIntent);
    setIntentMode(nextIntent);
    setError(null);
    void transitionToPhase("mmr", 480);
  }

  function chooseMatchMode(nextMode: DotaMatchMode) {
    if (selectedMatchMode || isBusy || stepTransitioningRef.current) {
      return;
    }

    setSelectedMatchMode(nextMode);
    setMatchMode(nextMode);
    setError(null);
    void (async () => {
      await wait(480);
      if (!mountedRef.current) {
        return;
      }
      await prepareSearch(nextMode);
    })();
  }

  function submitMmr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isValidDotaMmrInput(mmrFrom, mmrTo, resolveDotaMmrMode(mmrFrom, mmrTo))) {
      setError(t("games.search.cinematic.mmrError"));
      return;
    }

    void transitionToPhase("roles");
  }

  function submitRoles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (roles.length === 0) {
      setError(t("games.search.cinematic.rolesError"));
      return;
    }

    if (intentMode === "recruit") {
      void transitionToPhase("recruitRoles");
      return;
    }

    void transitionToPhase("matchMode");
  }

  function submitRecruitRoles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (recruitedRoles.length === 0) {
      setError(t("games.search.cinematic.recruitRolesError"));
      return;
    }

    void transitionToPhase("matchMode");
  }

  function toggleRole(
    role: DotaPositionRole,
    setter: React.Dispatch<React.SetStateAction<DotaPositionRole[]>>
  ) {
    setter((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : ([...current, role].sort() as DotaPositionRole[])
    );
  }

  async function prepareSearch(chosenMatchMode: DotaMatchMode) {
    if (
      stepTransitioningRef.current ||
      !mmr ||
      roles.length === 0 ||
      (intentMode === "recruit" && recruitedRoles.length === 0)
    ) {
      return;
    }

    const enteredCreating = await transitionToPhase("creating");
    if (!enteredCreating || !mountedRef.current) {
      return;
    }

    const creatingStartedAt = performance.now();
    setError(null);

    try {
      const prepared = preparedRef.current ?? (await createProfileAndSession(chosenMatchMode));
      preparedRef.current = prepared;

      let party = prepared.party;
      let createdPartyInThisAttempt = false;
      if (intentMode === "recruit" && !party) {
        party = await createGameParty("PARTY", prepared.accessToken);
        createdPartyInThisAttempt = true;
        preparedRef.current = { ...prepared, party };
      }

      if (intentMode === "recruit" && party) {
        try {
          await setDotaLfgLooking(true, prepared.accessToken, {
            partySlug: party.slug,
            recruitedRoles
          });
        } catch (lookingError) {
          if (createdPartyInThisAttempt) {
            try {
              await disbandGameParty(party.slug, prepared.accessToken);
            } catch {
              // Best-effort cleanup if recruit LFG failed after create.
            }
            preparedRef.current = { ...prepared, party: null };
          }
          throw lookingError;
        }
      } else {
        await setDotaLfgLooking(true, prepared.accessToken);
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(MATCH_MODE_STORAGE_KEY, chosenMatchMode);
      }

      const result: GamesSearchCinematicResult = {
        intentMode,
        matchMode: chosenMatchMode,
        mmr,
        party,
        profile: prepared.profile,
        recruitedRoles,
        roles
      };

      onPrepared(result);
      window.dispatchEvent(
        new CustomEvent<DotaProfileCreatedEventDetail>(DOTA_PROFILE_CREATED_EVENT, {
          detail: { cinematic: true, slug: prepared.profile.slug }
        })
      );
      await wait(Math.max(0, 850 - (performance.now() - creatingStartedAt)));
      if (!mountedRef.current) return;
      await runCinematicSequence(result);
    } catch {
      if (mountedRef.current) {
        setSelectedMatchMode(null);
        const returnedToForm = await transitionToPhase("matchMode");
        if (returnedToForm && mountedRef.current) {
          setError(t("games.search.cinematic.prepareError"));
        }
      }
    }
  }

  async function createProfileAndSession(chosenMatchMode: DotaMatchMode): Promise<PreparedContext> {
    const profileInput = { matchMode: chosenMatchMode, mmr, roles };

    if (authSession?.accessToken) {
      const profile = await createDotaProfile(profileInput, authSession.accessToken);
      return { accessToken: authSession.accessToken, party: null, profile };
    }

    const response = await createGuestDotaProfile(profileInput);
    storeAuthSession({
      accessToken: response.accessToken,
      expiresIn: response.expiresIn,
      tokenType: response.tokenType,
      user: {
        avatarUrl: response.user.avatarUrl ?? null,
        displayName: response.user.displayName,
        email: response.user.email,
        id: response.user.id
      }
    });
    stashDotaRecovery({
      recoveryToken: response.recoveryToken,
      recoveryUrl: response.recoveryUrl,
      slug: response.profile.slug
    });

    return {
      accessToken: response.accessToken,
      party: null,
      profile: response.profile
    };
  }

  async function runCinematicSequence(result: GamesSearchCinematicResult) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const enteredLeftMorph = await transitionToPhase("leftMorph");
    if (!enteredLeftMorph || !mountedRef.current) return;

    setQuestionnaireState("docking");
    const dockingAnimation = reducedMotion
      ? Promise.resolve()
      : animateQuestionnaireToLeft();
    let leftRevealed = reducedMotion;
    const leftRevealTimer = reducedMotion
      ? null
      : window.setTimeout(() => {
          leftRevealed = true;
          onVisualPhase("left");
        }, 500);

    await dockingAnimation;
    if (leftRevealTimer !== null) {
      window.clearTimeout(leftRevealTimer);
    }

    if (!mountedRef.current) return;
    setQuestionnaireState("hidden");
    if (!leftRevealed) {
      onVisualPhase("left");
    }

    await wait(reducedMotion ? 80 : 200);
    if (!mountedRef.current) return;
    setPhase("ready");

    await wait(reducedMotion ? 1100 : 1300);
    if (!mountedRef.current) return;
    setPhase("reveal");

    await wait(reducedMotion ? 1400 : 1600);
    if (!mountedRef.current) return;

    if (reducedMotion) {
      onVisualPhase("feed");
      onVisualPhase("rail");
      window.dispatchEvent(new Event(DOTA_PROFILE_CINEMATIC_ARRIVED_EVENT));
      setPhase("done");
      onComplete(result);
      return;
    }

    setPhase("profileMorph");
    let profileArrived = false;
    const revealProfileTarget = () => {
      if (profileArrived || !mountedRef.current) return;
      profileArrived = true;
      window.dispatchEvent(new Event(DOTA_PROFILE_CINEMATIC_ARRIVED_EVENT));
      setPhase("layoutBirth");
    };
    const profileArrivalTimer = window.setTimeout(revealProfileTarget, 600);
    await animateConfirmationToProfile();
    window.clearTimeout(profileArrivalTimer);
    revealProfileTarget();

    if (!mountedRef.current) return;
    await wait(420);
    onVisualPhase("feed");
    await wait(560);
    onVisualPhase("rail");
    await wait(650);

    if (!mountedRef.current) return;
    setPhase("done");
    onComplete(result);
  }

  async function animateQuestionnaireToLeft() {
    await nextFrame();
    const source = questionnaireRef.current;
    const target = document.querySelector<HTMLElement>("[data-cinematic-left-target]");

    if (!source || !target) {
      if (source) {
        source.style.animation = "none";
        source.style.opacity = "0";
      }
      await wait(760);
      return;
    }

    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    Object.assign(source.style, {
      animation: "none",
      height: `${sourceRect.height}px`,
      left: `${sourceRect.left}px`,
      margin: "0",
      maxHeight: "none",
      position: "fixed",
      top: `${sourceRect.top}px`,
      transform: "none",
      transformOrigin: "top left",
      width: `${sourceRect.width}px`,
      zIndex: "85"
    });

    const travelX = targetRect.left - sourceRect.left;
    const travelY = targetRect.top - sourceRect.top;
    const finalScale = Math.min(0.62, targetRect.width / Math.max(sourceRect.width, 1));
    const animation = source.animate(
      [
        {
          borderRadius: "24px",
          filter: "blur(0)",
          opacity: 1,
          transform: "translate3d(0, 0, 0)"
        },
        {
          borderRadius: "20px",
          filter: "blur(0)",
          offset: 0.58,
          opacity: 1,
          transform: `translate3d(${travelX * 0.72}px, ${travelY * 0.72}px, 0) scale(${
            1 - (1 - finalScale) * 0.52
          })`
        },
        {
          borderRadius: "17px",
          filter: "blur(3px)",
          opacity: 0,
          transform: `translate3d(${travelX}px, ${travelY}px, 0) scale(${finalScale})`
        }
      ],
      {
        duration: 760,
        easing: "cubic-bezier(0.18, 0.8, 0.22, 1)",
        fill: "forwards"
      }
    );

    await animation.finished.catch(() => undefined);
  }

  async function animateConfirmationToProfile() {
    await nextFrame();
    const source = confirmationRef.current;
    const target = document.querySelector<HTMLElement>("[data-cinematic-profile-target]");

    if (!source || !target) {
      if (source) {
        source.style.animation = "none";
        source.style.opacity = "0";
        source.style.visibility = "hidden";
      }
      await wait(900);
      return;
    }

    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const clone = source.cloneNode(true) as HTMLElement;
    clone.classList.add(styles.confirmationFlying!);
    clone.setAttribute("aria-hidden", "true");
    Object.assign(clone.style, {
      animation: "none",
      height: `${sourceRect.height}px`,
      left: `${sourceRect.left}px`,
      top: `${sourceRect.top}px`,
      transform: "none",
      transformOrigin: "top left",
      width: `${sourceRect.width}px`
    });
    document.body.appendChild(clone);
    source.style.animation = "none";
    source.style.opacity = "0";
    source.style.visibility = "hidden";

    const finalScale = Math.min(0.42, targetRect.width / Math.max(sourceRect.width, 1));
    const travelX =
      targetRect.left +
      targetRect.width / 2 -
      (sourceRect.left + (sourceRect.width * finalScale) / 2);
    const travelY =
      targetRect.top +
      targetRect.height / 2 -
      (sourceRect.top + (sourceRect.height * finalScale) / 2);
    const animation = clone.animate(
      [
        {
          borderRadius: "24px",
          filter: "blur(0)",
          opacity: 1,
          transform: "translate3d(0, 0, 0) scale(1)"
        },
        {
          borderRadius: "18px",
          filter: "blur(0.5px)",
          offset: 0.68,
          opacity: 1,
          transform: `translate3d(${travelX * 0.72}px, ${travelY * 0.72}px, 0) scale(${
            1 - (1 - finalScale) * 0.62
          })`
        },
        {
          borderRadius: "12px",
          filter: "blur(2px)",
          opacity: 0.08,
          transform: `translate3d(${travelX}px, ${travelY}px, 0) scale(${finalScale})`
        }
      ],
      {
        duration: 900,
        easing: "cubic-bezier(0.18, 0.8, 0.22, 1)",
        fill: "forwards"
      }
    );

    await animation.finished.catch(() => undefined);
    clone.remove();
  }

  const phaseNumber = useMemo(() => {
    switch (phase) {
      case "intent":
        return 1;
      case "mmr":
        return 2;
      case "roles":
        return 3;
      case "recruitRoles":
        return 4;
      case "matchMode":
        return intentMode === "recruit" ? 5 : 4;
      default:
        return intentMode === "recruit" ? 5 : 4;
    }
  }, [intentMode, phase]);
  const totalSteps = intentMode === "recruit" ? 5 : 4;

  const readyTitle =
    (matchMode ?? selectedMatchMode) === "auto"
      ? t("games.search.cinematic.readyTitleAuto")
      : t("games.search.cinematic.readyTitle");
  const readySubtitle =
    (matchMode ?? selectedMatchMode) === "auto"
      ? intentMode === "recruit"
        ? t("games.search.cinematic.readySubtitleAutoRecruit")
        : t("games.search.cinematic.readySubtitleAuto")
      : t("games.search.cinematic.readySubtitle");
  const revealHint =
    (matchMode ?? selectedMatchMode) === "auto"
      ? t("games.search.cinematic.revealHintAuto")
      : t("games.search.cinematic.revealHint");

  return (
    <div className={styles.root} data-phase={phase}>
      <section
        aria-busy={stepTransitioning}
        aria-label={t("games.search.cinematic.ariaLabel")}
        className={`${styles.questionnaire} ${
          questionnaireState === "docking" ? styles.questionnaireDocking : ""
        } ${questionnaireState === "hidden" ? styles.questionnaireHidden : ""} ${
          stepLeaving ? styles.questionnaireStepLeaving : ""
        } ${stepTransitioning ? styles.questionnaireTransitioning : ""}`}
        ref={questionnaireRef}
      >
        <div aria-hidden className={styles.motionTrail} />
        <div className={styles.stepMeta}>
          <span>{t("games.search.cinematic.step", { current: phaseNumber, total: totalSteps })}</span>
          {selectedIntent ? (
            <strong>
              {selectedIntent === "join"
                ? t("games.search.cinematic.choiceJoin")
                : t("games.search.cinematic.choiceRecruit")}
            </strong>
          ) : null}
        </div>

        {showAnswerSummary ? (
          <div className={styles.answerSummary}>
            <div className={styles.answerMmr} data-cinematic-source="mmr">
              <span>MMR</span>
              <strong>{formatDotaMmr(mmr)}</strong>
            </div>
            <div className={styles.answerRoles} aria-label={t("games.search.cinematic.yourRoles")}>
              {roles.map((role) => (
                <span
                  className={styles.answerRole}
                  data-cinematic-source={`role-${role}`}
                  key={`answer-role-${role}`}
                >
                  {role}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {phase === "intent" ? (
          <div className={`${styles.stepBody} ${styles.intentStep}`}>
            <div className={styles.intentIntro}>
              <p className={styles.eyebrow}>{t("games.search.cinematic.welcome")}</p>
              <h1 className={`${styles.title} ${styles.intentTitle}`}>
                <span>{t("games.search.cinematic.intentTitleFirst")}</span>
                <strong>{t("games.search.cinematic.intentTitleAccent")}</strong>
              </h1>
              <p className={styles.intentLead}>{t("games.search.cinematic.intentLead")}</p>
            </div>
            <div className={styles.intentChoices}>
              <button
                className={`${styles.intentChoice} ${
                  selectedIntent === "join" ? styles.intentChoiceActive : ""
                } ${selectedIntent === "recruit" ? styles.intentChoiceLeaving : ""}`}
                onClick={() => chooseIntent("join")}
                type="button"
              >
                <span aria-hidden className={styles.choiceIcon}>
                  <OpiniaIcon className={styles.choiceIconSvg!} name="gamepad" />
                </span>
                <span className={styles.choiceCopy}>
                  <strong>{t("games.search.cinematic.choiceJoin")}</strong>
                  <small>{t("games.search.cinematic.choiceJoinHint")}</small>
                </span>
              </button>
              <button
                className={`${styles.intentChoice} ${
                  selectedIntent === "recruit" ? styles.intentChoiceActive : ""
                } ${selectedIntent === "join" ? styles.intentChoiceLeaving : ""}`}
                onClick={() => chooseIntent("recruit")}
                type="button"
              >
                <span aria-hidden className={`${styles.choiceIcon} ${styles.choicePlus}`}>+</span>
                <span className={styles.choiceCopy}>
                  <strong>{t("games.search.cinematic.choiceRecruit")}</strong>
                  <small>{t("games.search.cinematic.choiceRecruitHint")}</small>
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {phase === "mmr" ? (
          <form className={styles.stepBody} onSubmit={submitMmr}>
            <p className={styles.eyebrow}>{t("games.search.cinematic.quickSetup")}</p>
            <h2 className={styles.title}>{t("games.search.cinematic.askMmr")}</h2>
            <p className={styles.lead}>{t("games.search.cinematic.askMmrHint")}</p>
            <DotaMmrField mmrFrom={mmrFrom} mmrTo={mmrTo} onChange={(from, to) => {
              setMmrFrom(from);
              setMmrTo(to);
              setError(null);
            }} />
            <StepActions
              backLabel={t("games.search.cinematic.back")}
              nextLabel={t("games.search.cinematic.next")}
              onBack={() => {
                setSelectedIntent(null);
                setError(null);
                void transitionToPhase("intent");
              }}
            />
          </form>
        ) : null}

        {phase === "roles" ? (
          <form className={styles.stepBody} onSubmit={submitRoles}>
            <p className={styles.eyebrow}>{t("games.search.cinematic.quickSetup")}</p>
            <h2 className={styles.title}>{t("games.search.cinematic.askRoles")}</h2>
            <p className={styles.lead}>{t("games.search.cinematic.askRolesHint")}</p>
            <RolePicker roles={roles} onToggle={(role) => {
              toggleRole(role, setRoles);
              setError(null);
            }} t={t} />
            <StepActions
              backLabel={t("games.search.cinematic.back")}
              nextLabel={t("games.search.cinematic.next")}
              onBack={() => {
                setError(null);
                void transitionToPhase("mmr");
              }}
            />
          </form>
        ) : null}

        {phase === "recruitRoles" ? (
          <form className={styles.stepBody} onSubmit={submitRecruitRoles}>
            <p className={styles.eyebrow}>{t("games.search.cinematic.almostDone")}</p>
            <h2 className={styles.title}>{t("games.search.cinematic.askRecruitRoles")}</h2>
            <p className={styles.lead}>{t("games.search.cinematic.askRecruitRolesHint")}</p>
            <RolePicker roles={recruitedRoles} onToggle={(role) => {
              toggleRole(role, setRecruitedRoles);
              setError(null);
            }} t={t} />
            <StepActions
              backLabel={t("games.search.cinematic.back")}
              nextLabel={t("games.search.cinematic.next")}
              onBack={() => {
                setError(null);
                void transitionToPhase("roles");
              }}
            />
          </form>
        ) : null}

        {phase === "matchMode" ? (
          <div className={`${styles.stepBody} ${styles.matchModeStep}`}>
            <p className={styles.eyebrow}>{t("games.search.cinematic.almostDone")}</p>
            <h2 className={styles.title}>
              {intentMode === "recruit"
                ? t("games.search.cinematic.askMatchModeRecruit")
                : t("games.search.cinematic.askMatchMode")}
            </h2>
            <p className={styles.lead}>
              {intentMode === "recruit"
                ? t("games.search.cinematic.askMatchModeRecruitHint")
                : t("games.search.cinematic.askMatchModeHint")}
            </p>
            <div className={styles.intentChoices}>
              <button
                className={`${styles.intentChoice} ${
                  selectedMatchMode === "auto" ? styles.intentChoiceActive : ""
                } ${selectedMatchMode === "manual" ? styles.intentChoiceLeaving : ""}`}
                disabled={Boolean(selectedMatchMode) || isBusy}
                onClick={() => chooseMatchMode("auto")}
                type="button"
              >
                <span aria-hidden className={styles.choiceIcon}>
                  <OpiniaIcon className={styles.choiceIconSvg!} name="sparkle" />
                </span>
                <span className={styles.choiceCopy}>
                  <strong>
                    {intentMode === "recruit"
                      ? t("games.search.cinematic.choiceMatchAutoRecruit")
                      : t("games.search.cinematic.choiceMatchAuto")}
                  </strong>
                  <small>
                    {intentMode === "recruit"
                      ? t("games.search.cinematic.choiceMatchAutoRecruitHint")
                      : t("games.search.cinematic.choiceMatchAutoHint")}
                  </small>
                </span>
              </button>
              <button
                className={`${styles.intentChoice} ${
                  selectedMatchMode === "manual" ? styles.intentChoiceActive : ""
                } ${selectedMatchMode === "auto" ? styles.intentChoiceLeaving : ""}`}
                disabled={Boolean(selectedMatchMode) || isBusy}
                onClick={() => chooseMatchMode("manual")}
                type="button"
              >
                <span aria-hidden className={styles.choiceIcon}>
                  <OpiniaIcon className={styles.choiceIconSvg!} name="search" />
                </span>
                <span className={styles.choiceCopy}>
                  <strong>
                    {intentMode === "recruit"
                      ? t("games.search.cinematic.choiceMatchManualRecruit")
                      : t("games.search.cinematic.choiceMatchManual")}
                  </strong>
                  <small>
                    {intentMode === "recruit"
                      ? t("games.search.cinematic.choiceMatchManualRecruitHint")
                      : t("games.search.cinematic.choiceMatchManualHint")}
                  </small>
                </span>
              </button>
            </div>
            <StepActions
              backLabel={t("games.search.cinematic.back")}
              onBack={() => {
                setSelectedMatchMode(null);
                setMatchMode(null);
                setError(null);
                void transitionToPhase(intentMode === "recruit" ? "recruitRoles" : "roles");
              }}
            />
          </div>
        ) : null}

        {phase === "creating" ? (
          <div aria-live="polite" className={`${styles.stepBody} ${styles.creating}`}>
            <span aria-hidden className={styles.spinner} />
            <h2 className={styles.title}>{t("games.search.cinematic.preparing")}</h2>
            <p className={styles.lead}>{t("games.search.cinematic.preparingHint")}</p>
          </div>
        ) : null}

        {phase === "leftMorph" ||
        phase === "ready" ||
        phase === "reveal" ||
        phase === "profileMorph" ||
        phase === "layoutBirth" ? (
          <div className={`${styles.stepBody} ${styles.dockedCopy}`}>
            <p className={styles.eyebrow}>
              {intentMode === "join"
                ? t("games.search.cinematic.choiceJoin")
                : t("games.search.cinematic.choiceRecruit")}
            </p>
            <h2 className={styles.dockedTitle}>
              {intentMode === "join"
                ? t("games.search.cinematic.leftJoinTitle")
                : t("games.search.cinematic.leftRecruitTitle")}
            </h2>
          </div>
        ) : null}

        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </section>

      {confirmationVisible ? (
        <div
          aria-live="polite"
          className={`${styles.confirmation} ${
            phase === "reveal" || phase === "profileMorph" || phase === "layoutBirth"
              ? styles.confirmationReveal
              : ""
          }`}
          ref={confirmationRef}
        >
          <div className={styles.confirmationReady}>
            <span aria-hidden className={styles.checkmark}>✓</span>
            <h2>{readyTitle}</h2>
            <p>{readySubtitle}</p>
          </div>
          <div className={styles.confirmationProfile}>
            <p className={styles.revealLead}>{t("games.search.cinematic.revealLead")}</p>
            <h2>{t("games.search.cinematic.revealBody")}</h2>
            <p>{revealHint}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface RolePickerProps {
  onToggle: (role: DotaPositionRole) => void;
  roles: DotaPositionRole[];
  t: ReturnType<typeof useTranslation>;
}

function RolePicker({ onToggle, roles, t }: RolePickerProps) {
  return (
    <div className={styles.rolePicker} role="group" aria-label={t("games.search.cinematic.yourRoles")}>
      {ROLE_POSITIONS.map((role) => (
        <button
          aria-pressed={roles.includes(role)}
          className={`${styles.roleButton} ${roles.includes(role) ? styles.roleButtonActive : ""}`}
          key={role}
          onClick={() => onToggle(role)}
          title={getDotaPositionLabel(role, t)}
          type="button"
        >
          <strong>{role}</strong>
          <span>{getDotaPositionLabel(role, t)}</span>
        </button>
      ))}
    </div>
  );
}

interface StepActionsProps {
  backLabel: string;
  nextLabel?: string;
  onBack: () => void;
}

function StepActions({ backLabel, nextLabel, onBack }: StepActionsProps) {
  return (
    <div className={styles.actions}>
      <button className={styles.backButton} onClick={onBack} type="button">
        {backLabel}
      </button>
      {nextLabel ? (
        <button className={styles.nextButton} type="submit">
          {nextLabel}
          <span aria-hidden>→</span>
        </button>
      ) : null}
    </div>
  );
}

function wait(duration: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}
