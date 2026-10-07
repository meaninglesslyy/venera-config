/** @type {import('./_venera_.js')} */

// ============================================================================
//  MissKon.com  —  Venera comic source
//
//  Site: WordPress + Sahifa theme, server side rendered HTML.
//  Data path:
//    - list pages  : HTML scrape  (article.item-list)
//    - detail      : WP REST API  (/wp-json/wp/v2/posts?slug=...&_embed) -> all
//                    gallery images of every paginated part in one request
//    - maxPage     : WP REST API totals (X-WP-Total header / tag count)
//  The site only exposes a preview subset of large albums (rest sits behind
//  MediaFire / Terabox links), so the reader shows exactly what the site shows.
// ============================================================================

const MK_BASE = "https://misskon.com";
const MK_PER_PAGE = 20;
const MK_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": MK_BASE + "/",
};

// param -> list section. `fixed` sections (Top*) are single page, 15 items.
const MK_SECTIONS = {
    "latest": { name: "Home Page", url: MK_BASE + "/", fixed: false },
    "top3": { name: "Top 3 Days", url: MK_BASE + "/top3/", fixed: true },
    "top7": { name: "Top 7 Days", url: MK_BASE + "/top7/", fixed: true },
    "top30": { name: "Top 30 Days", url: MK_BASE + "/top30/", fixed: true },
    "top60": { name: "Top 60 Days", url: MK_BASE + "/top60/", fixed: true },
    "top-year": { name: "Top Year", url: MK_BASE + "/top-year/", fixed: true },
};

// explore page partitions (title shown on the app, param = MK_SECTIONS key)
const MK_EXPLORE = [
    { title: "Home Page", param: "latest" },
    { title: "TOP 3 DAYS", param: "top3" },
    { title: "TOP 7 DAYS", param: "top7" },
    { title: "TOP 30 DAYS", param: "top30" },
    { title: "TOP 60 DAYS", param: "top60" },
    { title: "TOP YEAR", param: "top-year" },
];

// how many comics each explore partition previews before "View more"
const MK_PREVIEW = 5;

// session caches
const MK_COUNT_CACHE = {};
const MK_EP_CACHE = {};
const MK_INFO_CACHE = {};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mkDecode(text) {
    if (text == null) return "";
    return String(text).replace(
        /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
        (whole, body) => {
            if (body.charAt(0) === "#") {
                const hex = body.charAt(1) === "x" || body.charAt(1) === "X";
                const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
                if (isNaN(code)) return whole;
                return code > 0xffff
                    ? String.fromCharCode(0xd800 + ((code - 0x10000) >> 10),
                          0xdc00 + ((code - 0x10000) & 0x3ff))
                    : String.fromCharCode(code);
            }
            switch (body.toLowerCase()) {
                case "amp":
                    return "&";
                case "lt":
                    return "<";
                case "gt":
                    return ">";
                case "quot":
                    return '"';
                case "apos":
                    return "'";
                case "nbsp":
                    return " ";
                case "hellip":
                    return "…";
                case "mdash":
                    return "—";
                case "ndash":
                    return "–";
                default:
                    return whole;
            }
        },
    );
}

function mkText(el) {
    if (!el) return "";
    return mkDecode(el.text || "").replace(/\s+/g, " ").trim();
}

function mkAbs(url) {
    if (!url) return "";
    url = String(url).trim();
    if (!url) return "";
    if (url.indexOf("//") === 0) return "https:" + url;
    if (url.charAt(0) === "/") return MK_BASE + url;
    return url;
}

// "https://misskon.com/118418-foo-83-photos/" -> "118418-foo-83-photos"
function mkSlug(url) {
    const m = /^https?:\/\/[^/]+\/([^/?#]+)\/?/.exec(String(url || "").trim());
    return m ? m[1] : String(url || "").trim();
}

function mkPhotos(title) {
    const m = /(\d[\d,]*)\s*photos?/i.exec(title || "");
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
}

function mkVideos(title) {
    const m = /(\d[\d,]*)\s*videos?/i.exec(title || "");
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
}

// gallery <img> tags inside post content carry class="aligncenter"
function mkImages(html) {
    const out = [];
    const re = /<img\b[^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[0];
        const srcMatch = /src\s*=\s*"([^"]*)"/i.exec(tag);
        let src = srcMatch ? mkDecode(srcMatch[1]) : "";
        if (!src || src.indexOf("data:") === 0) continue;
        const clsMatch = /class\s*=\s*"([^"]*)"/i.exec(tag);
        const cls = clsMatch ? clsMatch[1] : "";
        const url = mkAbs(src);
        const isGallery =
            cls.indexOf("aligncenter") >= 0 ||
            /imghost\/uploads\//.test(url) ||
            /bp\.blogspot\.com/.test(url);
        if (!isGallery) continue;
        if (out.indexOf(url) < 0) out.push(url);
    }
    return out;
}

