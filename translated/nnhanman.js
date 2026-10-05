// 地址库：主域名 + 备用镜像。站点换域名时在「设置页」切换，或自定义输入最新地址。
const DEFAULT_BASE = "https://nnhanman.xyz"
const MIRROR_HOSTS = [
    "nnhanman.xyz",
    "nnhanman66.com",
    "nnhanman88.com",
    "nnhm81.com",
    "nnhm92.com",
    "nnhm91.com",
]

// 「标签」区块，与 /comics 页面的筛选条一一对应
const TAGS = [
    "正妹", "恋爱", "出版漫画", "肉慾", "浪漫",
    "大尺度", "巨乳", "有夫之婦", "女大生", "狗血劇",
    "同居", "好友", "調教", "动作", "後宮",
    "不倫", "3D", "校園", "耽美", "日漫",
]

function elAttr(el, name) {
    if (!el) return ""
    let v = el.attributes[name]
    return v === undefined || v === null ? "" : String(v)
}

function abs(u, base) {
    if (!u) return ""
    u = String(u).trim()
    if (u.length === 0) return ""
    if (u.indexOf("//") === 0) return "https:" + u
    if (u.charAt(0) === "/") return base + u
    return u
}

function siteIcon(base) {
    return base + "/images/logo.png"
}

// 站点用中文路径段，逐段编码
function encPath(p) {
    return p.split("/").map(function (s) { return encodeURIComponent(s) }).join("/")
}

async function getDocUrl(base, url) {
    let res = await Network.get(url, {})
    if (res.status !== 200) throw `Invalid status code: ${res.status}`
    return new HtmlDocument(res.body)
}

function getDoc(base, path) {
    return getDocUrl(base, base + encPath(path))
}

