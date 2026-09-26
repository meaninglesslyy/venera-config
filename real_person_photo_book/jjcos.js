/** @type {import('../../venera-configs/_venera_.js')} */

class JJCos extends ComicSource {
    name = "JJCOS"
    key = "jjcos"
    version = "1.2.1"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/jjcos.js"

    base = "https://jjcos.com"

    // 封面兜底的最后一环：任何封面路径都不允许返回空串
    SITE_ICON = "https://jjcos.com/favicon.ico"

    // 5 个分区：param -> {name, path}
    SECTION_LIST = {
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

    // 图片加载头：带 webp/avif 的 Accept，Photon 会按协商转码，整包下载体积明显更小
    imageHeaders(slug) {
        let ref = this.base + "/"
        if (slug) {
            try { ref = this.detailUrl(slug) } catch (e) { ref = this.base + "/" }
        }
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Referer": ref,
        }
    }

    // ============ URL 规整 ============
    // 只补协议、做 trim，绝不"猜"相对路径去拼 base。
    // 原因：app 会把本地漫画的封面（相对路径 "cover.webp" 或 "file:///data/..."）也送进来，
    // 一旦被改写，下面 app 那段识别就失效了：
    //   if (((configs['url'] ?? url)).startsWith('cover.')) { 回源取网络封面 }
    // 拼接后变成 https://jjcos.com/cover.webp，前缀判断不过，app 就去请求这个 404，
    // 表现为「下载好的漫画，详情页封面加载错误」（v1.2.0 踩过这个坑，1.2.1 修）。
    tryAbs(u) {
        let s = String(u == null ? "" : u).trim()
        if (!s) return ""
        if (/^https?:\/\//i.test(s)) return s
        if (s.startsWith("//")) return "https:" + s
        return s
    }

    // 封面用：能拿到绝对 http(s) 就用，否则兜底到站点图标（保证发给 app 的 cover 非空）
    abs(u, fallback) {
        let s = this.tryAbs(u)
        if (/^https?:\/\//i.test(s)) return s
        return fallback || this.SITE_ICON
    }

    // 分区的列表 URL（page 从 1 开始）
    // param 两种：① SECTION_LIST 里的 key（home/cosplay/japan/korea/r18）② 裸 tag id（自动拼 tag/{id}/）
    sectionUrl(param, page) {
        if (param === "home") {
            return this.base + (page > 1 ? "/page/" + page + "/" : "/")
        }
        let path = this.SECTION_LIST[param] ? this.SECTION_LIST[param].path : "tag/" + param
        return this.base + "/" + path + "/" + (page > 1 ? "page/" + page + "/" : "")
    }

    // 详情 URL：slug 是完整标题（含 unicode/空格/逗号），需整体编码。
    // 注意逗号：站点对未编码（或 encodeURI 那种保留逗号）的 URL 会返回 200 + 空 body，
    // 必须 encodeURIComponent 把「,」编成 %2C，实测同一帖 0 图 → 32 图。
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

    // ============ 请求层：给下载链路兜可靠性 ============
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    // 站点限流闸：撞过 429 就记一个冷却点，同一批批量操作里的后续请求先等，别连环撞
    cooldownUntil = 0

    // 统一页面请求：
    // - 429/503 长退避重试。实测站点是突发限流，冷却到几十秒级，
    //   短退避（500ms/2s）根本骑不过去，会被 429 穿透
    // - 200 但 body 为空也重试（站点对未编码逗号的空页就是这个形态，静默失败最坑）
    // - 图片链路是独立的，实测零间隔连拉 60 张全 200，不受这个闸影响
    async fetchPage(url, tries) {
        let max = tries || 4
        let lastErr = "unknown"
        for (let i = 0; i <= max; i++) {
            if (i > 0) {
                // 0.9s / 2.5s / 7s / 20s
                await this.sleep(Math.round(900 * Math.pow(2.8, i - 1)))
            }
            let w = this.cooldownUntil - Date.now()
            if (w > 0) await this.sleep(Math.min(w, 20000))

            let r = null
            try {
                r = await Network.get(url, this.pageHeaders())
            } catch (e) {
                lastErr = String(e)
                continue
            }
            if (r.status === 200) {
                let body = r.body || ""
                if (body.length > 512) return body
                lastErr = "empty body"
                continue
            }
            lastErr = "http " + r.status
            if (r.status === 429 || r.status === 503) {
                this.cooldownUntil = Date.now() + 8000
                continue
            }
            // 其余 4xx 重试没意义
            if (r.status < 500) break
        }
        throw "fetch failed: " + url + " (" + lastErr + ")"
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
            let cover = this.abs(img ? (img.attributes["src"] || "") : "")
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
            return this.fetchPage(url).then((body) => {
                return {comics: this.parseList(body), maxPage: this.maxPageFrom(body, page)}
            })
        }
        return this.fetchAggregate(ids, page)
    }

    // 聚合 tag：每个 id 拉第 1 页取 max + 当前页取内容，合并去重
    fetchAggregate(ids, page) {
        let tasks = ids.map((id) => {
            let p1 = this.fetchPage(this.sectionUrl(id, 1))
            let pn = page === 1 ? p1 : this.fetchPage(this.sectionUrl(id, page))
            return Promise.all([p1, pn]).then(([b1, bn]) => {
                return {max: this.maxPageFrom(b1, 1), comics: this.parseList(bn)}
            }).catch(() => {
                return {max: 1, comics: []}
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

    // ============ 正文图提取（详情封面兜底 + 整包下载共用一份） ============
    // 只认 Photon 图床：源站稳时可转码，源站挂（实测 522）时还有边缘缓存
    photonImages(body) {
        let out = []
        let seen = {}
        let doc = new HtmlDocument(body)
        let container = doc.querySelector("#post-content")
        let els = container ? container.querySelectorAll("img") : []
        for (let i = 0; i < els.length; i++) {
            let el = els[i]
            // 排除 prev/next 导航缩略图（class=post-image）
            let cls = el.attributes["class"] || ""
            if (cls.indexOf("post-image") >= 0) continue
            let raw = el.attributes["src"] || el.attributes["data-src"] || el.attributes["data-original"] || ""
            let src = this.tryAbs(raw)
            if (!src || !/^https?:\/\/i\d+\.wp\.com\//.test(src)) continue
            if (!seen[src]) { seen[src] = true; out.push(src) }
        }
        doc.dispose()
        return out
    }

    // ============ 大厅：一页五块，每块首页 5 套 + 查看更多 ============
    explore = [
        {
            title: "JJCOS",
            type: "multiPartPage",
            load: async (page) => {
                let parts = []
                let params = ["home", "cosplay", "japan", "korea", "r18"]
                for (let i = 0; i < params.length; i++) {
                    let param = params[i]
                    let sec = this.SECTION_LIST[param]
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
                        cover: this.abs(p.feature),
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
            return this.fetchPage(url).then((body) => {
                let title = ""
                let tm = body.match(/<meta property="og:title" content="([^"]*)"/)
                if (tm) title = this.stripSite(tm[1])
                if (!title) {
                    let t = body.match(/<title>([^<]*)<\/title>/)
                    if (t) title = this.stripSite(t[1])
                }
                if (!title) title = id

                // 封面多级兜底。任一级都可能缺失：/post/about/ 这类页面就是完全没 og:image，
                // 早期版本直接返回空串，app 一按下载就抛 relative URL without a base。
                let cover = ""
                let om = body.match(/<meta property="og:image" content="([^"]*)"/)
                if (om && om[1].trim()) cover = om[1].trim()
                if (!cover) {
                    let tw = body.match(/<meta name="twitter:image" content="([^"]*)"/)
                    if (tw && tw[1].trim()) cover = tw[1].trim()
                }
                if (!cover) {
                    let tile = body.match(/<meta name="msapplication-TileImage" content="([^"]*)"/)
                    if (tile && tile[1].trim()) cover = tile[1].trim()
                }
                if (!cover) {
                    // 正文首图：og 缺失时的最后一道真图兜底
                    let first = this.photonImages(body)
                    if (first.length) cover = first[0]
                }

                return {
                    title: title,
                    cover: this.abs(cover, this.SITE_ICON),
                    tags: {},
                    chapters: {"0": "View All Photos"},
                }
            })
        },

        // 整章图片列表 —— app 内置下载就是吃这里的 images
        loadEp: (id, epId) => {
            let url = this.detailUrl(id)
            return this.fetchPage(url).then((body) => {
                let imgs = this.photonImages(body)
                if (!imgs.length) throw "no images"
                return {images: imgs}
            })
        },

        // 图片加载：只对真正的网络地址补规范 + 挂降级链。
        // 本地封面（"cover.webp"）和本地文件（"file:///data/..."）必须原样透传，
        // 不能覆盖 url —— 覆盖会打断 app 对本地封面的识别（详见 tryAbs 上的注释）。
        onImageLoad: (url, comicId, epId) => {
            let u = this.tryAbs(url)
            let cfg = { headers: this.imageHeaders(comicId) }
            if (/^https?:\/\//i.test(u)) {
                cfg.url = u
                cfg.onLoadFailed = () => this.imageFallback(u, comicId)
            }
            return cfg
        },
        onThumbnailLoad: (url) => {
            let u = this.tryAbs(url)
            let cfg = { headers: this.imageHeaders() }
            if (/^https?:\/\//i.test(u)) {
                cfg.url = u
                cfg.onLoadFailed = () => this.imageFallback(u)
            }
            return cfg
        },
    }

    // ============ 死域图床降级 ============
    // 站点用一堆第三方 box 当图床，索引实测约三成帖子的 box 已经彻底死了：
    // 源站 522，Photon 也返回 400（边缘缓存衰减干净了），换分片/加尺寸参数都救不回来。
    // 唯一还有货的是 Wayback：实测一个 40 张的死域帖归档 40/40 全中，直取还是原图。
    // 所以失败就降级：① 原样重试一次（排除偶发抖动）② 转 Wayback 原始文件 ③ 收手。
    imgState = {}

    imageFallback(u, comicId) {
        if (!u) return null
        let st = this.imgState[u] || 0
        if (st >= 2) return null                       // 原图和归档都试过了，别再递归
        this.imgState[u] = st + 1
        let n = 0
        for (let k in this.imgState) n++               // 防无限增长
        if (n > 1000) this.imgState = {}
        // 注意：每一层返回的 config 都必须继续带上 onLoadFailed，否则降级链在第一跳就断了
        let again = () => this.imageFallback(u, comicId)
        if (st === 0) {
            return { url: u, headers: this.imageHeaders(comicId), onLoadFailed: again }
        }
        let m = u.match(/^https?:\/\/i\d+\.wp\.com\/([^/]+)\/(.+)$/)
        if (!m) return null
        return {
            url: "https://web.archive.org/web/2025id_/https://" + m[1] + "/" + m[2],
            headers: this.imageHeaders(comicId),
            onLoadFailed: again,
        }
    }

    // og:title / <title> 去掉站名后缀
    stripSite(s) {
        return String(s || "").replace(/\s*[-|—]\s*JJCOS\s*$/i, "").trim()
    }
}
