const DEFAULT_BASE = "https://www.twoimg.com"
const SITE_ICON = DEFAULT_BASE + "/favicon.ico"

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// 图片防盗链参照，随 getBase() 更新
let CURRENT_BASE = DEFAULT_BASE

// 列表封面缓存：详情页优先复用列表里那张，省一次请求也与列表视觉一致
const COVER_CACHE = {}

// 详情页缓存：loadInfo 和 loadEp 各要同一页，合并成一次
let INFO_CACHE = {}
const INFO_CACHE_MAX = 200

// people 分区下只有这 9 个二级分类，全部挂在 /people 之下。
// 探索页 tag 按 Nono 指定的顺序与命名呈现；分类页沿用原站路径。
const TAG_GROUP = [
    ["清纯美女", "qingchun"],
    ["性感美女", "xinggan"],
    ["丝袜美腿", "siwa"],
    ["制服诱惑", "zhifu"],
    ["运动美女", "sportgirl"],
    ["校花", "xiaohua"],
    ["明星艺人", "mingxing"],
    ["CosPlay", "cosplay"],
    ["潮拍", "beauty"],
]

// Venera 的 HtmlElement.attributes 是 {name: string}；
// 有些实现给的是 Attr 节点/Map 风格，这里三层兜底统一成字符串。
function elAttr(el, name) {
    if (!el) return ""
    let v = el.attributes[name]
    if (v && typeof v === "object" && "value" in v) v = v.value
    if (v === undefined || v === null) return ""
    return String(v)
}

function abs(u, base) {
    if (!u) return ""
    u = String(u).trim()
    if (!u) return ""
    if (u.indexOf("//") === 0) return "https:" + u
    if (u.charAt(0) === "/") return base + u
    return u
}

// 去掉标题尾巴上的 [70P] / [ 70 P ] 之类张数标记
function cleanTitle(t) {
    return String(t || "").replace(/\s*\[\s*\d+\s*P\s*\]\s*$/i, "").trim()
}

// 总页数：站点分页器只给「上一页 / 下一页」两个链接，正文里没有任何总页数字样，
// WP REST 接口在本站是 500 空壳，响应头也不带 X-WP-TotalPages。
// 唯一可靠信号是：越界页 nginx 直接回 404（不是软回落到末页），
// 所以第 1 页时二分探测一次真末页，按路径缓存，后续翻页零额外请求。
// 探测代价 ceil(log2(N)) 次 HEAD 级请求，/people 84 页约 7 次。
const MAX_PROBE_CACHE = {}
const PROBE_HARD_CAP = 2000

async function probeLastPage(base, path, pageSep) {
    if (MAX_PROBE_CACHE[path]) return MAX_PROBE_CACHE[path]
    let urlOf = function (n) {
        if (n === 1) return base + path
        return pageSep ? base + path + pageSep + n : base + path + "/page/" + n
    }
    let exists = async function (n) {
        if (n <= 1) return true
        let res = await Network.get(urlOf(n), requestHeaders(base))
        // 404 / 5xx 都算不存在；只有 200 且确实有卡片才算真存在
        if (res.status !== 200) return false
        return res.body.indexOf("article") >= 0 && res.body.indexOf("excerpt") >= 0
    }

    let lo = 1
    let hi = 2
    // 指数扩张先找上界
    while (hi <= PROBE_HARD_CAP && (await exists(hi))) {
        lo = hi
        hi *= 2
    }
    if (hi > PROBE_HARD_CAP) {
        MAX_PROBE_CACHE[path] = lo
        return lo
    }
    // 二分找最后一个存在的页
    while (lo + 1 < hi) {
        let mid = Math.floor((lo + hi) / 2)
        if (await exists(mid)) lo = mid
        else hi = mid
    }
    MAX_PROBE_CACHE[path] = lo
    return lo
}

function requestHeaders(base) {
    return {
        "user-agent": UA,
        "referer": base + "/",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9",
    }
}

async function fetchDoc(url, base) {
    let res = await Network.get(url, requestHeaders(base))
    if (res.status !== 200) throw `Invalid status code: ${res.status}`
    return new HtmlDocument(res.body)
}

