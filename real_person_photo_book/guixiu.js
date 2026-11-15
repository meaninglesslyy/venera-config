const DEFAULT_BASE = "https://guixiu.org"
const SITE_ICON = DEFAULT_BASE + "/favicon.ico"

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// 分类 tag：显示名 -> 原站分类页路径（category-{id}）
const TAG_GROUP = [
    ["美女写真", "category-16"],
    ["性感车模", "category-18"],
    ["日韩美女", "category-19"],
    ["秀人写真", "category-1"],
    ["丝模套图", "category-15"],
    ["明星写真", "category-21"],
]

// Venera 的 HtmlElement.attributes 是 {name: string}；三层兜底统一成字符串
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

function requestHeaders(base) {
    return {
        "user-agent": UA,
        "referer": base + "/",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9",
    }
}

async function fetchDoc(url, base) {
    // 站点偶发掐断连接，最多重试 3 次、间隔 500ms，兜住瞬时 reset。
    let last = null
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            let res = await Network.get(url, requestHeaders(base))
            if (res.status === 200) return new HtmlDocument(res.body)
            last = `Invalid status code: ${res.status} (${url})`
        } catch (e) {
            last = e
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw last
}

// 列表卡片：ul#post_list_box > li.lpost > div.list-img > a[href=/post/{id}.html] > img[src]
function parseCards(doc, base) {
    let out = []
    for (const li of doc.querySelectorAll("ul#post_list_box li.lpost")) {
        let a = li.querySelector("div.list-img a[href]") || li.querySelector("h2 a[href]")
        if (!a) continue
        let href = abs(elAttr(a, "href"), base)
        let m = href.match(/\/post\/(\d+)\.html/) || href.match(/\/(\d+)\.html$/)
        if (!m) continue
        let id = m[1]
        let img = li.querySelector("div.list-img img") || li.querySelector("img")
        let cover = abs(img ? elAttr(img, "src") : "", base)
        let h2 = li.querySelector("h2 a[href]")
        let title = h2 ? (h2.text || "").trim() : ""
        if (!title) title = id
        let time = li.querySelector("time")
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

// 列表页底部分页器给出「尾页」链接（>尾页），其页码即总页数，无需二分探测。
// 链接形如：
//   首页   /page_415.html
//   分类   /category-16_110.html
//   搜索   /%E4%B8%9D%E8%A2%9C_10.html
// 统一规律是 href 以 _{N}.html 结尾，扫 .pagelist 全部 <a> 取最大页码即可。
function maxPageOf(doc, page) {
    let max = page || 1
    for (const a of doc.querySelectorAll(".pagelist a[href]")) {
        let h = elAttr(a, "href")
        let m = h.match(/_(\d+)\.html$/)
        if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return max
}

// 列表页取数：path 形如 ""(首页) 或 "category-16"(分类)。
// 首页 第1页=base+path，第N页=base+"/page_"+N+".html"
// 分类 第1页=base+"/"+path+".html"，第N页=base+"/"+path+"_"+N+".html"
function listUrl(base, path, page) {
    let p = page && page > 1 ? page : 1
    if (!path) return p === 1 ? base + "/" : base + "/page_" + p + ".html"
    return p === 1 ? base + "/" + path + ".html" : base + "/" + path + "_" + p + ".html"
}

async function listPage(base, path, page) {
    let url = listUrl(base, path, page)
    let doc = await fetchDoc(url, base)
    try {
        return { comics: parseCards(doc, base), maxPage: maxPageOf(doc, page) }
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

// 从详情页 DOM 收集正文图：<article#lightgallery> 里所有 <img class="img" src="图床">
function collectDetailImages(doc, base, into) {
    let got = false
    for (const img of doc.querySelectorAll("article#lightgallery img[src]")) {
        let src = abs(elAttr(img, "src"), base)
        if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(src)) continue
        // 图源是按内容寻址的：同一 URL 恒返回同一张图，按 URL 去重即可
        if (into.indexOf(src) < 0) into.push(src)
        got = true
    }
    return got
}

// 详情页套图分页：正文一次性只渲染 4 张（第1页），其余通过 ?ipage={N} 逐页加载。
// <ul id="ipage"> 列出全部页码（2..N），取其最大值即总页数；每页再收 4 张。
// 注意：图源 URL 是按内容寻址的（同 URL = 同文件），必须逐页爬全再按 URL 去重。
// 站点自身在 ipage=2 复用了第 1 页的 URL（第 5-8 张与第 1-4 张同 URL），
// 这部分是上游数据缺陷，无法恢复，其余页均正常给出独立 URL。
function ipageTotal(doc, page) {
    let max = page || 1
    for (const a of doc.querySelectorAll("ul#ipage a[href]")) {
        let m = elAttr(a, "href").match(/ipage=(\d+)/)
        if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return max
}

// 套图分页硬上限：防止异常页面把 ipage 页码刷到几百而无限翻页。
const MAX_DETAIL_PAGES = 60
// 站点对连续请求敏感，页间留 300ms，避免被 reset（同 everiaclub 做法）。
const PAGE_THROTTLE_MS = 300

// 详情元数据缓存：只存第 1 页解析出的标题/封面/分类/首屏图/总页数。
// loadInfo 只消费这份轻量缓存，绝不触发整套拉取。
let INFO_CACHE = {}

// 整套图缓存：loadEp 真正打开图包时才逐页拉全并落这份缓存。
let IMG_CACHE = {}

// 并发合并：loadInfo / loadEp 同时触发同一 id 时不重复翻页。
let META_LOADING = {}

// 只拉第 1 页的轻量详情：浏览列表/打开详情页时仅此一次请求，速度快。
// 返回 title / cover / tags / maxIpage / firstImages（首屏 4 张）/ url。
async function loadDetailMeta(id, base) {
    if (INFO_CACHE[id]) return INFO_CACHE[id]
    if (META_LOADING[id]) return await META_LOADING[id]

    let task = (async () => {
        let doc = await fetchDoc(base + "/post/" + id + ".html", base)
        let images = []
        let title = ""
        let tags = {}
        let maxIpage = 1
        try {
            collectDetailImages(doc, base, images)
            maxIpage = ipageTotal(doc, 1)
            let h1 = doc.querySelector("h1.focusbox-title") || doc.querySelector("h1")
            if (h1) title = (h1.text || "").trim()
            // 分类面包屑：当前位置：首页 > <a href=/category-{N}.html>分类</a> > 正文
            let bread = doc.querySelector("div.mbs.mb1 a[href*='/category-']")
            if (bread) tags["分类"] = [(bread.text || "").trim()]
        } finally {
            doc.dispose()
        }
        let meta = {
            id: id,
            title: title || id,
            cover: images.length > 0 ? images[0] : SITE_ICON,
            tags: tags,
            url: base + "/post/" + id + ".html",
            maxIpage: maxIpage,
            firstImages: images,
        }
        INFO_CACHE[id] = meta
        return meta
    })()
    META_LOADING[id] = task
    try {
        return await task
    } finally {
        delete META_LOADING[id]
    }
}

// 拉整套图（loadEp 专用）：从第 1 页起逐页拉全，页间留 300ms，按 URL 去重。
// 结果落 IMG_CACHE，同一图包只爬一次；下次 loadEp 直接命中。
async function loadDetailAll(id, base) {
    if (IMG_CACHE[id]) return IMG_CACHE[id]

    let meta = await loadDetailMeta(id, base)
    let images = meta.firstImages.slice()
    let maxIpage = Math.min(meta.maxIpage || 1, MAX_DETAIL_PAGES)

    // 逐页拉取剩余套图（第 2 页起），全部按 URL 去重合并
    for (let p = 2; p <= maxIpage; p++) {
        let pdoc = await fetchDoc(base + "/post/" + id + ".html?ipage=" + p, base)
        try {
            collectDetailImages(pdoc, base, images)
        } finally {
            pdoc.dispose()
        }
        if (p < maxIpage) await new Promise((resolve) => setTimeout(resolve, PAGE_THROTTLE_MS))
    }

    IMG_CACHE[id] = images
    return images
}

class GuiXiu extends ComicSource {
    name = "闺秀网"

    key = "guixiu_pic"

    version = "1.2.0"

    minAppVersion = "1.6.0"

    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/guixiu.js"

    // 探索页：只有一个 tab（不拆子页），内容直接取自网站首页 /
    explore = [
        {
            title: "闺秀网",
            type: "multiPageComicList",
            load: async (page) => {
                let base = DEFAULT_BASE
                return await listPage(base, "", page)
            },
        },
    ]

    // 分类页：Nono 指定的 6 个 tag，顺序与命名照抄
    category = {
        title: "闺秀网",
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
            let base = DEFAULT_BASE
            let slug = String(param || "").trim()
            if (!/^category-\d+$/.test(slug)) throw `Invalid category param: ${param}`
            return await listPage(base, slug, page)
        },
    }

    search = {
        load: async (keyword, options, page) => {
            let base = DEFAULT_BASE
            // 搜索是 GET /search.php?q=关键词；分页为 /{urlencoded_q}_{N}.html
            let kw = encodeURIComponent(String(keyword || "").trim())
            let p = page <= 1 ? 1 : page
            let url = p === 1 ? base + "/search.php?q=" + kw : base + "/" + kw + "_" + p + ".html"
            let doc = await fetchDoc(url, base)
            try {
                return { comics: parseCards(doc, base), maxPage: maxPageOf(doc, p) }
            } finally {
                doc.dispose()
            }
        },
    }

    comic = {
        loadInfo: async (id) => {
            let base = DEFAULT_BASE
            let nid = normalizeId(id)
            if (!nid) throw "Invalid comic id"
            // 只拉第 1 页的轻量元数据，绝不做整套拉取，详情页秒开。
            let meta = await loadDetailMeta(nid, base)
            let desc = meta.maxIpage > 1 ? "共 " + meta.maxIpage + " 页" : ""
            if (meta.firstImages.length > 0) desc = (desc ? desc + " · " : "") + meta.firstImages.length + " 张（含后续翻页）"
            return new ComicDetails({
                id: nid,
                title: meta.title,
                cover: meta.cover,
                description: desc || "",
                tags: meta.tags,
                chapters: { "0": "View All Photos" },
                url: meta.url,
            })
        },

        loadEp: async (comicId, epId) => {
            let base = DEFAULT_BASE
            let nid = normalizeId(comicId)
            if (!nid) throw "Invalid comic id"
            // 真正打开图包时才逐页拉全（带 300ms 节流 + 重试），结果缓存复用。
            let images = await loadDetailAll(nid, base)
            if (!images.length) throw "没有解析到图片"
            return { images: images }
        },

        // 图床无硬防盗链，带站点 Referer 更稳。本地已下载的 cover.webp / file:// 原样透传。
        onImageLoad: (url, comicId, epId) => {
            if (!/^https?:\/\//i.test(String(url))) return {}
            return {
                headers: {
                    "user-agent": UA,
                    "referer": DEFAULT_BASE + "/",
                },
            }
        },

        onThumbnailLoad: (url) => {
            if (!/^https?:\/\//i.test(String(url))) return {}
            return {
                headers: {
                    "user-agent": UA,
                    "referer": DEFAULT_BASE + "/",
                },
            }
        },
    }
}