function idFromHref(h) {
    let m = String(h || "").match(/\/comic\/([^/?#]+)\.html/)
    return m ? m[1] : null
}

// 分页器是滑动窗口：第 1 页给出 [1..8] + 「... 147」末页链接，
// 末页给出 [140..146] + active(147)。取「数字链接最大页」与「active 页」的较大者。
// 越界页会软回落成空列表，所以绝不能用请求的页码当上界。
function maxPageOf(doc) {
    let nav = doc.querySelector(".pagination-wrap nav")
    if (!nav) return 1
    let max = 1
    for (const a of nav.querySelectorAll("a")) {
        let m = elAttr(a, "href").match(/\/page\/(\d+)/)
        if (!m) continue
        // 页码链接的文本必须带有与 href 一致的页码，才认作真页码。
        // 「上一页/下一页」按钮文本无数字，其 href 带的是无意义页号
        // （越界空页里上一页甚至指向 /page/998），据此排除；「... 147」
        // 这种省略号尾页文本含 147 与 href 一致，正常计入。
        let t = (a.text || "").match(/\d+/g)
        if (!t || parseInt(t[t.length - 1], 10) !== parseInt(m[1], 10)) continue
        let n = parseInt(m[1], 10)
        if (n > max) max = n
    }
    for (const li of nav.querySelectorAll("li")) {
        if (!/(^|\s)active(\s|$)/.test(elAttr(li, "class"))) continue
        let a = li.querySelector("a")
        let n = parseInt(String((a ? a.text : li.text) || "").trim(), 10)
        if (!isNaN(n) && n > max) max = n
    }
    return max
}

// 列表页 / 搜索页卡片：ul.col_3_1 > li
function parseList(doc, base) {
    let out = []
    for (const li of doc.querySelectorAll("ul.col_3_1 > li")) {
        let a = li.querySelector("a.ImgA")
        if (!a) continue
        let id = idFromHref(elAttr(a, "href"))
        if (!id) continue
        let img = li.querySelector("img")
        let cover = img ? (elAttr(img, "src") || elAttr(img, "data-src")) : ""
        let ta = li.querySelector("a.txtA")
        let title = ta ? ta.text.trim() : ""
        if (!title) title = elAttr(a, "title").trim()
        if (!title) continue
        let info = li.querySelector("span.info")
        let date = info ? info.text.trim() : ""
        out.push(new Comic({
            id: id,
            title: title,
            // cover 绝不返回空串：空串会让 app 抛 "relative URL without a base"
            cover: abs(cover, base) || siteIcon(base),
            tags: [],
            description: date ? "更新 " + date : "",
        }))
    }
    return out
}

// 排行页 / 更新页卡片：div.itemBox（固定 100 / 50 条，无分页）
function parseBoards(doc, base) {
    let out = []
    for (const box of doc.querySelectorAll(".itemBox")) {
        let a = box.querySelector(".itemImg a")
        if (!a) continue
        let id = idFromHref(elAttr(a, "href"))
        if (!id) continue
        let img = box.querySelector(".itemImg img")
        let cover = img ? (elAttr(img, "src") || elAttr(img, "data-src")) : ""
        let t = box.querySelector(".itemTxt a.title")
        let title = t ? t.text.trim() : elAttr(a, "title").trim()
        if (!title) continue

        let tags = []
        for (const ta of box.querySelectorAll(".pd a")) {
            let x = ta.text.trim()
            if (x) tags.push(x)
        }

        let chap = ""
        for (const ca of box.querySelectorAll(".itemTxt a")) {
            if (elAttr(ca, "href").indexOf("/chapter-") >= 0) {
                chap = ca.text.trim()
                break
            }
        }

        let dateEl = box.querySelector(".date")
        let date = dateEl ? dateEl.text.trim() : ""
        let desc = []
        if (chap) desc.push("最新: " + chap)
        if (date) desc.push("更新: " + date)

        out.push(new Comic({
            id: id,
            title: title,
            subTitle: chap,
            cover: abs(cover, base) || siteIcon(base),
            tags: tags,
            description: desc.join("|"),
        }))
    }
    return out
}

class Nnhanman extends ComicSource {
    name = "鸟鸟韩漫"

    key = "nnhanman"

    version = "1.1.0"

    minAppVersion = "1.6.0"

    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/translated/nnhanman.js"

    settings = {
        baseUrl: {
            title: "网址列表",
            type: "select",
            options: MIRROR_HOSTS.map(function (h) {
                return { value: "https://" + h, text: h }
            }),
            default: DEFAULT_BASE,
        },
        baseUrlCustom: {
            title: "自定义地址（非空即生效，末尾不要加斜杠）",
            type: "input",
            validator: null,
            default: "",
        },
    }

    // 当前生效的站点 base：自定义地址 > 下拉选择 > 默认域名
    getBase() {
        let custom = String(this.loadSetting("baseUrlCustom") || "").trim()
        if (custom) {
            custom = custom.replace(/\/+$/, "")
            if (!/^https?:\/\//i.test(custom)) custom = "https://" + custom
            return custom
        }
        let sel = this.loadSetting("baseUrl")
        if (sel) return String(sel).replace(/\/+$/, "")
        return DEFAULT_BASE
    }

    // 探索页：全站漫画列表，共 147 页
    explore = [
        {
            title: "鸟鸟韩漫",
            type: "multiPageComicList",
            load: async (page) => {
                let p = "/comics/all/ob/time/st/all"
                let doc = await getDoc(this.getBase(), page <= 1 ? p : p + "/page/" + page)
                try {
                    return { comics: parseList(doc, this.getBase()), maxPage: maxPageOf(doc) }
                } finally {
                    doc.dispose()
                }
            },
        },
    ]

    category = {
        title: "鸟鸟韩漫",
        parts: [
            {
                name: "标签",
                type: "fixed",
                categories: TAGS.map(function (t) {
                    return {
                        label: t,
                        target: {
                            page: "category",
                            attributes: { category: t, param: "/comics/" + t + "/ob/time/st/all" },
                        },
                    }
                }),
            },
            {
                name: "排行",
                type: "fixed",
                categories: [
                    { label: "日榜", target: { page: "category", attributes: { category: "排行", param: "/ranking/daily" } } },
                    { label: "周榜", target: { page: "category", attributes: { category: "排行", param: "/ranking/weekly" } } },
                    { label: "月榜", target: { page: "category", attributes: { category: "排行", param: "/ranking/monthly" } } },
                    { label: "总榜", target: { page: "category", attributes: { category: "排行", param: "/ranking/all" } } },
                ],
            },
            {
                name: "更新",
                type: "fixed",
                categories: [
                    { label: "最新更新", target: { page: "category", attributes: { category: "更新", param: "/update" } } },
                    { label: "新书发布", target: { page: "category", attributes: { category: "更新", param: "/update/newbook" } } },
                ],
            },
        ],
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            if (!param) throw "Invalid category param"
            // 排行 / 更新是整页直出，没有分页
            let isBoard = /^\/ranking(\/|$)/.test(param) || /^\/update(\/|$)/.test(param)
            let path = isBoard ? param : (page <= 1 ? param : param + "/page/" + page)
            let doc = await getDoc(this.getBase(), path)
            try {
                if (isBoard) {
                    return { comics: parseBoards(doc, this.getBase()), maxPage: 1 }
                }
                return { comics: parseList(doc, this.getBase()), maxPage: maxPageOf(doc) }
            } finally {
                doc.dispose()
            }
        },
    }

    search = {
        load: async (keyword, page) => {
            let p = "/search/" + encodeURIComponent(keyword)
            let doc = await getDocUrl(this.getBase(), this.getBase() + (page <= 1 ? p : p + "/page/" + page))
            try {
                return { comics: parseList(doc, this.getBase()), maxPage: maxPageOf(doc) }
            } finally {
                doc.dispose()
            }
        },
    }

    comic = {
        loadInfo: async (id) => {
            let doc = await getDoc(this.getBase(), "/comic/" + id + ".html")
            try {
                let cimg = doc.querySelector("#Cover img")
                let cover = cimg ? (elAttr(cimg, "src") || elAttr(cimg, "data-src")) : ""

                let h1 = doc.querySelector(".Introduct h1")
                let title = h1 ? h1.text.trim() : ""
                title = title.replace(/^[《\s]+/, "").replace(/[》\s]+$/, "")
                if (!title) title = id

                let author = ""
                let status = ""
                let tagList = []
                for (const p of doc.querySelectorAll(".sub_r p.txtItme")) {
                    let dateEl = p.querySelector("span.date")
                    if (dateEl) {
                        status = dateEl.text.trim()
                        continue
                    }
                    let picked = []
                    for (const la of p.querySelectorAll("a")) {
                        if (elAttr(la, "href").indexOf("/comics/") === 0) {
                            let x = la.text.trim()
                            if (x) picked.push(x)
                        }
                    }
                    if (picked.length > 0) {
                        tagList = picked
                        continue
                    }
                    if (!author) {
                        // 作者行首偶尔带一个模板残留的拉丁字母图标（如 "G由&NTK&六月"）
                        author = p.text.trim().replace(/^[A-Za-z](?=[一-鿿])/, "")
                    }
                }

                let descEl = doc.querySelector("p.txtDesc")
                let desc = descEl ? descEl.text.trim().replace(/^介绍[:：]\s*/, "") : ""

                let chapters = {}
                for (const a of doc.querySelectorAll("ul.Drama li a")) {
                    let h = elAttr(a, "href")
                    if (h.indexOf("/chapter-") < 0) continue
                    let sp = a.querySelector("span")
                    chapters[h] = sp ? sp.text.trim() : a.text.trim()
                }

                let tags = {}
                if (author) tags["作者"] = [author]
                if (status) tags["状态"] = [status]
                if (tagList.length > 0) tags["标签"] = tagList

                return new ComicDetails({
                    id: id,
                    title: title,
                    cover: abs(cover, this.getBase()) || siteIcon(this.getBase()),
                    description: desc,
                    tags: tags,
                    chapters: chapters,
                    recommend: parseList(doc, this.getBase()),
                    url: this.getBase() + "/comic/" + id + ".html",
                })
            } finally {
                doc.dispose()
            }
        },

        loadEp: async (comicId, epId) => {
            let path = epId ? String(epId) : ""
            if (path.indexOf("/") !== 0) path = "/comic/" + comicId + "/" + path
            let doc = await getDoc(this.getBase(), path)
            try {
                let items = []
                for (const img of doc.querySelectorAll(".view-imgBox img")) {
                    let src = elAttr(img, "data-src") || elAttr(img, "src")
                    if (!src) continue
                    let idx = parseInt(elAttr(img, "data-index"), 10)
                    items.push({ url: abs(src, this.getBase()), idx: isNaN(idx) ? items.length : idx })
                }
                items.sort(function (a, b) { return a.idx - b.idx })
                let images = []
                for (const it of items) {
                    if (images.indexOf(it.url) < 0) images.push(it.url)
                }
                return { images: images }
            } finally {
                doc.dispose()
            }
        },

        onClickTag: (namespace, tag) => {
            if (namespace !== "标签") return null
            return {
                page: "category",
                attributes: { category: tag, param: "/comics/" + tag + "/ob/time/st/all" },
            }
        },
    }
}
