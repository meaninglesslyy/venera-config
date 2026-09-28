/** @type {import('../../venera-configs/_venera_.js')} */

class Xiutaku extends ComicSource {
    name = "Xiutaku"
    key = "xiutaku"
    version = "1.1.0"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/xiutaku.js"

    base = "https://xiutaku.com"

    // 站点图标。详情页没有 og:image / twitter:image，封面全靠正文首图，
    // 拿不到时必须落到这里 —— 封面返回空串会让详情页崩在
    // "relative URL without a base"。favicon.ico 在本站是 404，这个 png 才是活的。
    SITE_ICON = "https://xiutaku.com/templates/xiuren/kiwi-icon.png"

    // 列表页（首页 / hot / brand / girl / 搜索）固定 20 条一页，分页参数 `?start=N`
    perPage = 20
    // 详情页正文固定 20 张图一页，分页参数 `?page=N`
    imgPerPage = 20
    // 详情页页数上限（护栏，非实测值）。秀人单套普遍 50~130 张（≤7 页），
    // 万一某篇的 [NNP] 标错标成大数，loadEp 不至于一口气打几十个请求。
    detailPageCap = 60

    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

    // 源文件在整个会话里只被求值一次（app 侧 `(() => { <src> }).call()`），
    // 所以这些实例字段等于模块级缓存，跨调用常驻。
    // 站点分页器的 End 链接只在「非最后一页」渲染，翻到末页就抓不到总数，
    // 所以第一次拿到的总数必须记下来，后续页码直接复用。
    maxPageCache = {}

    // 模特池：`/girl/{id}` 的 id 是连续编号，实测 1..1891 全部有效（1892 起 404），
    // 随机抽样 14/14 命中。上限是快照值，站点新增模特后可调大，
    // 抽到已下架/超界的号由 loadRandomModel 重抽兜底。
    girlPoolMin = 1
    girlPoolMax = 1891
    // 「随机抽取」当次选中的模特，翻页时沿用（不记住的话翻一页换一个人，没法看）
    randomPick = null

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
     * 只做 trim + 协议补齐，绝不猜相对路径去拼 base ——
     * 本地下载的漫画会把 `cover.webp` / `file:///...` 送进 onThumbnailLoad，
     * 一旦被改写成网络地址，app 的本地封面识别就断了。
     */
    abs(u) {
        if (!u) return ""
        let s = String(u).trim()
        if (!s) return ""
        if (s.indexOf("//") === 0) s = "https:" + s
        return s
    }

    /**
     * `/19509` -> `19509`；也吞掉完整 URL 形态。
     * ⚠️ 必须是 `\d+` 而不是 `\d{2,}` —— 站里存在一位数详情 ID（`/4`、`/15` 那批最早期作品），
     * 卡 2 位会把这些卡片整条静默吞掉（末页 6 条只解析出 2 条）。
     */
    idFromHref(href) {
        let s = String(href || "").trim()
        if (!s) return ""
        let m = s.match(/(\d+)/)
        return m ? m[1] : ""
    }

    /** 详情 id 归一化：允许 "4"、"19509"、"https://xiutaku.com/19509"、"/19509?page=2" */
    normId(id) {
        let s = String(id == null ? "" : id).trim()
        let m = s.match(/(\d+)/)
        return m ? m[1] : s
    }

