/** @type {import('../../venera-configs/_venera_.js')} */

/**
 * 4KHD v2 —— 全面升级版
 *
 * 对比 v1 的改动：
 * 1. 数据源从 HTML 抓取 → WordPress REST API（/wp/v2/posts）
 * 2. 分页从解析 .page-numbers → 读 X-WP-TotalPages 响应头
 * 3. 图片从递归抓 .html/N → 一次请求拿全套图
 * 4. 封面用 jetpack_featured_media_url / featuredmedia；标签用 _embedded.wp:term
 *
 * v2.0.1 修复：
 * - 图片 URL 不再「脱壳重写」。API 返回的 i0.wp.com/pic.4khd.com/xxx 是 Jetpack Photon 图床，
 *   直接返回 200 图片；之前改写成的 pic.4khd.com/xxx 会 301 跳到 Google(yt4.googleusercontent.com)，
 *   被墙 → app 报 Exception: Invalid image data。现在直接用原 URL。
 * - 补上分类页（沿用老版本的 fixed 结构，映射 WP categories：热门=21 / Cosplay=4 / 写真=3）。
 *
 * v2.0.2 修复（阅读页全空图）：
 * - 【根因】站点把 WP REST API 的 content.rendered 掏空了：现在所有帖子（含老帖）都只返回
 *   `<p>{slug}</p>` 这种 19 字节占位串，一张 <img> 都没有。loadEp 从 content 抓图必然空 →
 *   抛 "no images" → 阅读页全白，同时封面也空 → app 刷一串
 *   `relative URL without a base`（空 URL 直接丢给 Network）。
 * - 【对策 1】loadEp 改为抓「内容页 HTML」：/{contentBase}/content/{slug}.html，从
 *   .entry-content 里取 img[data-src|data-lazy-src|src]（选择器照抄 Tachiyomi 扩展的解析逻辑）。
 *   API 的 content 只作为兜底。
 * - 【对策 2】域名自动发现。站点现在用随机 uuss.uk 子域轮换，而且 **API 域和内容页域不是同一个**
 *   （实测：API 在 hecoq.uuss.uk，内容页在 kcqt.uuss.uk）。入口 4khd.com 会 302 到当前入口，
 *   从入口首页 HTML 里同时抓出这两个域。发现失败时回落到下面的默认常量。
 * - 【对策 3】JSON 容错解析。站点某些请求会在 JSON 前面吐一段 PHP Warning
 *   （class-wp-hook.php 的 `_return_false` not found），直接 JSON.parse 会抛，现在先定位首个 [ 或 {。
 * - 【对策 4】封面/图片空值兜底，绝不再把空字符串塞进 images 数组。
 *
 * ⚠️ 域名轮换：4khd.com / www.4khd.com / pic.4khd.com 现在都 302 到 uuss.uk 系的随机子域。
 */
class FourKHDv2 extends ComicSource {
    name = "4KHD"
    key = "fourkhd"
    version = "2.0.2"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/4khd.js"

    // 入口（会 302 到当前 uuss.uk 入口域）
    entryUrl = "https://4khd.com/"

    // 发现失败时的回落值（手动维护）
    apiBase = "https://hecoq.uuss.uk"
    contentBase = "https://kcqt.uuss.uk"

    // 本次会话是否已做过域名发现
    _resolved = false