function mkDownloadLinks(html) {
    const out = [];
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const clsMatch = /class\s*=\s*"([^"]*)"/i.exec(m[1]);
        const cls = clsMatch ? clsMatch[1] : "";
        if (cls.indexOf("shortc-button") < 0) continue;
        const hrefMatch = /href\s*=\s*"([^"]*)"/i.exec(m[1]);
        if (!hrefMatch) continue;
        const url = mkDecode(hrefMatch[1]);
        if (!url) continue;
        let name = mkDecode(m[2].replace(/<[^>]+>/g, ""))
            .replace(/\s+/g, " ")
            .trim()
            .replace(/^download link:\s*/i, "");
        out.push({ name: name || "Download", url: url });
    }
    return out;
}

// download links -> clickable tag chips.
// key   = netdisk name   -> rendered as a non-clickable title chip
// value = the URL itself -> rendered as a *clickable* chip, tapping it calls
//                           comic.onClickTag, which hands the URL to UI.launchUrl
// Why the detour: ComicDetails.description is a plain SelectableText (no
// markdown, no linkify) and the tag value chip is the only tappable field the
// detail page gives a source, so "URL as a tag value" is the only one-tap route.
function mkLinkTags(links) {
    const out = {};
    for (const link of links) {
        const base =
            String(link.name || "").replace(/\|/g, "/").replace(/\s+/g, " ").trim() ||
            "Download";
        let key = base;
        let n = 1;
        while (out[key]) {
            n++;
            key = base + " " + n;
        }
        out[key] = [link.url];
    }
    return out;
}

// "INFORMATION: Model: X Number of items: 83 photos File size: 994MB ..."
function mkInfoBlock(html) {
    const m = /<div class="box info[^"]*">([\s\S]*?)<\/div>\s*<\/div>/.exec(html);
    if (!m) return "";
    return mkDecode(
        m[1]
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, "")
    )
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line) => line.length > 0)
        .join("\n")
        .trim();
}

function mkParseList(doc) {
    const comics = [];
    const nodes = doc.querySelectorAll(".post-listing.archive-box article.item-list");
    for (const node of nodes) {
        const link = node.querySelector("h2.post-box-title a");
        if (!link) continue;
        const href = mkAbs(link.attributes["href"] || "");
        const title = mkText(link);
        if (!href || !title) continue;

        const img = node.querySelector(".post-thumbnail img");
        let cover = "";
        if (img) {
            const attrs = img.attributes;
            cover = mkAbs(attrs["data-src"] || attrs["src"] || "");
            if (cover.indexOf("data:") === 0) cover = "";
        }
        if (!cover) {
            const icon = node.querySelector("img");
            if (icon) cover = mkAbs(icon.attributes["src"] || "");
            if (cover.indexOf("data:") === 0) cover = "";
        }

        const tags = [];
        for (const t of node.querySelectorAll(".post-meta .post-cats a")) {
            const name = mkText(t);
            if (name && tags.indexOf(name) < 0) tags.push(name);
        }

        const views = mkText(node.querySelector(".post-meta .post-views"));

        const photos = mkPhotos(title);
        const videos = mkVideos(title);
        let subtitle = photos > 0 ? photos + " photos" : "";
        if (videos > 0) subtitle += (subtitle ? " + " : "") + videos + " videos";

        const descBits = [];
        if (views) descBits.push(views);
        if (tags.length > 0) descBits.push(tags.join(" / "));

        comics.push(
            new Comic({
                id: mkSlug(href),
                title: title,
                subtitle: subtitle,
                cover: cover,
                tags: tags,
                description: descBits.join("\n"),
                language: "en",
            }),
        );
    }
    return comics;
}

async function mkGet(url, asJson) {
    const res = await Network.get(url, MK_HEADERS);
    if (res.status !== 200) {
        throw `Invalid status code: ${res.status} (${url})`;
    }
    return asJson ? JSON.parse(res.body) : res.body;
}

function mkDoc(html) {
    return new HtmlDocument(html);
}

