/** @type {import('../../venera-configs/_venera_.js')} */

class EveriaClub extends ComicSource {
    name = "Everia Club"
    key = "everiaclub"
    version = "1.0.2"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/everiaclub.js"

    base = "https://everia.club"

    // 站点图标（192x192 WebP，200）。封面任何时候都不允许返回空串 ——
    // 空串会让 app 抛 "relative URL without a base"。
    SITE_ICON = "https://everia.club/wp-content/uploads/2026/05/cropped-everiaicon-192x192.webp"

    // 详情页缓存：loadInfo 和 loadEp 解析的是同一张详情页，只打一次请求。
    detailCache = {}
    // 同一篇详情的并发请求合并（loadInfo / loadEp 同时触发时不重复翻页）。
    detailLoading = {}
    // 长图集分页上限（wp_link_pages 每页 15~16 张），防止异常页面无限翻页。
    MAX_DETAIL_PAGES = 60

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
     * 这里最多试 3 次、每次间隔 500ms，兜住瞬时 reset；全失败才抛给 app。
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
     * 比从窗口页码反推可靠得多。拿不到才退回请求页码。
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

        return new Comic({
            id: id,
            title: title || id,
            cover: this.abs(cover) || this.SITE_ICON,
        })
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

    /**
     * @param path {string} ""（首页）或 "japan-gallery" 这类分类路径
     */
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

    /**
     * OceanWP 搜索模板：`<article id="post-123">`，
     * 封面 `img.wp-post-image`，标题 `h2.search-entry-title a`。
     */
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

