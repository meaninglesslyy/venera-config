const DEFAULT_BASE = "https://m.pic12345.net"
const SITE_ICON = DEFAULT_BASE + "/images/logo.png"
const MOBILE_UA =
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36"

// 图片防盗链要求 Referer 的 host 与当前站点一致，这里随 getBase() 更新。
let CURRENT_BASE = DEFAULT_BASE

// 列表封面缓存：详情页优先用列表里那张（跟用户在列表里看到的一致，且少一次猜图）
const COVER_CACHE = {}

// 频道 id → 频道名，用于详情页的「频道」标签
const CHANNEL_NAMES = {}

// 详情页缓存：loadInfo 与 loadEp 各要抓一次同一个页面，合并成一次。
// 站点对短时间高频请求会直接掐连接，能省一次就省一次。
let INFO_CACHE = {}
const INFO_CACHE_MAX = 200

const TAG_GROUPS = [
    { title: "推荐套图", items: [
        ["爱丝", "73"],
        ["ROSI", "4"],
        ["丽柜", "9"],
        ["妖精社", "100"],
        ["嘉丽", "103"],
        ["雅拉伊", "101"],
        ["爱秀", "22"],
        ["语画界", "102"],
        ["青豆客", "92"],
        ["尤蜜荟", "84"],
        ["御女郎", "76"],
        ["果团网", "83"],
        ["蜜桃社", "88"],
        ["猫萌榜", "89"],
        ["糖果画报", "87"],
        ["星乐园", "93"],
        ["顽味生活", "72"],
        ["花漾", "86"],
        ["克拉女神", "68"],
        ["尤果网", "65"],
        ["爱尤物", "11"],
        ["头条女神", "17"],
        ["秀人网", "8"],
        ["嗲囡囡", "78"],
        ["波菠社", "80"],
        ["第四印象", "18"],
        ["爱蜜社", "81"],
        ["推女神", "75"],
        ["魅妍社", "74"],
        ["模范学院", "77"],
        ["美腿宝贝", "96"],
        ["美媛馆", "2"],
        ["尤物馆", "85"],
        ["优星馆", "91"],
        ["花の颜", "94"],
        ["激萌文化", "90"],
        ["蜜丝", "70"],
        ["星颜社", "95"],
        ["轰趴猫", "82"],
        ["推女郎", "71"],
        ["动感小站", "21"],
        ["禁忌摄影", "79"],
        ["TyingArt", "56"]
    ] },
    { title: "韩系套图", items: [
        ["ARTGRAVIA", "156"],
        ["Bimilstory", "200"],
        ["BlueCake", "198"],
        ["BUNNY", "194"],
        ["CoCo", "186"],
        ["Cream pie", "180"],
        ["CreamSoda", "193"],
        ["Donggeuran", "210"],
        ["Espacia Korea", "199"],
        ["Fantasy Story", "183"],
        ["Fetishkorea", "203"],
        ["GlamARchive", "182"],
        ["HIGH FANTASY", "211"],
        ["JOApictures", "181"],
        ["KIMLEMON", "206"],
        ["KiSiA", "192"],
        ["Leehee Express", "201"],
        ["Lilynah", "212"],
        ["Limepunch", "189"],
        ["MARK", "188"],
        ["MilkyBomb", "187"],
        ["MISS TOUCH", "209"],
        ["Muchenne", "196"],
        ["Paranhosu", "205"],
        ["Patreon", "208"],
        ["PhotoChips", "204"],
        ["PINK", "179"],
        ["Pure Media", "207"],
        ["SaintPhotoLife", "202"],
        ["SeeShe", "191"],
        ["Sehee", "184"],
        ["Supreme", "197"],
        ["SWEETBOX", "213"],
        ["SWEETHB", "185"],
        ["WXY", "190"],
        ["YO-U", "195"]
    ] },
    { title: "二次元套图", items: [
        ["BamBi", "110"],
        ["Coser面饼仙儿", "154"],
        ["DJAWA", "128"],
        ["eloise软软", "127"],
        ["Kuuko W", "145"],
        ["Leah梓未", "114"],
        ["Money冷冷", "113"],
        ["Natsuko夏夏子", "137"],
        ["NinJa阿寨寨", "117"],
        ["Nyako喵子", "155"],
        ["Potato Godzilla", "108"],
        ["rioko凉凉子", "147"],
        ["yuuhui玉汇", "104"],
        ["阿包也是兔娘", "134"],
        ["白银81", "153"],
        ["蠢沫沫", "144"],
        ["刺青Poi", "120"],
        ["抖娘-利世", "136"],
        ["黑川", "142"],
        ["胡桃猫Kurumineko", "139"],
        ["虎森森", "131"],
        ["绞肉姬", "130"],
        ["九言", "118"],
        ["翎柒菜菜", "112"],
        ["鹿八岁", "129"],
        ["鹿野希", "125"],
        ["洛璃 LoLiSAMA", "135"],
        ["蜜汁猫裘", "132"],
        ["喵糖映画", "152"],
        ["奈汐酱nice", "121"],
        ["七月喵子", "119"],
        ["绮太郎_Kitaro", "141"],
        ["清水由乃", "133"],
        ["秋和柯基", "150"],
        ["日奈娇", "140"],
        ["三度_69", "126"],
        ["神楽坂真冬", "148"],
        ["是三不是世w", "124"],
        ["水淼Aqua", "107"],
        ["兔玩映画", "151"],
        ["雯妹不讲道理", "106"],
        ["无颜小天使", "123"],
        ["无影喵喵", "122"],
        ["香草喵露露", "138"],
        ["小仓千代w", "146"],
        ["星澜是澜澜叫澜妹呀", "115"],
        ["星野咪兔", "109"],
        ["雪晴Astra", "105"],
        ["一笑芳香沁", "116"],
        ["桜井宁宁", "111"],
        ["桜桃喵", "143"],
        ["云溪溪", "149"]
    ] },
    { title: "经典套图1", items: [
        ["3Agirl套图", "169"],
        ["DDY Pantyhose", "176"],
        ["FetiArt尚物集", "159"],
        ["ISS系列", "168"],
        ["Leghacker", "166"],
        ["Leglegs", "173"],
        ["MASKED QUEEN", "167"],
        ["PDL潘多拉", "161"],
        ["SLADY猎女神", "158"],
        ["Tpimage", "163"],
        ["V女郎", "174"],
        ["WingS影私荟", "160"],
        ["YouMei尤美", "157"],
        ["过期米线线喵", "177"],
        ["紧急企划", "172"],
        ["纳丝摄影", "164"],
        ["年年nnian", "162"],
        ["我丝你想", "178"],
        ["许岚LAN", "171"],
        ["研研", "175"],
        ["鱼子酱Fish-私拍", "170"],
        ["育美", "165"]
    ] },
    { title: "经典套图2", items: [
        ["异思趣向", "24"],
        ["青丘女神", "38"],
        ["Pans写真", "12"],
        ["柔丝晴晴", "46"],
        ["卿卿雪儿", "42"],
        ["拍美VIP", "53"],
        ["梦幻小妖", "28"],
        ["丽图人像", "49"],
        ["波斯猫儿", "58"],
        ["炫彩摄影", "19"],
        ["丝间舞", "32"],
        ["中国腿模", "30"],
        ["中高艺图", "39"],
        ["原味妖妖", "36"],
        ["新九阳", "69"],
        ["小美套图", "62"],
        ["王朝贵足", "37"],
        ["丝艺影像", "70"],
        ["丝图阁", "57"],
        ["神艺缘", "15"],
        ["HeiSiAi", "25"],
        ["美束", "30"],
        ["51MODO", "54"],
        ["HeiSiMM", "51"],
        ["丝尚", "47"],
        ["丝宝", "43"],
        ["ru1mm", "13"],
        ["丽阁影像", "50"],
        ["丝雅写真", "52"],
        ["Legku写真", "35"]
    ] },
    { title: "经典套图3", items: [
        ["DGC套图", "10"],
        ["Wanibooks", "66"],
        ["TopQueen", "23"],
        ["Princess", "33"],
        ["NS Eyes", "44"],
        ["Image.tv", "34"],
        ["Imouto.tv", "59"],
        ["Hello! Pro", "20"],
        ["For-side", "64"],
        ["BWH", "29"],
        ["4K-STAR", "7"],
        ["TWO套图", "55"],
        ["Sabra.net", "3"],
        ["Minisuka", "67"],
        ["Bom套图", "63"],
        ["Bejean on", "61"],
        ["misty套图", "48"],
        ["RQ-STAR", "6"],
        ["WPB套图", "45"],
        ["YS Web", "27"],
        ["OnlyTease", "16"],
        ["Layered", "26"],
        ["Denise", "60"],
        ["未分类图", "13"]
    ] },
]