// total list pages of /  or /?s=..., read from the WP REST totals
async function mkPostsMaxPage(query) {
    const key = "posts:" + (query || "");
    if (MK_COUNT_CACHE[key] != null) return MK_COUNT_CACHE[key];
    let maxPage = 1;
    try {
        const res = await Network.get(
            MK_BASE + "/wp-json/wp/v2/posts?per_page=" + MK_PER_PAGE +
                (query ? "&" + query : ""),
            MK_HEADERS,
        );
        if (res.status === 200) {
            const headers = res.headers || {};
            const pages = parseInt(
                headers["x-wp-totalpages"] || headers["X-WP-TotalPages"] || "",
                10,
            );
            const total = parseInt(
                headers["x-wp-total"] || headers["X-WP-Total"] || "",
                10,
            );
            if (!isNaN(pages) && pages > 0) {
                maxPage = pages;
            } else if (!isNaN(total) && total > 0) {
                maxPage = Math.ceil(total / MK_PER_PAGE);
            }
        }
    } catch (e) {
        console.log("misskon: failed to read total pages for '" + query + "': " + e);
    }
    MK_COUNT_CACHE[key] = maxPage;
    return maxPage;
}

// total list pages of /tag/<slug>/
async function mkTagMaxPage(slug) {
    const key = "tag:" + slug;
    if (MK_COUNT_CACHE[key] != null) return MK_COUNT_CACHE[key];
    let maxPage = 1;
    try {
        let plain = slug;
        try {
            plain = decodeURIComponent(slug);
        } catch (e) { /* keep raw */ }
        const res = await Network.get(
            MK_BASE + "/wp-json/wp/v2/tags?slug=" + encodeURIComponent(plain),
            MK_HEADERS,
        );
        if (res.status === 200) {
            const arr = JSON.parse(res.body);
            if (Array.isArray(arr) && arr.length > 0 && arr[0].count > 0) {
                maxPage = Math.ceil(arr[0].count / MK_PER_PAGE);
            }
        }
    } catch (e) {
        console.log("misskon: failed to read tag total for '" + slug + "': " + e);
    }
    MK_COUNT_CACHE[key] = maxPage;
    return maxPage;
}

// WP REST post object -> Comic (list card)
function mkComicFromPost(post) {
    const embedded = post["_embedded"] || {};
    let cover = "";
    const media = embedded["wp:featuredmedia"];
    if (media && media.length > 0) cover = media[0].source_url || "";
    const tags = [];
    const terms = embedded["wp:term"];
    if (terms) {
        for (const group of terms) {
            for (const term of group) {
                if (term.taxonomy === "post_tag" && term.name) {
                    tags.push(term.name);
                }
            }
        }
    }
    const title = mkDecode((post.title && post.title.rendered) || "");
    const photos = mkPhotos(title);
    return new Comic({
        id: post.slug,
        title: title,
        subtitle: photos > 0 ? photos + " photos" : "",
        cover: mkAbs(cover),
        tags: tags,
        description: tags.join(" / "),
        language: "en",
    });
}

// slug -> raw WP post (cached, detail payload is heavy and reused by loadEp)
async function mkFetchPost(slug) {
    if (MK_INFO_CACHE[slug]) return MK_INFO_CACHE[slug];
    const arr = await mkGet(
        MK_BASE + "/wp-json/wp/v2/posts?slug=" + encodeURIComponent(slug) + "&_embed",
        true,
    );
    if (!Array.isArray(arr) || arr.length === 0) {
        throw "Comic not found: " + slug;
    }
    MK_INFO_CACHE[slug] = arr[0];
    return arr[0];
}

// split the post body into per-page image lists (content uses <!--nextpage-->)
function mkPostParts(post) {
    const content = (post.content && post.content.rendered) || "";
    const chunks = content.split(/<!--\s*nextpage\s*-->/i);
    const parts = [];
    for (const chunk of chunks) {
        const images = mkImages(chunk);
        if (images.length > 0) parts.push(images);
    }
    if (parts.length === 0) {
        const all = mkImages(content);
        if (all.length > 0) parts.push(all);
    }
    return parts;
}

function mkBuildDescription(post, links) {
    const content = (post.content && post.content.rendered) || "";
    const lines = [];
    const info = mkInfoBlock(content);
    if (info) lines.push(info);

    if (links && links.length > 0) {
        lines.push("");
        lines.push("Full album download:");
        for (const link of links) {
            lines.push(link.name + ": " + link.url);
        }
    }
    // `|` is rendered as a line break by the app, so keep it out of the text
    return lines.join("\n").replace(/\|/g, "/").trim();
}

