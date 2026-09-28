/** @type {import('../../venera-configs/_venera_.js')} */

const LOGIN_STATE = { loggedIn: null }

class V2PH extends ComicSource {
    name = "V2PH"
    key = "v2ph"
    version = "1.2.0"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/v2ph.js"

    base = "https://www.v2ph.com"

    // 列表页固定 16 条一页，分页参数 ?page=N
    perPage = 16

    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

    // 站点 favicon.ico 是 404，页面里引用的是这个 svg，实测可用
    SITE_ICON = "https://www.v2ph.com/img/favicon.svg"

    TTL_LIST = 600000     // 列表 / 搜索：10 分钟
    TTL_DETAIL = 1800000  // 详情：30 分钟

    init() {
        this.base = String(this.base || "").replace(/\/+$/, "")
        this._boot()
    }

    _boot() {
        if (!this._inflight) this._inflight = {}
        if (!this._chain) this._chain = Promise.resolve()
        if (!this._minInterval) this._minInterval = 1000
        if (!this._lastReq) this._lastReq = 0
    }

    // ==================== 基础工具 ====================

    headers(extra) {
        let h = {
            "User-Agent": this.ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": this.base + "/",
        }
        if (extra) {
            for (let k in extra) h[k] = extra[k]
        }
        return h
    }

    /** 图片专用请求头：CDN 只认 Referer，Accept 换成图片类型更稳 */
    imageHeaders() {
        return {
            "User-Agent": this.ua,
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Referer": this.base + "/",
        }
    }

    sleep(ms) {
        return new Promise(function (r) { setTimeout(r, ms) })
    }

    /**
     * 只做 trim + 协议补齐，绝不猜相对路径去拼 base —— 本地下载的漫画会把
     * cover.webp / file:///... 送进来，必须原样透传，否则 app 的本地封面识别会断。
     */
    abs(u) {
        if (!u) return ""
        let s = String(u).trim()
        if (!s) return ""
        if (s.indexOf("//") === 0) s = "https:" + s
        return s
    }

