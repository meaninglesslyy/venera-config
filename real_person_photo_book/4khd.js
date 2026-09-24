/** @type {import('../../venera-configs/_venera_.js')} */

/**
 * 4KHD v2 —— 全面升级版
 *
 * 对比 v1 的改动：
 * 1. 数据源从 HTML 抓取 → WordPress REST API（/wp/v2/posts）
 * 2. 分页从解析 .page-numbers → 读 X-WP-TotalPages 响应头
 * 3. 图片从递归抓 .html/N → 一次 API 请求拿全套图（content.rendered 里全量）
 * 4. 封面用 jetpack_featured_media_url / featuredmedia；标签用 _embedded.wp:term
 *
 * v2.0.1 修复：
 * - 图片 URL 不再「脱壳重写」。API 返回的 i0.wp.com/pic.4khd.com/xxx 是 Jetpack Photon 图床，
 *   直接返回 200 图片；之前改写成的 pic.4khd.com/xxx 会 301 跳到 Google(yt4.googleusercontent.com)，
 *   被墙 → app 报 Exception: Invalid image data。现在直接用原 URL。
 * - 补上分类页（沿用老版本的 fixed 结构，映射 WP categories：热门=21 / Cosplay=4 / 写真=3）。
 *
 * ⚠️ 域名轮换：www.4khd.com 已变成跳转站，真实 WP 站点在 hecoq.uuss.uk（备用 eavqs.ssuu.uk）。
 * 站点会频繁换域，失效时改 apiBase 即可。
 */
class FourKHDv2 extends ComicSource {
    name = "4KHD"
    key = "fourkhd"
    version = "2.0.1"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/4khd.js"

    // WP 站点真实地址（会轮换，失效改这里）
    apiBase = "https://hecoq.uuss.uk"

    pageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
            "Referer": this.apiBase + "/",
        }
    }

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
        var s = url.trim()
        if (s.indexOf("\\/") >= 0) s = s.replace(/\\\//g, "/")
        if (s.indexOf("&amp;") >= 0) s = s.replace(/&amp;/g, "&")
        return s
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

    // 从 WP 帖子提取封面（jetpack_featured_media_url 优先，其次 featuredmedia.source_url）
    extractCover(post) {
        var c = post.jetpack_featured_media_url
        if (c) return this.cleanImageUrl(c)
        var emb = post._embedded || {}
        var fm = emb["wp:featuredmedia"]
        if (fm && fm[0] && fm[0].source_url) return this.cleanImageUrl(fm[0].source_url)
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
        var json = JSON.parse(body)
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
        var params = [
            ["page", String(page)],
            ["per_page", "20"],
            ["_embed", "1"],
        ]
        if (opts.orderby) params.push(["orderby", opts.orderby])
        if (opts.search) params.push(["search", opts.search])
        if (opts.categories) params.push(["categories", opts.categories])
        var url = this.buildApiUrl(params)
        return Network.get(url, this.pageHeaders()).then((r) => {
            if (r.status !== 200) throw "err"
            var posts = self.parsePosts(r.body)
            var comics = []
            for (var i = 0; i < posts.length; i++) {
                var c = self.parseComic(posts[i])
                if (c) comics.push(c)
            }
            var maxPage = self.getTotalPages(r, page)
            return {comics: comics, maxPage: maxPage}
        })
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
            var url = this.apiBase + "/index.php?rest_route=/wp/v2/posts/" + id + "&_embed=1"
            return Network.get(url, this.pageHeaders()).then((r) => {
                if (r.status !== 200) throw "err"
                var posts = this.parsePosts(r.body)
                if (!posts.length) throw "no post"
                var post = posts[0]
                var title = this.cleanText(post.title && post.title.rendered)
                var cover = this.extractCover(post)
                var tags = this.extractTags(post)
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
            var url = this.apiBase + "/index.php?rest_route=/wp/v2/posts/" + id + "&_embed=1"
            return Network.get(url, this.pageHeaders()).then((r) => {
                if (r.status !== 200) throw "err"
                var posts = self.parsePosts(r.body)
                if (!posts.length) throw "no post"
                var html = posts[0].content && posts[0].content.rendered
                if (!html) throw "no content"
                var imgs = []
                var seen = {}
                var d = new HtmlDocument(html)
                // 主内容容器，优先 .entry-content
                var container = d.querySelector(".entry-content.wp-block-post-content") || d.querySelector(".entry-content") || d
                // 图片 URL 从 <img src> 提取（该站 content 里每张图是 <a> + <img> 成对出现，img 带 ?w=1300 query）
                var els = container.querySelectorAll("img[src]")
                for (var i = 0; i < els.length; i++) {
                    var src = els[i].attributes["src"] || ""
                    if (!src) continue
                    var full = self.cleanImageUrl(src)
                    if (!full) continue
                    // 按扩展名过滤，去重（忽略 query 后比较）
                    if (!/\.(jpe?g|png|webp|gif|avif)(?:$|\?)/i.test(full)) continue
                    var key = full.replace(/\?.*$/, "")
                    if (!seen[key]) {
                        seen[key] = true
                        imgs.push(full)
                    }
                }
                d.dispose()
                if (!imgs.length) throw "no images"
                return {images: imgs}
            })
        },
    }
}