// ---------------------------------------------------------------------------

// Auto-generated from https://misskon.com/categories/ by gen_categories.py
// [groupName, [[label, tagSlug], ...]]
const CATEGORY_PARTS = [
  ["Cosplay", [
    ["Cosplay", "cosplay"],
  ]],
  ["Korean", [
    ["AG", "ag"],
    ["LE", "le"],
    ["Pure Media", "pure-media"],
    ["Bimilstory", "bimilstory"],
    ["DJAWA", "djawa"],
    ["Herovia", "herovia"],
    ["PhotoChips", "photochips"],
    ["SAINT Photolife", "saint-photolife"],
    ["Moon Night Snap", "moon-night-snap"],
    ["SWEETBOX", "sweetbox"],
    ["Haivia", "haivia"],
    ["Loozy", "loozy"],
    ["BLUECAKE", "bluecake"],
    ["KIMLEMON", "kimlemon"],
    ["Espacia Korea", "espacia-korea"],
    ["Paranhosu", "paranhosu"],
    ["CreamSoda", "creamsoda"],
    ["Yo-U", "yo-u"],
    ["Fantasy Story", "fantasy-story"],
    ["Fantasy Factory", "fantasy-factory"],
    ["WXY ENT", "wxy-ent"],
    ["HIGH FANTASY", "high-fantasy"],
    ["Lilynah", "lilynah"],
    ["PUSSYLET", "pussylet"],
    ["KiSiA", "kisia"],
    ["Sera", "sera"],
    ["Korean Realgraphic", "korean-realgraphic"],
    ["MakeModel", "makemodel"],
    ["UMIZINE", "umizine"],
    ["KIREI", "kirei"],
    ["UHHUNG MAGAZINE", "uhhung-magazine"],
    ["Lookas", "lookas"],
    ["Glamarchive", "glamarchive"],
    ["MAXIM", "maxim"],
    ["JP", "jp"],
  ]],
  ["Made by AI", [
    ["AI Enhanced", "ai-enhanced"],
    ["AIGirl", "aigirl"],
    ["AI Generated", "ai-generated"],
  ]],
  ["Chinese", [
    ["JVID", "jvid"],
    ["Private Photoshoot", "private-photoshoot"],
    ["XR Uncensored", "xr-uncensored"],
    ["Limerence原创", "limerence%e5%8e%9f%e5%88%9b"],
    ["她们印象", "%e5%a5%b9%e4%bb%ac%e5%8d%b0%e8%b1%a1"],
    ["精选街拍作品", "%e7%b2%be%e9%80%89%e8%a1%97%e6%8b%8d%e4%bd%9c%e5%93%81"],
    ["ROSI写真", "rosi%e5%86%99%e7%9c%9f"],
    ["ROSI口罩系列", "rosi%e5%8f%a3%e7%bd%a9%e7%b3%bb%e5%88%97"],
    ["MZSOCK爱美足", "mzsock%e7%88%b1%e7%be%8e%e8%b6%b3"],
    ["内购无水印", "%e5%86%85%e8%b4%ad%e6%97%a0%e6%b0%b4%e5%8d%b0"],
    ["模密運動甜心", "%e6%a8%a1%e5%af%86%e9%81%8b%e5%8b%95%e7%94%9c%e5%bf%83"],
    ["IESS异思趣向", "iess%e5%bc%82%e6%80%9d%e8%b6%a3%e5%90%91"],
    ["ISS系列", "iss%e7%b3%bb%e5%88%97"],
    ["NS纳丝摄影", "ns%e7%ba%b3%e4%b8%9d%e6%91%84%e5%bd%b1"],
    ["小众视觉", "%e5%b0%8f%e4%bc%97%e8%a7%86%e8%a7%89"],
    ["三禾摄影", "%e4%b8%89%e7%a6%be%e6%91%84%e5%bd%b1"],
    ["足愉心", "%e8%b6%b3%e6%84%89%e5%bf%83"],
    ["袜觅社", "%e8%a2%9c%e8%a7%85%e7%a4%be"],
    ["紧急企划", "%e7%b4%a7%e6%80%a5%e4%bc%81%e5%88%92"],
    ["OtherXXX", "otherxxx"],
    ["KING8舞團", "king8%e8%88%9e%e5%9c%98"],
    ["紗姬舞團", "%e7%b4%97%e5%a7%ac%e8%88%9e%e5%9c%98"],
  ]],
  ["Chinese Classic", [
    ["[MTCos] 喵糖映画", "mtcos"],
    ["BoLoli", "bololi"],
    ["CANDY", "candy"],
    ["FEILIN", "feilin"],
    ["FToow", "ftoow"],
    ["GIRLT", "girlt"],
    ["HuaYan", "huayan"],
    ["HuaYang", "huayang"],
    ["IMISS", "imiss"],
    ["ISHOW", "ishow"],
    ["KelaGirls", "kelagirls"],
    ["Kimoe", "kimoe"],
    ["LegBaby", "legbaby"],
    ["MF", "mf"],
    ["MFStar", "mfstar"],
    ["MiiTao", "miitao"],
    ["MintYe", "mintye"],
    ["MISSLEG", "missleg"],
    ["MiStar", "mistar"],
    ["MTMeng", "mtmeng"],
    ["MyGirl", "mygirl"],
    ["PartyCat", "partycat"],
    ["QingDouKe", "qingdouke"],
    ["RuiSG", "ruisg"],
    ["SLADY", "slady"],
    ["TASTE", "taste"],
    ["TGOD", "tgod"],
    ["TouTiao", "toutiao"],
    ["TuiGirl", "tuigirl"],
    ["Tukmo", "tukmo"],
    ["UGIRLS", "ugirls"],
    ["UGIRLS - Ai You Wu App", "ugirls-ai-you-wu-app"],
    ["Ugirls爱尤物", "ugirls-app"],
    ["UXING", "uxing"],
    ["WingS", "wings"],
    ["XiaoYu", "xiaoyu"],
    ["XingYan", "xingyan"],
    ["XIUREN", "xiuren"],
    ["YouMei", "youmei"],
    ["YouMi", "youmi"],
    ["YouMi尤蜜", "youmiapp"],
    ["YouWu", "youwu"],
  ]],
];

