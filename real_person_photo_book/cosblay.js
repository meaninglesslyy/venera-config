const DEFAULT_BASE = "https://cosblay.com"
const API_BASE = "https://cosblay.com/wp-json/wp/v2"

// 站点图标：封面兜底，保证 cover 永不为空串（空串会让下载流程抛 relative URL without a base）
const SITE_ICON = "https://cosblay.com/wp-content/uploads/2023/07/cropped-sexyC-192x192.png"

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// 语言 tag：显示名 -> 语言子站
const LANGUAGE_GROUP = [
    ["中文", "cn"],
    ["English", "en"],
    ["한국인", "kr"],
    ["日本語", "jp"],
    ["Tiếng Việt", "vn"],
    ["แบบไทย", "th"],
    ["Español", "es"],
    ["Melayu", "my"],
    ["Indonesia", "id"],
    ["Русский", "ru"],
    ["Deutsch", "de"],
]

// 分类 tag：显示名 -> WP category id
const CATEGORY_GROUP = [
    ["Cosplay", 13],
    ["European Photo Album", 3990],
    ["Pure Beauty", 993],
]

// ============ 基础工具 ============

// Venera 的 HtmlElement.attributes 是 {name: string}；统一成字符串
function elAttr(el, name) {
    if (!el) return ""
    let v = el.attributes[name]
    if (v && typeof v === "object" && "value" in v) v = v.value
    if (v === undefined || v === null) return ""
    return String(v)
}

