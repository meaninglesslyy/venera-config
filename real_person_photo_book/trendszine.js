const DEFAULT_BASE = "https://trendszine.com"

// 站点图标：封面兜底，保证 cover 永不为空串
const SITE_ICON = "https://trendszine.com/wp-content/uploads/2023/10/cropped-fenglogo-192x192.png"

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// ===== 分类数据：[显示名, 相对路径] =====
// 路径末段为 tag slug 或分类 path，构造时逐段编码

const PART_FENGLIU = [
    ["相約中國", "tag/相約中國"],
    ["麗圖100", "tag/麗圖100"],
    ["JVID", "tag/jvid"],
    ["推女郎", "tag/推女郎"],
    ["PANS寫真", "tag/pans"],
    ["北京天使", "tag/北京天使"],
    ["潘多拉", "tag/潘多拉"],
    ["轟趴貓", "tag/轟趴貓"],
    ["韓國模特養成", "tag/韓國模特養成"],
    ["無忌影社", "tag/無忌影社"],
    ["AI圖區", "tag/ai圖區"],
    ["A4U", "tag/a4u"],
    ["國模人體", "tag/國模人體"],
    ["日模人體", "tag/日模人體"],
    ["韓模人體", "tag/韓模人體"],
    ["港模人體", "tag/港模人體"],
    ["臺模人體", "tag/臺模人體"],
    ["其他人體", "tag/其他人體"],
]

const PART_ZAZHI = [
    ["性感寫真", "tag/性感寫真"],
    ["頭條女神", "tag/頭條女神"],
    ["PANS寫真", "tag/pans"],
    ["愛絲", "tag/愛絲"],
    ["果團網", "tag/果團網"],
    ["推女神", "tag/推女神"],
    ["蜜絲", "tag/蜜絲"],
    ["妖精社", "tag/妖精社"],
    ["SLADY獵女神", "tag/slady獵女神"],
    ["ArtGravia", "tag/artgravia"],
    ["尤美", "tag/尤美"],
]

const PART_XIUREN = [
    ["美媛館", "tag/美媛館"],
    ["尤蜜薈", "tag/尤蜜薈"],
    ["愛蜜社", "tag/愛蜜社"],
    ["模范學院", "tag/模范學院"],
    ["愛尤物", "tag/愛尤物"],
    ["花漾", "tag/花漾"],
    ["語畫界", "tag/語畫界"],
    ["FEILIN嗲囡囡", "tag/feilin嗲囡囡"],
    ["蜜桃社", "tag/蜜桃社"],
    ["星顏社", "tag/星顏社"],
]

const PART_HANGUO = [
    ["ArtGravia 藝術格拉維亞", "category/hanguo/artgravia"],
    ["DJAWA 大佳玩", "category/hanguo/djawa"],
    ["LEEHEE EXPRESS 利熙快運", "category/hanguo/leehee-express"],
    ["Loozy 淫惰少女", "category/hanguo/loozy"],
    ["PURE MEDIA 純媒體", "category/hanguo/pure-media"],
    ["Bimilstory 波咪故事", "category/hanguo/bimilstory"],
    ["BLUECAKE 藍色蛋糕", "category/hanguo/bluecake"],
    ["Espacia Korea 韓國埃斯帕西亞", "category/hanguo/espacia-korea"],
    ["Moon Night Snap 月夜快照", "category/hanguo/moon-night-snap"],
    ["CreamSoda 奶油蘇打", "category/hanguo/creamsoda"],
    ["BUNNY 俏兔子", "category/hanguo/bunny"],
    ["SAINT Photolife 聖光生活", "category/hanguo/saint-photolife"],
    ["Fantasy Story 幻想故事", "category/hanguo/fantasy-story"],
    ["HIGH FANTASY 極度幻想", "category/hanguo/high-fantasy"],
    ["JOApictures", "category/hanguo/joapictures"],
    ["KIMLEMON 金檸檬", "category/hanguo/kimlemon"],
    ["KiSiA 唇印", "category/hanguo/kisia"],
    ["Korean Realgraphic 真實寶貝", "category/hanguo/korean-realgraphic"],
    ["Lilynah 莉莉娜", "category/hanguo/lilynah"],
    ["MISS TOUCH 愛觸少女", "category/hanguo/miss-touch"],
    ["NWORKS", "category/hanguo/nworks"],
    ["ParanHosu", "category/hanguo/paranhosu"],
    ["Patreon 派特隆", "category/hanguo/patreon-hanguo"],
    ["PhotoChips 純誘寫真", "category/hanguo/photochips"],
    ["PINK 粉少女", "category/hanguo/pink"],
    ["PUSSYLET 軟貓寫真", "category/hanguo/pussylet"],
    ["ROGLE 羅格寫真", "category/hanguo/rogle"],
    ["SIDAM 西達姆", "category/hanguo/sidam"],
    ["SWEETBOX 甜盒", "category/hanguo/sweetbox"],
    ["SWEETHEBE 甜心", "category/hanguo/sweethebe"],
    ["Yo-U 优悠少女", "category/hanguo/yo-u"],
    ["CREAM PIE 奶油派", "category/hanguo/cream-pie"],
]