class MissKon extends ComicSource {
    name = "MissKon";

    key = "misskon";

    version = "1.1.0";

    minAppVersion = "1.6.0";

    url =
        "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/misskon.js";

    explore = [
        {
            title: "MissKon",

            type: "multiPartPage",

            load: async () => {
                const parts = await Promise.all(
                    MK_EXPLORE.map(async (section) => {
                        const def = MK_SECTIONS[section.param];
                        let comics = [];
                        try {
                            const html = await mkGet(def.url);
                            const doc = mkDoc(html);
                            comics = mkParseList(doc);
                            doc.dispose();
                        } catch (e) {
                            console.log(
                                "misskon: failed to load explore part " +
                                    section.param + ": " + e,
                            );
                        }
                        return {
                            title: section.title,
                            comics: comics.slice(0, MK_PREVIEW),
                            viewMore: {
                                page: "category",
                                attributes: {
                                    category: def.name,
                                    param: section.param,
                                },
                            },
                        };
                    }),
                );
                return parts;
            },
        },
    ];

    category = {
        title: "MissKon",

        parts: CATEGORY_PARTS.map((group) => ({
            name: group[0],
            type: "fixed",
            categories: group[1].map((entry) => ({
                label: entry[0],
                target: {
                    page: "category",
                    attributes: {
                        category: entry[0],
                        param: entry[1],
                    },
                },
            })),
        })),

        enableRankingPage: false,
    };

    categoryComics = {
        load: async (category, param, options, page) => {
            const section = MK_SECTIONS[param];
            if (section) {
                const url =
                    page > 1 ? section.url + "page/" + page + "/" : section.url;
                const html = await mkGet(url);
                const doc = mkDoc(html);
                const comics = mkParseList(doc);
                doc.dispose();
                const maxPage = section.fixed
                    ? 1
                    : await mkPostsMaxPage("");
                return { comics: comics, maxPage: maxPage };
            }

            if (!param) {
                throw "Invalid category: " + category;
            }
            const url =
                page > 1
                    ? MK_BASE + "/tag/" + param + "/page/" + page + "/"
                    : MK_BASE + "/tag/" + param + "/";
            const html = await mkGet(url);
            const doc = mkDoc(html);
            const comics = mkParseList(doc);
            doc.dispose();
            const maxPage = await mkTagMaxPage(param);
            return { comics: comics, maxPage: maxPage };
        },
    };

