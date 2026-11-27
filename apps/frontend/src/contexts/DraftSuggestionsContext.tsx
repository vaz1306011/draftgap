import {
    JSXElement,
    createContext,
    createMemo,
    useContext,
} from "solid-js";
import { getSuggestions } from "@draftgap/core/src/draft/suggestions";
import { getBanSuggestions } from "@draftgap/core/src/draft/bans";
import { useDraftAnalysis } from "./DraftAnalysisContext";
import { useDataset } from "./DatasetContext";
import { getVisibleChampionKey, useDraft } from "./DraftContext";
import { useDraftFilters } from "./DraftFiltersContext";

export function createDraftSuggestionsContext() {
    const { isLoaded, dataset, dataset30Days } = useDataset();
    const {
        draftAnalysisConfig,
        allySuggestionTeamComp,
        opponentSuggestionTeamComp,
        analyzeHovers,
        roleFilterTeam,
    } = useDraftAnalysis();
    const { selection, allyTeam, opponentTeam, allBans } = useDraft();
    const { roleFilter } = useDraftFilters();

    const allySuggestions = createMemo(() => {
        if (!isLoaded()) return [];

        return getSuggestions(
            dataset()!,
            dataset30Days()!,
            allySuggestionTeamComp(),
            opponentSuggestionTeamComp(),
            draftAnalysisConfig(),
        );
    });

    const opponentSuggestions = createMemo(() => {
        if (!isLoaded()) return [];

        return getSuggestions(
            dataset()!,
            dataset30Days()!,
            opponentSuggestionTeamComp(),
            allySuggestionTeamComp(),
            draftAnalysisConfig(),
        );
    });

    // Roles that still have suggestions for the team being picked for, or
    // banned against. Undefined while there is nothing to judge by (no team
    // selected or no data yet).
    const suggestedRoles = createMemo(() => {
        const team = roleFilterTeam();
        if (!team) return undefined;

        const suggestions =
            team === "opponent" ? opponentSuggestions() : allySuggestions();
        if (suggestions.length === 0) return undefined;

        return new Set(suggestions.map((s) => s.role));
    });

    const banSuggestions = createMemo(() => {
        if (!isLoaded() || selection.type !== "ban" || !selection.team) {
            return [];
        }

        const unavailable = new Set(allBans());
        for (const pick of [...allyTeam, ...opponentTeam]) {
            const key = getVisibleChampionKey(pick, analyzeHovers());
            if (key) unavailable.add(key);
        }

        return getBanSuggestions(
            dataset()!,
            selection.team === "ally"
                ? opponentSuggestions()
                : allySuggestions(),
            unavailable,
            roleFilter(),
        );
    });

    return {
        allySuggestions,
        opponentSuggestions,
        suggestedRoles,
        banSuggestions,
    };
}

export const DraftSuggestionsContext =
    createContext<ReturnType<typeof createDraftSuggestionsContext>>();

export function DraftSuggestionsProvider(props: { children: JSXElement }) {
    return (
        <DraftSuggestionsContext.Provider
            value={createDraftSuggestionsContext()}
        >
            {props.children}
        </DraftSuggestionsContext.Provider>
    );
}

export function useDraftSuggestions() {
    const useCtx = useContext(DraftSuggestionsContext);
    if (!useCtx) throw new Error("No DraftSuggestionsContext found");

    return useCtx;
}
