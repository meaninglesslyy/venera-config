/** @type {import('../../venera-configs/_venera_.js')} */

class BuonDua extends ComicSource {
    name = "Buon Dua"
    key = "buondua"
    version = "1.1.0"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/buondua.js"

    base = "https://buondua.com"

    // 封面兜底的最后一环：任何封面路径都不允许返回空串（空串会让详情页崩在
    // "relative URL without a base"）。favicon.ico 在本站是 404，这个 png 才是活的。
    SITE_ICON = "https://buondua.com/templates/duachua/watermelon-icon.png"

    // 列表页固定 20 条一页，分页参数 `?start=N`；
    // 详情页图片同样 20 张一页，分页参数 `?page=N`（总页数从标题的 "Page x / y" 取）
    perPage = 20

    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

    init() {
        this.base = String(this.base || "").replace(/\/+$/, "")
    }

    // ==================== 基础工具 ====================

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

    /** `/coser-xxx-34563` -> `coser-xxx-34563` */
    idFromHref(href) {
        let s = String(href || "").trim()
        if (!s) return ""
        s = s.replace(/^https?:\/\/[^/]+/i, "")
        s = s.split("#")[0].split("?")[0]
        s = s.replace(/^\/+/, "").replace(/\/+$/, "")
        if (s.indexOf("tag/") === 0) return ""   // tag 链接不是漫画
        return s
    }

