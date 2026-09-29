/** @type {import('../../venera-configs/_venera_.js')} */

class Kiutaku extends ComicSource {
    name = "Kiutaku"
    key = "kiutaku"
    version = "1.1.0"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/kiutaku.js"

    base = "https://kiutaku.com"

    // favicon.ico 在本站是 404，这个是活的。封面兜底链的最后一环 ——
    // 任何封面都绝不允许返回空串（空串会让详情页崩在 "relative URL without a base"）。
    SITE_ICON = "https://kiutaku.com/templates/xiuren/eggplant-icon.png"

    // 列表页每页 20 条，分页 `?start=N`；详情页每页 20 张图，分页 `?page=N`
    perPage = 20
    detailPerPage = 20

    // 「随机抽取」的池子 = **全部 tag**：`/tag/{id}` 的 id 从 1 连续到 2128，无空洞
    // （逐 id 探测确认，2129 起 404）。所以直接按编号区间抽，不用爬任何索引。
    // 站点新增 tag 后可把上限调大 —— 抽到不存在的号由 loadRandomTag 换号重抽兜底。
    tagPoolMin = 1
    tagPoolMax = 2128
    // 「随机抽取」当次抽中的 tag，翻页时沿用（不记住的话翻一页换一个 tag，没法看）
    randomTagPick = null

    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

    init() {
        this.base = String(this.base || "").replace(/\/+$/, "")
    }

    // ==================== 基础工具 ====================

    /** 页面请求头。注意：**图片请求绝不能带这个** —— 见 imageHeaders()。 */
    headers(extra) {
        let h = {
            "User-Agent": this.ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7",
            "Referer": this.base + "/",
        }
        if (extra) {
            for (let k in extra) h[k] = extra[k]
        }
        return h
    }

    /**
     * 图片请求头。**带 Referer: kiutaku.com 会被图床 mitaku.net 判 403**（实测：
     * 不给 Referer -> 200 image/jpeg，给 https://kiutaku.com/ -> 403 text/html）。
     * 所以图片一律只带 UA，绝不带 Referer。
     */
    imageHeaders() {
        return { "User-Agent": this.ua }
    }

    sleep(ms) {
        return new Promise(function (r) { setTimeout(r, ms) })
    }

    /**
     * 只做 trim + 协议补齐。绝不猜相对路径去拼 base —— 本地漫画送进来的
     * `cover.webp` / `file:///...` 必须原样透传，否则 app 的本地封面识别会断。
     */
    abs(u) {
        if (!u) return ""
        let s = String(u).trim()
        if (!s) return ""
        if (s.indexOf("//") === 0) s = "https:" + s
        return s
    }

    /** `/7325` -> `7325` */
    idFromHref(href) {
        let s = String(href || "").trim()
        if (!s) return ""
        s = s.replace(/^https?:\/\/[^/]+/i, "")
        s = s.split("#")[0].split("?")[0]
        s = s.replace(/^\/+/, "").replace(/\/+$/, "")
        if (!/^\d+$/.test(s)) return ""      // tag 链接、栏目链接都不是漫画
        return s
    }

    /** 列表页链接：`?start=` 步长 20 */
    listUrl(path, page) {
        let p = page || 1
        if (p <= 1) return this.base + path
        let sep = path.indexOf("?") >= 0 ? "&" : "?"
        return this.base + path + sep + "start=" + ((p - 1) * this.perPage)
    }

    /** 详情页链接：`?page=` 步长 1 */
    detailUrl(id, page) {
        let u = this.base + "/" + String(id).replace(/^\/+/, "")
        let p = page || 1
        return p > 1 ? u + "?page=" + p : u
    }

    // ==================== 网络 ====================

    async fetchPage(url, tries) {
        let n = tries || 3
        let last = ""
        for (let i = 0; i < n; i++) {
            try {
                let res = await Network.get(url, this.headers())
                if (res.status === 404) throw "404 Not Found: " + url
                let body = res.body || ""
                // 站点对保留字符会返回 200 + 空 body（静默失败），所以要验长度
                if (res.status === 200 && body.length > 512 && body.indexOf("Just a moment") < 0) {
                    return body
                }
                last = "status=" + res.status + " len=" + body.length
            } catch (e) {
                let msg = String(e && e.message ? e.message : e)
                if (msg.indexOf("404") >= 0) throw msg
                last = msg
            }
            if (i < n - 1) await this.sleep(600 * (i + 1))
        }
        throw "请求失败：" + url + " (" + last + ")"
    }

    // ==================== 解析 ====================

