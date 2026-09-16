/** @type {import('../../venera-configs/_venera_.js')} */

class HentaiCosplay extends ComicSource {
    name = "Hentai Cosplay"
    key = "hentaicosplay"
    version = "1.3.2"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/HentaiCosplay.js"
    base = "https://hentai-cosplay-xxx.com"

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

    // 解析列表页（只取主结果区，即第一个 #image-list，避开页面下方混入的推荐区）
    parseList(html) {
        var c = []
        var doc = new HtmlDocument(html)
        var list = doc.querySelector("#image-list")
        var items = list ? list.querySelectorAll(".image-list-item") : []
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

    // ============ 分类（标签，按类别分组） ============
    category = {
        title: "Hentai Cosplay",
        parts: [
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
                categoryParams: ["rezero", "nier-automata", "sono-bisque-doll-wa-koi-o-suru-my-dress-up-darling", "spy-x-family", "doa", "chainsaw-man", "kimetsu-no-yaiba", "neon-genesis-evangelion", "bocchi-the-rock", "overlord"],
            },
            {
                name: "Cosplay Freestyle",
                type: "fixed",
                itemType: "category",
                categories: ["Maid", "Schoolgirl Uniform", "ELF", "Nun", "Nurse", "Miko", "Cheongsam", "Hololive", "Devil", "Kimono", "Bunny Girl", "Hatsune Miku"],
                categoryParams: ["maid", "schoolgirl-uniform", "elf", "nun", "nurse", "miko", "cheongsam", "hololive", "devil", "kimono", "bunny-girl", "miku-hatsune"],
            },
            {
                name: "Best Cosplayer",
                type: "fixed",
                itemType: "category",
                categories: ["Machi Maji", "chuchu", "Tiny Asa", "水淼Aqua", "Byoru", "Umeko J", "Minami", "Rioko", "Tokar 浵卡", "Bangni 邦尼", "Arty Huang", "PoppaChan", "Nekokoyoshi", "Meenfox", "Hoshilily"],
                categoryParams: ["machi-maji", "chuchu", "tiny-asa", "aqua", "byoru", "umeko-j", "minami", "rioko", "tokar", "bangni-kuni", "arty-huang", "poppachan", "nekokoyoshi", "meenfox", "hoshilily"],
            },
            {
                name: "Others",
                type: "fixed",
                itemType: "category",
                categories: ["JKF", "萝莉", "Korean", "Japanese", "黑丝", "白丝", "丝袜", "JK", "泳装"],
                categoryParams: ["jkf", "luo-li", "korean", "japanese", "black-", "white-", "-", "jk", "water"],
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
                return {
                    title: title || id,
                    cover: cover,
                    tags: {},
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
    }
}