        return new Comic({
            id: id,
            title: title || id,
            cover: this.abs(cover) || this.SITE_ICON,
        })
    }

    /** 页码链接的最大值 + 当前页（末页的当前页是 span，不在链接里）。 */
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
        // 必须走路径式搜索：站点前面的 Cloudflare/LiteSpeed 会掐断带 `?` 的搜索请求
        // （app 里表现为 RhttpUnknownException / UnexpectedEof）。
        // `/search/{kw}/` 与 `/search/{kw}/page/N/` 是 WordPress 的规范路径，实测稳定。
        let url = this.base + "/search/" + kw + "/" + (p > 1 ? "page/" + p + "/" : "")
        let html = await this.fetchPage(url)
        return this.parseSearch(html, p)
    }

    // ==================== 详情 ====================

    /**
     * 正文图只认 `figure.wp-block-image`。
     * 这个主题的 HTML 偶尔会被上游广告脚本破坏嵌套（`.entry-content` 在
     * csslib 里匹配不到），figure 是稳定的，而且天然排除侧栏推荐缩略图。
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
     * WordPress `wp_link_pages` 的分页条：
     *   <div class="page-links">Pages: <span class="current">1</span>
     *     <a class="post-page-numbers" href=".../2/">2</a> ...</div>
     * 返回按页码升序的 [{n, url}]。长图集每页 15~16 张。
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

    parsePageData(html) {
        let doc = new HtmlDocument(html)
        let images = this.extractImages(doc)
        let links = this.extractPageLinks(doc)
        doc.dispose()
        return { images: images, links: links }
    }

    parseDetail(html, id) {
        let doc = new HtmlDocument(html)

        let title = ""
        let h2 = doc.querySelector("h2.single-post-title")
        if (h2) title = this.cleanText(h2.text)
        if (!title) {
            let h1 = doc.querySelector("h1.entry-title")
            if (h1) title = this.cleanText(h1.text)
        }

        // 封面：og:image 就是站点自己挑的 400x600 缩略封面，跟列表里那张一致。
        let cover = ""
        let og = doc.querySelector('meta[property="og:image"]')
        if (og) cover = og.attributes["content"] || ""

        let images = this.extractImages(doc)
        let pageLinks = this.extractPageLinks(doc)

        // 标签
        let tagList = []
        let tagNodes = doc.querySelectorAll(".post-tags a[rel=tag]")
        for (let i = 0; i < tagNodes.length; i++) {
            let t = this.cleanText(tagNodes[i].text)
            if (t && tagList.indexOf(t) < 0) tagList.push(t)
        }

        // 侧栏 Popular Posts 当推荐位（8 条）
        let recommend = []
        let recNodes = doc.querySelectorAll(".wli_popular_posts-listing li")
        for (let i = 0; i < recNodes.length; i++) {
            let link = recNodes[i].querySelector("a[href]")
            if (!link) continue
            let rid = this.idFromHref(link.attributes["href"])
            if (!rid || rid === id) continue
            let img = recNodes[i].querySelector("img")
            let rc = img ? (img.attributes["src"] || "") : ""
            if (rc.indexOf("data:image") === 0) rc = ""
            let rt = this.cleanText(link.text)
            if (!rt && img) rt = this.cleanText(img.attributes["title"] || img.attributes["alt"] || "")
            recommend.push(new Comic({
                id: rid,
                title: rt || rid,
                cover: this.abs(rc) || this.SITE_ICON,
            }))
        }

        doc.dispose()

        let tags = {}
        if (tagList.length) tags["Tags"] = tagList

        if (!cover && images.length) cover = images[0]
        if (!cover) cover = this.SITE_ICON

        return {
            title: title,
            cover: cover,
            images: images,
            tags: tags,
            recommend: recommend,
            pageLinks: pageLinks,
            pages: 1,
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
        let firstUrl = this.detailUrl(key)
        let info = this.parseDetail(await this.fetchPage(firstUrl), key)

        // 多页图集：第一页的 page-links 给出 2..N，逐页抓完再合并。
        // 不翻页的话阅读器永远只能拿到第一页（15~16 张）。
        let seen = {}
        seen[firstUrl] = true
        let queue = info.pageLinks.slice()
        let fetched = 1
        let maxPage = 1

        while (queue.length && fetched < this.MAX_DETAIL_PAGES) {
            queue.sort((a, b) => a.n - b.n)
            let item = queue.shift()
            if (!item || !item.url || seen[item.url]) continue
            seen[item.url] = true

            let data = this.parsePageData(await this.fetchPage(item.url))
            for (let i = 0; i < data.images.length; i++) {
                if (info.images.indexOf(data.images[i]) < 0) info.images.push(data.images[i])
            }
            // 分页条若只显示窗口页码，后续页里可能出现更靠后的链接。
            for (let i = 0; i < data.links.length; i++) {
                if (!seen[data.links[i].url]) queue.push(data.links[i])
            }

            fetched++
            if (item.n > maxPage) maxPage = item.n
            // 站点对连续请求敏感，页间留 300ms，避免被 reset。
            await new Promise((resolve) => setTimeout(resolve, 300))
        }

        info.pages = Math.max(fetched, maxPage)
        info.count = info.images.length
        return info
    }

    // ==================== 探索页 ====================

    // 按网站首页放：就是首页最新图包的分页列表。
    explore = [
        {
            title: "Everia Club",
            type: "multiPageComicList",
            load: (page) => this.fetchGrid("", page),
        },
    ]

    // ==================== 分类页 ====================

    // 按原站五个入口：JAPAN / KOREA / CHINA / COSPLAY / THAILAND。
    // 除 COSPLAY 外全部显示中文。
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
            let info = await this.getDetail(id)
            return new ComicDetails({
                title: info.title || this.normId(id),
                cover: info.cover || this.SITE_ICON,
                tags: info.tags,
                chapters: {
                    "0": info.count > 0
                        ? (info.pages > 1 ? info.pages + " 页 · " + info.count + " 张图片" : info.count + " 张图片")
                        : "全部图片",
                },
                url: this.detailUrl(id),
                recommend: info.recommend,
            })
        },

        // 图包站无章节，详情页一次把整套图给全。
        loadEp: async (comicId, epId) => {
            let info = await this.getDetail(comicId)
            if (!info.images.length) throw "没有解析到图片"
            return { images: info.images }
        },

        // 图片图床无防盗链（带/不带 Referer 字节一致），刻意不实现
        // onImageLoad / onThumbnailLoad —— 挂自定义头只会顶掉 app 默认 UA。

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