    /** 取出页面里所有 `<nav class="pagination">` 块，避免误抓正文里的 start= / page= */
    paginationNav(html) {
        let out = ""
        let re = /<nav class="pagination[\s\S]*?<\/nav>/g
        let m
        while ((m = re.exec(html)) !== null) out += m[0]
        return out
    }

    /**
     * 列表页总页数：从分页器的 `?start=` 最大值反推。
     * 注意搜索页的 href 会被转义成 `&amp;start=20`，所以不能要求前面是裸 `&`。
     */
    maxPageFromStart(html) {
        let nav = this.paginationNav(html)
        if (!nav) return 1
        let re = /start=(\d+)/g
        let max = 0
        let m
        while ((m = re.exec(nav)) !== null) {
            let v = parseInt(m[1], 10)
            if (v > max) max = v
        }
        return Math.max(1, Math.floor(max / this.perPage) + 1)
    }

    /**
     * 详情页总页数：分页器把**全部**页码都列出来（实测 7 页的相册列了 1..7），
     * 取 `?page=` 的最大值即可。没有分页器 = 单页。
     */
    detailPageCount(html) {
        let nav = this.paginationNav(html)
        if (!nav) return 1
        let re = /page=(\d+)/g
        let max = 0
        let m
        while ((m = re.exec(nav)) !== null) {
            let v = parseInt(m[1], 10)
            if (v > max) max = v
        }
        return Math.max(1, max)
    }

    /** 解析列表页的漫画卡片 */
    parseList(html) {
        let comics = []
        let d = new HtmlDocument(html)
        try {
            let rows = d.querySelectorAll(".items-row")
            for (let i = 0; i < rows.length; i++) {
                let row = rows[i]
                let a = row.querySelector(".item-content h2 a") || row.querySelector("a.item-link")
                if (!a) continue
                let id = this.idFromHref(a.attributes["href"])
                if (!id) continue

                let title = (a.text || "").replace(/\s+/g, " ").trim()
                let img = row.querySelector(".item-thumb img")
                if (!title && img) title = (img.attributes["alt"] || "").trim()

                // Comic.tags 必须是扁平字符串数组（List<String>.from），不能给对象！
                // 只有 ComicDetails.tags 才是 Map<String, List<String>>。
                let names = []
                let tagEls = row.querySelectorAll(".item-tags a.tag")
                for (let j = 0; j < tagEls.length; j++) {
                    let t = (tagEls[j].text || "").trim()
                    if (t) names.push(t)
                }

                comics.push(new Comic({
                    id: id,
                    title: title || id,
                    subTitle: names.join(", "),
                    cover: this.abs(img && img.attributes["src"]) || this.SITE_ICON,
                    tags: names,
                }))
            }
        } finally {
            d.dispose()
        }
        return comics
    }

    async fetchList(path, page) {
        let html = await this.fetchPage(this.listUrl(path, page))
        return {
            comics: this.parseList(html),
            maxPage: this.maxPageFromStart(html),
        }
    }