    search = {
        load: async (keyword, options, page) => {
            keyword = (keyword || "").trim();

            // pasted comic url -> open that album directly
            const urlMatch = /misskon\.com\/([^/?#\s]+)\/?/.exec(keyword);
            if (urlMatch) {
                try {
                    const post = await mkFetchPost(urlMatch[1]);
                    return { comics: [mkComicFromPost(post)], maxPage: 1 };
                } catch (e) {
                    // not a post url (tag / page / search) -> fall through
                }
            }

            const url =
                page > 1
                    ? MK_BASE + "/page/" + page + "/?s=" +
                        encodeURIComponent(keyword)
                    : MK_BASE + "/?s=" + encodeURIComponent(keyword);
            const html = await mkGet(url);
            const doc = mkDoc(html);
            const comics = mkParseList(doc);
            doc.dispose();
            const maxPage = await mkPostsMaxPage(
                "search=" + encodeURIComponent(keyword),
            );
            return { comics: comics, maxPage: maxPage };
        },

        enableTagsSuggestions: false,
    };

    comic = {
        loadInfo: async (id) => {
            const post = await mkFetchPost(id);
            const parts = mkPostParts(post);
            MK_EP_CACHE[id] = parts;

            let cover = "";
            const embedded = post["_embedded"] || {};
            const media = embedded["wp:featuredmedia"];
            if (media && media.length > 0) cover = media[0].source_url || "";
            if (!cover && parts.length > 0 && parts[0].length > 0) {
                cover = parts[0][0];
            }

            const tags = {};
            const tagNames = [];
            const terms = embedded["wp:term"];
            if (terms) {
                for (const group of terms) {
                    for (const term of group) {
                        if (term.taxonomy === "post_tag" && term.name) {
                            tagNames.push(term.name);
                        }
                    }
                }
            }

            // netdisk links first (one chip per link, tap = open the browser),
            // then the real tags
            const links = mkDownloadLinks(
                (post.content && post.content.rendered) || "",
            );
            const linkTags = mkLinkTags(links);
            for (const key of Object.keys(linkTags)) {
                tags[key] = linkTags[key];
            }
            if (tagNames.length > 0) tags["Tags"] = tagNames;

            const chapters = {};
            if (parts.length === 1) {
                chapters["0"] = "All (" + parts[0].length + "P)";
            } else {
                for (let i = 0; i < parts.length; i++) {
                    chapters[String(i)] =
                        "Part " + (i + 1) + " (" + parts[i].length + "P)";
                }
            }

            const uploader = tagNames.length > 0 ? tagNames[tagNames.length - 1] : null;

            return new ComicDetails({
                title: mkDecode((post.title && post.title.rendered) || ""),
                cover: mkAbs(cover),
                description: mkBuildDescription(post, links),
                tags: tags,
                chapters: chapters,
                url: post.link || MK_BASE + "/" + id + "/",
                uploadTime: post.date ? String(post.date).replace("T", " ") : null,
                uploader: uploader,
                maxPage: 1,
                language: "en",
            });
        },

        loadEp: async (comicId, epId) => {
            let parts = MK_EP_CACHE[comicId];
            if (!parts) {
                const post = await mkFetchPost(comicId);
                parts = mkPostParts(post);
                MK_EP_CACHE[comicId] = parts;
            }
            const index = parseInt(epId == null ? "0" : String(epId), 10);
            const images = parts[isNaN(index) ? 0 : index] || [];
            return { images: images };
        },

        idMatch: "https?://misskon\\.com/[^/\\s]+/",

        onClickTag: (namespace, tag) => {
            const text = String(tag == null ? "" : tag).trim();
            // the netdisk chips carry a raw URL as their value -> open the browser
            // and stop there (returning null keeps the app from hijacking the jump)
            if (/^https?:\/\//i.test(text)) {
                try {
                    UI.launchUrl(text);
                } catch (e) {
                    console.log("misskon: UI.launchUrl unavailable: " + e);
                }
                return null;
            }
            // everything else is a plain tag -> search it
            return {
                page: "search",
                attributes: {
                    text: text,
                },
            };
        },

        link: {
            domains: ["misskon.com"],
            linkToId: (url) => mkSlug(url),
        },

        enableTagsTranslate: false,
    };

    translation = {
        "zh_CN": {
            "View more": "查看更多",
        },
        "zh_TW": {
            "View more": "查看更多",
        },
        "en": {},
    };
}