    pageHeaders(base) {
        var b = base || this.apiBase
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
            "Referer": b + "/",
        }
    }

    htmlHeaders(base) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
            "Referer": (base || this.contentBase) + "/",
        }
    }

    // ============ 基础工具 ============

    // 去掉 HTML 标签与常见实体，得到纯文本标题
    cleanText(html) {
        if (!html) return ""
        return html
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#8211;/g, "-")
            .replace(/&#8212;/g, "-")
            .replace(/&#8220;/g, "“")
            .replace(/&#8221;/g, "”")
            .replace(/&#8217;/g, "'")
            .replace(/&nbsp;/g, " ")
            .trim()
    }

    // 图片 URL 清理：只做防御性清洗，不重写域名。
    // API 返回的 i0.wp.com/pic.4khd.com/xxx 是 Photon 图床，直接能用；
    // pic.4khd.com 只是 Photon 的 origin 名，写进路径里，别拆出来直连（会 301 到被墙的 Google）。
    cleanImageUrl(url) {
        if (!url) return ""
        var s = String(url).trim()
        if (s.indexOf("\\/") >= 0) s = s.replace(/\\\//g, "/")
        if (s.indexOf("&amp;") >= 0) s = s.replace(/&amp;/g, "&")
        if (s.indexOf("//") === 0) s = "https:" + s
        return s
    }

    // 判断是不是图片 URL（照抄扩展的正则：按扩展名过滤）
    isImageUrl(u) {
        return /\.(?:jpe?g|png|webp|gif|avif)(?:$|\?)/i.test(u)
    }

    // 站点自身装饰图（主题/插件的 logo、404 图等），不是相册内容，必须排除。
    // 不排除的话，内容页 404 时会把 logo.png / 404.png 当成相册图返回。
    isSiteAsset(u) {
        return /\/wp-content\/(?:themes|plugins)\//i.test(u)
            || /\/wp-content\/uploads\//i.test(u)
            || /(?:^|\/)(?:logo|favicon|avatar)[^\/]*\.(?:png|jpe?g|webp|gif|avif)(?:$|\?)/i.test(u)
    }

    // 容错 JSON 解析：站点有时会在 JSON 前吐 PHP Warning，先定位首个 [ 或 {
    parseJson(raw) {
        if (!raw) throw "empty body"
        var s = String(raw)
        var i = -1
        for (var n = 0; n < s.length; n++) {
            var c = s[n]
            if (c === "[" || c === "{") { i = n; break }
        }
        if (i < 0) throw "no json"
        return JSON.parse(s.slice(i))
    }

    // 从 WP API 响应读 X-WP-TotalPages 分页头
    getTotalPages(r, fallback) {
        if (r.headers) {
            var v = r.headers["x-wp-totalpages"] || r.headers["X-WP-TotalPages"]
            if (v != null) {
                var n = parseInt(v)
                if (!isNaN(n) && n > 0) return n
            }
        }
        if (typeof r.responseHeaders === "string") {
            var mm = r.responseHeaders.match(/x-wp-totalpages:\s*(\d+)/i)
            if (mm) return parseInt(mm[1]) || (fallback || 1)
        }
        return fallback || 1
    }

    // ============ 域名发现 ============
    // 站点用随机 uuss.uk 子域轮换，且 API 域 ≠ 内容页域。
    // 入口首页 HTML 里同时含有这两个域，抓出来即可。
    resolveBases() {
        var self = this
        if (this._resolved) return Promise.resolve()
        return Network.get(this.entryUrl, this.htmlHeaders(this.entryUrl)).then((r) => {
            var html = (r && r.body) ? r.body : ""
            // 首页里出现的所有 uuss.uk 主机名（去重）
            var hosts = []
            var re = /https?:\/\/([a-z0-9-]+)\.uuss\.uk/gi
            var m
            while ((m = re.exec(html)) !== null) {
                if (hosts.indexOf(m[1]) < 0) hosts.push(m[1])
            }
            // 内容页域：文章链接指向的那个
            var cm = html.match(/https?:\/\/([a-z0-9-]+)\.uuss\.uk\/content\//i)
            if (cm) self.contentBase = "https://" + cm[1] + ".uuss.uk"
            // API 域：候选里第一个 REST API 能出 JSON 的
            var i = 0
            function tryNext() {
                if (i >= hosts.length) return Promise.resolve()
                var base = "https://" + hosts[i] + ".uuss.uk"
                i++
                return self.probeApi(base).then((ok) => {
                    if (ok) { self.apiBase = base; return }
                    return tryNext()
                })
            }
            return tryNext()
        }).then(() => {
            self._resolved = true
        }).catch(() => {
            // 发现失败就用回落常量，别让整个源挂掉
            self._resolved = true
        })
    }

    // 探测某个 base 是不是 WP REST API
    probeApi(base) {
        var url = base + "/index.php?rest_route=/wp/v2/posts&per_page=1"
        return Network.get(url, this.pageHeaders(base)).then((r) => {
            if (r.status !== 200) return false
            try {
                var d = this.parseJson(r.body)
                return Array.isArray(d) && d.length > 0
            } catch (e) {
                return false
            }
        }).catch(() => false)
    }

    // ============ WP 数据解析 ============

    // 从 WP 帖子提取标签（_embedded.wp:term → 扁平化 → name → 去重）
    extractTags(post) {
        var tags = []
        var emb = post._embedded || {}
        var terms = emb["wp:term"]
        if (terms) {
            for (var i = 0; i < terms.length; i++) {
                var group = terms[i]
                if (!group) continue
                for (var j = 0; j < group.length; j++) {
                    var name = group[j].name || ""
                    name = this.cleanText(String(name))
                    if (name && tags.indexOf(name) < 0) tags.push(name)
                }
            }
        }
        return tags
    }

    // 从 WP 帖子提取封面。
    // 注意：新格式的 wp:featuredmedia 是「自引用占位」（指向帖子自己，没有 source_url），
    // 必须校验 source_url 存在，否则会返回空串 → app 报 relative URL without a base。
    extractCover(post) {
        var c = post.jetpack_featured_media_url
        if (c && String(c).trim()) return this.cleanImageUrl(c)
        var emb = post._embedded || {}
        var fm = emb["wp:featuredmedia"]
        if (fm && fm[0] && fm[0].source_url && String(fm[0].source_url).trim()) {
            return this.cleanImageUrl(fm[0].source_url)
        }
        return ""
    }

    // WP 帖子 → Comic
    parseComic(post) {
        var id = String(post.id)
        var title = this.cleanText(post.title && post.title.rendered)
        var cover = this.extractCover(post)
        var tags = this.extractTags(post)
        var date = (post.date || "").slice(0, 10)
        return new Comic({
            id: id,
            title: title || id,
            subTitle: date,
            cover: cover,
            tags: tags,
        })
    }

    // 解析 WP 列表响应（可能是数组或单个对象）
    parsePosts(body) {
        var json = this.parseJson(body)
        if (Array.isArray(json)) return json
        return json ? [json] : []
    }

    // 构建 WP REST API URL
    buildApiUrl(params) {
        var url = this.apiBase + "/index.php?rest_route=/wp/v2/posts"
        for (var i = 0; i < params.length; i++) {
            url += "&" + params[i][0] + "=" + encodeURIComponent(params[i][1])
        }
        return url
    }

    // 拉取帖子列表页
    fetchList(page, opts) {
        var self = this
        return this.resolveBases().then(() => {
            var params = [
                ["page", String(page)],
                ["per_page", "20"],
                ["_embed", "1"],
            ]
            if (opts.orderby) params.push(["orderby", opts.orderby])
            if (opts.search) params.push(["search", opts.search])
            if (opts.categories) params.push(["categories", opts.categories])
            var url = self.buildApiUrl(params)
            return Network.get(url, self.pageHeaders())
        }).then((r) => {
            if (r.status !== 200) throw "err"
            var posts = this.parsePosts(r.body)
            var comics = []
            for (var i = 0; i < posts.length; i++) {
                var c = this.parseComic(posts[i])
                if (c) comics.push(c)
            }
            var maxPage = this.getTotalPages(r, page)
            return {comics: comics, maxPage: maxPage}
        })
    }

    // 按 id 取单个帖子
    fetchPost(id) {
        var self = this
        return this.resolveBases().then(() => {
            var url = self.apiBase + "/index.php?rest_route=/wp/v2/posts/" + id + "&_embed=1"
            return Network.get(url, self.pageHeaders())
        }).then((r) => {
            if (r.status !== 200) throw "err"
            var posts = this.parsePosts(r.body)
            if (!posts.length) throw "no post"
            return posts[0]
        })
    }

    // 从一段 HTML 里抽图片 URL（选择器与 Tachiyomi 扩展 c() 一致）
    extractImages(html) {
        var out = []
        if (!html) return out
        var d = new HtmlDocument(html)
        var container = d.querySelector(".entry-content.wp-block-post-content")
            || d.querySelector(".entry-content")
            || d.querySelector("article")
        var scope = container || d
        var els = scope.querySelectorAll("img[data-src], img[data-lazy-src], img[src]")
        var seen = {}
        for (var i = 0; i < els.length; i++) {
            var attrs = els[i].attributes || {}
            var cand = [attrs["data-src"], attrs["data-lazy-src"], attrs["src"]]
            for (var j = 0; j < cand.length; j++) {
                var raw = cand[j]
                if (!raw || !String(raw).trim()) continue
                var full = this.cleanImageUrl(raw)
                if (!full || !this.isImageUrl(full)) continue
                var key = full.replace(/\?.*$/, "")
                if (!seen[key]) {
                    seen[key] = true
                    out.push(full)
                }
                break
            }
        }
        // 兜底：正文里没有 <img> 时，找 <a href> 里的图片直链
        if (!out.length) {
            var links = scope.querySelectorAll("a[href]")
            for (var k = 0; k < links.length; k++) {
                var href = (links[k].attributes || {})["href"]
                if (!href) continue
                var f2 = this.cleanImageUrl(href)
                if (!f2 || !this.isImageUrl(f2)) continue
                var key2 = f2.replace(/\?.*$/, "")
                if (!seen[key2]) {
                    seen[key2] = true
                    out.push(f2)
                }
            }
        }
        d.dispose()
        return out
    }

    // 抓内容页 HTML（图片真正所在的地方）
    fetchContentPage(slug) {
        var self = this
        if (!slug) return Promise.resolve("")
        var url = self.contentBase + "/content/" + slug + ".html"
        return Network.get(url, self.htmlHeaders()).then((r) => {
            if (r.status !== 200 || !r.body) return ""
            return r.body
        }).catch(() => "")
    }

    // ============ 大厅 ============
    explore = [
        {
            title: "4KHD-最新发布",
            type: "multiPageComicList",
            load: (p) => {
                return this.fetchList(p, {orderby: "date"})
            },
        },
        {
            title: "4KHD-最近更新",
            type: "multiPageComicList",
            load: (p) => {
                return this.fetchList(p, {orderby: "modified"})
            },
        },
    ]

    // ============ 分类（沿用老版本的 fixed 结构，映射 WP categories id） ============
    category = {
        title: "4KHD",
        parts: [
            {
                name: "分类",
                type: "fixed",
                itemType: "category",
                categories: ["热门 Popular", "Cosplay", "写真 Photo"],
                categoryParams: ["21", "4", "3"],
            }
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: (cat, param, options, p) => {
            // param 是 WP category id（21=热门 4=Cosplay 3=写真）
            return this.fetchList(p, {orderby: "date", categories: param})
        }
    }

    // ============ 搜索 ============
    search = {
        load: (k, o, p) => {
            return this.fetchList(p, {orderby: "date", search: k})
        },
        optionList: [],
    }

    // ============ 详情 / 图片 ============
    comic = {
        loadInfo: (id) => {
            var self = this
            return this.fetchPost(id).then((post) => {
                var title = self.cleanText(post.title && post.title.rendered)
                var cover = self.extractCover(post)
                var tags = self.extractTags(post)
                var tagMap = {}
                if (tags.length) tagMap["tag"] = tags
                return {
                    title: title || id,
                    cover: cover,
                    tags: tagMap,
                    chapters: {"0": "View All Photos"},
                }
            })
        },

        loadEp: (id, epId) => {
            var self = this
            // 先拿帖子，取 slug（内容页按 slug 拼路径）
            return this.fetchPost(id).then((post) => {
                var slug = post.slug || ""
                return self.fetchContentPage(slug).then((html) => {
                    var imgs = self.extractImages(html)
                    if (imgs.length) return {images: imgs}
                    // 兜底：内容页没抓到就退回 API 的 content.rendered（老格式帖子还有图）
                    var apiImgs = self.extractImages((post.content || {}).rendered || "")
                    if (apiImgs.length) return {images: apiImgs}
                    throw "no images"
                })
            })
        },
    }
}