    /**
     * 详情页正文图片：限定在 `.article-fulltext` 内，避开相关推荐。
     * 容器里每隔几张图就夹一段站点广告（`<ins>`，没有 img），所以按 img 取就够干净。
     * 一页 20 张（末页常不满），不是 10 张 —— 广告块把图片分成两段，别被分段误导。
     */
    articleImages(html) {
        let out = []
        let seen = {}
        let d = new HtmlDocument(html)
        try {
            let box = d.querySelector(".article-fulltext")
            if (!box) return out
            let imgs = box.querySelectorAll("img")
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

    /** 标题清理：剥掉 `- Mitaku` / `(mitaku.net)` 这类站名尾巴 */
    cleanTitle(s) {
        let t = String(s || "")
            .replace(/<[^>]+>/g, "")
            .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/\s+/g, " ")
            .trim()
        t = t.replace(/[\s\-–—]*\(\s*mitaku\.net\s*\)\s*$/i, "")
        t = t.replace(/[\s\-–—]+mitaku\s*$/i, "")
        return t.replace(/[\s\-–—]+$/, "").trim()
    }

    /** 详情页解析：标题 / 封面 / 标签 / 日期 / 作者 / 简介 / 推荐 */
    parseDetail(html, id) {
        let cover = ""
        let tagNames = []
        let uploadTime = ""
        let uploader = ""
        let totalPages = this.detailPageCount(html)

        let mh = html.match(/<div class="article-header">\s*<h1[^>]*>([\s\S]*?)<\/h1>/i)
        if (!mh) mh = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
        let title = this.cleanTitle(mh ? mh[1] : "")

        let d = new HtmlDocument(html)
        try {
            let box = d.querySelector(".article-tags")
            if (box) {
                let els = box.querySelectorAll("a.tag")
                for (let i = 0; i < els.length; i++) {
                    // 详情页的标签文字带 `#` 前缀（`#Genshin Impact`），剥掉
                    let t = (els[i].text || "").replace(/\s+/g, " ").trim()
                    t = t.replace(/^#+\s*/, "")
                    if (t) tagNames.push(t)
                }
            }
            // 两个 .article-info：第一个含时间，第二个是 `Cosplayer: XXX`
            // （老帖这里是关键词堆或空，只有带前缀时才当作者用）
            let infos = d.querySelectorAll(".article-info")
            for (let i = 0; i < infos.length; i++) {
                let txt = (infos[i].text || "").replace(/\s+/g, " ").trim()
                if (!txt) continue
                let mc = txt.match(/cosplayer\s*[:：]\s*(.+)$/i)
                if (mc) uploader = mc[1].trim()
                let mt = txt.match(/(\d{1,2}):(\d{2})\s+(\d{1,2})-(\d{1,2})-(\d{4})/)
                if (mt) {
                    uploadTime = mt[5] + "-" + ("0" + mt[4]).slice(-2) + "-" + ("0" + mt[3]).slice(-2)
                        + " " + ("0" + mt[1]).slice(-2) + ":" + mt[2]
                }
            }
        } finally {
            d.dispose()
        }

        let tags = {}
        if (tagNames.length) tags["tag"] = tagNames

        if (!cover) {
            let imgs = this.articleImages(html)
            if (imgs.length) cover = imgs[0]
        }
        if (!cover) cover = this.SITE_ICON

        // 相关推荐在 .bottom-articles 里
        let recommend = []
        let bi = html.indexOf("bottom-articles")
        if (bi >= 0) {
            try {
                recommend = this.parseList(html.slice(bi))
            } catch (e) {
                recommend = []
            }
        }

        let descParts = []
        if (uploader) descParts.push("Cosplayer：" + uploader)
        if (tagNames.length) descParts.push("标签：" + tagNames.join("、"))
        descParts.push("图片最多 " + (totalPages * this.detailPerPage) + " 张（分 " + totalPages + " 页，末页常不满）")
        let desc = descParts.join("\n")

        return {
            title: title || id,
            cover: cover,
            tags: tags,
            uploadTime: uploadTime,
            uploader: uploader,
            totalPages: totalPages,
            tagNames: tagNames,
            description: desc,
            recommend: recommend,
        }
    }

    // ==================== 发现页 ====================

    explore = [
        {
            title: "最新",
            type: "multiPageComicList",
            load: (page) => this.fetchList("/", page),
        },
        {
            title: "热门",
            type: "multiPageComicList",
            load: (page) => this.fetchList("/hot", page),
        },
    ]

    // ==================== 随机抽取 ====================

    pickRandomTagId() {
        let span = this.tagPoolMax - this.tagPoolMin + 1
        return this.tagPoolMin + Math.floor(Math.random() * span)
    }

    /**
     * 随机打开一个 tag 的作品列表。
     * 第 1 页重新抽（每次进分类都是新 tag），翻页沿用同一个 —— 否则翻一页换一个 tag，没法看。
     * 池子是全部 2128 个 tag，其中只有 id 1206（`Adshrink`）是空的，
     * 抽到空页 / 404 就换号重抽（最多 5 次），全空也不抛错。
     */
    async loadRandomTag(page) {
        let p = page || 1
        if (p > 1 && this.randomTagPick) {
            return this.fetchList("/tag/" + this.randomTagPick, p)
        }
        let last = null
        for (let i = 0; i < 5; i++) {
            let id = this.pickRandomTagId()
            try {
                let res = await this.fetchList("/tag/" + id, p)
                if (res.comics.length > 0) {
                    this.randomTagPick = id
                    return res
                }
                last = res
            } catch (e) {
                // 抽到不存在的号，换一个
            }
        }
        return last || { comics: [], maxPage: 1 }
    }

    // ==================== 分类 ====================
    // 站点没有分类总览页，tag 全部是规律的 `/tag/{数字}`（1 – 2128 连续，共 2128 个）。
    // 清单由 gen_categories.py 注入到下面的标记之间（标记保留，可重跑）。

    category = {
        title: "Kiutaku",
        parts: [
            // <<<CATEGORY_PARTS>>>
            {
                name: "游戏专区",
                type: "fixed",
                itemType: "category",
                categories: [
                    "原神", "碧蓝航线", "胜利女神：妮姬", "命运-冠位指定",
                    "尼尔：机械纪元", "崩坏：星穹铁道", "最终幻想", "英雄联盟",
                    "蔚蓝档案", "绝区零", "守望先锋", "宝可梦",
                    "街头霸王", "超级马力欧", "死或生", "生化危机",
                    "女神异闻录5", "鸣潮", "拳皇", "明日方舟",
                    "赛博朋克：边缘行者", "无畏契约", "动物森友会", "恶魔战士",
                    "巫师", "博德之门3", "少女前线", "偶像大师",
                    "艾尔登法环", "塞尔达传说", "崩坏3", "星刃",
                    "巧克力与香子兰", "舰队Collection", "黑兽",
                ],
                categoryParams: [
                    "425", "165", "899", "88", "19", "1305", "39", "45", "636", "1607",
                    "21", "85", "128", "5", "225", "194", "33", "1723", "71", "261",
                    "1060", "445", "259", "75", "123", "1431", "345", "145", "1022", "119",
                    "441", "1734", "15", "95", "529",
                ],
            },
            {
                name: "角色专区",
                type: "fixed",
                itemType: "category",
                categories: [
                    "2B", "喜多川海梦", "蒂法", "约尔·福杰",
                    "玛奇玛", "DVA", "甘雨", "零二",
                    "蕾姆", "甘露寺蜜璃", "初音未来", "阿狸",
                    "日向雏田", "雷电将军", "芙莉莲", "艾达·王",
                    "八重神子", "明日香", "优菈", "春丽",
                    "大凤", "玛修", "爱宕", "渡鸦",
                    "简·杜", "不知火舞", "塞尔达", "库巴姬",
                    "宝钟玛琳", "莫娜", "卡芙卡", "柴郡",
                    "夏尔米", "超级索尼子", "嘉米", "布尔玛",
                    "下平玲花", "薇尔玛", "蕾塞", "时",
                    "哈莉·奎茵", "娜美", "梅维斯", "玉藻前",
                    "酒吞童子", "玛丽·萝丝", "菲伦", "露科亚",
                    "古拉", "莉雅丝", "蛇喰梦子", "莫莉卡",
                    "蜘蛛格温", "阿贝多", "帕瓦", "露西",
                    "毒蛇", "碧琪公主", "缠流子", "吹雪",
                    "波雅·汉库克", "申鹤", "夜兰", "星野爱",
                    "纲手", "弥海砂", "香草", "三笠·阿克曼",
                    "圣路易斯", "金克丝", "艾莲", "妮可·罗宾",
                    "龙卷", "灶门祢豆子", "星期三·阿达姆", "时崎狂三",
                    "宇崎", "安卡", "小紅", "拉毗",
                    "妮可", "绫濑桃", "灵蝶", "高卷杏",
                    "惠惠", "贞德（Alter）", "丽莎", "刻晴",
                    "爱丽丝 (NIKKE)", "蝴蝶忍", "双叶", "爱丽丝 (FF7)",
                    "黑猫", "女天狗", "胡桃", "波奇",
                    "姬野", "杠", "尼禄", "拉芙塔莉雅",
                    "神里绫华", "米哈拉", "纳西妲", "奇乐",
                    "伊芙", "小霞", "玛丽·简", "渡我被身子",
                    "洋子", "莎拉芬妮", "菲谢尔", "葛城美里",
                    "心海", "玛丽 (NIKKE)", "Elegg",
                ],
                categoryParams: [
                    "18", "826", "41", "919", "649", "20", "538", "43", "80", "172",
                    "12", "44", "8", "767", "1464", "240", "786", "271", "683", "230",
                    "340", "389", "176", "207", "1741", "70", "120", "366", "548", "556",
                    "1348", "408", "666", "31", "127", "150", "154", "164", "877", "1240",
                    "108", "324", "63", "89", "159", "608", "1476", "74", "667", "29",
                    "136", "76", "125", "279", "761", "1122", "1225", "4", "196", "200",
                    "217", "809", "1015", "1261", "38", "646", "97", "238", "316", "405",
                    "1672", "215", "685", "91", "122", "191", "338", "768", "1121", "1244",
                    "1606", "1758", "142", "304", "358", "371", "518", "613", "898", "134",
                    "32", "251", "329", "550", "567", "1213", "1153", "1292", "244", "248",
                    "740", "1129", "1171", "1257", "1733", "84", "187", "223", "287", "479",
                    "488", "780", "798", "1349", "1648",
                ],
            },
            {
                name: "coser 专区",
                type: "fixed",
                itemType: "category",
                categories: [
                   "machi 马吉", "Hana Bunny", "Byoru", "Potato Godzilla", "HaneAme",
                    "Hidori Rose", "Umeko J", "Kuuko W", "Uy Uy",
                    "Aqua 水淼", "Queenie Chuppy", "ShiroKitsune", "Azami",
                    "ZinieQ", "Arty Huang", "Shimo", "KaYa Huang",
                    "PoppaChan", "Tokar 浵卡", "Alina Becker", "Hoshilily 星之迟迟",
                    "Aery Tiefling", "Yoshinobi", "Lady Melamori", "Kalinka Fox",
                    "Danielle Vedovelli", "Okita Rinka", "Sayo Momo", "Sally Dorasnow",
                    "Hatori Sama", "Alice Delish", "Joyce Lin2x", "Tiny Asa",
                    "Ely", "Vinnegal", "Yaokoututu 咬人小小兔", "LovelySpaceKitten",
                    "PeachMilky", "Minichu", "Virtual Geisha", "Mad Roxy",
                    "Mikomin", "Valentina Kryp", "Guaxichan 瓜希酱", "Helly von Valentine",
                    "Bunny Ayumi", "Xenon",
                ],
                categoryParams: [
                   "1857", "59", "516", "77", "578", "1", "677", "426", "431", "494", "313",
                    "82", "262", "916", "406", "534", "359", "974", "1278", "606", "569",
                    "1083", "112", "444", "335", "55", "300", "990", "478", "1064", "582",
                    "837", "1395", "100", "812", "1618", "846", "630", "1116", "274", "1146",
                    "373", "415", "797", "413", "61", "576",
                ],
            },
            {
                name: "随机抽取",
                type: "fixed",
                itemType: "category",
                categories: ["随机抽取"],
                categoryParams: ["random"],
            },
            // <<<END_CATEGORY_PARTS>>>
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: (category, param, options, page) => {
            let p = String(param || "").trim()
            if (!p) return Promise.resolve({ comics: [], maxPage: 1 })
            // 特殊 param：随机抽一个 tag
            if (p === "random") return this.loadRandomTag(page)
            // 其余就是 tag 的数字 id
            return this.fetchList("/tag/" + p, page)
        },
    }

    // ==================== 搜索 ====================

    search = {
        load: (keyword, options, page) => {
            let kw = String(keyword || "").trim()
            if (!kw) return Promise.resolve({ comics: [], maxPage: 1 })
            let p = page || 1
            let url = "/?search=" + encodeURIComponent(kw)
            if (p > 1) url += "&start=" + ((p - 1) * this.perPage)
            return this.fetchList(url, 1)
        },
        optionList: [],
    }

    // ==================== 详情 / 章节 ====================

    comic = {
        loadInfo: async (id) => {
            let html = await this.fetchPage(this.detailUrl(id, 1))
            let info = this.parseDetail(html, id)
            let chapterName = "共 " + info.totalPages + " 页"
            return new ComicDetails({
                title: info.title,
                cover: info.cover,
                tags: info.tags,
                description: info.description,
                chapters: { "0": chapterName },
                uploader: info.uploader,
                uploadTime: info.uploadTime,
                url: this.detailUrl(id, 1),
                recommend: info.recommend,
                maxPage: info.totalPages,
            })
        },

        loadEp: async (comicId, epId) => {
            // 第 1 页顺带拿到总页数
            let first = await this.fetchPage(this.detailUrl(comicId, 1))
            let images = this.articleImages(first)
            let total = this.detailPageCount(first)

            if (total > 1) {
                let pages = []
                for (let p = 2; p <= total; p++) pages.push(p)
                // 小批并发，失败只丢那一页（不要整本翻车）
                for (let i = 0; i < pages.length; i += 4) {
                    let batch = pages.slice(i, i + 4)
                    let htmls = await Promise.all(batch.map((p) => {
                        return this.fetchPage(this.detailUrl(comicId, p)).catch(() => "")
                    }))
                    for (let j = 0; j < htmls.length; j++) {
                        if (!htmls[j]) continue
                        let part = this.articleImages(htmls[j])
                        for (let k = 0; k < part.length; k++) images.push(part[k])
                    }
                }
            }

            // 去重。站点对越界页（?page=99）返回 200 + 最后一页的内容，
            // 所以去重不是可选项，是必需品。
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
         * 图床 mitaku.net 对**带本站 Referer 的请求返回 403**（不带就 200）。
         * 所以这里只给 UA，绝不给 Referer，也绝不改写 url。
         */
        onImageLoad: () => {
            return { headers: this.imageHeaders() }
        },

        onThumbnailLoad: () => {
            return { headers: this.imageHeaders() }
        },

        idMatch: "kiutaku\\.com/(\\d+)",
    }
}