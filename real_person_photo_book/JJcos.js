/** @type {import('../../venera-configs/_venera_.js')} */

/**
 * JJCOS —— https://jjcos.com
 *
 * 结构：
 * - 5 个分区：Home(/)、Cosplay、Japan、Korea、R18（都是 tag 页）
 * - 列表：<article class="custom-article"> → figure.img-box a + img + h3
 * - 分页：<input type="number" max="N">；home=/page/N/，tag=/tag/{id}/page/N/
 * - 详情：/post/{slug}/，正文图在 #post-content img（排除 .post-navigation 的 prev/next 缩略图）
 * - 图片：i1.wp.com/{box}/wp-content/uploads/... 老帖 + i1.wp.com/{pages.dev}/file/{hash}.jpg 新帖
 *   （都是 Jetpack Photon 包裹，直接用）
 *
 */
class JJCos extends ComicSource {
    name = "JJCOS"
    key = "jjcos"
    version = "1.1.0"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/jjcos.js"

    base = "https://jjcos.com"

    // 5 个分区：param -> {name, path}
    // 5 个大厅分区：param -> {name, path}（explore 用）
    SECTIONS = {
        home:    { name: "Home",      path: "" },
        cosplay: { name: "Cosplay",   path: "tag/HSQ2151O0wZ" },
        japan:   { name: "Japan",     path: "tag/_m1OhebEGKK" },
        korea:   { name: "Korea",     path: "tag/HFU2FLGMsyDB" },
        r18:     { name: "R18",       path: "tag/a2_60MJyBG9S" },
    }

    pageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
            "Referer": this.base + "/",
        }
    }

    // 图片加载头：模拟浏览器（Photon 有反盗链/边缘缓存，带 Referer 更接近网站观看效果）
    imageHeaders(slug) {
        let ref = this.base + "/"
        if (slug) ref = this.detailUrl(slug)
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Referer": ref,
        }
    }

    // 分区的列表 URL（page 从 1 开始）
    // param 两种：① SECTIONS 里的 key（home/cosplay/japan/korea/r18）② 裸 tag id（自动拼 tag/{id}/）
    sectionUrl(param, page) {
        if (param === "home") {
            return this.base + (page > 1 ? "/page/" + page + "/" : "/")
        }
        let path = this.SECTIONS[param] ? this.SECTIONS[param].path : "tag/" + param
        return this.base + "/" + path + "/" + (page > 1 ? "page/" + page + "/" : "")
    }

    // 详情 URL：slug 是完整标题（含 unicode/空格/逗号），需整体编码
    detailUrl(slug) {
        return this.base + "/post/" + encodeURIComponent(slug) + "/"
    }

    // 从 post href 里抽出 slug（去域名、去 /post/ 前缀、去尾斜杠）
    slugFromHref(href) {
        let s = String(href || "")
        s = s.replace(/^https?:\/\/[^/]+/, "")
        s = s.replace(/^\/post\//, "")
        s = s.replace(/\/+$/, "")
        return s
    }

    normalizeUrl(u) {
        if (!u) return ""
        u = String(u).trim()
        if (u.startsWith("//")) return "https:" + u
        if (/^https?:\/\//i.test(u)) return u
        return u
    }

    // 解析列表页（article -> {id, title, cover, date}）
    parseList(html) {
        let comics = []
        let doc = new HtmlDocument(html)
        let items = doc.querySelectorAll("article.custom-article")
        for (let i = 0; i < items.length; i++) {
            let it = items[i]
            let a = it.querySelector(".img-box a, figure a")
            if (!a) continue
            let href = a.attributes["href"] || ""
            let slug = this.slugFromHref(href)
            if (!slug || slug.indexOf("post/") >= 0) continue
            let img = it.querySelector(".img-box img, figure img")
            let cover = this.normalizeUrl(img ? (img.attributes["src"] || "") : "")
            let titleEl = it.querySelector(".fh5co-article-title a, h3 a")
            let title = titleEl ? (titleEl.text || "").trim() : (img ? (img.attributes["alt"] || "").trim() : "")
            let dateEl = it.querySelector(".date-overlay")
            let date = dateEl ? (dateEl.text || "").trim() : ""
            if (!slug || !title) continue
            comics.push(new Comic({
                id: slug,
                title: title,
                subTitle: date,
                cover: cover,
            }))
        }
        doc.dispose()
        return comics
    }

    // 从分页 input 的 max 属性取最大页数
    maxPageFrom(html, fallback) {
        let m = String(html).match(/max="(\d+)"/)
        if (m) {
            let n = parseInt(m[1])
            if (!isNaN(n) && n > 0) return n
        }
        return fallback || 1
    }

    // 拉取某分区某页。param 支持聚合：多个裸 tag id 用 | 拼接（如 "id1|id2|id3"）
    fetchList(param, page) {
        let ids = String(param).split("|").map((x) => x.trim()).filter((x) => x)
        if (ids.length <= 1) {
            let url = this.sectionUrl(ids[0] || param, page)
            return Network.get(url, this.pageHeaders()).then((r) => {
                if (r.status !== 200) throw "err"
                return {comics: this.parseList(r.body), maxPage: this.maxPageFrom(r.body, page)}
            })
        }
        return this.fetchAggregate(ids, page)
    }

    // 聚合 tag：每个 id 拉第 1 页取 max + 当前页取内容，合并去重
    fetchAggregate(ids, page) {
        let tasks = ids.map((id) => {
            let p1 = Network.get(this.sectionUrl(id, 1), this.pageHeaders())
            let pn = page === 1 ? p1 : Network.get(this.sectionUrl(id, page), this.pageHeaders())
            return Promise.all([p1, pn]).then(([r1, rn]) => {
                let max = r1.status === 200 ? this.maxPageFrom(r1.body, 1) : 1
                let comics = rn.status === 200 ? this.parseList(rn.body) : []
                return {max: max, comics: comics}
            })
        })
        return Promise.all(tasks).then((results) => {
            let maxPage = 1
            let comics = []
            let seen = {}
            for (let i = 0; i < results.length; i++) {
                let r = results[i]
                if (r.max > maxPage) maxPage = r.max
                for (let j = 0; j < r.comics.length; j++) {
                    let c = r.comics[j]
                    if (!seen[c.id]) { seen[c.id] = true; comics.push(c) }
                }
            }
            return {comics: comics, maxPage: maxPage}
        })
    }

    // ============ 大厅：一页五块，每块首页 20 套 + 查看更多 ============
    explore = [
        {
            title: "JJCOS",
            type: "multiPartPage",
            load: async (page) => {
                let parts = []
                let params = ["home", "cosplay", "japan", "korea", "r18"]
                for (let i = 0; i < params.length; i++) {
                    let param = params[i]
                    let sec = this.SECTIONS[param]
                    let viewMore = { page: "category", attributes: { category: sec.name, param: param } }
                    try {
                        let r = await this.fetchList(param, 1)
                        parts.push({ title: sec.name, comics: r.comics.slice(0, 5), viewMore: viewMore })
                    } catch (e) {
                        parts.push({ title: sec.name, comics: [], viewMore: viewMore })
                    }
                }
                return parts
            }
        }
    ]

    // ============ 分类：查看更多进入后的完整分区 ============
    category = {
        title: "JJCOS",
        parts: [
            {
                name: "分区",
                type: "fixed",
                itemType: "category",
                categories: ["秀人网", "JVID", "阿薰kaOri", "蠢沫沫", "水淼Aqua", "Natsuko夏夏子", "铃木美咲", "星之迟迟", "雪晴Astra", "小和甜酒", "Tiny Asa", "Bangni邦尼", "Yeha"],
                categoryParams: [
                    "lF2wifO7tb5n|XUU4iaNxd1hp|8OSxrA28xshu",
                    "J98wrYlyozVo|eIFhPjl4ARrD",
                    "54whuLuogIw3|0Umcd3-DPE5Ju|dN-lZOw739vzB",
                    "EbKijoqVm671|lnkRoN8Gg0zU|-FmPg6e4rmD5",
                    "E4NRhUA3QNr|8vWW5wTevRA|207z7wE4XGu",
                    "WVYpu6nzvifw|5ytz1VZulbqc",
                    "Pfp26jAcAw6VN|8CFx40b-84W7X",
                    "PI1oy1pfnrL|FJxYmY-z1MFUJ",
                    "gTAMFAMq5rAR|BV9mIpXALMLB|z2DT7-E_nkwX",
                    "gI0izmYRU92",
                    "KGvOqn5hMDC_",
                    "Nf6X0WFs2T-m",
                    "WKyr1DA4uNMH|0rE928kTUjwr",
                ],
            }
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: (category, param, options, page) => {
            return this.fetchList(param, page)
        }
    }

    // ============ 搜索（Gridea 全量索引 /api/） ============
    search = {
        load: async (keyword, options, page) => {
            let kw = String(keyword || "").toLowerCase().trim()
            if (!kw) return {comics: [], maxPage: 1}
            try {
                // 全量索引约 11MB+，缓存 6h 避免反复下载
                let idx = this.loadData("search_index")
                if (idx) {
                    try {
                        let o = JSON.parse(idx)
                        if (o.t && o.body && (Date.now() - o.t) < 6 * 3600 * 1000) idx = o.body
                        else idx = null
                    } catch (e) { idx = null }
                }
                if (!idx) {
                    let res = await Network.get(this.base + "/api/", this.pageHeaders())
                    if (res.status !== 200) return {comics: [], maxPage: 1}
                    idx = res.body
                    this.saveData("search_index", JSON.stringify({t: Date.now(), body: idx}))
                }
                let data = JSON.parse(idx)
                let posts = data.posts || []
                let matched = []
                for (let i = 0; i < posts.length; i++) {
                    let t = (posts[i].title || "").toLowerCase()
                    if (t.indexOf(kw) >= 0) matched.push(posts[i])
                }
                let perPage = 20
                let start = (page - 1) * perPage
                let slice = matched.slice(start, start + perPage)
                let comics = []
                for (let j = 0; j < slice.length; j++) {
                    let p = slice[j]
                    comics.push(new Comic({
                        id: this.slugFromHref(p.link),
                        title: p.title,
                        subTitle: p.dateFormat || "",
                        cover: this.normalizeUrl(p.feature),
                    }))
                }
                return {comics: comics, maxPage: Math.max(1, Math.ceil(matched.length / perPage))}
            } catch (e) {
                return {comics: [], maxPage: 1}
            }
        },
        optionList: [],
        enableTagsSuggestions: false,
        onTagSuggestionSelected: (namespace, tag) => tag,
    }

    // ============ 详情 / 图片 ============
    comic = {
        loadInfo: (id) => {
            let url = this.detailUrl(id)
            return Network.get(url, this.pageHeaders()).then((r) => {
                if (r.status !== 200) throw "err"
                let title = ""
                let tm = r.body.match(/<meta property="og:title" content="([^"]+)"/)
                if (tm) title = tm[1].replace(/\s*[-|]\s*JJCOS\s*$/, "").trim()
                if (!title) title = id
                let cover = ""
                let cm = r.body.match(/<meta property="og:image" content="([^"]+)"/)
                if (cm) cover = cm[1]
                return {
                    title: title,
                    cover: cover,
                    tags: {},
                    chapters: {"0": "View All Photos"},
                }
            })
        },

        loadEp: (id, epId) => {
            let url = this.detailUrl(id)
            return Network.get(url, this.pageHeaders()).then((r) => {
                if (r.status !== 200) throw "err"
                let doc = new HtmlDocument(r.body)
                let container = doc.querySelector("#post-content")
                let imgs = []
                let seen = {}
                let els = container ? container.querySelectorAll("img") : []
                for (let i = 0; i < els.length; i++) {
                    let cls = els[i].attributes["class"] || ""
                    // 排除 prev/next 导航缩略图（class=post-image）与无关图
                    if (cls.indexOf("post-image") >= 0) continue
                    let src = this.normalizeUrl(els[i].attributes["src"] || els[i].attributes["data-src"] || "")
                    // 只看 Photon 图床图：i1.wp.com/{box}/wp-content/uploads/（老帖）或 i1.wp.com/{pages.dev}/file/（新帖）
                    if (!src || !/^https?:\/\/i\d+\.wp\.com\//.test(src)) continue
                    if (!seen[src]) { seen[src] = true; imgs.push(src) }
                }
                doc.dispose()
                if (!imgs.length) throw "no images"
                return {images: imgs}
            })
        },

        // 图片加载带浏览器头（Referer 对齐网站观看行为）
        onImageLoad: (url, comicId, epId) => {
            return { headers: this.imageHeaders(comicId) }
        },
        onThumbnailLoad: (url) => {
            return { headers: this.imageHeaders() }
        },
    }
}