    /** 详情页标签文本是 `#XiuRen秀人网` 形态，先 trim 再剥井号（顺序反了会剥不掉） */
    cleanLabel(s) {
        let t = String(s || "").replace(/\s+/g, " ").trim()
        return t.replace(/^#+\s*/, "").trim()
    }

    /** 列表页 URL：path 里已经带 query（搜索）时用 & 续接 */
    listUrl(path, page) {
        let p = String(path || "/")
        if (p.charAt(0) !== "/") p = "/" + p
        let start = ((page || 1) - 1) * this.perPage
        if (start <= 0) return this.base + p
        let sep = p.indexOf("?") >= 0 ? "&" : "?"
        return this.base + p + sep + "start=" + start
    }

    detailUrl(id, page) {
        let u = this.base + "/" + this.normId(id)
        if (page && page > 1) u += "?page=" + page
        return u
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
                // 站点偶尔对保留字符返回 200 + 空 body（静默失败），所以要验长度；
                // 顺带认一下 Cloudflare 挑战页，别把挑战页当内容解析出 0 条。
                if (res.status === 200 && body.length > 512
                    && body.indexOf("Just a moment") < 0
                    && body.indexOf("__cf_chl") < 0) {
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

    // ==================== 解析：列表 ====================

    /** 页面里所有 `<nav class="pagination...">` 块（列表页带 is-small is-centered，详情页不带） */
    paginationNav(html) {
        let out = ""
        let re = /<nav class="pagination[\s\S]*?<\/nav>/g
        let m
        while ((m = re.exec(html)) !== null) out += m[0]
        return out
    }

    /**
     * 列表页总页数：从分页器 End 链接的 `?start=` 最大值反推。
     * 搜索页的 href 会被转义成 `&amp;start=20`，所以不能要求前面是裸 `&`。
     * ⚠️ 末页不渲染 End 链接，取不到时返回 1，由 fetchList 用缓存兜住。
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
        if (max <= 0) return 1
        return Math.max(1, Math.floor(max / this.perPage) + 1)
    }

    /** 解析列表页的漫画卡片（首页 / hot / brand / girl / 搜索 结构完全一致） */
    parseList(html) {
        let comics = []
        let d = new HtmlDocument(html)
        try {
            let rows = d.querySelectorAll(".items-row")
            for (let i = 0; i < rows.length; i++) {
                let row = rows[i]
                let a = row.querySelector(".item-content h2 a") || row.querySelector("a.item-link")
                if (!a) continue
                let id = this.idFromHref(a.attributes["href"] || row.attributes["data-id"])
                if (!id) continue

                let title = (a.text || "").replace(/\s+/g, " ").trim()
                let img = row.querySelector(".item-thumb img")
                if (!title && img) title = (img.attributes["alt"] || "").trim()

                // Comic.tags 必须是扁平字符串数组（List<String>.from），给对象会整页白屏；
                // 只有 ComicDetails.tags 才是 Map<String, List<String>>。
                let names = []
                let tagEls = row.querySelectorAll(".item-tags a.tag")
                for (let j = 0; j < tagEls.length; j++) {
                    let t = this.cleanLabel(tagEls[j].text)
                    if (t && names.indexOf(t) < 0) names.push(t)
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
        let comics = this.parseList(html)

        // 缓存 key 去掉 start，让同一路径的所有页码共享一份总数
        let key = String(path).replace(/[?&]start=\d+/g, "")
        let mp = this.maxPageFromStart(html)
        if (mp > 1) {
            this.maxPageCache[key] = mp
        } else if (this.maxPageCache[key]) {
            mp = this.maxPageCache[key]
        }
        // 末页 / 参数异常时也别让 maxPage 缩回当前页之前
        let cur = page || 1
        if (mp < cur) mp = cur

        return { comics: comics, maxPage: mp }
    }

    // ==================== 解析：详情 ====================

    /** 详情页正文图片：限定在 `.article-fulltext` 内，避开底部相关推荐 */
    articleImages(html, limit) {
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
                if (limit && out.length >= limit) break
            }
        } finally {
            d.dispose()
        }
        return out
    }

    /** 详情页标题：`<h1>` 在 `.article-header` 里，翻页时尾巴会多出 ` - 第 N 页` */
    parseTitle(html) {
        let raw = ""
        let mh = html.match(/<div class="article-header">\s*<h1[^>]*>([\s\S]*?)<\/h1>/i)
        if (mh) raw = mh[1]
        else {
            let mt = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
            if (mt) raw = mt[1]
        }
        return String(raw)
            .replace(/<[^>]+>/g, "")
            .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&nbsp;/g, " ")
            .replace(/\s*-\s*第\s*\d+\s*页\s*$/, "")
            .replace(/\s+/g, " ")
            .trim()
    }

    /**
     * 张数标记。新作品简介里写 `[85P]`，也有 `[72+1P]` 这种（+N 是附赠图，
     * 实测不计入正文分页），所以只取加号前的主数。
     */
    parsePhotoCount(html) {
        let pat = /\[(\d+)\s*(?:\+[^\]]*)?P\]/i
        // 优先简介块（第二个 .article-info），其次 h1，最后全文
        let infos = []
        let re = /class="article-info">([\s\S]*?)<\/div>/g
        let m
        while ((m = re.exec(html)) !== null) infos.push(m[1])
        let cands = infos.concat([this.parseTitle(html), html])
        for (let i = 0; i < cands.length; i++) {
            let mm = String(cands[i] || "").match(pat)
            if (mm) {
                let v = parseInt(mm[1], 10)
                if (v > 0) return v
            }
        }
        return 0
    }

    /**
     * 详情页分页器里能看到的**最大**页码。
     * ⚠️ 新作品的分页器只渲染 `1..5` 就被截断（即使有 7 页），
     * 老作品（无 `[NNP]` 标记的那批）才渲染全部页码 —— 所以这个值只能当辅助。
     */
    maxPageFromNavPage(html) {
        let nav = this.paginationNav(html)
        if (!nav) return 0
        let re = /page=(\d+)/g
        let max = 0
        let m
        while ((m = re.exec(nav)) !== null) {
            let v = parseInt(m[1], 10)
            if (v > max) max = v
        }
        return max
    }

    /**
     * 详情页总页数 = max(张数推算, 分页器最大页码)。
     * 张数推算覆盖新作品（分页器截断到 5），分页器覆盖没有 `[NNP]` 的老作品。
     * ⚠️ 越界页码不 404，而是静默回落最后一页（实测 page=99 返回末页内容），
     * 所以绝不能靠「请求成功」判断还有没有下一页。
     */
    detailMaxPage(html) {
        let count = this.parsePhotoCount(html)
        let byCount = count > 0 ? Math.ceil(count / this.imgPerPage) : 0
        let byNav = this.maxPageFromNavPage(html)
        let n = Math.max(byCount, byNav, 1)
        return Math.min(n, this.detailPageCap)
    }

    /** 详情页解析：标题 / 封面 / 标签 / 时间 / 简介 / 张数 / 推荐 */
    parseDetail(html, id) {
        let title = this.parseTitle(html) || String(id)
        let cover = ""
        let orgs = []
        let models = []
        let uploadTime = ""
        let desc = ""

        let d = new HtmlDocument(html)
        try {
            // 标签：机构芯片不带 is-girl，模特芯片带。文本形如 `#XiuRen秀人网`
            let box = d.querySelector(".article-tags")
            if (box) {
                let els = box.querySelectorAll("a.tag")
                for (let i = 0; i < els.length; i++) {
                    let t = this.cleanLabel(els[i].text)
                    if (!t) continue
                    let cls = String(els[i].attributes["class"] || "")
                    if (/\bis-girl\b/.test(cls)) {
                        if (models.indexOf(t) < 0) models.push(t)
                    } else {
                        if (orgs.indexOf(t) < 0) orgs.push(t)
                    }
                }
            }

            // `.article-info` 有两个：第一个是时间（内含 <small>），第二个是简介
            let infos = d.querySelectorAll(".article-info")
            if (infos.length) {
                let small = infos[0].querySelector("small")
                let raw = small ? (small.text || "") : (infos[0].text || "")
                let md = String(raw).match(/(\d{1,2}):(\d{2})\s+(\d{1,2})-(\d{1,2})-(\d{4})/)
                if (md) {
                    uploadTime = md[5] + "-" + ("0" + md[4]).slice(-2) + "-" + ("0" + md[3]).slice(-2)
                        + " " + ("0" + md[1]).slice(-2) + ":" + md[2]
                }
            }
            if (infos.length > 1) {
                desc = String(infos[infos.length - 1].text || "").replace(/\s+/g, " ").trim()
            }
        } finally {
            d.dispose()
        }

        // 封面：站点没有 og:image，只能拿正文首图，再兜底站点图标
        let first = this.articleImages(html, 1)
        if (first.length) cover = first[0]
        if (!cover) cover = this.SITE_ICON

        let count = this.parsePhotoCount(html)

        // 简介：张数 + 机构 + 模特 + 时间 抬头，再拼站点原文。
        // ⚠️ Venera 的 description 是 SelectableText，不渲染 markdown；
        // 且列表卡片会把 `|` 换成换行（comic.dart），所以原文里的竖线要清掉。
        let head = []
        if (count > 0) head.push(count + " 张图片")
        if (orgs.length) head.push("机构：" + orgs.join("、"))
        if (models.length) head.push("模特：" + models.join("、"))
        if (uploadTime) head.push("时间：" + uploadTime)
        let body = desc.replace(/\|/g, "/").replace(/\s+/g, " ").trim()
        let description = head.join("\n")
        if (body) description += (description ? "\n\n" : "") + body

        // 底部相关推荐（.bottom-articles 里同样是 .items-row 卡片）
        let recommend = []
        let bi = html.indexOf("bottom-articles")
        if (bi >= 0) {
            try {
                recommend = this.parseList(html.slice(bi))
            } catch (e) {
                recommend = []
            }
        }

        let tags = {}
        if (orgs.length) tags["机构"] = orgs
        if (models.length) tags["模特"] = models

        return {
            title: title,
            cover: cover,
            tags: tags,
            orgNames: orgs,
            modelNames: models,
            uploadTime: uploadTime,
            count: count,
            description: description,
            recommend: recommend,
            maxPage: this.detailMaxPage(html),
        }
    }

    // ==================== 发现页 ====================

    // 首页（最新）与热门各自一个独立探索页，都支持翻页
    explore = [
        {
            title: "Xiutaku-最新",
            type: "multiPageComicList",
            load: (page) => this.fetchList("/", page),
        },
        {
            title: "Xiutaku-热门",
            type: "multiPageComicList",
            load: (page) => this.fetchList("/hot", page),
        },
    ]

    // ==================== 随机抽取 ====================

    pickRandomGirlId() {
        let span = this.girlPoolMax - this.girlPoolMin + 1
        return this.girlPoolMin + Math.floor(Math.random() * span)
    }

    /**
     * 随机打开一位模特的作品列表。
     * 第 1 页重新抽（每次进这个分类都是新人），翻页沿用同一位。
     * 抽到空页 / 404 就换一个重抽 —— 站点虽然有 1662 位模特挂在 `/girl` 索引上，
     * 但那只是索引显示的一部分，编号区间里还有一堆没上索引的活号，所以按编号抽比按索引抽覆盖更全。
     */
    async loadRandomModel(page) {
        let p = page || 1
        if (p > 1 && this.randomPick) {
            return this.fetchList("/girl/" + this.randomPick, p)
        }
        let last = null
        for (let i = 0; i < 5; i++) {
            let id = this.pickRandomGirlId()
            try {
                let res = await this.fetchList("/girl/" + id, p)
                if (res.comics.length > 0) {
                    this.randomPick = id
                    return res
                }
                last = res
            } catch (e) {
                // 这个号不存在或已下架，换一个
            }
        }
        return last || { comics: [], maxPage: 1 }
    }

    // ==================== 分类 ====================

    category = {
        title: "Xiutaku",
        parts: [
            {
                name: "秀人全集",
                type: "fixed",
                itemType: "category",
                categories: [
                    "秀人全集",
                    "XiuRen秀人网", "XiaoYu画语界", "YouMi尤蜜荟", "Imiss爱蜜社",
                    "MyGirl美媛馆", "MFStar模范学院", "HuaYang花漾", "FeiLin嗲囡囡",
                    "MiStar魅妍社", "YouWu尤物馆", "XingYan星颜社", "MiiTao蜜桃社",
                    "BoLoli兔几盟", "DKGirl御女郎", "Micat猫萌榜", "Candy糖果画报",
                    "HuaYan花の颜", "Uxing优星馆", "LeYuan星乐园", "Taste顽味生活",
                    "WingS影私荟", "MintYe薄荷叶", "MTMeng模特联盟",
                ],
                categoryParams: [
                    "all",
                    "brand/1", "brand/23", "brand/17", "brand/5",
                    "brand/4", "brand/2", "brand/21", "brand/10",
                    "brand/3", "brand/7", "brand/22", "brand/9",
                    "brand/6", "brand/15", "brand/20", "brand/18",
                    "brand/14", "brand/8", "brand/13", "brand/12",
                    "brand/11", "brand/16", "brand/19",
                ],
            },
            {
                name: "人气模特",
                type: "fixed",
                itemType: "category",
                categories: [
                    "随机抽取",
                    "杨晨晨", "周于希", "王雨纯", "朱可儿",
                    "芝芝Booty", "王馨瑶", "尤妮丝", "陆萱萱",
                    "绮里嘉", "果儿", "梦心月", "唐安琪",
                    "糯美子", "绯月樱", "芝芝", "妲己",
                    "允爾", "鱼子酱", "小热巴", "就是阿朱啊",
                    "安然", "模特合集", "黄乐然", "奶瓶土肥圆",
                    "陈小喵"
                ],
                categoryParams: [
                    "random",
                    "girl/290", "girl/322", "girl/435", "girl/585",
                    "girl/478", "girl/63", "girl/468", "girl/519",
                    "girl/73", "girl/409", "girl/510", "girl/646",
                    "girl/547", "girl/423", "girl/429", "girl/267",
                    "girl/642", "girl/640", "girl/391", "girl/507",
                    "girl/575", "girl/36", "girl/382", "girl/474",
                    "girl/537"
                ],
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: (category, param, options, page) => {
            let p = String(param || "").trim()
            if (!p) return Promise.resolve({ comics: [], maxPage: 1 })
            // 特殊 param：random 抽一位模特
            if (p === "random") return this.loadRandomModel(page)
            // 其余是全路径："all" / "brand/1" / "girl/290"
            return this.fetchList(p === "all" ? "/" : "/" + p, page)
        },
    }

    // ==================== 搜索 ====================

    search = {
        load: (keyword, options, page) => {
            let kw = String(keyword || "").trim()
            if (!kw) return Promise.resolve({ comics: [], maxPage: 1 })
            let p = page || 1

            // 粘详情链接 / 纯数字 id 时直接出单条详情卡（id 可以是一位数）
            let m = kw.match(/xiutaku\.com\/(\d+)/i)
            if (!m && /^\d+$/.test(kw)) m = [kw, kw]
            if (m) {
                if (p > 1) return Promise.resolve({ comics: [], maxPage: 1 })
                return this.detailCard(m[1])
            }

            let url = "/?search=" + encodeURIComponent(kw)
            if (p > 1) url += "&start=" + ((p - 1) * this.perPage)
            return this.fetchList(url, 1)
        },
        optionList: [],
    }

    /** 详情 id → 单条 Comic 卡（搜索里粘贴链接时用） */
    async detailCard(id) {
        try {
            let html = await this.fetchPage(this.detailUrl(id, 1))
            let info = this.parseDetail(html, id)
            return {
                comics: [new Comic({
                    id: this.normId(id),
                    title: info.title,
                    subTitle: info.modelNames.concat(info.orgNames).join(", "),
                    cover: info.cover || this.SITE_ICON,
                    tags: info.modelNames.concat(info.orgNames),
                })],
                maxPage: 1,
            }
        } catch (e) {
            return { comics: [], maxPage: 1 }
        }
    }

    // ==================== 详情 / 章节 ====================

    comic = {
        loadInfo: async (id) => {
            let cid = this.normId(id)
            let html = await this.fetchPage(this.detailUrl(cid, 1))
            let info = this.parseDetail(html, cid)
            let chapterName = info.count > 0 ? info.count + " 张图片" : "全部图片"
            return new ComicDetails({
                title: info.title,
                cover: info.cover || this.SITE_ICON,
                tags: info.tags,
                description: info.description,
                chapters: { "0": chapterName },
                uploadTime: info.uploadTime,
                url: this.detailUrl(cid, 1),
                recommend: info.recommend,
                maxPage: info.maxPage,
            })
        },

        loadEp: async (comicId, epId) => {
            let cid = this.normId(comicId)
            // 第 1 页顺带拿到总页数
            let first = await this.fetchPage(this.detailUrl(cid, 1))
            let images = this.articleImages(first)
            let total = this.detailMaxPage(first)

            if (total > 1) {
                let pages = []
                for (let p = 2; p <= total; p++) pages.push(p)
                // 小批并发，单页失败只丢那一页，别整本翻车
                for (let i = 0; i < pages.length; i += 4) {
                    let batch = pages.slice(i, i + 4)
                    let htmls = await Promise.all(batch.map((p) => {
                        return this.fetchPage(this.detailUrl(cid, p)).catch(() => "")
                    }))
                    for (let j = 0; j < htmls.length; j++) {
                        if (!htmls[j]) continue
                        let part = this.articleImages(htmls[j])
                        for (let k = 0; k < part.length; k++) images.push(part[k])
                    }
                }
            }

            // 去重（分页理论上不重叠，防站点抖动导致同一张来两次）
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
         * 图片走 i.xiutaku.com，实测无防盗链（带不带 Referer 都 200）。
         * 只补 headers，绝不改写 url —— 本地漫画的 cover.webp / file:// 必须原样透传。
         */
        onImageLoad: (url) => {
            return { headers: this.headers() }
        },

        onThumbnailLoad: (url) => {
            return { headers: this.headers() }
        },

        /**
         * 标签芯片点击：机构名 / 模特名 → 关键词搜索。
         * （onClickTag 是同步钩子、拿不到 slug，所以走搜索而不是分类页；
         * 标题里带模特名和机构名，搜索命中率够用。）
         */
        onClickTag: (namespace, tag) => {
            let t = String(tag || "").trim()
            if (!t) return null
            if (/^https?:\/\//i.test(t)) {
                try {
                    UI.launchUrl(t)
                } catch (e) { }
                return null
            }
            return { page: "search", attributes: { text: t } }
        },

        idMatch: "xiutaku\\.com/(\\d+)",
    }
}