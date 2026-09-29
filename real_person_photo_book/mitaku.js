/** @type {import('../../venera-configs/_venera_.js')} */

class Mitaku extends ComicSource {
    name = "Mitaku"
    key = "mitaku"
    version = "1.0.0"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/mitaku.js"

    base = "https://mitaku.net"

    // 封面兜底：og:image 缺失时用站点图标（msapplication-TileImage 是活图）。
    SITE_ICON = "https://mitaku.net/wp-content/uploads/2020/05/cropped-Mitaku-Logo-1-270x270.jpg"

    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

    // 首页 HTML 会话级缓存：探索页两个分区（Home + Trending）都读同一份首页，别打两次。
    homeCache = { html: null, time: 0 }
    homeTtl = 60 * 1000

    init() {
        this.base = String(this.base || "").replace(/\/+$/, "")
    }

    // ==================== 基础工具 ====================

    headers(extra) {
        let h = {
            "User-Agent": this.ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7",
            "Referer": this.base + "/",
        }
        if (extra) {
            for (let k in extra) h[k] = extra[k]
        }
        return h
    }

    /**
     * 只做 trim + 协议补齐。绝不猜相对路径去拼 base —— 本地漫画送进来的
     * `cover.webp` / `file:///...` 必须原样透传。
     */
    abs(u) {
        if (!u) return ""
        let s = String(u).trim()
        if (!s) return ""
        if (s.indexOf("//") === 0) s = "https:" + s
        return s
    }

