import {
    batch,
    createContext,
    createSignal,
    JSX,
    onCleanup,
    useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import {
    getChampSelectSession,
    getCurrentSummoner,
    getGridChampions,
    getPickableChampionIds,
    selectChampion,
} from "../api/lcu-api";
import { getRoleFromString, Role } from "@draftgap/core/src/models/Role";
import { Team } from "@draftgap/core/src/models/Team";
import {
    LolChampSelectChampSelectPlayerSelection,
    LolChampSelectChampSelectSession,
    LolSummonerSummoner,
} from "../types/Lcu";
import {
    createImportFavouritePicksSuccessToast,
    createImportFavouritePicksToast,
} from "../utils/toast";
import { useDraftFilters } from "./DraftFiltersContext";
import { getPickedChampionKey, useDraft } from "./DraftContext";
import { useMedia } from "../hooks/useMedia";
import { useUser } from "./UserContext";
import { LolalyticsRole } from "../../../dataset/src/lolalytics/roles";

const createChampSelectSession = (): LolChampSelectChampSelectSession => ({
    actions: [],
    allowBattleBoost: false,
    allowDuplicatePicks: false,
    allowLockedEvents: false,
    allowSkinSelection: false,
    bans: {
        myTeamBans: [],
        numBans: 0,
        theirTeamBans: [],
    },
    benchChampionIds: [],
    benchEnabled: false,
    boostableSkinCount: 0,
    chatDetails: {
        chatRoomName: "",
        chatRoomPassword: "",
    },
    counter: 0,
    entitledFeatureState: {
        additionalRerolls: 0,
        unlockedSkinIds: [],
    },
    gameId: 0,
    hasSimultaneousBans: false,
    hasSimultaneousPicks: false,
    isCustomGame: false,
    isSpectating: false,
    localPlayerCellId: 0,
    lockedEventIndex: 0,
    myTeam: [],
    recoveryCounter: 0,
    rerollsRemaining: 0,
    skipChampionSelect: false,
    theirTeam: [],
    timer: {
        adjustedTimeLeftInPhase: 0,
        internalNowInEpochMs: 0,
        isInfinite: false,
        phase: "",
        totalTimeInPhase: 0,
    },
    trades: [],
});

export const ClientState = {
    NotFound: "NotFound",
    MainMenu: "MainMenu",
    InChampSelect: "InChampSelect",
    Disabled: "Disabled",
} as const;

export type ClientState = (typeof ClientState)[keyof typeof ClientState];

export const createLolClientContext = () => {
    const { isDesktop } = useMedia();
    const {
        pickChampion,
        hoverChampion,
        resetChampion,
        select,
        selection,
        setAllyAssignedRoles,
        allyAssignedRoles,
        resetAll,
        allyTeam,
        opponentTeam,
        setTeamBans,
        setOwnedChampions,
        selectNextPick,
    } = useDraft();
    const { setRoleFilter } = useDraftFilters();
    const { isFavourite, setFavourite } = useUser();

    const [clientState, setClientState] = createSignal<ClientState>(
        ClientState.NotFound,
    );
    const [clientError, setClientError] = createSignal<string | undefined>();
    const [champSelectSession, setChampSelectSession] =
        createStore<LolChampSelectChampSelectSession>(
            createChampSelectSession(),
        );
    const [hasCurrentSummoner, setHasCurrentSummoner] = createSignal(false);
    const [currentSummoner, setCurrentSummoner] =
        createStore<LolSummonerSummoner>({
            displayName: "",
            internalName: "",
            percentCompleteForNextLevel: 0,
            profileIconId: 0,
            puuid: "",
            rerollPoints: {
                currentPoints: 0,
                maxRolls: 0,
                numberOfRolls: 0,
                pointsCostToRoll: 0,
                pointsToReroll: 0,
            },
            summonerId: 0,
            summonerLevel: 0,
            xpSinceLastLevel: 0,
            xpUntilNextLevel: 0,
            accountId: "",
            nameChangeFlag: false,
            privacy: "",
        });

    let lastSelectedBanActionId: number | undefined;

    const updateChampSelectSession = (
        session: LolChampSelectChampSelectSession,
        firstTime = false,
    ) => {
        const nextPick = session.actions
            .flat()
            .find((a) => a.type === "pick" && !a.completed);
        const allyBansInProgress = session.actions
            .flat()
            .filter(
                (a) => a.type === "ban" && a.isInProgress && a.isAllyAction,
            );
        const currentBan =
            allyBansInProgress.find(
                (a) => a.actorCellId === session.localPlayerCellId,
            ) ?? allyBansInProgress[0];

        const localCellId = session.localPlayerCellId;
        const isLockedIn = session.actions
            .flat()
            .some(
                (a) =>
                    a.actorCellId === localCellId &&
                    a.type === "pick" &&
                    a.completed,
            );

        const getRole = (role: string) => {
            return {
                top: Role.Top,
                jungle: Role.Jungle,
                bottom: Role.Bottom,
                middle: Role.Middle,
                utility: Role.Support,
            }[role];
        };

        const processSelection = (
            selection: LolChampSelectChampSelectPlayerSelection,
            team: Team,
            index: number,
        ) => {
            const teamPicks = team === "ally" ? allyTeam : opponentTeam;

            const role = selection.assignedPosition
                ? getRole(selection.assignedPosition)
                : undefined;

            // The local player's champion only shows up once it is locked in,
            // so their pre-pick does not affect the other roles' analysis
            const isUnlockedLocalPlayer =
                selection.cellId === localCellId && !isLockedIn;

            if (selection.championId && !isUnlockedLocalPlayer) {
                const championKey = selection.championId.toString();
                if (getPickedChampionKey(teamPicks[index]) === championKey) {
                    return false;
                }
                const resetFilters =
                    hasCurrentSummoner() &&
                    currentSummoner.summonerId === selection.summonerId;
                pickChampion(team, index, championKey, role, {
                    updateSelection: false,
                    resetFilters,
                });

                return true;
            } else {
                if (
                    isUnlockedLocalPlayer &&
                    getPickedChampionKey(teamPicks[index]) !== undefined
                ) {
                    resetChampion(team, index);
                }

                let championKey = undefined;
                if (
                    selection.championPickIntent &&
                    selection.summonerId !== currentSummoner.summonerId
                ) {
                    championKey = selection.championPickIntent.toString();
                }
                const pick = teamPicks[index];
                const hoverKey = pick.hover ? pick.championKey : undefined;
                if (hoverKey !== championKey) {
                    hoverChampion(team, index, championKey, role);
                }
            }

            return false;
        };

        batch(() => {
            // Track assigned roles and follow swaps on the selected slot
            const previousRoles = allyAssignedRoles();
            const assignedRoles = session.myTeam.map((p) =>
                p.assignedPosition ? getRole(p.assignedPosition) : undefined,
            );
            setAllyAssignedRoles(assignedRoles);
            if (selection.type === "pick" && selection.team === "ally") {
                const role = assignedRoles[selection.index];
                if (
                    role !== undefined &&
                    role !== previousRoles[selection.index]
                ) {
                    setRoleFilter(role);
                }
            }

            let draftChanged = firstTime;
            for (let i = 0; i < session.myTeam.length; i++) {
                const selection = session.myTeam[i];
                draftChanged =
                    processSelection(selection, "ally", i) || draftChanged;
            }
            for (let i = 0; i < session.theirTeam.length; i++) {
                const selection = session.theirTeam[i];
                draftChanged =
                    processSelection(selection, "opponent", i) || draftChanged;
            }

            // Handle bans
            // Place each ban in the slot of the player who banned it, like the client does
            const getBannedChampions = (isAllyAction: boolean) => {
                const teamSelections = isAllyAction
                    ? session.myTeam
                    : session.theirTeam;
                const banActions = session.actions
                    .flat()
                    .filter(
                        (a) =>
                            a.type === "ban" && a.isAllyAction === isAllyAction,
                    );
                const bans: (string | undefined)[] = [];
                banActions.forEach((a, actionIndex) => {
                    if (!a.completed || a.championId <= 0) return;
                    const playerIndex = teamSelections.findIndex(
                        (s) => s.cellId === a.actorCellId,
                    );
                    const index =
                        playerIndex !== -1 ? playerIndex : actionIndex;
                    bans[index] = String(a.championId);
                });
                return bans;
            };
            setTeamBans("ally", getBannedChampions(true));
            setTeamBans("opponent", getBannedChampions(false));

            // Move selection to the next pick once all ally bans are done
            const allyBansRemaining = session.actions
                .flat()
                .some(
                    (a) => a.type === "ban" && a.isAllyAction && !a.completed,
                );
            const allyBansFinished =
                !currentBan &&
                !allyBansRemaining &&
                lastSelectedBanActionId !== undefined;
            if (allyBansFinished) {
                lastSelectedBanActionId = undefined;
                draftChanged = true;
            }

            // Until the local player locks in, default to their own slot and
            // never move the selection away from wherever they put it
            const localIndex = session.myTeam.findIndex(
                (s) => s.cellId === localCellId,
            );
            const previousLocalIndex = champSelectSession.myTeam.findIndex(
                (s) => s.cellId === champSelectSession.localPlayerCellId,
            );
            const followLocalSlot = localIndex !== -1 && !isLockedIn;
            const allBansPlaced =
                selection.type === "ban" &&
                !session.actions
                    .flat()
                    .some((a) => a.type === "ban" && !a.completed);

            if (currentBan) {
                if (currentBan.id !== lastSelectedBanActionId) {
                    lastSelectedBanActionId = currentBan.id;
                    select("ally", undefined, {
                        type: "ban",
                        resetFilters: false,
                    });
                    // Ban suggestions cover every enemy role, so drop the
                    // filter left over from the assigned pick role
                    setRoleFilter(undefined);
                }
            } else if (followLocalSlot) {
                if (firstTime || allyBansFinished || allBansPlaced) {
                    select("ally", localIndex, { resetFilters: false });
                } else if (
                    // Pick order swapped, follow the player to the new slot
                    localIndex !== previousLocalIndex &&
                    selection.type === "pick" &&
                    selection.team === "ally" &&
                    selection.index === previousLocalIndex
                ) {
                    select("ally", localIndex, { resetFilters: false });
                }
            } else if (allBansPlaced) {
                // All bans are placed, move from banning to picking
                selectNextPick("ally", { resetFilters: false });
            } else if (nextPick && draftChanged) {
                // Set next pick if draft has changed
                const nextPickTeamSelection = nextPick.isAllyAction
                    ? session.myTeam
                    : session.theirTeam;
                const index = nextPickTeamSelection.findIndex(
                    (s) => s.cellId === nextPick.actorCellId,
                );

                // Only update next pick if ally
                // Irritating to have it update when opponent picks
                if (nextPick.isAllyAction) {
                    select("ally", index, { resetFilters: false });
                }
            }

            setChampSelectSession(session);
        });
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const checkImportFavourites = async () => {
        const DRAFTGAP_IMPORT_FAVOURITES_LAST_ASKED =
            "draftgap-import-favourites-last-asked";
        const lastAsked = localStorage.getItem(
            DRAFTGAP_IMPORT_FAVOURITES_LAST_ASKED,
        );
        if (lastAsked) {
            const lastAskedDate = new Date(lastAsked);
            const now = new Date();
            const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
            if (now.getTime() - lastAskedDate.getTime() < ONE_WEEK) {
                return;
            }
        }

        const gridChampions = await getGridChampions();
        if (!gridChampions) {
            console.error("Failed to get grid champions");
            return;
        }

        const lolFavourites = gridChampions?.flatMap((c) =>
            c.positionsFavorited.map((p) => ({
                championKey: c.id.toString(),
                role: getRoleFromString(p as LolalyticsRole),
            })),
        );

        const nonFavouritePicks = lolFavourites.filter(
            (f) => !isFavourite(f.championKey, f.role),
        );

        if (!nonFavouritePicks.length) {
            return;
        }

        createImportFavouritePicksToast(() => {
            for (const nonFavourite of nonFavouritePicks) {
                setFavourite(nonFavourite.championKey, nonFavourite.role, true);
            }

            createImportFavouritePicksSuccessToast(nonFavouritePicks.length);
        });

        localStorage.setItem(
            DRAFTGAP_IMPORT_FAVOURITES_LAST_ASKED,
            new Date().toISOString(),
        );
    };

    const updateUnownedChampions = async () => {
        const ownedChampions = await getPickableChampionIds();
        if (!ownedChampions) {
            console.error("Failed to get owned champions");
            return;
        }

        setOwnedChampions(new Set(ownedChampions.map((c) => String(c))));
    };

    const [integrationTimeout, setIntegrationTimeout] = createSignal<
        NodeJS.Timeout | undefined
    >();

    const startLolClientIntegration = () => {
        if (!isDesktop) return;

        const update = async () => {
            try {
                if (!hasCurrentSummoner()) {
                    const summoner = await getCurrentSummoner();
                    if (summoner) {
                        setCurrentSummoner(summoner);
                        setHasCurrentSummoner(true);
                    }
                }

                const session = await getChampSelectSession();
                if (session == null) {
                    if (clientState() !== ClientState.MainMenu) {
                        setTeamBans("ally", []);
                        setTeamBans("opponent", []);
                        setOwnedChampions(new Set<string>());
                    }

                    setClientState(ClientState.MainMenu);
                } else {
                    batch(() => {
                        if (clientState() !== ClientState.InChampSelect) {
                            updateUnownedChampions();
                            // Disabled: favourites import prompt repeats, likely because WebView2 drops recent localStorage writes.
                            // checkImportFavourites();
                            resetAll();
                            lastSelectedBanActionId = undefined;
                        }

                        updateChampSelectSession(
                            session,
                            clientState() !== ClientState.InChampSelect,
                        );
                        setClientState(ClientState.InChampSelect);
                    });
                }
                setClientError(undefined);
            } catch (e) {
                setClientState(ClientState.NotFound);

                setClientError((e as any).toString());
            }

            const timeoutMs = {
                [ClientState.MainMenu]: 1000,
                [ClientState.InChampSelect]: 500,
                [ClientState.NotFound]: 2000,
                [ClientState.Disabled]: 2000,
            }[clientState()];
            setIntegrationTimeout(setTimeout(() => update(), timeoutMs));
        };
        update();
    };

    // Changes the pre-picked champion in the game client for the local
    // player's pick, unless it is already locked in
    const selectChampionInClient = async (championKey: string) => {
        if (clientState() !== ClientState.InChampSelect) return;

        const cellId = champSelectSession.localPlayerCellId;
        const action = champSelectSession.actions
            .flat()
            .find(
                (a) =>
                    a.actorCellId === cellId &&
                    a.type === "pick" &&
                    !a.completed,
            );
        if (!action) return;

        try {
            await selectChampion(action.id, Number(championKey));
        } catch (e) {
            console.error("Failed to select champion in client", e);
        }
    };

    // Picks a champion for a slot. The local player's own pick is only
    // pre-picked in the game client until lock-in, so the slot stays empty and
    // doesn't affect the other roles' analysis
    const pickOrPrePick = (
        team: Team,
        index: number,
        championKey: string,
        role: Role | undefined,
    ) => {
        const localCellId = champSelectSession.localPlayerCellId;
        const isLocalPlayerSlot =
            team === "ally" &&
            champSelectSession.myTeam[index]?.cellId === localCellId;
        const isLockedIn = champSelectSession.actions
            .flat()
            .some(
                (a) =>
                    a.actorCellId === localCellId &&
                    a.type === "pick" &&
                    a.completed,
            );

        // The session is kept after champ select ends, so check the state too
        if (
            clientState() === ClientState.InChampSelect &&
            isLocalPlayerSlot &&
            !isLockedIn
        ) {
            selectChampionInClient(championKey);
        } else {
            pickChampion(team, index, championKey, role);
        }
    };

    const stopLolClientIntegration = () => {
        if (integrationTimeout() != null) {
            clearTimeout(integrationTimeout());
        }
        setClientState(ClientState.Disabled);
    };

    onCleanup(() => {
        stopLolClientIntegration();
        setClientState(ClientState.NotFound);
    });

    return {
        clientState,
        champSelectSession,
        startLolClientIntegration,
        stopLolClientIntegration,
        pickOrPrePick,
        clientError,
    };
};

export const LolClientContext =
    createContext<ReturnType<typeof createLolClientContext>>();

export function LolClientProvider(props: { children: JSX.Element }) {
    const ctx = createLolClientContext();

    return (
        <LolClientContext.Provider value={ctx}>
            {props.children}
        </LolClientContext.Provider>
    );
}

export const useLolClient = () => {
    const useCtx = useContext(LolClientContext);
    if (!useCtx) throw new Error("No LolClientContext found");

    return useCtx;
};
