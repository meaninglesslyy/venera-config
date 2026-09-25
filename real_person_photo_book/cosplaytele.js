class CosplayTele extends ComicSource {
    name = "CosplayTele"
    key = "cosplaytele"
    version = "1.7.0"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/cosplaytele.js"
    base = "https://cosplaytele.com"
    api = "https://cosplaytele.com/wp-json/wp/v2"

    // 站点自有图标，保证 cover 永不为空串（空串会让下载流程抛 relative URL without a base）
    fallbackCover = "https://cosplaytele.com/wp-content/uploads/2024/01/cropped-icon-cosplaytele-1-270x270.png"

    // WPP nonce 从页面 data-token 动态取，取不到再退回旧值
    _wppToken = null

    pageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": this.base + "/",
        }
    }

    // ============ 基础工具 ============

    // 把任意 URL 规整成绝对地址。空值返回 ""，调用方负责兜底。
    // 这是修复 "relative URL without a base" 的核心：Dio 只吃带 scheme 的绝对地址。
    abs(u) {
        if (!u) return ""
        u = String(u).trim().replace(/&amp;/g, "&")
        if (!u || u.indexOf("data:") === 0 || u.indexOf("javascript:") === 0) return ""
        if (/^https?:\/\//i.test(u)) return u
        if (u.indexOf("//") === 0) return "https:" + u
        if (u.indexOf("/") === 0) return this.base + u
        return this.base + "/" + u
    }

    // HTML 实体解码 + 去标签
    decodeEntities(s) {
        return String(s == null ? "" : s)
            .replace(/<[^>]+>/g, "")
            .replace(/&#8211;/g, "–").replace(/&#8212;/g, "—")
            .replace(/&#8216;/g, "‘").replace(/&#8217;/g, "’")
            .replace(/&#8220;/g, "“").replace(/&#8221;/g, "”")
            .replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')
            .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .trim()
    }

    // 安全地执行 querySelectorAll，避免 null 崩溃
    safeQueryAll(doc, selector) {
        try {
            var result = doc.querySelectorAll(selector)
            return result || []
        } catch (e) {
            return []
        }
    }

    // 安全地执行 querySelector
    safeQuery(doc, selector) {
        try {
            return doc.querySelector(selector) || null
        } catch (e) {
            return null
        }
    }

    // ============ 封面提取 ============
    // 该站 Yoast 不输出 og:/twitter: 标签，旧实现永远返回空串 —— 下载时炸 Dio。
    // 现在按 4 级兜底，保证任何路径都吐绝对地址。
    extractCover(body) {
        if (!body) return this.fallbackCover
        // 1) og:image / twitter:image（属性顺序两种都试）
        var m = body.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
            || body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
            || body.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
            || body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)
        if (m && this.abs(m[1])) return this.abs(m[1])
        // 2) 正文 .entry-content 里的第一张图
        var d = new HtmlDocument(body)
        try {
            var content = this.safeQuery(d, ".entry-content")
            if (content) {
                var imgs = this.safeQueryAll(content, "img")
                for (var i = 0; i < imgs.length; i++) {
                    var a = imgs[i].attributes || {}
                    var src = a["src"] || a["data-src"] || a["data-lazy-src"] || ""
                    if (/\.(jpg|jpeg|png|webp)/i.test(src)) {
                        var abs1 = this.abs(src)
                        if (abs1) return abs1
                    }
                }
            }
        } catch (e) {
        } finally {
            d.dispose()
        }
        // 3) 站点图标 meta
        var t = body.match(/<meta[^>]+name=["']msapplication-TileImage["'][^>]+content=["']([^"']+)["']/i)
        if (t && this.abs(t[1])) return this.abs(t[1])
        // 4) 兜底，绝不返回空串
        return this.fallbackCover
    }

    // 从 WP REST post 对象取封面（featured media），取不到退回正文首图
    coverFromPost(post) {
        try {
            var fm = post._embedded && post._embedded["wp:featuredmedia"]
            if (fm && fm[0] && fm[0].source_url) {
                var a = this.abs(fm[0].source_url)
                if (a) return a
            }
        } catch (e) {
        }
        try {
            var c = post.content && post.content.rendered
            if (c) {
                var m = c.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i)
                if (m) {
                    var a2 = this.abs(m[1])
                    if (a2) return a2
                }
            }
        } catch (e) {
        }
        return this.fallbackCover
    }

    // WP REST post -> comic 精简对象
    parsePost(post) {
        var slug = post.slug || ""
        var title = this.decodeEntities(post.title && post.title.rendered ? post.title.rendered : "")
        if (!slug || !title) return null
        return {id: slug, title: title, cover: this.coverFromPost(post)}
    }

    // 从响应头拿总页数
    totalPages(r, p, count, perPage) {
        var maxPage = p
        try {
            if (r.headers && r.headers["x-wp-totalpages"]) {
                maxPage = parseInt(r.headers["x-wp-totalpages"]) || 1
            } else if (r.responseHeaders) {
                var tp = r.responseHeaders.match(/x-wp-totalpages:\s*(\d+)/i)
                if (tp) maxPage = parseInt(tp[1]) || 1
            }
        } catch (e) {
        }
        if (maxPage === p) {
            maxPage = (count < (perPage || 20)) ? p : 500
        }
        return maxPage
    }

    // ============ 搜索 ============
    parseSearchResults(html, totalCount) {
        var c = []
        var seen = {}
        var itemRe = /<div class='item asl_r_pagepost asl_r_pagepost_\d+ asl_r_post'>([\s\S]*?)<\/div>\s*<div class='clear'><\/div>\s*<\/div>/g
        var itemMatch
        while ((itemMatch = itemRe.exec(html)) !== null) {
            var itemHtml = itemMatch[1]
            var imgRe = /<img[^>]+src=['"]([^'"]+)['"]/
            var imgMatch = imgRe.exec(itemHtml)
            var cover = imgMatch ? this.abs(imgMatch[1].replace(/\\\//g, "/")) : this.fallbackCover
            var linkRe = /<a class="asl_res_url" href='([^']+)'>([\s\S]*?)<\/a>/
            var linkMatch = linkRe.exec(itemHtml)
            if (!linkMatch) continue
            var href = linkMatch[1].replace(/\\\//g, "/")
            var title = this.decodeEntities(linkMatch[2])
            var slug = href.replace(this.base + "/", "").replace(/\/$/, "")
            if (slug && title && !seen[slug]) {
                seen[slug] = true
                c.push({id: slug, title: title, cover: cover || this.fallbackCover})
            }
        }
        if (c.length === 0) {
            var simpleRe = /<a class="asl_res_url" href='([^']+)'>([\s\S]*?)<\/a>/g
            var simpleMatch
            while ((simpleMatch = simpleRe.exec(html)) !== null) {
                var href2 = simpleMatch[1].replace(/\\\//g, "/")
                var title2 = this.decodeEntities(simpleMatch[2])
                var slug2 = href2.replace(this.base + "/", "").replace(/\/$/, "")
                if (slug2 && title2 && !seen[slug2]) {
                    seen[slug2] = true
                    c.push({id: slug2, title: title2, cover: this.fallbackCover})
                }
            }
        }
        return {comics: c, maxPage: Math.ceil((totalCount || 0) / 10) || 1}
    }

    search = {
        load: (k, o, p) => {
            var body = "action=ajaxsearchlite_search&aslp=" + encodeURIComponent(k) + "&asid=1&options=customset%5B%5D%3Dpost%26asl_gen%5B%5D%3Dtitle%26qtranslate_lang%3D0%26filters_initial%3D1%26filters_changed%3D0&asl_req_json=1"
            return Network.post(this.base + "/wp-admin/admin-ajax.php", {
                "Content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Accept": "text/html"
            }, body).then((r) => {
                if (r.status !== 200) throw "err"
                var json = JSON.parse(r.body)
                return this.parseSearchResults(json.html, json.full_results_count || 0)
            }).catch(() => {
                return {comics: [], maxPage: 1}
            })
        },
        optionList: []
    }

    // ============ 热门榜（WPP） ============
    // 旧的 X-WP-Nonce 是硬编码的，会过期。改为从首页 data-token 动态取并缓存。
    getWppToken(html) {
        var m = html.match(/data-token=["']([^"']+)["']/)
        return m ? m[1] : null
    }

    ensureWppToken() {
        var self = this
        if (self._wppToken) return Promise.resolve(self._wppToken)
        return Network.get(self.base + "/", self.pageHeaders()).then((r) => {
            if (r.status === 200) {
                var t = self.getWppToken(r.body)
                if (t) self._wppToken = t
            }
            return self._wppToken || "848c6cd23e"
        }).catch(() => {
            return self._wppToken || "848c6cd23e"
        })
    }

    parseTopList(html) {
        var c = []
        var seen = {}
        var itemRe = /<li[^>]*>([\s\S]*?)<\/li>/g
        var itemMatch
        while ((itemMatch = itemRe.exec(html)) !== null) {
            var itemHtml = itemMatch[1]
            var imgRe = /<img[^>]+src=["']([^"']+)["']/
            var imgMatch = imgRe.exec(itemHtml)
            var cover = imgMatch ? this.abs(imgMatch[1]) : ""
            var href = ""
            var title = ""
            var linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*class=["']wpp-post-title["'][^>]*>([\s\S]*?)<\/a>/
            var linkMatch = linkRe.exec(itemHtml)
            if (linkMatch) {
                href = linkMatch[1]
                title = this.decodeEntities(linkMatch[2])
            } else {
                var gRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g
                var links = []
                var mm
                while ((mm = gRe.exec(itemHtml)) !== null) links.push(mm)
                if (links.length >= 2) {
                    href = links[1][1]
                    title = this.decodeEntities(links[1][2])
                } else if (links.length >= 1) {
                    href = links[0][1]
                    title = this.decodeEntities(links[0][2])
                } else {
                    continue
                }
            }
            var slug = href.replace(this.base + "/", "").replace(/\/$/, "")
            if (slug && title && !seen[slug]) {
                seen[slug] = true
                c.push({id: slug, title: title, cover: cover || this.fallbackCover})
            }
        }
        return {comics: c, maxPage: 1}
    }

    // ============ 分类 ============
    category = {
        title: "CosplayTele",
        parts: [
            {
                name: "内容类型",
                type: "fixed",
                itemType: "category",
                categories: ["Cosplay Nude", "Cosplay Ero", "Video Cosplay", "Cosplay", "AI Art", "Only Video"],
                categoryParams: ["cosplay-nude", "cosplay-ero", "video-cosplayy", "cosplay", "ai-art", "only-video"],
            },
            {
                name: "游戏作品",
                type: "fixed",
                itemType: "category",
                categories: ["Genshin Impact", "Azur Lane", "Fate/Grand Order", "Wuthering Waves", "Honkai:Star Rail", "NIKKE", "Zenless Zone Zero", "Blue Archive", "League Of Legends", "Final Fantasy", "Arknights"],
                categoryParams: ["genshin-impact", "azur-lane", "fate-grand-order", "wuthering-waves", "honkai-star-rail", "nikke", "zenless-zone-zero", "blue-archive", "league-of-legends", "final-fantasy", "arknights"],
            },
            {
                name: "动漫作品",
                type: "fixed",
                itemType: "category",
                categories: ["Re:Zero", "NieR:Automata", "Sono Bisque Doll", "Spy x Family", "Dead or Alive", "Chainsaw Man", "Demon Slayer", "Evangelion", "Bocchi The Rock", "Overlord"],
                categoryParams: ["rezero", "nierautomata", "sono-bisque-doll", "spy-x-family", "dead-or-alive", "chainsaw-man", "kimetsu-no-yaiba", "evangelion", "bocchi-the-rock", "overlord"],
            },
            {
                name: "Cosplay Freestyle",
                type: "fixed",
                itemType: "category",
                categories: ["Maid", "School Girl", "ELF", "Nun", "Nurse", "Miko", "Cheongsam", "Hololive", "Devil", "Kimono", "Bunny Girl", "Hatsune Miku"],
                categoryParams: ["maid", "school-girl", "elf", "nun", "nurse", "miko", "cheongsam", "hololive", "devil", "kimono", "bunny-girl", "hatsune-miku"],
            },
            {
                name: "Best Cosplayer",
                type: "fixed",
                itemType: "category",
                categories: ["Machi馬吉", "ChuChu Magic", "Tiny Asa", "水淼Aqua", "铃木美咲", "Byoru", "Umeko J", "咬一口兔娘ovo", "小丁", "Minami", "Rioko", "你的小狗", "DemiFairyTW", "Tokar 浵卡", "阿薰kaOri", "米胡桃MeeHutao", "Bangni邦尼", "Arty Huang", "PoppaChan", "Nekokoyoshi", "Meenfox", "九言", "Hoshilily", "软萌兔兔酱"],
                categoryParams: ["machi", "chuchu-magic", "tiny-asababy", "aqua", "misaki-suzuki", "byoru", "umeko-j", "sticky-bunny", "xiao-ding", "minami", "rioko", "puppyporn090", "demifairytw", "tokar", "axunkaorii", "meehutao69", "bangni", "artyhuang", "poppachan", "nekokoyoshi", "meenfox", "jiu-yan", "hoshilily", "sweetrabbit233"],
            },
            {
                name: "热门时间",
                type: "fixed",
                itemType: "category",
                categories: ["Top 24 Hours", "Top 3 Days", "Top 7 Days"],
                categoryParams: ["top-24h", "top-3d", "top-7d"],
            }
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: (cat, param, options, p) => {
            var self = this
            // Top View 分类：WPP API
            if (param.indexOf("top-") === 0) {
                var rangeMap = {"top-24h": "daily", "top-3d": "daily", "top-7d": "weekly"}
                var timeQtyMap = {"top-24h": 24, "top-3d": 72, "top-7d": 168}
                var requestBody = JSON.stringify({
                    title: "", limit: "20", offset: 0,
                    range: rangeMap[param] || "daily",
                    time_quantity: timeQtyMap[param] || 24, time_unit: "hour",
                    freshness: false, order_by: "views", post_type: "post", pid: "", exclude: "", cat: "",
                    taxonomy: "category", term_id: "", author: "",
                    shorten_title: {active: false, length: 0, words: false},
                    "post-excerpt": {active: false, length: 0, keep_format: false, words: false},
                    thumbnail: {active: true, build: "manual", width: "1920", height: "1080"},
                    rating: false,
                    stats_tag: {comment_count: false, views: "1", author: false, date: {active: false, format: "F j, Y"}, category: false, taxonomy: {active: false, name: "category"}},
                    markup: {custom_html: true, "wpp-start": "<ul class=\"wpp-list\">", "wpp-end": "</ul>", "title-start": "<h2>", "title-end": "</h2>", "post-html": "<li class=\"{current_class}\">{thumb} {title} <span class=\"wpp-meta post-stats\">{stats}</span><p class=\"wpp-excerpt\">{excerpt}</p></li>"},
                    theme: {name: ""}
                })
                return self.ensureWppToken().then((token) => {
                    return Network.post(self.base + "/wp-json/wordpress-popular-posts/v2/widget", {
                        "X-Requested-With": "XMLHttpRequest",
                        "Content-Type": "application/json",
                        "X-WP-Nonce": token
                    }, requestBody)
                }).then((r) => {
                    if (r.status !== 200) throw "err"
                    var json = JSON.parse(r.body)
                    return self.parseTopList(json.widget || "")
                }).catch(() => {
                    return {comics: [], maxPage: 1}
                })
            }
            // 普通分类/标签：WP REST API
            var catMap = {
                "cosplay-nude": {id: 193, type: "category"}, "free-style": {id: 400, type: "category"},
                "cosplay-ero": {id: 194, type: "category"}, "game": {id: 398, type: "category"},
                "video-cosplayy": {id: 850, type: "category"}, "anime": {id: 399, type: "category"},
                "cosplay": {id: 363, type: "category"}, "ai-art": {id: 589, type: "category"},
                "only-video": {id: 1124, type: "category"},
                "genshin-impact": {id: 23, type: "category"}, "azur-lane": {id: 43, type: "category"},
                "fate-grand-order": {id: 153, type: "category"},
                "wuthering-waves": {id: 1135, type: "tag"}, "honkai-star-rail": {id: 779, type: "tag"},
                "nikke": {id: 416, type: "tag"}, "zenless-zone-zero": {id: 1112, type: "tag"},
                "blue-archive": {id: 211, type: "tag"}, "league-of-legends": {id: 121, type: "tag"},
                "final-fantasy": {id: 130, type: "tag"}, "arknights": {id: 315, type: "tag"},
                "xiuren": {id: 946, type: "category"}, "pure-media": {id: 955, type: "category"},
                "fantasy-factory": {id: 63, type: "category"},
                "rezero": {id: 197, type: "tag"}, "nierautomata": {id: 133, type: "tag"},
                "sono-bisque-doll": {id: 89, type: "tag"}, "spy-x-family": {id: 126, type: "tag"},
                "dead-or-alive": {id: 237, type: "tag"}, "chainsaw-man": {id: 378, type: "tag"},
                "kimetsu-no-yaiba": {id: 59, type: "tag"}, "evangelion": {id: 260, type: "tag"},
                "bocchi-the-rock": {id: 470, type: "tag"}, "overlord": {id: 305, type: "tag"},
                "maid": {id: 693, type: "tag"}, "school-girl": {id: 739, type: "tag"},
                "elf": {id: 707, type: "tag"}, "nun": {id: 672, type: "tag"},
                "nurse": {id: 700, type: "tag"}, "miko": {id: 230, type: "tag"},
                "cheongsam": {id: 726, type: "tag"}, "hololive": {id: 228, type: "tag"},
                "devil": {id: 710, type: "tag"}, "kimono": {id: 719, type: "tag"},
                "bunny-girl": {id: 742, type: "tag"}, "hatsune-miku": {id: 259, type: "tag"},
                "machi": {id: 1023, type: "category"}, "chuchu-magic": {id: 1171, type: "category"},
                "tiny-asababy": {id: 852, type: "category"}, "misaki-suzuki": {id: 702, type: "category"},
                "minami": {id: 1183, type: "category"},
                "puppyporn090": {id: 1172, type: "category"}, "demifairytw": {id: 1141, type: "category"},
                "tokar": {id: 733, type: "category"}, "axunkaorii": {id: 971, type: "category"},
                "meehutao69": {id: 1179, type: "category"}, "bangni": {id: 1138, type: "category"},
                "poppachan": {id: 347, type: "category"}, "nekokoyoshi": {id: 22, type: "category"},
                "meenfox": {id: 429, type: "category"}, "hoshilily": {id: 41, type: "category"},
                "sweetrabbit233": {id: 803, type: "category"}
            }
            var info = catMap[param] || {id: 193, type: "category"}
            var key = info.type === "tag" ? "tags" : "categories"
            var url = self.api + "/posts?" + key + "=" + info.id + "&page=" + p + "&per_page=20&_embed"
            return Network.get(url, {}).then((r) => {
                if (r.status !== 200) throw "err"
                var posts = JSON.parse(r.body)
                var c = []
                for (var i = 0; i < posts.length; i++) {
                    var item = self.parsePost(posts[i])
                    if (item) c.push(item)
                }
                return {comics: c, maxPage: self.totalPages(r, p, c.length, 20)}
            }).catch(() => {
                return {comics: [], maxPage: p}
            })
        }
    }

    // ============ 大厅（最新） ============
    explore = [
        {
            title: "Cosplaytele",
            type: "multiPageComicList",
            load: (p) => {
                var self = this
                var url = self.api + "/posts?page=" + p + "&per_page=20&_embed&orderby=date&order=desc"
                return Network.get(url, {}).then((r) => {
                    if (r.status !== 200) throw "err"
                    var posts = JSON.parse(r.body)
                    var c = []
                    for (var i = 0; i < posts.length; i++) {
                        var item = self.parsePost(posts[i])
                        if (item) c.push(item)
                    }
                    return {comics: c, maxPage: self.totalPages(r, p, c.length, 20)}
                }).catch(() => {
                    return {comics: [], maxPage: p}
                })
            }
        }
    ]

    // ============ 详情 / 图片 ============
    comic = {
        // 详情优先走 REST（封面必有 featured media），失败再退回抓页面
        loadInfo: (id) => {
            var self = this
            var apiUrl = self.api + "/posts?slug=" + encodeURIComponent(id) + "&_embed"
            return Network.get(apiUrl, self.pageHeaders()).then((r) => {
                if (r.status !== 200) throw "err"
                var posts = JSON.parse(r.body)
                if (!posts || !posts.length) throw "err"
                var post = posts[0]
                var title = self.decodeEntities(post.title && post.title.rendered ? post.title.rendered : id)
                return {
                    id: id,
                    title: title || id,
                    cover: self.coverFromPost(post),
                    tags: {},
                    chapters: {"0": "View All Photos"}
                }
            }).catch(() => {
                // 退回抓 HTML 页面
                var pageUrl = self.base + "/" + id + "/"
                return Network.get(pageUrl, self.pageHeaders()).then((r2) => {
                    if (r2.status !== 200) throw "err"
                    var title = ""
                    var tm = r2.body.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
                    if (tm) title = self.decodeEntities(tm[1])
                    if (!title) {
                        var h1 = r2.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
                        if (h1) title = self.decodeEntities(h1[1])
                    }
                    if (!title) {
                        var tg = r2.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
                        if (tg) title = self.decodeEntities(tg[1])
                    }
                    return {
                        id: id,
                        title: title || id,
                        cover: self.extractCover(r2.body),
                        tags: {},
                        chapters: {"0": "View All Photos"}
                    }
                })
            })
        },

        loadEp: (id, e) => {
            var self = this
            var url = self.base + "/" + id + "/"
            return Network.get(url, self.pageHeaders()).then((r) => {
                if (r.status !== 200) throw "err"
                var allImgs = []
                var seen = {}
                var d = new HtmlDocument(r.body)
                var html = ""
                try {
                    var content = self.safeQuery(d, ".entry-content")
                    html = content ? content.innerHTML : r.body
                } catch (err) {
                    html = r.body
                } finally {
                    d.dispose()
                }
                // 砍掉推荐位
                var cutPos = html.indexOf("Recommend For You")
                if (cutPos > 0) html = html.substring(0, cutPos)

                var push = (raw) => {
                    if (!raw) return
                    var s = self.abs(raw.replace(/\\\//g, "/"))
                    if (!s) return
                    if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(s)) return
                    if (seen[s]) return
                    seen[s] = true
                    allImgs.push(s)
                }
                // 方式1: data-fancybox 原图
                var re1 = /<a[^>]+data-fancybox[^>]+href=["']([^"']+)["']/g
                var m
                while ((m = re1.exec(html)) !== null) push(m[1])
                // 方式2: img src
                if (allImgs.length === 0) {
                    var re2 = /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/g
                    while ((m = re2.exec(html)) !== null) push(m[1])
                }
                if (!allImgs.length) throw "no images"
                return {images: allImgs}
            })
        },

        // 图片加载配置：headers 与页面请求保持一致；
        // 若上游传来相对地址，这里改写成绝对地址 —— 下载流程同样走这个钩子，
        // 这是防 "relative URL without a base" 的最后一道闸。
        onImageLoad: (url, comicId, epId) => {
            var cfg = {headers: this.pageHeaders()}
            var fixed = this.abs(url)
            if (fixed && fixed !== url) cfg.url = fixed
            return cfg
        },

        onThumbnailLoad: (url) => {
            var cfg = {headers: this.pageHeaders()}
            var fixed = this.abs(url)
            if (fixed && fixed !== url) cfg.url = fixed
            return cfg
        }
    }

    settings = {}
}