const PART_RIBEN = [
    ["FLASH フラッシュ", "tag/flash-フラッシュ"],
    ["FRIDAY フライデー", "tag/friday-フライデー"],
    ["Weekly SPA! 週刊SPA!", "tag/weekly-spa-週刊spa"],
    ["Weekly Playboy 週刊プレイボーイ", "tag/weekly-playboy-週刊プレイボーイ"],
    ["MINISUKA.TV", "tag/minisuka-tv"],
    ["Graphis", "tag/graphis"],
    ["Nogizaka46 乃木坂46", "tag/nogizaka46-乃木坂46"],
    ["YOUNG MAGAZINE ヤングマガジン", "tag/young-magazine-ヤングマガジン"],
    ["Young Jump ヤングジャンプ", "tag/young-jump-ヤングジャンプ"],
    ["ENTAME 月刊エンタメ", "tag/entame-月刊エンタメ"],
    ["B.L.T ビーエルティー", "tag/b-l-t-ビーエルティー"],
    ["NMB48", "tag/nmb48"],
    ["AKB48", "tag/akb48"],
    ["Keyakizaka46 欅坂46", "tag/keyakizaka46-欅坂46"],
    ["SHUKAN TAISHU 週刊大衆", "tag/shukan-taishu-週刊大衆"],
    ["Ex-Taishu EX大衆", "tag/ex-taishu-ex大衆"],
    ["Young Gangan ヤングガンガン", "tag/young-gangan-ヤングガンガン"],
    ["Shukan Jitsuwa 週刊実話", "tag/shukan-jitsuwa-週刊実話"],
    ["ギルドデジタル写真集", "tag/ギルドデジタル写真集"],
    ["Young Animal ヤングアニマル", "tag/young-animal-ヤングアニマル"],
    ["BIG COMIC SPIRITS ビッグコミックスピリッツ", "tag/big-comic-spirits-ビッグコミックスピリッツ"],
    ["HINATAZAKA46 日向坂46", "tag/hinatazaka46-日向坂46"],
    ["Shukan Post 週刊ポスト", "tag/shukan-post-週刊ポスト"],
    ["Shonen Magazine 週刊少年マガジン", "tag/shonen-magazine-週刊少年マガジン"],
    ["Young Champion ヤングチャンピオン", "tag/young-champion-ヤングチャンピオン"],
    ["Sakurazaka46 櫻坂46", "tag/sakurazaka46-櫻坂46"],
    ["Shukan Gendai 週刊現代", "tag/shukan-gendai-週刊現代"],
    ["ヤンマガWeb", "tag/ヤンマガweb"],
    ["SHONEN SUNDAY 少年サンデー", "tag/shonen-sunday-少年サンデー"],
    ["HKT48", "tag/hkt48"],
    ["Shonen Champion 少年チャンピオン", "tag/shonen-champion-少年チャンピオン"],
    ["SKE48", "tag/ske48"],
    ["Cyzo サイゾー", "tag/cyzo-サイゾー"],
    ["Morning Musume モーニング娘。", "tag/morning-musume-モーニング娘。"],
    ["UTB アップトゥボーイ", "tag/utb-アップトゥボーイ"],
    ["Shukan Bunshun 週刊文春", "tag/shukan-bunshun-週刊文春"],
    ["週プレ PHOTO BOOK", "tag/週プレ-photo-book"],
    ["BUBKA ブブカ", "tag/bubka-ブブカ"],
    ["NGT48", "tag/ngt48"],
    ["Ray レイ Magazine", "tag/ray-レイ-magazine"],
    ["Manga Action 漫画アクション", "tag/manga-action-漫画アクション"],
    ["ＦＲＩＤＡＹデジタル写真集", "tag/ｆｒｉｄａｙデジタル写真集"],
    ["AR アール MAGAZINE", "tag/ar-アール-magazine"],
    ["アサ芸Secret", "tag/アサ芸secret"],
    ["STRiKE!", "tag/strike"],
]