    /** `https://mitaku.net/ero-cosplay/byoru-nami/` -> `ero-cosplay/byoru-nami` */
    idFromHref(href) {
        let s = String(href || "").trim()
        if (!s) return ""
        s = s.replace(/^https?:\/\/mitaku\.net\//i, "").replace(/\/+$/, "")
        return s
    }

    detailUrl(id) {
        let s = String(id || "").replace(/^\/+|\/+$/g, "")
        return this.base + "/" + s + "/"
    }

    // ==================== 网络 ====================

    fetchText(url) {
        return Network.get(url, this.headers()).then((res) => res.body)
    }

    getHome() {
        let now = Date.now()
        if (this.homeCache.html && now - this.homeCache.time < this.homeTtl) {
            return Promise.resolve(this.homeCache.html)
        }
        return this.fetchText(this.base + "/").then((html) => {
            this.homeCache.html = html
            this.homeCache.time = Date.now()
            return html
        })
    }

    // ==================== 解析 ====================

    /** 列表页卡片（首页 / 分类 / 搜索共用）：#primary 里的 article */
    parsePostList(doc) {
        let comics = []
        let primary = doc.querySelector("#primary")
        if (!primary) return comics
        let articles = primary.querySelectorAll("article.post")
        for (let i = 0; i < articles.length; i++) {
            let art = articles[i]
            let a = art.querySelector("h2.entry-title a")
            if (!a) continue
            let href = this.abs(a.attributes["href"])
            let id = this.idFromHref(href)
            if (!id) continue
            let img = art.querySelector(".featured-image img")
            let cover = img ? this.abs(img.attributes["src"]) : ""
            if (!cover) cover = this.SITE_ICON
            let descP = art.querySelector(".entry-content p")
            let desc = descP ? descP.text.trim() : ""
            // 卡片列表会把 description 里的 `|` 换成换行，这里先替掉免得被打断
            desc = desc.replace(/\|/g, ", ")
            let tags = []
            let catLinks = art.querySelectorAll(".cat-links a")
            for (let j = 0; j < catLinks.length; j++) {
                let t = catLinks[j].text.trim()
                if (t) tags.push(t)
            }
            comics.push(new Comic({
                id: id,
                title: a.text.trim(),
                cover: cover,
                description: desc,
                tags: tags,
            }))
        }
        return comics
    }

    /** 侧栏 Trending Posts widget */
    parseTrending(doc) {
        let comics = []
        let aside = doc.querySelector("aside.wtpsw_post_list_widget")
        if (!aside) return comics
        let items = aside.querySelectorAll("li.wtpsw-post-li")
        for (let i = 0; i < items.length; i++) {
            let li = items[i]
            let a = li.querySelector("a.wtpsw-post-title")
            if (!a) continue
            let href = this.abs(a.attributes["href"])
            let id = this.idFromHref(href)
            if (!id) continue
            let img = li.querySelector(".wtpsw-post-thumb-left img")
            let cover = img ? this.abs(img.attributes["src"]) : ""
            // 缩略图命名是 `xxx-150x75.jpg`，还原成原图
            if (cover) cover = cover.replace(/-\d+x\d+\.(\w+)$/i, ".$1")
            if (!cover) cover = this.SITE_ICON
            comics.push(new Comic({
                id: id,
                title: a.text.trim(),
                cover: cover,
            }))
        }
        return comics
    }

    /** 从 wp-pagenavi 取总页数；拿不到就当前页兜底 */
    maxPage(doc, cur) {
        let last = doc.querySelector(".wp-pagenavi a.last")
        if (last && last.attributes["href"]) {
            let m = String(last.attributes["href"]).match(/\/page\/(\d+)\//)
            if (m) return Math.max(Number(cur) || 1, parseInt(m[1], 10))
        }
        let pages = doc.querySelector(".wp-pagenavi span.pages")
        if (pages) {
            let m = pages.text.match(/of\s+(\d+)/i)
            if (m) return Math.max(Number(cur) || 1, parseInt(m[1], 10))
        }
        return Number(cur) || 1
    }

    // ==================== 探索页（一页两大区） ====================

    explore = [
        {
            title: "Home",
            type: "multiPartPage",

            // 分区一：首页第 1 页内容（9 条），View More 按钮进"全部"分页（剩下 893 页）。
            // 分区二：Trending Posts（侧栏 widget，7 条）。
            load: async () => {
                let html = await this.getHome()
                let doc = new HtmlDocument(html)
                let homeComics = this.parsePostList(doc)
                let trendingComics = this.parseTrending(doc)
                doc.dispose()
                return [
                    {
                        title: "Home",
                        comics: homeComics,
                        viewMore: {
                            page: "category",
                            attributes: {
                                category: "All Posts",
                                param: "all",
                            },
                        },
                    },
                    {
                        title: "Trending Posts",
                        comics: trendingComics,
                        viewMore: null,
                    },
                ]
            },
        },
    ]

    // ==================== 分类页（四个 tag） ====================

    category = {
        title: "Mitaku",
        parts: [
            {
                name: "Mitaku",
                type: "fixed",
                // "All Posts" 是 View More 跳进来的完整分页（首页 894 页）；四个 tag 各自独立
                categories: ["All Posts", "ERO COSPLAY", "SEXY SET", "ONLINE VIDEO", "NUDE"],
                itemType: "category",
                categoryParams: ["all", "ero-cosplay", "sexy-set", "online-video", "nude"],
            },
        ],
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let p = String(param || "all")
            let url
            if (p === "all") {
                url = page <= 1 ? this.base + "/" : this.base + "/page/" + page + "/"
            } else {
                url = page <= 1
                    ? this.base + "/category/" + p + "/"
                    : this.base + "/category/" + p + "/page/" + page + "/"
            }
            let doc = new HtmlDocument(await this.fetchText(url))
            let comics = this.parsePostList(doc)
            let maxPage = this.maxPage(doc, page)
            doc.dispose()
            if (!comics.length) maxPage = 0
            return { comics, maxPage }
        },
    }

    // ==================== 搜索 ====================

    search = {
        load: async (keyword, page) => {
            let kw = encodeURIComponent(String(keyword || ""))
            let url = page <= 1
                ? this.base + "/?s=" + kw
                : this.base + "/page/" + page + "/?s=" + kw
            let doc = new HtmlDocument(await this.fetchText(url))
            let comics = this.parsePostList(doc)
            let maxPage = this.maxPage(doc, page)
            doc.dispose()
            if (!comics.length) maxPage = 0
            return { comics, maxPage }
        },
    }

    // ==================== 详情 / 图集 ====================

    comic = {
        loadInfo: async (comicId) => {
            let url = this.detailUrl(comicId)
            let doc = new HtmlDocument(await this.fetchText(url))
            let article = doc.querySelector("article.post") || doc

            let title = comicId
            let h1 = article.querySelector("h1.entry-title")
            if (h1) title = h1.text.trim()
            if (!title) title = comicId

            // 封面多级兜底
            let cover = ""
            let og = doc.querySelector('meta[property="og:image"]')
            if (og) cover = this.abs(og.attributes["content"])
            if (!cover) {
                let tw = doc.querySelector('meta[name="twitter:image"]')
                if (tw) cover = this.abs(tw.attributes["content"])
            }
            if (!cover) {
                let tile = doc.querySelector('meta[name="msapplication-TileImage"]')
                if (tile) cover = this.abs(tile.attributes["content"])
            }
            if (!cover) cover = this.SITE_ICON

            // 图包介绍：entry-content 里所有 <p> 文本（Cosplayer/Character/Content/File Size...）
            let descLines = []
            let content = article.querySelector(".entry-content")
            if (content) {
                let ps = content.querySelectorAll("p")
                for (let i = 0; i < ps.length; i++) {
                    let t = ps[i].text.trim()
                    if (!t) continue
                    if (/^( |\s)+$/.test(t)) continue
                    descLines.push(t.replace(/\|/g, ", "))
                }
            }

            // 下载链接分类：视频 / 图包（文本含 video 的算视频，其余算图包）
            let pics = []
            let videos = []
            if (content) {
                let dl = content.querySelectorAll('a[href*="ouo.io"]')
                for (let i = 0; i < dl.length; i++) {
                    let u = this.abs(dl[i].attributes["href"])
                    if (!u) continue
                    if (/video/i.test(dl[i].text)) videos.push(u)
                    else pics.push(u)
                }
            }
            let tags = {}
            if (pics.length) tags["Pics Download"] = pics
            if (videos.length) tags["Video Download"] = videos

            doc.dispose()
            return new ComicDetails({
                title: title,
                cover: cover,
                description: descLines.join("\n"),
                tags: tags,
                chapters: { "0": "View All Photos" },
                url: url,
                uploader: "Mitaku",
            })
        },

        loadEp: async (comicId, epId) => {
            let url = this.detailUrl(comicId)
            let doc = new HtmlDocument(await this.fetchText(url))
            let article = doc.querySelector("article.post") || doc
            let content = article.querySelector(".entry-content") || article

            // 图集全在 slider 的 data-mfp-src（DOM 一次给全，lazy 只是原生懒加载）
            let images = []
            let seen = {}
            let links = content.querySelectorAll("a.msacwl-img-link")
            for (let i = 0; i < links.length; i++) {
                let src = this.abs(links[i].attributes["data-mfp-src"])
                if (src && !seen[src]) { seen[src] = 1; images.push(src) }
            }
            if (!images.length) {
                // 老帖子可能只有 img[data-lazy]
                let imgs = content.querySelectorAll("img.msacwl-img")
                for (let i = 0; i < imgs.length; i++) {
                    let src = this.abs(imgs[i].attributes["data-lazy"])
                    if (src && !seen[src]) { seen[src] = 1; images.push(src) }
                }
            }
            if (!images.length) {
                // 最后兜底：正文里任何非占位图
                let imgs = content.querySelectorAll("img[src*='/uploads/']")
                for (let i = 0; i < imgs.length; i++) {
                    let src = this.abs(imgs[i].attributes["src"])
                    if (src && !seen[src]) { seen[src] = 1; images.push(src) }
                }
            }
            doc.dispose()
            if (!images.length) throw "未解析到图片"
            return { images }
        },

        /**
         * 标签芯片点击：tag 值本身是下载 URL（图包 / 视频），直接开浏览器，
         * 返回 null 不劫持其它行为。
         */
        onClickTag: (namespace, tag) => {
            try {
                let s = String(tag || "").trim()
                if (/^https?:\/\//i.test(s)) UI.launchUrl(s)
            } catch (e) {
                // 老版本 app 拿不到 UI，静默跳过
            }
            return null
        },

        idMatch: "mitaku\\.net/([^/?#]+/[^/?#]+)",
    }
}
