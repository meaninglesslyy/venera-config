/** @type {import('../../venera-configs/_venera_.js')} */

class EveriaClub extends ComicSource {
    name = "Everia Club"
    key = "everiaclub"
    version = "1.1.0"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/everiaclub.js"

    base = "https://everia.club"

    // 站点图标（192x192 WebP，200）。封面任何时候都不允许返回空串 ——
    // 空串会让 app 抛 "relative URL without a base"。
    SITE_ICON = "https://everia.club/wp-content/uploads/2026/05/cropped-everiaicon-192x192.webp"

    // 列表/搜索卡片缓存：详情页直接用这里已有的 title/cover 秒开，不再请求 HTML。
    cardCache = {}
    // 详情页缓存：第 1 页先入，后台预取再把 2..N 页的图片 URL 补进来。
    detailCache = {}
    // 同一篇详情的 loadInfo 并发合并。
    detailLoading = {}
    // 同一篇详情的 loadEp 并发合并，避免重复翻页。
    epLoading = {}
    // 长图集分页上限（每页 15~16 张），防止异常页面无限翻页。
    MAX_DETAIL_PAGES = 60
    // 后续页并发数。站点对连续请求敏感，2 路比一次全并发稳。
    PAGE_CONCURRENCY = 2

    headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7,ko;q=0.6",
            "Referer": this.base + "/",
        }
    }

    /**
     * 站点（Cloudflare + LiteSpeed）会偶发直接掐断连接，报
     * `UnexpectedEof / peer closed connection without sending TLS close_notify`。
     * 最多试 3 次、每次间隔 500ms；全失败才抛给 app。
     */
    async fetchPage(url) {
        let last = null
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                let res = await Network.get(url, this.headers())
                if (res.status === 200) return res.body
                last = `Invalid status code: ${res.status} (${url})`
            } catch (e) {
                last = e
            }
            if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500))
        }
        throw last
    }

    // ==================== 工具 ====================

    abs(u) {
        let s = String(u == null ? "" : u).trim()
        if (!s) return ""
        if (s.indexOf("//") === 0) return "https:" + s
        // 站点部分缩略图吐的是 http://，统一升到 https，避免 Android 明文流量被拦。
        if (/^http:\/\//i.test(s)) return "https://" + s.slice(7)
        if (/^https:\/\//i.test(s)) return s
        if (s.charAt(0) === "/") return this.base + s
        return this.base + "/" + s
    }

    decodeEntities(s) {
        let t = String(s == null ? "" : s)
        t = t.replace(/&#x([0-9a-fA-F]+);/g, (m, h) => {
            let n = parseInt(h, 16)
            return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m
        })
        t = t.replace(/&#(\d+);/g, (m, d) => {
            let n = parseInt(d, 10)
            return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m
        })
        let named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " }
        return t.replace(/&([a-zA-Z]+);/g, (m, n) => (named[n] !== undefined ? named[n] : m))
    }

    cleanText(s) {
        return this.decodeEntities(s).replace(/[\s　]+/g, " ").trim()
    }

    /** 从任意帖子链接里取站内路径，作为 id（保留百分号编码，避免二次编码）。 */
    idFromHref(href) {
        let s = String(href == null ? "" : href).trim()
        if (!s) return ""
        s = s.replace(/[?#].*$/, "")
        let m = s.match(/^https?:\/\/[^/]+\/(.+)$/i)
        if (m) s = m[1]
        s = s.replace(/^\/+/, "").replace(/\/+$/, "")
        return s
    }

    normId(id) {
        return this.idFromHref(id)
    }

    detailUrl(id) {
        return this.base + "/" + this.normId(id) + "/"
    }

    // ==================== 首页 / 分类列表 ====================

    /**
     * The Post Grid 把总页数直接渲染在分页容器上：
     *   <div class="rt-pagination-wrap" data-total-pages="508" ...>
     */
    parseTotalPages(doc, page) {
        let wrap = doc.querySelector(".rt-pagination-wrap") || doc.querySelector("[data-total-pages]")
        if (wrap) {
            let n = parseInt(wrap.attributes["data-total-pages"], 10)
            if (!isNaN(n) && n > 0) return n
        }
        return page || 1
    }

    parseGridCard(el) {
        let link = el.querySelector("h3.entry-title a[href]") || el.querySelector("a.tpg-post-link[href]")
        if (!link) return null
        let id = this.idFromHref(link.attributes["href"])
        if (!id) return null

        let img = el.querySelector("img")
        let cover = ""
        if (img) {
            cover = img.attributes["src"] || img.attributes["data-src"] || img.attributes["data-original"] || ""
        }
        if (cover.indexOf("/static/") === 0 || cover.indexOf("data:image") === 0) cover = ""

        let title = this.cleanText(link.text)
        if (!title && img) title = this.cleanText(img.attributes["alt"] || img.attributes["title"] || "")

        let comic = new Comic({
            id: id,
            title: title || id,
            cover: this.abs(cover) || this.SITE_ICON,
        })
        // 详情页秒开：列表里已经有 title/cover，点进去就不再等 HTML。
        if (!this.cardCache[id]) {
            this.cardCache[id] = { title: comic.title, cover: comic.cover }
        }
        return comic
    }

    parseGrid(html, page) {
        let doc = new HtmlDocument(html)
        let comics = []
        let nodes = doc.querySelectorAll("div.rt-holder.tpg-post-holder")
        for (let i = 0; i < nodes.length; i++) {
            let c = this.parseGridCard(nodes[i])
            if (c) comics.push(c)
        }
        let maxPage = this.parseTotalPages(doc, page)
        doc.dispose()
        return { comics: comics, maxPage: maxPage }
    }

    async fetchGrid(path, page) {
        let p = page || 1
        let rel = String(path == null ? "" : path).trim().replace(/^\/+|\/+$/g, "")
        let url
        if (!rel) {
            url = p > 1 ? this.base + "/page/" + p + "/" : this.base + "/"
        } else {
            url = this.base + "/" + rel + "/" + (p > 1 ? "page/" + p + "/" : "")
        }
        let html = await this.fetchPage(url)
        return this.parseGrid(html, p)
    }

    // ==================== 搜索 ====================

    parseSearchCard(el) {
        let link = el.querySelector("h2.search-entry-title a[href]") || el.querySelector("h3 a[href]") || el.querySelector("a[href]")
        if (!link) return null
        let id = this.idFromHref(link.attributes["href"])
        if (!id) return null

        let img = el.querySelector("img.wp-post-image") || el.querySelector("img")
        let cover = ""
        if (img) cover = img.attributes["src"] || img.attributes["data-src"] || ""
        if (cover.indexOf("data:image") === 0) cover = ""

        let title = this.cleanText(link.text)
        if (!title && img) title = this.cleanText(img.attributes["alt"] || img.attributes["title"] || "")

        let comic = new Comic({
            id: id,
            title: title || id,
            cover: this.abs(cover) || this.SITE_ICON,
        })
        if (!this.cardCache[id]) {
            this.cardCache[id] = { title: comic.title, cover: comic.cover }
        }
        return comic
    }

    parseSearchMaxPage(doc, page) {
        let box = doc.querySelector(".oceanwp-pagination")
        if (!box) return page || 1
        let max = 0
        let links = box.querySelectorAll("a")
        for (let i = 0; i < links.length; i++) {
            let href = links[i].attributes["href"] || ""
            let m = href.match(/\/page\/(\d+)\//)
            if (m) {
                let n = parseInt(m[1], 10)
                if (n > max) max = n
            }
        }
        let cur = box.querySelector("span.page-numbers.current")
        if (cur) {
            let n = parseInt(this.cleanText(cur.text), 10)
            if (!isNaN(n) && n > max) max = n
        }
        return max > 0 ? max : (page || 1)
    }

    parseSearch(html, page) {
        let doc = new HtmlDocument(html)
        let comics = []
        let nodes = doc.querySelectorAll("article")
        for (let i = 0; i < nodes.length; i++) {
            let pid = nodes[i].attributes["id"] || ""
            if (!/^post-\d+$/.test(pid)) continue
            let c = this.parseSearchCard(nodes[i])
            if (c) comics.push(c)
        }
        let maxPage = this.parseSearchMaxPage(doc, page)
        doc.dispose()
        return { comics: comics, maxPage: maxPage }
    }

    async searchComics(keyword, page) {
        let p = page || 1
        let raw = String(keyword == null ? "" : keyword).trim()
        if (!raw) return { comics: [], maxPage: 0 }
        let kw = encodeURIComponent(raw)
        // 必须走路径式搜索：带 `?s=` 会被 Cloudflare/LiteSpeed 掐断。
        let url = this.base + "/search/" + kw + "/" + (p > 1 ? "page/" + p + "/" : "")
        let html = await this.fetchPage(url)
        return this.parseSearch(html, p)
    }

    // ==================== 详情 ====================

    /**
     * 正文图只认 `figure.wp-block-image`，天然排除侧栏推荐缩略图；
     * `.entry-content` 在部分破损 HTML 里匹配不到，只作兜底。
     */
    extractImages(doc) {
        let out = []
        let imgs = doc.querySelectorAll("figure.wp-block-image img")
        if (!imgs.length) imgs = doc.querySelectorAll(".entry-content img")
        if (!imgs.length) imgs = doc.querySelectorAll("img")
        for (let i = 0; i < imgs.length; i++) {
            let src = imgs[i].attributes["src"] || imgs[i].attributes["data-src"] || ""
            if (!src) continue
            if (src.indexOf("/static/") === 0 || src.indexOf("data:image") === 0) continue
            let u = this.abs(src)
            if (u && out.indexOf(u) < 0) out.push(u)
        }
        return out
    }

    /**
     * WordPress `wp_link_pages` 的分页条，返回按页码升序的 [{n, url}]。
     */
    extractPageLinks(doc) {
        let box = doc.querySelector(".page-links")
        if (!box) return []
        let out = []
        let seen = {}
        let links = box.querySelectorAll("a[href]")
        for (let i = 0; i < links.length; i++) {
            let url = this.abs(links[i].attributes["href"] || "")
            if (!url || seen[url]) continue
            let m = url.match(/\/(\d+)\/?$/) || url.match(/[?&]page=(\d+)/)
            if (!m) continue
            let n = parseInt(m[1], 10)
            if (!n) continue
            seen[url] = true
            out.push({ n: n, url: url })
        }
        out.sort((a, b) => a.n - b.n)
        return out
    }

    parsePageImages(html) {
        let doc = new HtmlDocument(html)
        let images = this.extractImages(doc)
        doc.dispose()
        return images
    }

    /**
     * loadInfo 只解析第 1 页：
     * title / cover / tags / 第 1 页图片 / 分页链接。
     * 后续页留到 loadEp。
     */
    parseDetail(html, id) {
        let doc = new HtmlDocument(html)

        let title = ""
        let h2 = doc.querySelector("h2.single-post-title")
        if (h2) title = this.cleanText(h2.text)
        if (!title) {
            let h1 = doc.querySelector("h1.entry-title")
            if (h1) title = this.cleanText(h1.text)
        }

        let cover = ""
        let og = doc.querySelector('meta[property="og:image"]')
        if (og) cover = og.attributes["content"] || ""

        let images = this.extractImages(doc)
        let pageLinks = this.extractPageLinks(doc)

        let tagList = []
        let tagNodes = doc.querySelectorAll(".post-tags a[rel=tag]")
        for (let i = 0; i < tagNodes.length; i++) {
            let t = this.cleanText(tagNodes[i].text)
            if (t && tagList.indexOf(t) < 0) tagList.push(t)
        }

        doc.dispose()

        let tags = {}
        if (tagList.length) tags["Tags"] = tagList

        if (!cover && images.length) cover = images[0]
        if (!cover) cover = this.SITE_ICON

        let pages = 1
        for (let i = 0; i < pageLinks.length; i++) {
            if (pageLinks[i].n > pages) pages = pageLinks[i].n
        }

        return {
            title: title,
            cover: cover,
            images: images,
            tags: tags,
            pageLinks: pageLinks,
            pages: pages,
            loadedAll: pageLinks.length === 0,
            count: images.length,
        }
    }

    async getDetail(id) {
        let key = this.normId(id)
        let cached = this.detailCache[key]
        if (cached) return cached
        let pending = this.detailLoading[key]
        if (pending) return await pending

        let task = this.loadDetail(key)
        this.detailLoading[key] = task
        try {
            let info = await task
            this.detailCache[key] = info
            return info
        } finally {
            delete this.detailLoading[key]
        }
    }

    async loadDetail(key) {
        // 只抓第 1 页，详情页立刻返回。
        let info = this.parseDetail(await this.fetchPage(this.detailUrl(key)), key)
        return info
    }

    /**
     * 并发池：按原顺序返回每一页的图片数组。
     * 任何一页在 3 次重试后仍失败，整体抛错，不静默丢页。
     */
    async fetchPageBatch(items) {
        let results = new Array(items.length)
        let next = 0
        let self = this
        async function worker() {
            while (next < items.length) {
                let i = next++
                results[i] = self.parsePageImages(await self.fetchPage(items[i].url))
            }
        }
        let workers = []
        let n = Math.min(this.PAGE_CONCURRENCY, items.length)
        for (let i = 0; i < n; i++) workers.push(worker())
        await Promise.all(workers)
        return results
    }

    /**
     * 后台预取整章：第 1 页 + 2..N 页的 HTML，只拿图片 URL，不下载图片。
     * 详情页 loadInfo 不 await 它；loadEp 进来时共享同一个 in-flight promise。
     */
    prefetchChapter(key) {
        let pending = this.epLoading[key]
        if (pending) return pending

        let task = (async () => {
            let info = await this.getDetail(key)
            if (!info.loadedAll) await this.loadAllPages(info)
        })()
        this.epLoading[key] = task
        let cleanup = () => {
            if (this.epLoading[key] === task) delete this.epLoading[key]
        }
        task.then(cleanup, cleanup)
        return task
    }

    /** loadEp 时补齐 2..N 页，按 URL 去重合并。 */
    async loadAllPages(info) {
        let queue = info.pageLinks.slice(0, this.MAX_DETAIL_PAGES - 1)
        if (!queue.length) {
            info.loadedAll = true
            return
        }
        let results = await this.fetchPageBatch(queue)
        for (let i = 0; i < results.length; i++) {
            let images = results[i] || []
            for (let j = 0; j < images.length; j++) {
                if (info.images.indexOf(images[j]) < 0) info.images.push(images[j])
            }
        }
        info.loadedAll = true
        info.count = info.images.length
    }

    // ==================== 探索页 ====================

    explore = [
        {
            title: "Everia Club",
            type: "multiPageComicList",
            load: (page) => this.fetchGrid("", page),
        },
    ]

    // ==================== 分类页 ====================

    category = {
        title: "Everia Club",
        parts: [
            {
                name: "分类",
                type: "fixed",
                categories: [
                    {
                        label: "日本",
                        target: { page: "category", attributes: { category: "日本", param: "japan-gallery" } },
                    },
                    {
                        label: "韩国",
                        target: { page: "category", attributes: { category: "韩国", param: "korea-gallery" } },
                    },
                    {
                        label: "中国",
                        target: { page: "category", attributes: { category: "中国", param: "china-gallery" } },
                    },
                    {
                        label: "COSPLAY",
                        target: { page: "category", attributes: { category: "COSPLAY", param: "cosplay-gallery" } },
                    },
                    {
                        label: "泰国",
                        target: { page: "category", attributes: { category: "泰国", param: "thailand-gallery" } },
                    },
                ],
            },
        ],
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            return this.fetchGrid(param || "japan-gallery", page)
        },
    }

    // ==================== 搜索模块 ====================

    search = {
        load: async (keyword, options, page) => {
            return this.searchComics(keyword, page)
        },
        enableTagsSuggestions: false,
    }

    // ==================== 详情 / 阅读 ====================

    comic = {
        loadInfo: async (id) => {
            let key = this.normId(id)

            // 秒开路径：列表/搜索已经拿到 title + cover，详情页不再请求 HTML。
            // 代价是详情页不再显示那一页的 tags（进入阅读器时会补齐全部图片）。
            let card = this.cardCache[key]
            if (card) {
                // 后台预取整章（页面 HTML + 图片 URL），不阻塞详情页。
                // 只预取地址，不下载图片本体；loadEp 进来时直接复用这次结果。
                this.prefetchChapter(key).catch(() => {})
                return new ComicDetails({
                    title: card.title || key,
                    cover: card.cover || this.SITE_ICON,
                    tags: {},
                    chapters: { "0": "点击加载全部" },
                    url: this.detailUrl(key),
                })
            }

            // 兜底：从外部链接/粘贴进来看的条目没有卡片缓存，仍然抓第 1 页。
            let info = await this.getDetail(key)
            let chapter
            if (!info.loadedAll) {
                chapter = info.pages + " 页图集 · 点击加载全部"
            } else if (info.count > 0) {
                chapter = info.count + " 张图片"
            } else {
                chapter = "全部图片"
            }
            return new ComicDetails({
                title: info.title || key,
                cover: info.cover || this.SITE_ICON,
                tags: info.tags,
                chapters: { "0": chapter },
                url: this.detailUrl(key),
            })
        },

        // 进阅读器时优先复用后台预取；预取没跑完就等它，失败则重试一次。
        loadEp: async (comicId, epId) => {
            let key = this.normId(comicId)
            let info = await this.getDetail(comicId)

            if (!info.loadedAll) {
                let pending = this.epLoading[key]
                if (pending) {
                    // 后台预取还在跑就等它；预取失败则吞掉，下面重试一次。
                    try { await pending } catch (e) { }
                }
                if (!info.loadedAll) {
                    let retry = this.loadAllPages(info)
                    this.epLoading[key] = retry
                    let cleanup = () => {
                        if (this.epLoading[key] === retry) delete this.epLoading[key]
                    }
                    retry.then(cleanup, cleanup)
                    await retry
                }
            }

            if (!info.images.length) throw "没有解析到图片"
            return { images: info.images }
        },

        // 图片图床无防盗链，刻意不实现 onImageLoad / onThumbnailLoad。

        onClickTag: (namespace, tag) => {
            let t = String(tag == null ? "" : tag).trim()
            if (!t) return null
            if (/^https?:\/\//i.test(t)) {
                try { UI.launchUrl(t) } catch (e) { }
                return null
            }
            return { page: "search", attributes: { text: t } }
        },

        idMatch: "everia\\.club/([^?#]+)",

        link: {
            domains: ["everia.club", "www.everia.club"],
            linkToId: (url) => {
                let id = this.idFromHref(url)
                return id ? id : null
            },
        },
    }

    translation = {
        "zh_CN": {
            "Everia Club": "Everia Club",
            "Tags": "标签",
        },
        "zh_TW": {},
        "en": {},
    }
}
