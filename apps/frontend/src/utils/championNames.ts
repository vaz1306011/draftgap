import { createSignal } from "solid-js";

type NamesByKey = Record<string, string>;

const [namesByLanguage, setNamesByLanguage] = createSignal<
    Record<string, NamesByKey>
>({});
const loading = new Set<string>();

async function fetchChampionNames(language: string) {
    const versions = (await (
        await fetch("https://ddragon.leagueoflegends.com/api/versions.json")
    ).json()) as string[];
    const res = await fetch(
        `https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/${language}/champion.json`,
    );
    const json = (await res.json()) as {
        data: Record<string, { key: string; name: string }>;
    };

    return Object.fromEntries(
        Object.values(json.data).map((c) => [c.key, c.name]),
    );
}

// Dataset only ships some languages, so the rest are loaded from Data Dragon
export async function loadChampionNames(language: string) {
    if (language === "en_US" || loading.has(language)) return;
    loading.add(language);
    try {
        const names = await fetchChampionNames(language);
        setNamesByLanguage((prev) => ({ ...prev, [language]: names }));
    } catch (e) {
        console.error(`Failed to load champion names for ${language}`, e);
    } finally {
        loading.delete(language);
    }
}

export function loadedChampionName(language: string, championKey: string) {
    return namesByLanguage()[language]?.[championKey];
}
