/** @type {import('../../venera-configs/_venera_.js')} */

class FourKHDv2 extends ComicSource {
    name = "4KHD"
    key = "fourkhd"
    version = "2.0.6"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/4khd.js"

    // 入口（会 302 到当前 uuss.uk 网关，网关页里有当前主机列表）
    entryUrl = "https://4khd.com/"

    // 发现失败时的回落值（2026-09-30 实测真站）
    apiBase = "https://qhrzv.uuss.uk"

    // 本次会话是否已做过域名发现
    _resolved = false

    // 每页条数：和原站首页一致（12 条/页 → 3257 页），别改成 20，不然页数对不上
    perPage = 12

    pageHeaders(base) {
        var b = base || this.apiBase
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
            "Referer": b + "/",
        }
    }

    htmlHeaders(ref) {
        var r = ref || this.entryUrl
        var m = String(r).match(/^https?:\/\/[^/]+/)
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
            "Referer": (m ? m[0] : r) + "/",
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

    // 容错 JSON 解析：
    // - 站点老毛病：JSON 前有一段 PHP Warning（<br /><b>Warning...</b><br />）→ 剥掉。
    // - 站点新毛病：API 域报废时直接回 HTML 页面（CF 挑战/网关）→ 别去 HTML 里找 {，
    //   否则 JSON.parse 会报 SyntaxError at position N。直接抛 "no json"。
    parseJson(raw) {
        if (!raw) throw "empty body"
        var s = String(raw)
        var t = s.replace(/^\s+/, "")
        if (t[0] === "[" || t[0] === "{") return JSON.parse(t)
        var i = -1
        for (var n = 0; n < s.length; n++) {
            var c = s[n]
            if (c === "[" || c === "{") { i = n; break }
        }
        if (i <= 0) throw "no json"
        if (s.slice(0, i).indexOf("Warning") >= 0) return JSON.parse(s.slice(i))
        throw "no json"
    }

    // 从 WP API 响应读 X-WP-TotalPages 分页头（真站会带，读不到就回落当前页）
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
    // 入口 4khd.com 302 → 网关页（y5gx.uuss.uk/4khd.php），网关页里有个 sites 数组：
    //   const sites = ['https://qhrzv.uuss.uk', 'https://jrimj.ssuu.uk'];
    // 逐个探测哪个是真 API：要求返回 JSON **且第一条 content 里有 <img>**。
    // 空壳镜像（doudou.me/hecoq 这类）content 全是 `<p>{slug}</p>`，探测直接淘汰。
    resolveBases() {
        var self = this
        if (this._resolved) return Promise.resolve()
        var entries = ["https://4khd.com/", "https://www.4khd.com/", "https://y5gx.uuss.uk/4khd.php"]
        var hosts = []
        var idx = 0
        function collect() {
            if (idx >= entries.length) return Promise.resolve()
            var url = entries[idx]
            idx++
            return Network.get(url, self.pageHeaders(url)).then((r) => {
                if (r.status === 200 && r.body) {
                    var re = /['"]https?:\/\/([a-z0-9-]+\.(?:uuss|ssuu)\.uk)['"]/gi
                    var m
                    while ((m = re.exec(r.body)) !== null) {
                        if (hosts.indexOf(m[1]) < 0) hosts.push(m[1])
                    }
                }
                return collect()
            }).catch(() => collect())
        }
        return collect().then(() => {
            var i = 0
            function tryNext() {
                if (i >= hosts.length) return Promise.resolve()
                var base = "https://" + hosts[i]
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
            self._resolved = true
        })
    }

    // 探测某个 base 是不是「真」API（JSON + content 里有 <img>）
    probeApi(base) {
        var url = base + "/index.php?rest_route=/wp/v2/posts&page=1&per_page=1&_embed=1&orderby=date"
        return Network.get(url, this.pageHeaders(base)).then((r) => {
            if (r.status !== 200) return false
            try {
                var d = this.parseJson(r.body)
                if (!Array.isArray(d) || !d.length) return false
                var html = (d[0].content || {}).rendered || ""
                return html.indexOf("<img") >= 0
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
    // 注意：空壳镜像的 wp:featuredmedia 是「自引用占位」（指向帖子自己，没有 source_url），
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
                ["per_page", String(this.perPage)],
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
                if (this.isSiteAsset(full)) continue
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
                if (this.isSiteAsset(f2)) continue
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

    // ============ 大厅 ============
    explore = [
        {
            title: "4KHD-最新发布",
            type: "multiPageComicList",
            load: (p) => {
                // 原站首页第 N 页 == REST page=N（per_page=12，顺序逐条一致，实测 N=1..8 与末页 3257）。
                // 不要再走 `?query-3-page=N-1`：那是站方不生成的退化键，第 1、2 页会拿到杂烩。
                return this.fetchList(p, {orderby: "date"})
            },
        },
        {
            title: "4KHD-热门人气",
            type: "multiPageComicList",
            load: (p) => {
                // WP 分类 21 = popular（4869 帖），和最新发布完全不同的列表
                return this.fetchList(p, {orderby: "date", categories: "21"})
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
            return this.fetchPost(id).then((post) => {
                // 优先 API content（真站 content 是全量图，132 张一次给全）
                var imgs = self.extractImages((post.content || {}).rendered || "")
                if (imgs.length) return {images: imgs}
                // 兜底：API 正文空（镜像/空壳）时，抓 post.link 内容页
                var link = post.link || ""
                if (!link) throw "no images"
                return Network.get(link, self.htmlHeaders(link)).then((r) => {
                    var pageImgs = (r.status === 200 && r.body) ? self.extractImages(r.body) : []
                    if (pageImgs.length) return {images: pageImgs}
                    throw "no images"
                })
            })
        },
    }
}
