const BASE = {
    ア: "a", イ: "i", ウ: "u", エ: "e", オ: "o",
    カ: "ka", キ: "ki", ク: "ku", ケ: "ke", コ: "ko",
    ガ: "ga", ギ: "gi", グ: "gu", ゲ: "ge", ゴ: "go",
    サ: "sa", シ: "shi", ス: "su", セ: "se", ソ: "so",
    ザ: "za", ジ: "ji", ズ: "zu", ゼ: "ze", ゾ: "zo",
    タ: "ta", チ: "chi", ツ: "tsu", テ: "te", ト: "to",
    ダ: "da", ヂ: "ji", ヅ: "zu", デ: "de", ド: "do",
    ナ: "na", ニ: "ni", ヌ: "nu", ネ: "ne", ノ: "no",
    ハ: "ha", ヒ: "hi", フ: "fu", ヘ: "he", ホ: "ho",
    バ: "ba", ビ: "bi", ブ: "bu", ベ: "be", ボ: "bo",
    パ: "pa", ピ: "pi", プ: "pu", ペ: "pe", ポ: "po",
    マ: "ma", ミ: "mi", ム: "mu", メ: "me", モ: "mo",
    ヤ: "ya", ユ: "yu", ヨ: "yo",
    ラ: "ra", リ: "ri", ル: "ru", レ: "re", ロ: "ro",
    ワ: "wa", ヰ: "i", ヱ: "e", ヲ: "o", ン: "n", ヴ: "vu",
    ァ: "a", ィ: "i", ゥ: "u", ェ: "e", ォ: "o",
} as Record<string, string>;

// Small kana combined with the previous kana, e.g. キャ -> kya
const SMALL = {
    ャ: "ya", ュ: "yu", ョ: "yo",
    ァ: "a", ィ: "i", ゥ: "u", ェ: "e", ォ: "o",
} as Record<string, string>;

const toKatakana = (str: string) =>
    str.replace(/[ぁ-ゖ]/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) + 0x60),
    );

// Collapse Hepburn / Kunrei / Nihon-shiki spelling differences, so "shi" and "si" match
export function normalizeRomaji(str: string) {
    return str
        .toLowerCase()
        .replace(/tch/g, "tt")
        .replace(/sh([aueo])/g, "sy$1")
        .replace(/ch([aueo])/g, "ty$1")
        .replace(/j([aueo])/g, "zy$1")
        .replace(/shi/g, "si")
        .replace(/chi/g, "ti")
        .replace(/tsu/g, "tu")
        .replace(/ji/g, "zi")
        .replace(/fu/g, "hu")
        .replace(/dzu/g, "zu")
        .replace(/ou/g, "o")
        .replace(/oo/g, "o")
        .replace(/uu/g, "u");
}

export function kanaToRomaji(input: string) {
    const kata = [...toKatakana(input)];
    let out = "";
    let doubleNext = false;
    for (let i = 0; i < kata.length; i++) {
        const c = kata[i];
        if (c === "ッ") {
            doubleNext = true;
            continue;
        }
        if (c === "ー") continue;

        let romaji = BASE[c];
        if (romaji === undefined) {
            out += c;
            doubleNext = false;
            continue;
        }
        const next = kata[i + 1];
        if (next && SMALL[next] && "キギシジチヂニヒビピミリフヴテデウ".includes(c)) {
            const small = SMALL[next];
            // Drop the "i"; sha/cha/ja keep only the vowel of the small ya/yu/yo
            const head = romaji.slice(0, -1);
            romaji =
                ["shi", "chi", "ji"].includes(romaji) && small.startsWith("y")
                    ? head + small.slice(1)
                    : head + small;
            i++;
        }
        if (doubleNext) {
            out += romaji[0];
            doubleNext = false;
        }
        out += romaji;
    }
    return out;
}

// Characters kept when matching: latin, digits, CJK, kana
export const SEARCH_STRIP = /[^a-zA-Z0-9぀-ヺー-ヿ一-鿿]/g;

export function searchKeys(str: string) {
    const cleaned = str.replaceAll(SEARCH_STRIP, "");
    const katakana = toKatakana(cleaned).toLowerCase();
    return [
        cleaned.toLowerCase(),
        katakana,
        normalizeRomaji(kanaToRomaji(cleaned)),
    ];
}

export function matchesSearch(name: string, query: string) {
    const q = query.replaceAll(SEARCH_STRIP, "");
    if (!q) return true;
    const keys = searchKeys(name);
    const needles = [q.toLowerCase(), toKatakana(q), normalizeRomaji(q)];
    return needles.some((n) => keys.some((k) => k.includes(n)));
}