    /**
     * 清理链接文字上的装饰前缀（站点写的是 "👉 Download link: MediaFire"）。
     * 顺手把 `|` 换成 `/` —— Venera 列表卡片会 `split('|').join('\n')`，
     * 简介里带 `|` 会被硬拆行。
     */
    cleanLabel(s) {
        let t = String(s || "").replace(/\s+/g, " ").trim()
        t = t.replace(/^[^\w一-龥(]+/, "").trim()
        return t.replace(/\|/g, "/")
    }

    listUrl(path, page) {
        let p = page || 1
        if (p <= 1) return this.base + path
        let sep = path.indexOf("?") >= 0 ? "&" : "?"
        return this.base + path + sep + "start=" + ((p - 1) * this.perPage)
    }

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

    /** 取出页面里所有 `<nav class="pagination">` 块，避免误抓正文里的 start= */
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

    /** 详情页正文图片：限定在 `.article-fulltext` 内，避开相关推荐 */
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

    /**
     * 详情页标题。h1 与 <title> 内容一致，都以 " - ( Page 1 / 3 )" 结尾。
     * 返回 {title, totalPages, photoCount}，title 已去掉页码尾巴。
     */
    parseTitle(html) {
        let raw = ""
        let mt = html.match(/<title>([\s\S]*?)<\/title>/i)
        if (mt) raw = mt[1]
        let mh = html.match(/<div class="article-header">\s*<h1[^>]*>([\s\S]*?)<\/h1>/i)
        if (mh) raw = mh[1]
        let title = String(raw)
            .replace(/<[^>]+>/g, "")
            .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/\s+/g, " ")
            .trim()

        let totalPages = 1
        let mp = title.match(/\(\s*Page\s+(\d+)\s*\/\s*(\d+)\s*\)\s*$/i)
        if (mp) {
            totalPages = parseInt(mp[2], 10) || 1
            title = title.slice(0, mp.index).replace(/[\s\-–—]+$/, "").trim()
        }
        let photoCount = 0
        let mc = title.match(/\((\d+)\s*photos?/i)
        if (mc) photoCount = parseInt(mc[1], 10) || 0

        return { title: title, totalPages: totalPages, photoCount: photoCount }
    }

    /** 详情页解析：标题 / 封面 / 标签 / 日期 / 简介 / 网盘链接 / 推荐 */
    parseDetail(html, id) {
        let cover = ""
        let tags = {}
        let tagNames = []
        let uploadTime = ""
        let uploader = ""
        let links = []
        let password = ""

        let head = this.parseTitle(html)
        let title = head.title
        let totalPages = head.totalPages
        let photoCount = head.photoCount

        let mo = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        if (mo) cover = this.abs(mo[1])

        let d = new HtmlDocument(html)
        try {
            let box = d.querySelector(".article-tags")
            if (box) {
                let els = box.querySelectorAll("a.tag")
                for (let i = 0; i < els.length; i++) {
                    let t = (els[i].text || "").trim()
                    if (t) tagNames.push(t)
                }
            }
            // 第一个 small 是站点名，第二个才是时间
            let info = d.querySelector(".article-info")
            if (info) {
                let smalls = info.querySelectorAll("small")
                if (smalls.length) uploader = (smalls[0].text || "").trim()
                if (smalls.length > 1) uploadTime = (smalls[smalls.length - 1].text || "").trim()
            }
            // 站点自带的网盘资源：.article-links 下 2~4 条（ouo.io 短链 → MediaFire / Terabox）
            let linksBox = d.querySelector(".article-links")
            if (linksBox) {
                let aEls = linksBox.querySelectorAll("a[href]")
                for (let i = 0; i < aEls.length; i++) {
                    let u = this.abs(aEls[i].attributes["href"])
                    if (!u || !/^https?:/i.test(u)) continue
                    let label = (aEls[i].text || "").replace(/\s+/g, " ").trim()
                    links.push({ label: this.cleanLabel(label), url: u })
                }
            }
            // 提取码：整页正好一个 <code>（放在 .article-links 后面）
            let codeEl = d.querySelector("code")
            if (codeEl) password = (codeEl.text || "").replace(/\s+/g, " ").trim()
        } finally {
            d.dispose()
        }

        if (tagNames.length) tags["tag"] = tagNames
        if (!cover) {
            let imgs = this.articleImages(html)
            if (imgs.length) cover = imgs[0]
        }
        if (!cover) cover = this.SITE_ICON

        // "17:12 26-12-2023" -> "2023-12-26 17:12"
        let md = uploadTime.match(/(\d{1,2}):(\d{2})\s+(\d{1,2})-(\d{1,2})-(\d{4})/)
        if (md) {
            uploadTime = md[5] + "-" + ("0" + md[4]).slice(-2) + "-" + ("0" + md[3]).slice(-2)
                + " " + ("0" + md[1]).slice(-2) + ":" + md[2]
        }

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
        if (photoCount > 0) descParts.push(photoCount + " 张图片")
        if (tagNames.length) descParts.push("标签：" + tagNames.join("、"))
        if (uploader) descParts.push("来源：" + uploader)
        let desc = descParts.join("\n")

        // 网盘链接 + 提取码。注意 Venera 的 description 走 SelectableText，
        // 不渲染 markdown —— 只能是纯文本，链接单独占一行方便长按复制。
        if (links.length || password) {
            let lines = []
            for (let i = 0; i < links.length; i++) {
                lines.push(links[i].label || "下载链接")
                lines.push(links[i].url)
            }
            if (password) lines.push(password.replace(/\|/g, "/"))
            desc += (desc ? "\n\n" : "") + lines.join("\n")
        }

        return {
            title: title || id,
            cover: cover,
            tags: tags,
            uploadTime: uploadTime,
            uploader: uploader,
            totalPages: totalPages > 0 ? totalPages : 1,
            photoCount: photoCount,
            links: links,
            description: desc,
            recommend: recommend,
        }
    }

    // ==================== 发现页 ====================

    explore = [
        {
            title: "buondua-最新",
            type: "multiPageComicList",
            load: (page) => this.fetchList("/", page),
        },
        {
            title: "buondua-热门",
            type: "multiPageComicList",
            load: (page) => this.fetchList("/hot", page),
        },
    ]

    // ==================== 分类 ====================

    category = {
        title: "Buon Dua",
        parts: [
            {
                name: "热门",
                type: "fixed",
                itemType: "category",
                    categories: [
                        "Cosplay", "JP", "Mik Allen(miakanayuri)", "Sakura Misaki",
                        "Nyako喵子", "鱼子酱Fish", "内购无水印", "渡久山",
                        "nookkizzcos", "布丁大法", "OtherXXX", "tianjiang(小芒果)",
                        "Shiori Hatano", "李若汐", "Remukira", "けん研",
                        "Kasame 花雨(かさめ)", "Candy_Ball", "Nitori Sayaka", "djfkc6686(小潼宝-镇痛剂)",
                        "奈汐酱nice", "Moeka Sasaki", "御子miko", "Yeha",
                        "HIGH FANTASY", "AI Enhanced", "Gini (지니)", "Jdabyeol (정다별이)",
                        "Dongeuran", "LingChen",
                    ],
                    categoryParams: [
                        "cosplay-10688", "jp-11853", "mik-allen-miakanayuri-13856", "sakura-misaki-15413",
                        "nyako喵子-11200", "鱼子酱fish-10749", "内购无水印-14442", "渡久山-15072",
                        "nookkizzcos-13401", "布丁大法-11518", "otherxxx-13913", "tianjiang-小芒果-15412",
                        "shiori-hatano-15411", "李若汐-11827", "remukira-13548", "けん研-11081",
                        "kasame-花雨-かさめ-15284", "candy_ball-11902", "nitori-sayaka-13073", "djfkc6686-小潼宝-镇痛剂-15410",
                        "奈汐酱nice-10597", "moeka-sasaki-12148", "御子miko-14102", "yeha-11167",
                        "high-fantasy-11418", "ai-enhanced-15002", "gini-지니-15091", "jdabyeol-정다별이-15399",
                        "dongeuran-11453", "lingchen-15409",
                    ],
            },
            {
                name: "分类",
                type: "fixed",
                itemType: "category",
                    categories: [
                        "Bimilstory", "XE-NO Archive", "Private Photoshoot", "DJAWA",
                        "DDiDDi", "Garum", "LE", "纸悦Etsu_ko",
                        "JISAM", "Fantasy", "GMS", "MZSOCK爱美足",
                        "AIGirl", "MAXIM", "SWEETBOX", "PhotoChips",
                        "JVID", "Graphis",
                    ],
                    categoryParams: [
                        "bimilstory-11116", "xe-no-archive-15405", "private-photoshoot-12486", "djawa-10855",
                        "ddiddi-15204", "garum-15358", "le-11493", "纸悦etsu_ko-12714",
                        "jisam-13739", "fantasy-15177", "gms-10883", "mzsock爱美足-14061",
                        "aigirl-14905", "maxim-14694", "sweetbox-11337", "photochips-11043",
                        "jvid-11832", "graphis-13183",
                    ],
            },
            {
                name: "模特",
                type: "fixed",
                itemType: "category",
                    categories: [
                        "leeesovely", "쏘블리", "Miinmeow", "Sayo Momo",
                        "HWAYEON", "Mio Ishikawa", "REbecca", "花音葉子",
                        "落落Raku", "日奈娇", "puppy_pvq(小怡酱)", "Bangni邦尼",
                        "Yuria Satomi", "玥儿玥er", "Byoru", "九言",
                        "魅瞳Meroko", "桜井宁宁", "Rio Yoshida", "洛璃LoLiSAMA",
                        "咸鱼青椒", "loveqing_qaq(碳碳小萌酱)", "喵喵的喵吖", "Nagao Mariya",
                        "Wada Miyu", "染三ran3", "清水凪", "Nana Nanase",
                        "半半子", "Rei Jonishi", "Gyuri", "Son Ye-Eun",
                        "Myu_a_", "Hina", "年年Nnian", "Mony",
                        "铁手叫兽", "Ami Kitai", "18jkpeach(仙仙桃一颗甜桃)", "沈青黛",
                        "PoppaChan", "Natsuko夏夏子", "PuyPuy", "Fubuki Kei",
                        "麻薯好吃", "九曲Jean", "李沁恩lrene", "Kana Yamada",
                        "Peach milky", "Seika Ruru", "二阶堂", "Saki Yanase",
                        "Cocoro Toyoshima", "过期米线线喵", "Xiu", "ＪＯＪＯ",
                        "Kim Joo-young", "CHUCHU", "Jinguji Nao", "唐翩翩",
                        "Kanna Seto", "阿雪雪", "小美miyoki", "Sakura Sakakura",
                        "萨隆苦囚", "Yuzuha Saeki", "柒柒要乖哦", "袁圆",
                        "江念鱼", "疯猫ss", "Shida Nene", "安然anran",
                        "宝钡bei", "钛合金TiTi", "Haeun", "小雅kemi",
                        "Enako", "Yuka Murayama", "絞肉姬Walküre", "Takara Suzuki",
                        "Kanami Takasaki", "杨晨晨", "Yokono Sumire", "Reng",
                        "云溪溪", "rioko凉凉子", "Yūki Mita", "Moka Hashimoto",
                        "贝贝琪Becky", "Stella", "Sonson", "Aesoon (애순이)",
                        "Inah", "Nene Misumi", "Momona Koibuchi", "Neppu",
                        "Sui Utatane", "YeonYu", "Ggyong-ee (굥이)", "Sula",
                        "Ray", "Baebae (베베)", "果寶寶", "黏黏团子兔",
                        "Eren Sora", "不呆猫", "Saki Sasaki", "Yin Tian Tian",
                        "魔理花", "潘思沁", "脆糕yaki", "Xiaoyukiko小鱼",
                    ],
                    categoryParams: [
                        "leeesovely-11028", "쏘블리-11029", "miinmeow-14414", "sayo-momo-11395",
                        "hwayeon-11564", "mio-ishikawa-12703", "rebecca-13761", "花音葉子-14498",
                        "落落raku-11669", "日奈娇-11681", "puppy_pvq-小怡酱-15408", "bangni邦尼-12182",
                        "yuria-satomi-14852", "玥儿玥er-10661", "byoru-10931", "九言-11627",
                        "魅瞳meroko-12460", "桜井宁宁-10668", "rio-yoshida-14859", "洛璃lolisama-11689",
                        "咸鱼青椒-15401", "loveqing_qaq-碳碳小萌酱-15407", "喵喵的喵吖-15406", "nagao-mariya-12038",
                        "wada-miyu-14650", "染三ran3-15210", "清水凪-14444", "nana-nanase-14122",
                        "半半子-11312", "rei-jonishi-12550", "gyuri-12652", "son-ye-eun-10842",
                        "myu_a_-11034", "hina-11388", "年年nnian-11456", "mony-15404",
                        "铁手叫兽-15308", "ami-kitai-15403", "18jkpeach-仙仙桃一颗甜桃-15167", "沈青黛-11813",
                        "poppachan-11701", "natsuko夏夏子-11740", "puypuy-12111", "fubuki-kei-12342",
                        "麻薯好吃-14765", "九曲jean-11737", "李沁恩lrene-13678", "kana-yamada-14409",
                        "peach-milky-13858", "seika-ruru-12210", "二阶堂-11679", "saki-yanase-14588",
                        "cocoro-toyoshima-14339", "过期米线线喵-10694", "xiu-11798", "ｊｏｊｏ-13584",
                        "kim-joo-young-15402", "chuchu-12174", "jinguji-nao-12559", "唐翩翩-12481",
                        "kanna-seto-12399", "阿雪雪-11955", "小美miyoki-13706", "sakura-sakakura-15400",
                        "萨隆苦囚-15367", "yuzuha-saeki-13431", "柒柒要乖哦-11304", "袁圆-10461",
                        "江念鱼-12177", "疯猫ss-11613", "shida-nene-12213", "安然anran-11176",
                        "宝钡bei-15333", "钛合金titi-11314", "haeun-15398", "小雅kemi-15397",
                        "enako-12195", "yuka-murayama-14366", "絞肉姬walküre-12066", "takara-suzuki-14413",
                        "kanami-takasaki-14445", "杨晨晨-15396", "yokono-sumire-12528", "reng-15384",
                        "云溪溪-11131", "rioko凉凉子-10567", "yūki-mita-12649", "moka-hashimoto-14301",
                        "贝贝琪becky-14065", "stella-11394", "sonson-10856", "aesoon-애순이-15395",
                        "inah-10935", "nene-misumi-15394", "momona-koibuchi-12978", "neppu-11183",
                        "sui-utatane-13699", "yeonyu-11257", "ggyong-ee-굥이-15393", "sula-11610",
                        "ray-11003", "baebae-베베-15392", "果寶寶-12149", "黏黏团子兔-11333",
                        "eren-sora-13245", "不呆猫-11375", "saki-sasaki-14013", "yin-tian-tian-10891",
                        "魔理花-15391", "潘思沁-11680", "脆糕yaki-15389", "xiaoyukiko小鱼-12674",
                    ],
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: (category, param, options, page) => {
            if (!param) return Promise.resolve({ comics: [], maxPage: 1 })
            return this.fetchList("/tag/" + encodeURI(String(param)), page)
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
            let chapterName = info.photoCount > 0
                ? info.photoCount + " 张图片"
                : "全部图片"
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
            let total = this.parseTitle(first).totalPages

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

            // 去重（首页 + 后续页理论上不重叠，防站点分页抖动）
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
         * 图片走 cdn.buondua.com / iN.buondua.com，实测无防盗链。
         * 只加 headers，绝不改写 url —— 本地漫画的 cover.webp / file:// 必须原样透传。
         */
        onImageLoad: (url) => {
            return { headers: this.headers() }
        },

        onThumbnailLoad: (url) => {
            return { headers: this.headers() }
        },

        idMatch: "buondua\\.com/([^/?#]+)",
    }
}