    unescape(s) {
        return String(s == null ? "" : s)
            .replace(/&nbsp;/g, " ")
            .replace(/&quot;/g, '"')
            .replace(/&#0?39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/\s+/g, " ")
            .trim()
    }

    /** `/album/xxx.html` -> `album/xxx.html`；非图集链接返回空串 */
    idFromHref(href) {
        let s = String(href || "").trim()
        if (!s) return ""
        s = s.replace(/^https?:\/\/[^/]+/i, "")
        s = s.split("#")[0].split("?")[0]
        s = s.replace(/^\/+/, "").replace(/\/+$/, "")
        if (s.indexOf("album/") !== 0) return ""
        return s
    }

    listUrl(path, page) {
        let p = page || 1
        let u = this.base + path
        if (p <= 1) return u
        return u + (path.indexOf("?") >= 0 ? "&" : "?") + "page=" + p
    }

    detailUrl(id, page) {
        let u = this.base + "/" + String(id || "").replace(/^\/+/, "")
        let p = page || 1
        return p > 1 ? u + "?page=" + p : u
    }

    // ==================== 网络：限流 + 去重 + 缓存 + 退避 ====================

    /** 全局闸门，所有非图片请求串行且间隔 >= 1s，压住站点风控 */
    async throttle() {
        this._boot()
        let self = this
        let release
        let gate = new Promise(function (r) { release = r })
        let prev = self._chain
        self._chain = gate
        await prev
        try {
            let wait = (self._lastReq || 0) + self._minInterval - Date.now()
            if (wait > 0) await self.sleep(wait)
            self._lastReq = Date.now()
        } finally {
            release()
        }
    }

    _cacheGet(url, ttl) {
        try {
            let raw = this.loadData("c:" + url)
            if (!raw) return null
            let o = JSON.parse(raw)
            if (o && o.b && o.t && (Date.now() - o.t) < (o.ttl || ttl || this.TTL_LIST)) return o.b
        } catch (e) { }
        return null
    }

    /** 缓存写入一律 try/catch —— saveData 抛错不能拖垮整个详情页 */
    _cachePut(url, body, ttl) {
        try {
            this.saveData("c:" + url, JSON.stringify({
                t: Date.now(),
                ttl: ttl || this.TTL_LIST,
                b: body,
            }))
        } catch (e) { }
    }

    isChallenge(body) {
        let s = String(body || "")
        return s.indexOf("Just a moment") >= 0
            || s.indexOf("__cf_chl") >= 0
            || s.indexOf("cf-challenge") >= 0
    }

    /** 详情页 2 页起的登录墙 */
    isRestricted(body) {
        return String(body || "").indexOf("restricted-login-page") >= 0
    }

    async fetchPage(url, ttl, noCache) {
        this._boot()
        let t = ttl || this.TTL_LIST

        if (!noCache) {
            let hit = this._cacheGet(url, t)
            if (hit) return hit
        }
        // 同一 URL 在途请求复用（并发去重）
        if (this._inflight[url]) return this._inflight[url]

        let self = this
        let task = (async function () {
            let last = ""
            for (let i = 0; i < 3; i++) {
                try {
                    await self.throttle()
                    let res = await Network.get(url, self.headers())
                    let body = (res && res.body) ? res.body : ""
                    if (res && res.status === 404) throw "404 Not Found: " + url
                    if (body.length > 512 && !self.isChallenge(body)) {
                        // 登录墙的页面绝不入缓存，否则登录后仍读到旧墙
                        if (!self.isRestricted(body) && !noCache) self._cachePut(url, body, t)
                        return body
                    }
                    last = "status=" + (res ? res.status : "?") + " len=" + body.length
                } catch (e) {
                    let m = String(e && e.message ? e.message : e)
                    if (m.indexOf("404") >= 0) throw m
                    last = m
                }
                if (i < 2) await self.sleep(700 * (i + 1))
            }
            throw "请求失败：" + url + " (" + last + ")"
        })()

        this._inflight[url] = task
        try {
            return await task
        } finally {
            delete this._inflight[url]
        }
    }

    // ==================== 解析 ====================

    /**
     * 分页器里的最大页码（总页数）。
     * 限定在含 pagination 的 <nav> 块内，避开正文里零散的 page= 参数；
     * 列表页与详情页共用同一套分页器，所以一个函数就够。
     */
    paginationMax(html) {
        let s = String(html || "")
        let re = /<nav[^>]*>[\s\S]*?<\/nav>/g
        let max = 0
        let m
        while ((m = re.exec(s)) !== null) {
            let blk = m[0]
            if (blk.indexOf("pagination") < 0) continue
            let r2 = /[?&]page=(\d+)/g
            let m2
            while ((m2 = r2.exec(blk)) !== null) {
                let v = parseInt(m2[1], 10)
                if (v > max) max = v
            }
        }
        return max
    }

    /**
     * 读 <dt>/<dd> 键值对。列表卡片和详情页信息块用的是同一套 markup
     * （Photos / Model / Tags / Vendor），所以两边共用一个函数。
     */
    readMeta(root) {
        let out = { photos: 0, model: "", vendor: "", tags: [] }
        let dls = root.querySelectorAll("dl")
        for (let i = 0; i < dls.length; i++) {
            let dts = dls[i].querySelectorAll("dt")
            let dds = dls[i].querySelectorAll("dd")
            for (let j = 0; j < dts.length && j < dds.length; j++) {
                let label = this.unescape(dts[j].text).toLowerCase()
                let dd = dds[j]
                if (label.indexOf("photos") >= 0) {
                    let n = parseInt(this.unescape(dd.text).replace(/[^\d]/g, ""), 10)
                    if (n > 0) out.photos = n
                } else if (label.indexOf("model") >= 0) {
                    out.model = this.unescape(dd.text)
                } else if (label.indexOf("vendor") >= 0 || label.indexOf("studio") >= 0) {
                    out.vendor = this.unescape(dd.text)
                } else if (label.indexOf("tag") >= 0) {
                    let as = dd.querySelectorAll("a")
                    if (as.length) {
                        for (let k = 0; k < as.length; k++) {
                            let t = this.unescape(as[k].text)
                            if (t) out.tags.push(t)
                        }
                    } else {
                        let t = this.unescape(dd.text)
                        if (t) out.tags.push(t)
                    }
                }
            }
        }
        return out
    }

    /** 解析 `.albums-list` 里的图集卡片（分类 / 地区 / 机构 / 模特 / 搜索 / 首页 通用） */
    parseList(html) {
        let comics = []
        let d = new HtmlDocument(html)
        try {
            let cards = d.querySelectorAll(".albums-list .card")
            for (let i = 0; i < cards.length; i++) {
                let card = cards[i]
                let a = card.querySelector("a.media-cover[href]") || card.querySelector("h6 a[href]")
                if (!a) continue
                let id = this.idFromHref(a.attributes["href"])
                if (!id) continue

                let img = card.querySelector("img.card-img-top")
                let tEl = card.querySelector("h6 a") || a
                let title = this.unescape(tEl.text) || this.unescape(img && img.attributes["alt"]) || id

                let badge = card.querySelector(".album-photos .badge")
                let badgeText = this.unescape(badge && badge.text)

                let meta = this.readMeta(card)

                // Comic.tags 必须是扁平的 List<String>（Comic.fromJson 走
                // List<String>.from），给成对象整页白屏；ComicDetails.tags 才用 Map。
                let tags = []
                if (meta.vendor) tags.push(meta.vendor)
                if (meta.model) tags.push(meta.model)
                for (let j = 0; j < meta.tags.length; j++) tags.push(meta.tags[j])

                let sub = []
                if (meta.model) sub.push(meta.model)
                else if (meta.vendor) sub.push(meta.vendor)
                if (badgeText) sub.push(badgeText)

                comics.push(new Comic({
                    id: id,
                    title: title,
                    subTitle: sub.join(" · "),
                    cover: this.abs(img && img.attributes["src"]) || this.SITE_ICON,
                    tags: tags,
                }))
            }
        } finally {
            d.dispose()
        }
        return comics
    }

    async fetchList(path, page) {
        let html = await this.fetchPage(this.listUrl(path, page), this.TTL_LIST)
        let max = this.paginationMax(html)
        return { comics: this.parseList(html), maxPage: max > 0 ? max : 1 }
    }

    /** 只取列表页里的图集 id，不构造 Comic（验证 cookie 时用） */
    listAlbumIds(html) {
        let out = []
        let d = new HtmlDocument(html)
        try {
            let as = d.querySelectorAll(".albums-list a.media-cover[href]")
            for (let i = 0; i < as.length; i++) {
                let id = this.idFromHref(as[i].attributes["href"])
                if (id) out.push(id)
            }
        } finally {
            d.dispose()
        }
        return out
    }

    /**
     * 判断当前 cookie 到底是不是登录态。
     * 站点没有「必须登录」的稳定页面（/user、/favorites、/account 之类全是 404），
     * 只能拿一本真实存在、且确实分页的图集，看它第 2 页是登录墙还是真图。
     * 首页第一本通常就是多页图集；万一碰上单页的，往下多试几本。
     */
    async probeLoggedIn() {
        let home = await this.fetchPage(this.base + "/", this.TTL_LIST)
        let ids = this.listAlbumIds(home).slice(0, 6)
        for (let i = 0; i < ids.length; i++) {
            try {
                let p1 = await this.fetchPage(this.detailUrl(ids[i], 1), 60000)
                if (this.paginationMax(p1) <= 1) continue
                let p2 = await this.fetchPage(this.detailUrl(ids[i], 2), 60000, true)
                return !this.isRestricted(p2)
            } catch (e) { }
        }
        return false
    }

    /** 详情页正文图片：限定 `.photos-list` 内，避开相关推荐的 card-img-top */
    albumImages(html) {
        let out = []
        let seen = {}
        let d = new HtmlDocument(html)
        try {
            let box = d.querySelector(".photos-list")
            let imgs = box ? box.querySelectorAll("img.album-photo")
                : d.querySelectorAll("img.album-photo")
            for (let i = 0; i < imgs.length; i++) {
                let src = this.abs(imgs[i].attributes["src"] || imgs[i].attributes["data-src"])
                if (!src || !/^https?:/i.test(src)) continue
                if (seen[src]) continue
                seen[src] = true
                out.push(src)
            }
        } finally {
            d.dispose()
        }
        return out
    }

    parseDetail(html, id) {
        let s = String(html || "")
        let title = ""
        let cover = ""
        let model = ""
        let tagNames = []
        let photoCount = 0
        let totalPages = 1

        let mo = s.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        if (mo) cover = this.abs(mo[1])

        let d = new HtmlDocument(html)
        try {
            let h1 = d.querySelector("main h1") || d.querySelector("h1")
            if (h1) title = this.unescape(h1.text)
            // 登录墙页面标题会带 " - Page N" 尾巴
            title = title.replace(/\s*-\s*Page\s+\d+\s*$/i, "").trim()

            // 只读图集自身的信息块（h1 所在的 .card-body）。
            // 绝不能扫整个 <main>：页面下半部是相关推荐卡片，每张卡也带自己的
            // Vendor/Model/Tags <dl>，一锅端会把别人的模特名和标签混进来
            // （实测会把 Model 覆盖成推荐里的 "Yang Yi"，标签从 1 个变 16 个）。
            let scope = (h1 && h1.parent) ? h1.parent : (d.querySelector("main") || d)
            let meta = this.readMeta(scope)
            model = meta.model
            photoCount = meta.photos

            // 去重保序
            let seenTag = {}
            for (let i = 0; i < meta.tags.length; i++) {
                let t = meta.tags[i]
                if (!t || seenTag[t]) continue
                seenTag[t] = true
                tagNames.push(t)
            }
        } finally {
            d.dispose()
        }

        totalPages = this.paginationMax(html)
        if (totalPages < 1) totalPages = 1

        // 标题兜底：<title> 去掉 " - V2PH"
        if (!title) {
            let mt = s.match(/<title>([\s\S]*?)<\/title>/i)
            if (mt) title = this.unescape(mt[1]).replace(/\s*-\s*V2PH\s*$/i, "")
        }

        return {
            title: title || id,
            cover: cover,
            model: model,
            tagNames: tagNames,
            photoCount: photoCount,
            totalPages: totalPages,
        }
    }

    // ==================== 发现页 ====================

    /**
     * 首页 (/) 有三段：Featured Albums / Latest Update / Hot Models。
     * 前两段是图集列表，按 <section aria-labelledby="..."> 切片取；
     * Hot Models 是模特卡片不是图集，跳过（模特已单独做成分类分组）。
     * 首页本身不分页，所以 maxPage 固定 1。
     */
    async fetchHome(kind, page) {
        if ((page || 1) > 1) return { comics: [], maxPage: 1 }
        let html = await this.fetchPage(this.base + "/", this.TTL_LIST)
        let s = String(html)
        let marks = {
            featured: ['aria-labelledby="featured-albums-title"', 'aria-labelledby="latest-albums-title"'],
            latest: ['aria-labelledby="latest-albums-title"', 'aria-labelledby="hot-models-title"'],
        }
        let mk = marks[kind]
        if (!mk) return { comics: [], maxPage: 1 }
        let i0 = s.indexOf(mk[0])
        if (i0 < 0) return { comics: [], maxPage: 1 }
        let i1 = s.indexOf(mk[1], i0 + 1)
        let seg = i1 > i0 ? s.slice(i0, i1) : s.slice(i0)
        return { comics: this.parseList(seg), maxPage: 1 }
    }

    explore = [
        {
            title: "V2PH-精选",
            type: "multiPageComicList",
            load: (page) => this.fetchHome("featured", page),
        },
        {
            title: "V2PH-最新更新",
            type: "multiPageComicList",
            load: (page) => this.fetchHome("latest", page),
        },
    ]

    // ==================== 分类（四个 tag 分区） ====================

    category = {
        title: "V2PH",
        parts: [
            {
                name: "热门标签",
                type: "fixed",
                itemType: "category",
                categories: [
                    "sexy", "Goddess", "Short hair", "Pure",
                    "Lingerie", "Magazine", "Sexy Models", "Legs",
                    "Japanese", "Quality", "Outdoor", "Bikini",
                ],
                categoryParams: [
                    "category/sexy-girls", "category/nvshen", "category/short-hair", "category/pure",
                    "category/underwear-beauty", "category/magazine", "category/glamour-models", "category/beautiful-legs",
                    "category/japanese-girls", "category/best-quality", "category/outside", "category/bikini-girls",
                ],
            },
            {
                name: "地区",
                type: "fixed",
                itemType: "category",
                categories: [
                    "China", "Japan", "Korea", "Taiwan",
                    "Thailand", "Europe and America",
                ],
                categoryParams: [
                    "country/china", "country/japan", "country/south-korea", "country/taiwan",
                    "country/thailand", "country/europe",
                ],
            },
            {
                name: "机构",
                type: "fixed",
                itemType: "category",
        categories: [
                    "Online beauties", "Yituyu", "XIUREN", "Street Snap", "Ugirls Aiyouwu",
                    "Minisuka.tv", "IESS", "Wulian Media", "LovePop", "Beautyleg", "LIGUI",
                    "Mojing street snap", "Digi-Gra", "MussGirl", "DGC", "PANS", "XIAOYU", "YOUMI",
                    "Tuwan Photo Film", "RQ-STAR", "YALAYI", "Graphis", "KELAGIRLS", "Girlz-High",
                    "FRIDAY", "The Black Alley", "IMiss", "CosPlay", "Toutiao Nushen", "Wabobo",
                    "Weekly Playboy", "OnlyTease", "Taiwan beauties", "HuaYang", "Cosdoki",
                    "MyGirl", "YS Web", "MFStar Model Academy", "SiMu", "Bomb.TV", "glamour",
                    "Weekly Young Jump", "YouMiabc", "Miaotang", "NS Eyes", "SSA", "WPB", "FRIDAY",
                    "Young Magazine", "TGOD", "Ugirls", "LEEHEE", "Image.tv",
                    "Weekly Big Comic Spirits magazine photo", "FLASH", "XINGYAN", "GeorgeModels",
                    "IMZSOCK", "Waxiaomiao", "FEILIN", "SIEE", "ARTGRAVIA", "@misty", "4K-STAR",
                    "DJAWA", "Sabra", "PB", "MiStar", "Bejean On Line", "Young Champion", "ISHOW",
                    "Bimilstory", "Chuxia Goddess", "PartyCat", "Young Animal",
                    "Teen Starlet Euro", "Dasheng Mopai", "SiHua", "ShowTimeDancer",
                    "Senluo Caituan", "Fengzhi Lingyu", "Street Snap Silk Feet",
                    "Nash Photography", "BoLoli", "PURE MEDIA", "X-City", "Guotuan",
                    "Young Gangan", "Xuemei Jiasupao", "Qimeng Photography", "PDL",
                    "Hello! Project Digital Books", "YJ PHOTO BOOK", "3A", "Tianyu Photography",
                    "BlueCake", "Daxigua Ai Yagao", "LSS", "Ziyou Photography", "Yuming Media",
                    "MSLASS", "YouWu", "Loozy", "For-side", "Shenshi Yuepai", "Wanibooks",
                    "Zhanqian Nvshen", "Youmiss", "Xiangyou", "Pary Student Model Shooting",
                    "MiiTao", "Naisi", "LD", "BWH", "Imuto.tv", "Weekly SPA!", "Espacia",
                    "Juicy Honey", "SAINT Photolife", "Zhaijiyue", "Moon Night Snap", "Yaojingshe",
                    "AISS", "Qingdouke", "Wudaosheng Diary", "Yunulang", "IESS",
                    "Zhimeng Xingying", "Taiwan Limerence", "TuiGirl", "Bamboo e-Book", "YouMei",
                    "SIW", "LISS", "FetiArt", "RUISG", "Wanghongguan", "Shukan Taishu",
                    "Wuji Photo Studio", "SUNGIRL", "Wase", "Young Animal Arashi", "Mifu Girl",
                    "Sanhe Photography", "HuaYan", "Shaonvzhixu", "VYJ", "SJA", "Zhimeng Imaging",
                    "Mojing Travel Photography", "MISSLEG", "ISS", "Zuiai Fanbuxie", "UXING",
                    "Princess Collection", "Manga Action", "Jianxin Photography",
                    "Sexy Asian Girls Feet", "blt graph.", "Jinjiqihua", "Qingning Film",
                    "Qinglan", "STRiKE!", "Wunder", "Shukan Jitsuwa", "Ai Yuexia", "LeYuan",
                    "HIGH FANTASY", "Schoolgirl Short Socks Beautiful Feet", "Xiaozhong Shijue",
                    "Wosi Nixiang", "Tang Yun Photography", "3AGiRL", "Ecolog Ultimate",
                    "Amazing Models", "Tukmo", "Legbaby", "TASTE", "Creamsoda", "Solexight",
                    "Yiwen", "Nanguo Foot Art", "DDY Pantyhose", "Yuzu Photography", "Kimoe",
                    "Digital Shupure", "WingS", "Yanmaga", "V Girl", "72 Si", "SLADY",
                    "Tamen Yinxiang", "Korean Realgraphic", "FTOOW", "51MODO", "GJ PHOTO BOOK",
                    "IdolLine", "Yuexia Photography", "MintYe", "MTMENG", "iLogos", "Moecco",
                    "Fashion Land", "Gravure Gakuen",
                ],
                categoryParams: [
                    "company/online-girls", "company/YITUYU", "company/XIUREN", "company/JPXZ", "company/Ugirls-Aiyouwu", "company/minisuka-tv",
                    "company/IESS", "company/WLCM", "company/LovePop", "company/Beautyleg", "company/LIGUI", "company/MOJING", "company/Digi-Gra",
                    "company/MussGirl", "company/DGC", "company/PANS", "company/XIAOYU", "company/YOUMI", "company/TWYH", "company/RQ-STAR", "company/YALAYI",
                    "company/Graphis", "company/kelagirls", "company/Girlz-High", "company/firday-photo-book", "company/the-black-alley",
                    "company/IMiss", "company/cosplay", "company/toutiao-god", "company/BoBoSocks", "company/weekly-playboy", "company/Only-Tease",
                    "company/taiwan", "company/huayang", "company/Cosdoki", "company/MyGirl", "company/YS-Web", "company/MFStar", "company/SiMu",
                    "company/Bomb-TV", "company/glamour", "company/weekly-young-jump", "company/YouMiabc", "company/mtcos_net", "company/NS-Eyes",
                    "company/SSA", "company/wpb-net", "company/friday", "company/Young-Magazine", "company/TGOD", "company/Ugirls", "company/LEEHEE",
                    "company/image-tv", "company/weekly-big-comic-spirits", "company/flash", "company/xingyan", "company/GeorgeModels",
                    "company/IMZSOCK", "company/kittyWawa", "company/FEILIN", "company/siee", "company/ARTGRAVIA", "company/misty", "company/4k-star",
                    "company/DJAWA", "company/Sabra", "company/photo-book", "company/MiStar", "company/bejean-online", "company/Young-Champion",
                    "company/ISHOW", "company/Bimilstory", "company/CXNS", "company/PartyCat", "company/young-animal", "company/TeenStarletEuro",
                    "company/dsmopai", "company/SiHua", "company/show-time-dancer", "company/loveplus", "company/wind-land", "company/JPSZ",
                    "company/NaSiSheYing", "company/BoLoli", "company/PURE", "company/x-city", "company/girlt", "company/Young-Gangan", "company/XM",
                    "company/QMSY", "company/PDL", "company/hello-pdb", "company/yj-photo-book", "company/3AJP", "company/TYSY", "company/BlueCake",
                    "company/DXGAYG", "company/LSS", "company/ZYSY", "company/YMCM", "company/MSLASS", "company/YouWu", "company/Loozy", "company/for-side", "company/SS",
                    "company/Wanibooks", "company/ZQNS", "company/YOUMISI", "company/XIANGYOU", "company/Pary", "company/MiiTao", "company/NICE", "company/LD",
                    "company/bwh", "company/imuto-tv", "company/Weekly-SPA", "company/Espacia", "company/juicy-honey", "company/SAINT-Photolife",
                    "company/WordGirls", "company/Moon-Night-Snap", "company/Fairy-Club", "company/aiss", "company/qingdouke",
                    "company/dancers-journal", "company/DK-Girl", "company/One-thousand-nights", "company/ZMXY", "company/Limerence",
                    "company/TuiGirl", "company/bamboo-e-book", "company/youmei", "company/SIW", "company/GIRLISS", "company/FetiArt", "company/ruisg",
                    "company/candy", "company/Weekly-Taishu", "company/WJ", "company/sungirl", "company/WaSe", "company/young-animal-arashi",
                    "company/MFSN", "company/SHSY", "company/huayan", "company/SNCX", "company/vyj", "company/SJA", "company/ZMYX", "company/MJLP", "company/missleg",
                    "company/ISS", "company/ZAFBX", "company/UXING", "company/princess-collection", "company/Manga-Action", "company/JXSY", "company/SAGF",
                    "company/blt-graph", "company/JJQH", "company/QNYH", "company/Qing-Lan-Ying-Hua", "company/STRiKE",
                    "company/Wunder-Publishing-House", "company/Shukan-Jitsuwa", "company/YAX", "company/LeYuan", "company/HIGH-FANTASY",
                    "company/XMMJ", "company/SZSJ", "company/BS", "company/TY", "company/3AGiRL", "company/Ecolog", "company/Amazing-Models", "company/Tukmo",
                    "company/legbaby", "company/TASTE", "company/Creamsoda", "company/Solexight", "company/YW", "company/NGZY", "company/ddy-pantyhose",
                    "company/YZSY", "company/kimoe", "company/gravure-japan", "company/WingS", "company/Yanmaga", "company/VGIRLS", "company/72SI",
                    "company/slday", "company/TMYX", "company/Korean-Realgraphic", "company/FTOOW", "company/51MODO", "company/GJ", "company/idolline",
                    "company/YXSY", "company/mintye", "company/mtmeng", "company/ilogos", "company/Moecco", "company/fashion-land",
                    "company/gravure-gakue",
                ],
            },
            {
                name: "模特",
                type: "fixed",
                itemType: "category",
                categories: [
                    "Byoru", "Anonymous", "Yang Chenchen", "Caviar Fish",
                    "Wang Yuchun", "Zhou Yuxi", "Kaizhu", "Anju Kouzuki",
                    "Chun Momo", "Wang Xinyao", "Lu Xuanxuan", "Karisha Terebun",
                    "Tang Anqi", "Xingzhi Chichi", "Wan Ping", "Alina Becker",
                    "Meng Xinyue", "Zhu Keer", "Shuimiao aqua", "Xiao Tiandou",
                    "An Ran Maleah", "Xiao Jie", "Asami Kondo", "Da Ji _Toxic",
                    "Douniang Lishi", "Hina Kikuchi", "ElyEE Zi", "Ri Naijiao",
                    "Yao Yikoutuniang", "Baiyin 81", "Yingtaomiao", "Aju",
                    "Egg_ You Nisi", "Meizi", "Song Guoer", "Shen Lebanzhendong",
                    "Qi Li Jia", "Qiuqiu", "Tuan Tuan", "Zhi Zhi Booty",
                ],
                categoryParams: [
                    "actor/Byoru", "actor/CHINA-UNKOWN", "actor/Yang-Chenchen", "actor/8689xa7m",
                    "actor/Wang-Yuchun", "actor/Zhou-Yuxi", "actor/Kai-Zu", "actor/Anju-Kouzuki",
                    "actor/chunmomo0127", "actor/Wang-Xinyao", "actor/Lu-Xuanxuan", "actor/Karisha-Terebun",
                    "actor/nmxx899m", "actor/XingZhiChiChi", "actor/amn7zx46", "actor/Alina-Becker",
                    "actor/Meng-Xinyue", "actor/Barbie", "actor/shuimiaoaqua", "actor/7me3a5am",
                    "actor/Maleah", "actor/96a535o6", "actor/Asami-Kondou", "actor/Daji-Toxic",
                    "actor/DNlishi", "actor/Hina-Kikuchi", "actor/nmx9x5z6", "actor/naijiaojiao",
                    "actor/nmz98o76", "actor/silver81", "actor/Ying-Tao-Miao", "actor/A-Zhu",
                    "actor/Egg_YouNiSi", "actor/7me95onm", "actor/Song-Guoer", "actor/ShenLeBan-ZhenDong",
                    "actor/Qi-Lijia", "actor/nm58ex76", "actor/ZhangYueGOD", "actor/Zhizhi-Booty",
                ],
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: (category, param, options, page) => {
            if (!param) return Promise.resolve({ comics: [], maxPage: 1 })
            let segs = String(param).replace(/^\/+/, "").split("/")
            let path = "/" + segs.map(function (s) {
                return encodeURIComponent(s)
            }).join("/")
            return this.fetchList(path, page)
        },
    }

    // ==================== 搜索 ====================

    search = {
        load: (keyword, options, page) => {
            let kw = String(keyword || "").trim()
            if (!kw) return Promise.resolve({ comics: [], maxPage: 1 })
            let p = page || 1
            let path = "/search/?q=" + encodeURIComponent(kw)
            if (p > 1) path += "&page=" + p
            return this.fetchList(path, 1)
        },
        optionList: [],
    }

    // ==================== 详情 / 章节 ====================

    comic = {
        loadInfo: async (id) => {
            let html = await this.fetchPage(this.detailUrl(id, 1), this.TTL_DETAIL)
            let info = this.parseDetail(html, id)

            // 第 1 页永远不是登录墙，判断不出登录态；整本只有 1 页的图集也根本不受限。
            // 所以只在「这本确实分页」且「本会话还不知道登录态」时探一次第 2 页，
            // 结果记进 LOGIN_STATE，之后开别的图集就不再重复请求。
            if (info.totalPages > 1 && LOGIN_STATE.loggedIn === null) {
                try {
                    let p2 = await this.fetchPage(this.detailUrl(id, 2), this.TTL_DETAIL)
                    LOGIN_STATE.loggedIn = !this.isRestricted(p2)
                } catch (e) { }
            }
            let previewOnly = info.totalPages > 1 && LOGIN_STATE.loggedIn !== true

            let tags = {}
            if (info.model) tags["模特"] = [info.model]
            if (info.tagNames.length) tags["标签"] = info.tagNames

            let chapter = info.photoCount > 0
                ? info.photoCount + " 张图片"
                : "全部图片"
            if (previewOnly) chapter += " · 预览 10 张"

            let desc = []
            if (info.photoCount > 0) desc.push("共 " + info.photoCount + " 张高清图片")
            if (info.model) desc.push("模特：" + info.model)
            if (info.tagNames.length) desc.push("标签：" + info.tagNames.join("、"))
            if (previewOnly) {
                desc.push("")
                desc.push("未登录只能看前 10 张预览，整本需要登录 v2ph 账号。")
                desc.push("登录：源设置 → 账号 → Login with webview，在弹出页面里登录一次即可。")
                desc.push("站点带 Cloudflare 人机验证，只能在网页里过，登录后 cookie 会自动保存。")
            }

            return new ComicDetails({
                title: info.title,
                cover: info.cover || this.SITE_ICON,
                tags: tags,
                description: desc.join("\n").split("|").join("/"),
                chapters: { "0": chapter },
                url: this.detailUrl(id, 1),
                maxPage: info.totalPages,
            })
        },

        loadEp: async (comicId, epId) => {
            let self = this
            let first = await self.fetchPage(self.detailUrl(comicId, 1), self.TTL_DETAIL)
            let images = self.albumImages(first)
            let total = self.paginationMax(first)

            if (total > 1) {
                // 先探第 2 页：没登录会拿到登录墙，直接停在预览，不白跑后面 N 个请求
                let second = await self.fetchPage(self.detailUrl(comicId, 2), self.TTL_DETAIL)
                let loggedIn = !self.isRestricted(second)
                LOGIN_STATE.loggedIn = loggedIn
                if (loggedIn) {
                    let extra = self.albumImages(second)
                    for (let i = 0; i < extra.length; i++) images.push(extra[i])

                    let rest = []
                    for (let p = 3; p <= total; p++) rest.push(p)
                    // 小批并发，单页失败只丢那一页，不要整本翻车
                    for (let i = 0; i < rest.length; i += 4) {
                        let batch = rest.slice(i, i + 4)
                        let htmls = await Promise.all(batch.map(function (p) {
                            return self.fetchPage(self.detailUrl(comicId, p), self.TTL_DETAIL)
                                .catch(function () { return "" })
                        }))
                        for (let j = 0; j < htmls.length; j++) {
                            if (!htmls[j]) continue
                            let part = self.albumImages(htmls[j])
                            for (let k = 0; k < part.length; k++) images.push(part[k])
                        }
                    }
                }
            }

            // 去重（分页抖动时前后页可能重叠）
            let out = []
            let seen = {}
            for (let i = 0; i < images.length; i++) {
                if (seen[images[i]]) continue
                seen[images[i]] = true
                out.push(images[i])
            }
            if (!out.length) throw "未解析到图片"
            return { images: out }
        },

        /**
         * cdn.v2ph.com 实测有防盗链：无 Referer 403，带 https://www.v2ph.com/ 才 200。
         *
         * 只对**真正的网络地址**补规范 + 挂降级链；本地封面（"cover.webp"）和本地文件
         * （"file:///data/..."）必须原样透传，不能覆盖 url —— 覆盖会打断 app 对
         * 「这是已下载到本地的封面」的识别，症状是「离线图包能看，进详情页封面却加载失败」。
         */
        onImageLoad: (url, comicId, epId) => {
            let u = this.abs(url)
            let cfg = { headers: this.imageHeaders() }
            if (/^https?:\/\//i.test(u)) {
                cfg.url = u
                cfg.onLoadFailed = () => this.imageRetryLater(u)
            }
            return cfg
        },

        onThumbnailLoad: (url) => {
            let u = this.abs(url)
            let cfg = { headers: this.imageHeaders() }
            // 缩略图这条路 app 明确忽略 onLoadFailed（只支持 headers / url），别挂
            if (/^https?:\/\//i.test(u)) cfg.url = u
            return cfg
        },

        /**
         * 标签芯片点击 -> 跳到搜索。
         * 点模特名看她的全部图集，点标签看同类图集。
         */
        onClickTag: (namespace, tag) => {
            try {
                let t = String(tag || "").trim()
                if (t && t.length <= 60) {
                    return new PageJumpTarget({ page: "search", keyword: t })
                }
            } catch (e) { }
            return null
        },

        idMatch: "v2ph\\.com/album/([^/?#]+)",
    }

    // ==================== 图片失败降级（整章下载用） ====================

    // 按 URL 记同址重试次数，防止降级链无限递归
    imgRetry = {}

    /**
     * 图片加载失败的降级。
     *
     * 实测 cdn.v2ph.com **只有唯一一种地址**：`.jpg` / `.webp` / `_600x0.webp` 之类的变体
     * 全是 404，也没有备用图床域名 —— 没有「换个地址再试」的余地，只能同址重试。
     *
     * 为什么必须提供这个回调：app 的 ImageDownloader._loadComicImage 里写的是
     *     if (retryLimit < 0 || onLoadFailed == null) rethrow;
     * 源不给 onLoadFailed，任何一次瞬时失败（CF 抖动 / CDN 限流 / socket 被代理掐断）
     * 都会当场抛错 —— 整章下载里那一张就再也补不回来。给了之后 app 会重试最多 5 跳。
     *
     * ⚠️ 每一跳返回的 config 都必须继续带上 onLoadFailed，否则降级链在第一跳就断
     * （单测直接调函数能过，真实链路会断 —— 这个坑在 jjcos 上踩过）。
     */
    imageFallback(u) {
        if (!u || !/^https?:\/\//i.test(u)) return null    // 本地路径不参与降级
        if (!this.imgRetry) this.imgRetry = {}
        let cnt = 0
        for (let k in this.imgRetry) cnt++
        if (cnt > 2000) this.imgRetry = {}                 // 防状态无限增长
        let n = this.imgRetry[u] || 0
        if (n >= 3) return null                            // 同址 3 次仍失败就收手，别再耗
        this.imgRetry[u] = n + 1
        return {
            url: u,
            headers: this.imageHeaders(),
            onLoadFailed: () => this.imageFallback(u),
        }
    }

    /**
     * 降级前先退避。app 的重试是紧接着来的，碰上 CDN 限流窗口会连撞几次；
     * 递增延迟让限流有机会冷却（app 侧会 await 这个 Promise，所以可以异步）。
     */
    async imageRetryLater(u) {
        let n = (this.imgRetry && this.imgRetry[u]) || 0
        if (n > 0) await this.sleep(500 * n)
        return this.imageFallback(u)
    }

    // ==================== 账号 ====================

    /**
     * 站点登录接口本身是通的：POST /login，字段 email / password / remember，无 CSRF。
     * 但**服务端强制校验 Cloudflare Turnstile**（sitekey 0x4AAAAAAAEbdlH2LtvLfbbB）：
     * 实测直接 POST 会回 "Invalid human-machine authentication"。
     * Turnstile token 只能在真实浏览器里签发，源里拿不到，所以这里**没有**实现
     * account.login(账号, 密码) —— 实现了也只会白报错。
     *
     * 两条能走通的路：
     *   1. loginWithWebview（推荐）：app 内嵌浏览器打开登录页，手动过验证。
     *      成功后 cookie 落进 app 的 SingleInstanceCookieJar，而 Network.get 用的是同一个 jar。
     *   2. loginWithCookies：在自己浏览器里登录好，把 frontend cookie 粘进来。
     */
    account = {
        loginWithWebview: {
            url: "https://www.v2ph.com/login",
            checkStatus: (url, title) => {
                let u = String(url || "").toLowerCase()
                let t = String(title || "")
                if (u.indexOf("/login") >= 0) return false
                if (u.indexOf("/signup") >= 0) return false
                if (u.indexOf("v2ph.com") < 0) return false
                if (t.indexOf("Login") >= 0 || t.indexOf("Sign Up") >= 0) return false
                return t.length > 0
            },
            onLoginSuccess: () => {
                LOGIN_STATE.loggedIn = true
            },
        },

        // 账号对话框里的 Register 按钮会直接打开这个地址
        registerWebsite: "https://www.v2ph.com/signup",

        /**
         * v2ph 的会话就存在 frontend 这一个 cookie 里（游客也会发一个），
         * 登录后服务端把用户绑到该会话上，所以粘 frontend 等于恢复登录态。
         * 验证方式：拿一本真实分页的图集，看它第 2 页是登录墙还是真图。
         */
        loginWithCookies: {
            fields: ["frontend"],
            validate: async (values) => {
                let v = values && values[0] ? String(values[0]).trim() : ""
                if (!v) return false
                try {
                    Network.setCookies("https://www.v2ph.com", [
                        new Cookie({ name: "frontend", value: v, domain: "www.v2ph.com" })
                    ])
                    let ok = await this.probeLoggedIn()
                    if (ok) LOGIN_STATE.loggedIn = true
                    return ok
                } catch (e) {
                    return false
                }
            },
        },
    }
}