function elAttr(el, name) {
    if (!el) return ""
    let v = el.attributes[name]
    return v === undefined || v === null ? "" : String(v)
}

function abs(u, base) {
    if (!u) return ""
    u = String(u).trim()
    if (u.length === 0) return ""
    if (u.indexOf("//") === 0) return "https:" + u
    if (u.charAt(0) === "/") return base + u
    return u
}

function requestHeaders(base) {
    return {
        // 站点 WAF 会 RST rhttp(reqwest/hyper) 的 HTTP/2 流：
        //   Error: hyper_util::client::legacy::Error(SendRequest,
        //          hyper::Error(Http2, Error { kind: Reset(StreamId(..), PROTOCOL_ERROR, Remote) }))
        // 这个头让 Venera 的 JS 引擎把请求切到 Dart HttpClient（HTTP/1.1 + BoringSSL），实测 200。
        "http_client": "dart:io",
        "user-agent": MOBILE_UA,
        "referer": base + "/",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9",
    }
}

// 站点是 GBK：fetchBytes 拿原始字节，再 decodeGbk，Network.get 会被按 UTF-8 解成乱码。
async function fetchDoc(url, base) {
    let res = await Network.fetchBytes("GET", url, requestHeaders(base))
    if (res.status !== 200) throw `Invalid status code: ${res.status}`
    let html = Convert.decodeGbk(res.body)
    return new HtmlDocument(html)
}