// 列表卡片：article.excerpt > a.thumbnail[href=/{id}.html] > img[data-src]
function parseCards(doc, base) {
    let out = []
    for (const art of doc.querySelectorAll("article.excerpt")) {
        let a = art.querySelector("a.thumbnail") || art.querySelector("h2 a[href]")
        if (!a) continue
        let href = elAttr(a, "href")
        let m = href.match(/twoimg\.com\/(\d+)\.html/) || href.match(/^\/(\d+)\.html/)
        if (!m) continue
        let id = m[1]
        let img = art.querySelector("a.thumbnail img") || art.querySelector("img")
        let cover = abs(
            img ? elAttr(img, "data-src") || elAttr(img, "data-original") || elAttr(img, "src") : "",
            base
        )
        // 占位图 thumb.png 不算封面
        if (/\/thumb\.png$/i.test(cover)) cover = ""
        if (cover) COVER_CACHE[id] = cover
        let h2 = art.querySelector("h2 a[href]")
        let title = cleanTitle(h2 ? h2.text : "")
        if (!title) title = id
        let time = art.querySelector("time")
        out.push(
            new Comic({
                id: id,
                title: title,
                subTitle: time ? (time.text || "").trim() : "",
                cover: cover || SITE_ICON,
                tags: [],
                description: "",
            })
        )
    }
    return out
}

// 分页：div.pagination > li.next-page > a[href$=/page/N]
// 站点只给两个链接，下一页码就是 page+1；拿不到再用末页探测结果兜底。
function maxPageOf(doc, page) {
    let nxt = doc.querySelector(".pagination li.next-page a[href]")
    if (nxt) {
        let m = elAttr(nxt, "href").match(/\/page\/(\d+)/)
        if (m) return Math.max(page || 1, parseInt(m[1], 10))
        return (page || 1) + 1
    }
    return page || 1
}

async function listPage(base, path, page) {
    let p = page && page > 1 ? page : 1
    let url = p === 1 ? base + path : base + path + "/page/" + p
    // 末页探测与列表页并发：Venera 的翻页器只读第一次返回的 maxPage，
    // 若第 1 页先回 maxPage=2 再翻页，UI 就把总页数钉死在 2 了。
    let lastPromise = probeLastPage(base, path)
    let doc = await fetchDoc(url, base)
    try {
        let last = await lastPromise
        let maxPage = Math.max(maxPageOf(doc, p), last, p)
        return { comics: parseCards(doc, base), maxPage: maxPage }
    } finally {
        doc.dispose()
    }
}

function normalizeId(id) {
    let s = String(id || "").trim()
    if (/^https?:\/\//i.test(s)) s = s.replace(/^https?:\/\/[^/]+/i, "")
    let m = s.match(/(\d+)\.html/)
    if (m) return m[1]
    if (/^\d+$/.test(s)) return s
    return ""
}

async function fetchDetail(id, base) {
    if (Object.keys(INFO_CACHE).length > INFO_CACHE_MAX) INFO_CACHE = {}
    let doc = await fetchDoc(base + "/" + id + ".html", base)
    try {
        let images = []
        for (const a of doc.querySelectorAll(".gallery-item a[href]")) {
            let src = abs(elAttr(a, "href"), base)
            if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(src)) continue
            if (images.indexOf(src) < 0) images.push(src)
        }
        // 兜底：主题换了也没关系，正文里所有指向图床的链接全收
        if (images.length === 0) {
            for (const img of doc.querySelectorAll(".article-content img")) {
                let src = abs(elAttr(img, "data-src") || elAttr(img, "src"), base)
                if (src.indexOf("twoimg.com/") < 0) continue
                src = src.replace(/-\d+x\d+(\.\w+)$/i, "$1")
                if (images.indexOf(src) < 0) images.push(src)
            }
        }

        let title = ""
        let h1 = doc.querySelector("h1")
        if (h1) title = cleanTitle(h1.text || "")
        let h2 = doc.querySelector(".article-content h2")
        if (!title && h2) title = cleanTitle(h2.text || "")

        // <span class="item item-3">分类：<a href="/people/siwa" rel="category tag">丝袜美腿</a></span>
        let cat = doc.querySelector("span.item a[href*='/people/'], .article-info a[href*='/people/']")
        let tags = {}
        if (cat) tags["分类"] = [(cat.text || "").trim()]
        for (const a of doc.querySelectorAll(".article-tags a[href*='/tag/']")) {
            let t = (a.text || "").trim()
            if (t) tags["标签"] = (tags["标签"] || []).concat([t])
        }

        let cover = COVER_CACHE[id] || (images.length > 0 ? images[0] : "") || SITE_ICON
        let info = {
            title: title || id,
            cover: cover,
            description: images.length > 0 ? "共 " + images.length + " 张" : "",
            tags: tags,
            url: base + "/" + id + ".html",
            images: images,
        }
        INFO_CACHE[id] = info
        return info
    } finally {
        doc.dispose()
    }
}

