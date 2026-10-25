import {
    JSXElement,
    createContext,
    createEffect,
    createMemo,
    useContext,
} from "solid-js";
import { getSuggestions } from "@draftgap/core/src/draft/suggestions";
import { useDraftAnalysis } from "./DraftAnalysisContext";
import { useDataset } from "./DatasetContext";
import { useDraft } from "./DraftContext";
import { useDraftFilters } from "./DraftFiltersContext";

export function createDraftSuggestionsContext() {
    const { selection } = useDraft();
    const { roleFilter, setRoleFilter } = useDraftFilters();
    const { isLoaded, dataset, dataset30Days } = useDataset();
    const { draftAnalysisConfig, allyTeamComp, opponentTeamComp } =
        useDraftAnalysis();

    const allySuggestions = createMemo(() => {
        if (!isLoaded()) return [];

        return getSuggestions(
            dataset()!,
            dataset30Days()!,
            allyTeamComp(),
            opponentTeamComp(),
            draftAnalysisConfig(),
        );
    });

    const opponentSuggestions = createMemo(() => {
        if (!isLoaded()) return [];

        return getSuggestions(
            dataset()!,
            dataset30Days()!,
            opponentTeamComp(),
            allyTeamComp(),
            draftAnalysisConfig(),
        );
    });

    // Roles that still have suggestions for the selected team. Undefined while
    // there is nothing to judge by (no team selected or no data yet).
    const suggestedRoles = createMemo(() => {
        if (!selection.team) return undefined;

        const suggestions =
            selection.team === "opponent"
                ? opponentSuggestions()
                : allySuggestions();
        if (suggestions.length === 0) return undefined;

        return new Set(suggestions.map((s) => s.role));
    });

    // Never leave the table empty because of a role that has no data
    createEffect(() => {
        const roles = suggestedRoles();
        const role = roleFilter();
        if (roles && role !== undefined && !roles.has(role)) {
            setRoleFilter(undefined);
        }
    });

    return { allySuggestions, opponentSuggestions, suggestedRoles };
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