// 分页文本：
//   频道页 / 首页：共2146页：第1页
//   搜索页：共101条/显示4页
function maxPageOf(doc) {
    let ap = doc.querySelector(".article_page")
    if (!ap) return 1
    let t = ap.text || ""
    let m = t.match(/共\s*(\d+)\s*页/)
    if (m) return parseInt(m[1], 10)
    m = t.match(/显示\s*(\d+)\s*页/)
    if (m) return parseInt(m[1], 10)
    return 1
}

// 关键词按 GBK 百分号编码：站点按 GBK 查库，UTF-8 会查出 0 条。
function gbkQuote(s) {
    try {
        let hex = Convert.hexEncode(Convert.encodeGbk(String(s)))
        let out = ""
        for (let i = 0; i + 1 < hex.length; i += 2) {
            out += "%" + hex.substring(i, i + 2)
        }
        return out
    } catch (e) {
        return encodeURIComponent(String(s))
    }
}

// 列表卡片：ul.PictureList > li > a[href=/tb/{频道}/{id}.html] > img + span
function parseCards(doc, base) {
    let out = []
    for (const li of doc.querySelectorAll(".PictureList li")) {
        let a = li.querySelector("a[href]")
        if (!a) continue
        let href = elAttr(a, "href")
        let m = href.match(/\/tb\/(\d+)\/(\d+)\.html/)
        if (!m) continue
        let id = "tb/" + m[1] + "/" + m[2] + ".html"
        let img = a.querySelector("img")
        let cover = abs(img ? elAttr(img, "src") || elAttr(img, "data-src") : "", base)
        if (cover) COVER_CACHE[m[2]] = cover
        let span = a.querySelector("span")
        // 搜索结果里 title 属性夹着 <font> 高亮标签，span 的 text 才是干净的
        let title = span ? (span.text || "").trim() : ""
        if (!title) title = elAttr(a, "title").replace(/<[^>]*>/g, "").trim()
        if (!title) title = m[2]
        out.push(new Comic({
            id: id,
            title: title,
            cover: cover || SITE_ICON,
            tags: [],
            description: "",
        }))
    }
    return out
}

function normalizeId(id) {
    let s = String(id || "").trim()
    if (/^https?:\/\//i.test(s)) {
        s = s.replace(/^https?:\/\/[^/]+/i, "")
    }
    s = s.replace(/^\/+/, "")
    if (/^\d+\/\d+\.html$/.test(s)) s = "tb/" + s
    return s
}