// 把任意 URL 规整成绝对地址；空值返回 ""
function abs(u, base) {
    if (!u) return ""
    u = String(u).trim()
    if (!u || u.indexOf("data:") === 0 || u.indexOf("javascript:") === 0) return ""
    if (/^https?:\/\//i.test(u)) return u
    if (u.indexOf("//") === 0) return "https:" + u
    if (u.charAt(0) === "/") return (base || DEFAULT_BASE) + u
    return (base || DEFAULT_BASE) + "/" + u
}

// HTML 实体解码 + 去标签
function decodeEntities(s) {
    return String(s == null ? "" : s)
        .replace(/<[^>]+>/g, "")
        .replace(/&#8211;/g, "–").replace(/&#8212;/g, "—")
        .replace(/&#8216;/g, "‘").replace(/&#8217;/g, "’")
        .replace(/&#8220;/g, "“").replace(/&#8221;/g, "”")
        .replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        // 数字实体：&#123;（十进制）与 &#x1F;（十六进制）
        .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) {
            let cp = parseInt(h, 16)
            return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m
        })
        .replace(/&#(\d+);/g, function (m, d) {
            let cp = parseInt(d, 10)
            return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m
        })
        .trim()
}

function requestHeaders(base) {
    return {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Referer": (base || DEFAULT_BASE) + "/",
    }
}

// GET JSON，带重试兜瞬时 reset；非 200 抛错
async function fetchJson(url, base) {
    let last = null
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            let res = await Network.get(url, requestHeaders(base))
            if (res.status === 200) {
                try {
                    return JSON.parse(res.body)
                } catch (e) {
                    last = "Bad JSON: " + url
                }
            } else {
                last = `Invalid status code: ${res.status} (${url})`
            }
        } catch (e) {
            last = e
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw last
}

// ============ WP REST 解析 ============

// 从 WP REST post 对象取封面：featured media 优先，回落正文首图，再兜底站点图标
function coverFromPost(post) {
    try {
        let fm = post._embedded && post._embedded["wp:featuredmedia"]
        if (fm && fm[0] && fm[0].source_url) {
            let a = abs(fm[0].source_url, DEFAULT_BASE)
            if (a) return a
        }
    } catch (e) {}
    try {
        let c = post.content && post.content.rendered
        if (c) {
            let m = c.match(/<img[^>]+src=["']([^"']+\.(?:jpe?g|png|webp))["']/i)
            if (m) {
                let a = abs(m[1].replace(/\\\//g, "/"), DEFAULT_BASE)
                if (a) return a
            }
        }
    } catch (e) {}
    return SITE_ICON
}

// 从 WP REST post 对象取详情全套图：content.rendered 里所有 <img src>
function imagesFromPost(post) {
    let out = []
    let seen = {}
    let c = post && post.content && post.content.rendered
    if (!c) return out
    let re = /<img[^>]+src=["']([^"']+\.(?:jpe?g|png|webp))["']/gi
    let m
    while ((m = re.exec(c)) !== null) {
        let s = abs(m[1].replace(/\\\//g, "/"), DEFAULT_BASE)
        if (!s || !/\.(jpe?g|png|webp)(\?|$)/i.test(s)) continue
        if (seen[s]) continue
        seen[s] = true
        out.push(s)
    }
    return out
}

// WP REST post -> Comic 列表项
function parsePost(post) {
    let title = decodeEntities(post.title && post.title.rendered ? post.title.rendered : "")
    let id = post.id || (post.slug || "")
    if (!title || !id) return null
    let date = post.date || ""
    return new Comic({
        id: String(id),
        title: title,
        subTitle: date,
        cover: coverFromPost(post),
        tags: [],
        description: "",
    })
}

// 从 REST 响应拿总页数（x-wp-totalpages 头），拿不到则按满页与否兜底
function totalPages(res, page, count, perPage) {
    let maxPage = page || 1
    try {
        if (res.headers && res.headers["x-wp-totalpages"]) {
            maxPage = parseInt(res.headers["x-wp-totalpages"], 10) || 1
        } else if (res.responseHeaders) {
            let tp = res.responseHeaders.match(/x-wp-totalpages:\s*(\d+)/i)
            if (tp) maxPage = parseInt(tp[1], 10) || 1
        }
    } catch (e) {}
    if (maxPage === (page || 1)) {
        maxPage = count < (perPage || 20) ? page || 1 : 500
    }
    return maxPage
}

// 拉一页列表并解析：apiRoot 形如 https://cosblay.com/wp-json/wp/v2 或 https://cn.cosblay.com/wp-json/wp/v2
async function listPage(apiRoot, query, page) {
    let p = page && page > 1 ? page : 1
    let perPage = 20
    let url = apiRoot + "/posts?per_page=" + perPage + "&page=" + p + "&_embed" + (query ? "&" + query : "")
    let res = await Network.get(url, requestHeaders(apiRoot.replace(/\/wp-json\/wp\/v2$/, "")))
    if (res.status !== 200) throw `Invalid status code: ${res.status} (${url})`
    let posts = JSON.parse(res.body)
    let comics = []
    for (let post of posts) {
        let c = parsePost(post)
        if (c) comics.push(c)
    }
    return { comics: comics, maxPage: totalPages(res, p, comics.length, perPage) }
}

// ============ 源 ============

class CosBlay extends ComicSource {
    name = "CosBlay"

    key = "cosblay"

    version = "1.0.0"

    minAppVersion = "1.6.0"

    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/cosblay.js"

    // 探索页：只有一个 tab，内容直接取自网站首页（REST 全站最新）
    explore = [
        {
            title: "CosBlay",
            type: "multiPageComicList",
            load: async (page) => {
                return await listPage(API_BASE, "", page)
            },
        },
    ]

    // 分类页：两个区块 —— 分类（真分类筛选）+ Language（各自子站流）
    category = {
        title: "CosBlay",
        parts: [
            {
                name: "分类",
                type: "fixed",
                categories: CATEGORY_GROUP.map(function (it) {
                    return it[0]
                }),
                categoryParams: CATEGORY_GROUP.map(function (it) {
                    return "c:" + it[1]
                }),
                itemType: "category",
            },
            {
                name: "Language",
                type: "fixed",
                categories: LANGUAGE_GROUP.map(function (it) {
                    return it[0]
                }),
                categoryParams: LANGUAGE_GROUP.map(function (it) {
                    return "lang:" + it[1]
                }),
                itemType: "category",
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let s = String(param || "").trim()
            if (s.indexOf("c:") === 0) {
                // 真分类：categories={id}
                let id = s.slice(2)
                if (!/^\d+$/.test(id)) throw `Invalid category param: ${param}`
                return await listPage(API_BASE, "categories=" + id, page)
            }
            if (s.indexOf("lang:") === 0) {
                // 语言子站：走各自子站的独立 REST 流
                let code = s.slice(5)
                if (!/^[a-z]{2}$/.test(code)) throw `Invalid language param: ${param}`
                let sub = "https://" + code + ".cosblay.com"
                return await listPage(sub + "/wp-json/wp/v2", "", page)
            }
            throw `Invalid category param: ${param}`
        },
    }

    search = {
        load: async (keyword, options, page) => {
            let kw = encodeURIComponent(String(keyword || "").trim())
            return await listPage(API_BASE, "search=" + kw, page)
        },
    }

    comic = {
        loadInfo: async (id) => {
            let nid = String(id || "").trim()
            if (!/^\d+$/.test(nid)) throw "Invalid comic id: " + id
            let url = API_BASE + "/posts/" + nid + "?_embed"
            let post = await fetchJson(url, DEFAULT_BASE)
            if (!post || !post.id) throw "Not found: " + nid
            let title = decodeEntities(post.title && post.title.rendered ? post.title.rendered : nid)
            let images = imagesFromPost(post)
            let desc = images.length > 0 ? images.length + " 张" : ""
            return new ComicDetails({
                id: nid,
                title: title || nid,
                cover: coverFromPost(post),
                description: desc,
                tags: {},
                chapters: { "0": "View All Photos" },
                url: post.link || (DEFAULT_BASE + "/" + nid + ".html"),
            })
        },

        loadEp: async (comicId, epId) => {
            let nid = String(comicId || "").trim()
            if (!/^\d+$/.test(nid)) throw "Invalid comic id: " + comicId
            let url = API_BASE + "/posts/" + nid + "?_embed"
            let post = await fetchJson(url, DEFAULT_BASE)
            let images = imagesFromPost(post)
            if (!images.length) throw "没有解析到图片"
            return { images: images }
        },

        // 图床在 CF 后，带站点 Referer + UA 与页面请求保持一致；相对地址改写为绝对。
        onImageLoad: (url, comicId, epId) => {
            let cfg = { headers: requestHeaders(DEFAULT_BASE) }
            let fixed = abs(url, DEFAULT_BASE)
            if (fixed && fixed !== url) cfg.url = fixed
            return cfg
        },

        onThumbnailLoad: (url) => {
            let cfg = { headers: requestHeaders(DEFAULT_BASE) }
            let fixed = abs(url, DEFAULT_BASE)
            if (fixed && fixed !== url) cfg.url = fixed
            return cfg
        },
    }
}