// 独立 tag（不算分区，但加进分类页）
const PART_INDEPENDENT = [
    ["欧美", "category/oumei"],
    ["泰国", "category/taiguo"],
    ["精选Coser", "category/cosplay/best-coser"],
]

// ===== 基础工具 =====

// 逐段编码路径（保留 /），中文/日文 slug 安全
function buildPath(param, page) {
    let segs = String(param).split("/")
    let enc = segs.map(function (s) {
        return encodeURIComponent(s)
    }).join("/")
    let p = page && page > 1 ? page : 1
    return DEFAULT_BASE + "/" + enc + (p > 1 ? "/page/" + p : "")
}

function requestHeaders() {
    return {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
}

// 绝对化 URL
function abs(u, base) {
    if (!u) return ""
    u = String(u).trim()
    if (!u || u.indexOf("data:") === 0) return ""
    if (/^https?:\/\//i.test(u)) return u
    if (u.indexOf("//") === 0) return "https:" + u
    if (u.charAt(0) === "/") return (base || DEFAULT_BASE) + u
    return (base || DEFAULT_BASE) + "/" + u
}

// GET HTML，带重试兜瞬时错误；非 200 抛错
async function fetchHtml(url) {
    let last = null
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            let res = await Network.get(url, requestHeaders())
            if (res.status === 200) return res.body
            last = `Invalid status code: ${res.status} (${url})`
        } catch (e) {
            last = e
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw last
}

// ===== 列表解析 =====

// 从详情 URL 提取 id：https://trendszine.com/20261118213693.html -> 20261118213693
function idFromUrl(u) {
    let m = String(u || "").match(/\/(\d+)\.html/)
    return m ? m[1] : ""
}

// 从分页控件提取最大页码（文本形如 "Page138" / "Page2,433" / "Next →"）
function maxPageFromDoc(doc) {
    let nums = doc.querySelectorAll(".page-numbers")
    let max = 0
    for (let el of nums) {
        // 去掉千分位逗号后再取整数，避免 "Page2,433" 被截成 2
        let t = String(el.text || "").replace(/,/g, "")
        let m = t.match(/(\d+)/)
        if (!m) continue
        let n = parseInt(m[1], 10)
        if (!isNaN(n) && n > max) max = n
    }
    return max > 0 ? max : 1
}

// 解析列表页 -> {comics, maxPage}
function parseList(html, isFirstPage) {
    let doc = new HtmlDocument(html)
    try {
        let comics = []
        let arts = doc.querySelectorAll("article")
        for (let art of arts) {
            let titleEl = art.querySelector(".entry-title a")
            if (!titleEl) continue
            let href = titleEl.attributes["href"] || ""
            let id = idFromUrl(href)
            let title = String(titleEl.text || "").trim()
            if (!id || !title) continue
            let coverEl = art.querySelector(".post-image img") || art.querySelector(".wp-post-image")
            let cover = coverEl ? abs(coverEl.attributes["src"] || "", DEFAULT_BASE) : ""
            if (!cover) cover = SITE_ICON
            let dateEl = art.querySelector(".posted-on time")
            let date = dateEl ? String(dateEl.text || "").trim() : ""
            comics.push(new Comic({
                id: id,
                title: title,
                subTitle: date,
                cover: cover,
                tags: [],
                description: "",
            }))
        }
        return { comics: comics, maxPage: maxPageFromDoc(doc) }
    } finally {
        doc.dispose()
    }
}

// ===== 源 =====

class Trendszine extends ComicSource {
    name = "风流杂志"

    key = "trendszine"

    version = "1.1.0"

    minAppVersion = "1.6.0"

    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/trendszine.js"

    // 探索页：只有一个 tab，内容取自网站首页
    explore = [
        {
            title: "风流杂志",
            type: "multiPageComicList",
            load: async (page) => {
                let p = page && page > 1 ? page : 1
                let url = DEFAULT_BASE + "/" + (p > 1 ? "page/" + p : "")
                let html = await fetchHtml(url)
                return parseList(html, p === 1)
            },
        },
    ]

    // 分类页：五个分区 + 一个独立 tag 区块
    category = {
        title: "风流杂志",
        parts: [
            {
                name: "风流",
                type: "fixed",
                categories: PART_FENGLIU.map(function (it) { return it[0] }),
                categoryParams: PART_FENGLIU.map(function (it) { return it[1] }),
                itemType: "category",
            },
            {
                name: "杂志",
                type: "fixed",
                categories: PART_ZAZHI.map(function (it) { return it[0] }),
                categoryParams: PART_ZAZHI.map(function (it) { return it[1] }),
                itemType: "category",
            },
            {
                name: "秀人网",
                type: "fixed",
                categories: PART_XIUREN.map(function (it) { return it[0] }),
                categoryParams: PART_XIUREN.map(function (it) { return it[1] }),
                itemType: "category",
            },
            {
                name: "韩国",
                type: "fixed",
                categories: PART_HANGUO.map(function (it) { return it[0] }),
                categoryParams: PART_HANGUO.map(function (it) { return it[1] }),
                itemType: "category",
            },
            {
                name: "日本",
                type: "fixed",
                categories: PART_RIBEN.map(function (it) { return it[0] }),
                categoryParams: PART_RIBEN.map(function (it) { return it[1] }),
                itemType: "category",
            },
            {
                name: "独立",
                type: "fixed",
                categories: PART_INDEPENDENT.map(function (it) { return it[0] }),
                categoryParams: PART_INDEPENDENT.map(function (it) { return it[1] }),
                itemType: "category",
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let p = String(param || "").trim()
            if (!p) throw `Empty category param: ${category}`
            let html = await fetchHtml(buildPath(p, page))
            return parseList(html, (page || 1) === 1)
        },
    }

    search = {
        load: async (keyword, options, page) => {
            let kw = encodeURIComponent(String(keyword || "").trim())
            let p = page && page > 1 ? page : 1
            let url = DEFAULT_BASE + "/?s=" + kw + (p > 1 ? "&paged=" + p : "")
            let html = await fetchHtml(url)
            return parseList(html, p === 1)
        },
    }

    comic = {
        loadInfo: async (id) => {
            let nid = String(id || "").trim()
            if (!/^\d+$/.test(nid)) throw "Invalid comic id: " + id
            let url = detailPageUrl(nid, 1)
            let html = await fetchHtml(url)
            let doc = new HtmlDocument(html)
            let title = nid
            let cover = SITE_ICON
            let date = ""
            let total = 0
            try {
                let titleEl = doc.querySelector("h1.entry-title")
                title = titleEl ? String(titleEl.text || "").trim() : nid
                collectImages(doc).forEach(function () { total++ })
                let coverEl = doc.querySelector(".entry-content img") || doc.querySelector(".post-image img") || doc.querySelector("article img")
                cover = coverEl ? abs(coverEl.attributes["src"] || "", DEFAULT_BASE) : SITE_ICON
                let dateEl = doc.querySelector(".posted-on time") || doc.querySelector("time")
                date = dateEl ? String(dateEl.text || "").trim() : ""
                // 统计全部分页图片总数（后续页并发抓取）
                let pages = maxPostPage(doc)
                if (pages > 1) {
                    let tasks = []
                    for (let p = 2; p <= pages; p++) {
                        tasks.push(fetchHtml(detailPageUrl(nid, p)).then(function (h2) {
                            let d2 = new HtmlDocument(h2)
                            try {
                                return collectImages(d2).length
                            } finally {
                                d2.dispose()
                            }
                        }).catch(function () { return 0 }))
                    }
                    let counts = await Promise.all(tasks)
                    counts.forEach(function (n) { total += n })
                }
                return new ComicDetails({
                    id: nid,
                    title: title || nid,
                    cover: cover || SITE_ICON,
                    description: total > 0 ? total + " 张（" + pages + " 页）" : "",
                    tags: {},
                    chapters: { "0": "View All Photos" },
                    updateTime: date,
                    url: url,
                })
            } finally {
                doc.dispose()
            }
        },

        loadEp: async (comicId, epId) => {
            let nid = String(comicId || "").trim()
            if (!/^\d+$/.test(nid)) throw "Invalid comic id: " + comicId
            // 第一页
            let html = await fetchHtml(detailPageUrl(nid, 1))
            let doc = new HtmlDocument(html)
            let pages = 1
            let all = []
            try {
                pages = maxPostPage(doc)
                all = collectImages(doc)
            } finally {
                doc.dispose()
            }
            // 后续分页（{id}.html/2 ... /N）并发抓取，合并去重保序
            let seen = {}
            all.forEach(function (u) { seen[u] = true })
            if (pages > 1) {
                let tasks = []
                for (let p = 2; p <= pages; p++) {
                    tasks.push(fetchHtml(detailPageUrl(nid, p)).then(function (h) {
                        let d = new HtmlDocument(h)
                        try {
                            return collectImages(d)
                        } finally {
                            d.dispose()
                        }
                    }).catch(function () { return [] }))
                }
                let pageLists = await Promise.all(tasks)
                for (let p = 0; p < pageLists.length; p++) {
                    for (let u of pageLists[p]) {
                        if (seen[u]) continue
                        seen[u] = true
                        all.push(u)
                    }
                }
            }
            if (!all.length) throw "没有解析到图片"
            return { images: all }
        },

        onImageLoad: (url, comicId, epId) => {
            let fixed = abs(url, DEFAULT_BASE)
            let cfg = { headers: requestHeaders() }
            if (fixed && fixed !== url) cfg.url = fixed
            return cfg
        },

        onThumbnailLoad: (url) => {
            let fixed = abs(url, DEFAULT_BASE)
            let cfg = { headers: requestHeaders() }
            if (fixed && fixed !== url) cfg.url = fixed
            return cfg
        },
    }
}

// 收集详情页正文图片：取 .entry-content 内所有 img 的 src/srcset，过滤广告/图标，去重保序
// 注意：详情页单个 <img> 的 srcset 里含 768w 缩略变体，collectImages 只用 src 原图，
//       但 WordPress 分页文章每页最多 25 张，需由 loadEp 遍历多页合并。

// 详情页总页数：WordPress 分页文章，控件 .post-page-numbers，URL 形如 {id}.html/N
function maxPostPage(doc) {
    let els = doc.querySelectorAll(".post-page-numbers")
    let max = 1
    for (let el of els) {
        // "1" / "2" / "下一頁 »" —— 取文本里的整数，忽略“下一頁”
        let t = String(el.text || "").trim()
        let m = t.match(/^(\d+)$/)
        if (!m) continue
        let n = parseInt(m[1], 10)
        if (n > max) max = n
    }
    return max
}

// 详情页某分页 URL：page 1 = {id}.html，page N = {id}.html/N
function detailPageUrl(id, page) {
    let p = page && page > 1 ? page : 1
    return DEFAULT_BASE + "/" + id + ".html" + (p > 1 ? "/" + p : "")
}

// 收集详情页正文图片：取 .entry-content 内所有 img 的 src/data-src，过滤广告/图标，去重保序
function collectImages(doc) {
    let out = []
    let seen = {}
    let root = doc.querySelector(".entry-content") || doc
    let imgs = root.querySelectorAll("img")
    for (let img of imgs) {
        let a = img.attributes || {}
        let cls = String(a["class"] || "").toLowerCase()
        let src = a["src"] || a["data-src"] || a["data-original"] || ""
        if (!src) continue
        // 排除明显的非正文图：广告追踪像素 / 头像 / logo / 表情
        if (/(avatar|logo|emoji|pixel|tracking|icon)/.test(cls)) continue
        let absUrl = abs(src, DEFAULT_BASE)
        if (!absUrl || seen[absUrl]) continue
        if (absUrl.indexOf("data:") === 0) continue
        // 只保留常见图片扩展名
        if (!/\.(webp|jpe?g|png|gif)(\?|$)/i.test(absUrl)) continue
        seen[absUrl] = true
        out.push(absUrl)
    }
    return out
}
