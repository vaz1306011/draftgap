import { ChampionData } from "@draftgap/core/src/models/dataset/ChampionData";
import { DraftGapConfig } from "@draftgap/core/src/models/user/Config";
import { championName } from "./i18n";
import { matchesSearch } from "./kana";

export function championMatchesSearch(
    champion: ChampionData,
    search: string,
    config: DraftGapConfig,
) {
    return (
        matchesSearch(champion.name, search) ||
        matchesSearch(championName(champion, config), search)
    );
}
