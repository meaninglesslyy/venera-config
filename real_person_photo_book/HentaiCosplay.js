/** @type {import('../../venera-configs/_venera_.js')} */

class HentaiCosplay extends ComicSource {
    name = "Hentai Cosplay"
    key = "hentaicosplay"
    version = "1.1.2"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/hentaiCosplay.js"
    base = "https://hentai-cosplay-xxx.com"

    // 预拉取标签列表并缓存，供分类页同步 loader 使用
    init() {
        this.refreshTags()
    }

    async refreshTags() {
        try {
            var res = await Network.get(this.base + "/ranking-tag/", this.pageHeaders())
            if (res.status !== 200) return
            var tags = []
            var doc = new HtmlDocument(res.body)
            var as = doc.querySelectorAll("#tags li a")
            for (var i = 0; i < as.length; i++) {
                var href = as[i].attributes.href || ""
                var m = href.match(/\/search\/tag\/([^/]+)\//)
                if (!m) continue
                var slug = m[1]
                var name = (as[i].text || "").replace(/\s*\(\d+\)\s*$/, "").trim()
                if (!name) name = slug
                tags.push({name: name, slug: slug})
            }
            doc.dispose()
            if (tags.length) this.saveData('tags', tags)
        } catch (e) {}
    }

    // 缓存没拉到时用的兜底热门标签
    fallbackTags() {
        return [
            {name: "Cosplay", slug: "cosplay"},
            {name: "Loli", slug: "loli"},
            {name: "Twitter", slug: "twitter"},
            {name: "Big Breasts", slug: "big-breasts"},
            {name: "Sex", slug: "sex"},
            {name: "Crossdressing", slug: "crossdressing"},
            {name: "Sex Toys", slug: "sex-toys"},
            {name: "Anal", slug: "anal"},
            {name: "Stockings", slug: "stockings"},
            {name: "Masturbation", slug: "masturbation"},
            {name: "Big Ass", slug: "big-ass"},
            {name: "Korean", slug: "korean"},
            {name: "Genshin Impact", slug: "genshin-impact"},
            {name: "Bikini", slug: "bikini"},
            {name: "Onlyfans", slug: "onlyfans"},
            {name: "Blowjob", slug: "blowjob"},
            {name: "Machi Maji", slug: "machi-maji"},
            {name: "Small Breasts", slug: "small-breasts"},
        ]
    }

    pageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": this.base + "/",
        }
    }

    // 封面缩略图统一转成 p=700（列表里是 p=160x200，太小）
    coverSize(url) {
        if (!url) return ""
        if (url.indexOf("/p=700/") >= 0) return url
        return url.replace(/\/p=\d+(?:x\d+)?\//, "/p=700/")
    }

    // 解析列表页（.image-list-item 块）
    parseList(html) {
        var c = []
        var doc = new HtmlDocument(html)
        var items = doc.querySelectorAll(".image-list-item")
        for (var i = 0; i < items.length; i++) {
            var it = items[i]
            var a = it.querySelector(".image-list-item-image a")
            if (!a) continue
            var href = a.attributes.href || ""
            if (href.indexOf("/image/") !== 0) continue
            var slug = href.replace(/^\/image\//, "").replace(/\/$/, "")
            var img = it.querySelector(".image-list-item-image img")
            var cover = img ? (img.attributes.src || "") : ""
            var titleEl = it.querySelector(".image-list-item-title a")
            var title = titleEl ? (titleEl.text || "").trim() : ""
            var dateEl = it.querySelector(".image-list-item-regist-date span")
            var date = dateEl ? (dateEl.text || "").trim() : ""
            if (slug && title) {
                c.push(new Comic({
                    id: slug,
                    title: title,
                    subTitle: date,
                    cover: this.coverSize(cover),
                }))
            }
        }
        doc.dispose()
        return c
    }

    // 从分页链接 /page/N/ 里取最大页数
    maxPageFrom(html, fallback) {
        var re = /\/page\/(\d+)\//g
        var m, max = 0
        while ((m = re.exec(html)) !== null) {
            var n = parseInt(m[1])
            if (n > max) max = n
        }
        return max > 0 ? max : (fallback || 1)
    }

    // ============ 大厅 ============
    explore = [
        {
            title: "Hentai Cosplay-最近更新",
            type: "multiPageComicList",
            load: (p) => {
                var url = this.base + "/recently/" + (p > 1 ? "page/" + p + "/" : "")
                return Network.get(url, this.pageHeaders()).then((r) => {
                    if (r.status !== 200) throw "err"
                    return {comics: this.parseList(r.body), maxPage: this.maxPageFrom(r.body, p)}
                })
            },
        },
        {
            title: "Hentai Cosplay-热门排行",
            type: "multiPageComicList",
            load: (p) => {
                var url = this.base + "/ranking/" + (p > 1 ? "page/" + p + "/" : "")
                return Network.get(url, this.pageHeaders()).then((r) => {
                    if (r.status !== 200) throw "err"
                    return {comics: this.parseList(r.body), maxPage: this.maxPageFrom(r.body, p)}
                })
            },
        },
    ]

    // ============ 搜索 ============
    search = {
        load: (k, o, p) => {
            var kw = encodeURIComponent(k).replace(/%20/g, "+")
            var url = this.base + "/search/keyword/" + kw + "/" + (p > 1 ? "page/" + p + "/" : "")
            return Network.get(url, this.pageHeaders()).then((r) => {
                if (r.status !== 200) throw "err"
                return {comics: this.parseList(r.body), maxPage: this.maxPageFrom(r.body, p)}
            })
        },
        optionList: [],
    }

    // ============ 分类（标签） ============
    category = {
        title: "Hentai Cosplay",
        parts: [
            {
                name: "全部标签",
                type: "dynamic",
                loader: () => {
                    var tags = this.loadData('tags')
                    if (!Array.isArray(tags) || !tags.length) {
                        tags = this.fallbackTags()
                        this.refreshTags()
                    }
                    return tags.map((t) => ({
                        label: t.name,
                        target: { page: "category", attributes: { category: t.name, param: t.slug } },
                    }))
                },
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: (category, param, options, page) => {
            var url = this.base + "/search/tag/" + param + "/" + (page > 1 ? "page/" + page + "/" : "")
            return Network.get(url, this.pageHeaders()).then((r) => {
                if (r.status !== 200) throw "err"
                return {comics: this.parseList(r.body), maxPage: this.maxPageFrom(r.body, page)}
            })
        },
    }

    // ============ 详情 / 图片 ============
    comic = {
        loadInfo: (id) => {
            var url = this.base + "/image/" + id + "/"
            return Network.get(url, this.pageHeaders()).then((r) => {
                if (r.status !== 200) throw "err"
                var title = ""
                var tm = r.body.match(/<meta property="og:title" content="([^"]+)"/)
                if (tm) title = tm[1]
                if (!title) {
                    var h2 = r.body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)
                    if (h2) title = h2[1].replace(/<[^>]+>/g, "").trim()
                }
                var cover = ""
                var cm = r.body.match(/<meta property="og:image" content="([^"]+)"/)
                if (cm) cover = cm[1]
                // 解析 tag 列表（#detail_tag 里的 /search/tag/ 链接）
                var tags = {}
                var tagList = []
                var tagRe = /<a href="\/search\/tag\/[^"]+\/">([\s\S]*?)<\/a>/g
                var tm2
                while ((tm2 = tagRe.exec(r.body)) !== null) {
                    var t = tm2[1].replace(/<[^>]+>/g, "").trim()
                    if (t) tagList.push(t)
                }
                if (tagList.length) tags["tag"] = tagList
                return {
                    title: title || id,
                    cover: cover,
                    tags: tags,
                    chapters: {"0": "View All Photos"},
                }
            })
        },

        loadEp: async (id, epId) => {
            var self = this
            var imgs = []
            var seen = {}

            function parseImages(html) {
                var local = []
                var doc = new HtmlDocument(html)
                var container = doc.querySelector("#display_image_detail")
                if (container) {
                    var anchors = container.querySelectorAll("a[data-modal-gallery-image-item]")
                    for (var i = 0; i < anchors.length; i++) {
                        var href = anchors[i].attributes.href || ""
                        if (href && !seen[href]) { seen[href] = true; local.push(href) }
                    }
                    // 兜底：没有 a 锚点时，从 img src 提取并去掉尺寸前缀
                    if (local.length === 0) {
                        var imgs2 = container.querySelectorAll("img")
                        for (var j = 0; j < imgs2.length; j++) {
                            var s = imgs2[j].attributes.src || ""
                            if (s) {
                                s = s.replace(/\/p=\d+(?:x\d+)?\//, "/")
                                if (!seen[s]) { seen[s] = true; local.push(s) }
                            }
                        }
                    }
                }
                doc.dispose()
                return local
            }

            // 第 1 页
            var r1 = await Network.get(self.base + "/image/" + id + "/", self.pageHeaders())
            if (r1.status !== 200) throw "err"
            imgs.push.apply(imgs, parseImages(r1.body))

            // 图多会分页：/image/{slug}/page/N/
            var maxPage = 0
            var pm = /\/page\/(\d+)\//g
            var m
            while ((m = pm.exec(r1.body)) !== null) {
                var n = parseInt(m[1])
                if (n > maxPage) maxPage = n
            }
            for (var p = 2; p <= maxPage; p++) {
                var rp = await Network.get(self.base + "/image/" + id + "/page/" + p + "/", self.pageHeaders())
                if (rp.status !== 200) break
                imgs.push.apply(imgs, parseImages(rp.body))
            }

            if (!imgs.length) throw "no images"
            return {images: imgs}
        },

        // 点击 tag 跳转到标签列表页
        onClickTag: (namespace, tag) => {
            return {
                page: "category",
                attributes: {
                    category: tag,
                    param: tag.toLowerCase().replace(/\s+/g, "-"),
                },
            }
        },
    }
}