class TwoImg extends ComicSource {
    name = "TWOIMG 美女"

    key = "twoimg_people"

    version = "1.1.1"

    minAppVersion = "1.6.0"

    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/twoimg.js"

    settings = {
        baseUrl: {
            title: "站点地址（留空用默认；换域名时填新地址，不要带末尾斜杠）",
            type: "input",
            validator: null,
            default: "",
        },
    }

    getBase() {
        let custom = String(this.loadSetting("baseUrl") || "").trim()
        if (custom) {
            custom = custom.replace(/\/+$/, "")
            if (!/^https?:\/\//i.test(custom)) custom = "https://" + custom
            CURRENT_BASE = custom
            return custom
        }
        CURRENT_BASE = DEFAULT_BASE
        return DEFAULT_BASE
    }

    // 探索页：只有一个 tab（不按分类拆成多个子页），内容取自 /people，
    // 但可以往后无限翻页：/people/page/2、/people/page/3 …
    explore = [
        {
            title: "TWOIMG",
            type: "multiPageComicList",
            load: async (page) => {
                let base = this.getBase()
                return await listPage(base, "/people", page)
            },
        },
    ]

    // 分类页：people 分区下的 9 个二级分类
    category = {
        title: "TWOIMG",
        parts: [
            {
                name: "分类",
                type: "fixed",
                categories: TAG_GROUP.map(function (it) {
                    return it[0]
                }),
                categoryParams: TAG_GROUP.map(function (it) {
                    return it[1]
                }),
                itemType: "category",
            },
        ],
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let base = this.getBase()
            let slug = String(param || "").trim()
            if (!/^[a-z]+$/.test(slug)) throw `Invalid category param: ${param}`
            return await listPage(base, "/people/" + slug, page)
        },
    }

    search = {
        load: async (keyword, options, page) => {
            let base = this.getBase()
            let kw = encodeURIComponent(String(keyword || "").trim())
            let p = page <= 1 ? 1 : page
            // /page/N/?s= 是 404；站点只认 ?s=..&paged=N
            let url = p === 1 ? base + "/?s=" + kw : base + "/?s=" + kw + "&paged=" + p
            let lastPromise = probeLastPage(base, "/?s=" + kw, "&paged=")
            let doc = await fetchDoc(url, base)
            try {
                return { comics: parseCards(doc, base), maxPage: Math.max(maxPageOf(doc, p), await lastPromise, p) }
            } finally {
                doc.dispose()
            }
        },
    }

    comic = {
        loadInfo: async (id) => {
            let base = this.getBase()
            let nid = normalizeId(id)
            if (!nid) throw "Invalid comic id"
            let info = INFO_CACHE[nid] || (await fetchDetail(nid, base))
            return new ComicDetails({
                id: nid,
                title: info.title,
                cover: info.cover,
                description: info.description,
                tags: info.tags,
                chapters: { "0": "View All Photos" },
                url: info.url,
            })
        },

        loadEp: async (comicId, epId) => {
            let base = this.getBase()
            let nid = normalizeId(comicId)
            if (!nid) throw "Invalid comic id"
            let info = INFO_CACHE[nid] || (await fetchDetail(nid, base))
            return { images: info.images }
        },

        // 图床无硬防盗链，带站点 Referer 更稳。本地已下载的 cover.webp / file:// 原样透传。
        onImageLoad: (url, comicId, epId) => {
            if (!/^https?:\/\//i.test(String(url))) return {}
            return {
                headers: {
                    "user-agent": UA,
                    "referer": CURRENT_BASE + "/",
                },
            }
        },

        onThumbnailLoad: (url) => {
            if (!/^https?:\/\//i.test(String(url))) return {}
            return {
                headers: {
                    "user-agent": UA,
                    "referer": CURRENT_BASE + "/",
                },
            }
        },
    }
}