// 详情页解析一次、缓存一份，loadInfo / loadEp 共用，避免对同页重复请求。
async function fetchDetail(rel, base) {
    if (Object.keys(INFO_CACHE).length > INFO_CACHE_MAX) INFO_CACHE = {}
    let doc = await fetchDoc(base + "/" + rel, base)
    try {
        let t = doc.querySelector(".PsBox")
        let title = t ? (t.text || "").trim() : ""
        let images = []
        for (const img of doc.querySelectorAll(".ArticleImageBox img")) {
            let src = abs(elAttr(img, "src"), base)
            if (src && images.indexOf(src) < 0) images.push(src)
        }
        let numId = (rel.match(/(\d+)\.html$/) || [])[1] || ""
        let cover = COVER_CACHE[numId] || (images.length > 0 ? images[0] : "") || SITE_ICON
        let channel = (rel.match(/^tb\/(\d+)\//) || [])[1] || ""
        let tags = {}
        let chName = channel ? CHANNEL_NAMES[channel] : ""
        if (chName) tags["频道"] = [chName]
        let info = {
            title: title || rel,
            cover: cover,
            description: images.length > 0 ? "共 " + images.length + " 张图片" : "",
            tags: tags,
            url: base + "/" + rel,
            images: images,
        }
        INFO_CACHE[rel] = info
        return info
    } finally {
        doc.dispose()
    }
}

class Pic12345 extends ComicSource {
    name = "美女图库"

    key = "pic12345"

    version = "1.0.1"

    minAppVersion = "1.6.0"

    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/pic12345.js"

    settings = {
        baseUrl: {
            title: "站点地址（留空用默认；换域名时填新地址，不要带末尾斜杠）",
            type: "input",
            validator: null,
            default: "",
        },
    }

    getBase() {
        let custom = String(this.loadSetting("baseUrl") || "").trim()
        if (custom) {
            custom = custom.replace(/\/+$/, "")
            if (!/^https?:\/\//i.test(custom)) custom = "https://" + custom
            CURRENT_BASE = custom
            return custom
        }
        CURRENT_BASE = DEFAULT_BASE
        return DEFAULT_BASE
    }

    // 探索页 = 原站首页：最新 30 套，共 2146 页（频道 1 的列表，第 1 页就是首页那份）
    explore = [
        {
            title: "美女图库",
            type: "multiPageComicList",
            load: async (page) => {
                let base = this.getBase()
                let p = page <= 1 ? 1 : page
                let doc = await fetchDoc(base + "/tb/1/list_1_" + p + ".html", base)
                try {
                    return { comics: parseCards(doc, base), maxPage: maxPageOf(doc) }
                } finally {
                    doc.dispose()
                }
            },
        },
    ]

    // 分类页：全部取自 https://m.pic12345.net/pic12345.html 的六个分组（共 207 个标签）
    category = {
        title: "美女图库",
        parts: TAG_GROUPS.map(function (g) {
            return {
                name: g.title,
                type: "fixed",
                categories: g.items.map(function (it) {
                    return {
                        label: it[0],
                        target: {
                            page: "category",
                            attributes: { category: it[0], param: it[1] },
                        },
                    }
                }),
            }
        }),
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let base = this.getBase()
            let id = String(param || "").trim()
            if (!/^\d+$/.test(id)) throw `Invalid category param: ${param}`
            let url = page <= 1
                ? base + "/tb/" + id + "/"
                : base + "/tb/" + id + "/list_" + id + "_" + page + ".html"
            let doc = await fetchDoc(url, base)
            try {
                return { comics: parseCards(doc, base), maxPage: maxPageOf(doc) }
            } finally {
                doc.dispose()
            }
        },
    }

    search = {
        load: async (keyword, options, page) => {
            let base = this.getBase()
            let url = base + "/plus/search.php?keyword=" + gbkQuote(keyword) + "&pagesize=30"
            if (page > 1) url += "&PageNo=" + page
            let doc = await fetchDoc(url, base)
            try {
                return { comics: parseCards(doc, base), maxPage: maxPageOf(doc) }
            } finally {
                doc.dispose()
            }
        },
    }

    comic = {
        loadInfo: async (id) => {
            let base = this.getBase()
            let rel = normalizeId(id)
            if (!rel) throw "Invalid comic id"
            if (!/\.html$/.test(rel)) rel += ".html"
            let info = INFO_CACHE[rel] || await fetchDetail(rel, base)
            return new ComicDetails({
                id: rel,
                title: info.title,
                cover: info.cover,
                description: info.description,
                tags: info.tags,
                chapters: { "0": "View All Photos" },
                url: info.url,
            })
        },

        loadEp: async (comicId, epId) => {
            let base = this.getBase()
            let rel = normalizeId(comicId)
            if (!/\.html$/.test(rel)) rel += ".html"
            let info = INFO_CACHE[rel] || await fetchDetail(rel, base)
            return { images: info.images }
        },

        // 图片 CDN 只认站点自己的 Referer；同时统一带移动 UA。
        // 本地下载的漫画会送 cover.webp / file:// 这类非网络地址进来，原样透传，不重写。
        onImageLoad: (url, comicId, epId) => {
            if (!/^https?:\/\//i.test(String(url))) return {}
            return {
                headers: {
                    "user-agent": MOBILE_UA,
                    "referer": CURRENT_BASE + "/",
                },
            }
        },

        onThumbnailLoad: (url) => {
            if (!/^https?:\/\//i.test(String(url))) return {}
            return {
                headers: {
                    "user-agent": MOBILE_UA,
                    "referer": CURRENT_BASE + "/",
                },
            }
        },
    }
}

// 填充频道名表（供详情页「频道」标签用）
for (const g of TAG_GROUPS) {
    for (const it of g.items) {
        if (!CHANNEL_NAMES[it[1]]) CHANNEL_NAMES[it[1]] = it[0]
    }
}
