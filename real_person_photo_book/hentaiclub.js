/** @type {import('./_venera_.js')} */

class HentaiClub extends ComicSource {
    name = "绅士会所"
    key = "hentaiclub"
    version = "1.0.0"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/hentaiclub.js"

    // --- constants ---
    BASE = "https://www.hentaiclub.net"
    SITE_ICON = "https://www.hentaiclub.net/static/logo.png"
    EXPLORE_PREVIEW = 10  // items per explore partition

    // --- session cache ---
    _coverCache = {}  // id -> cover URL from list parsing


    _abs(url) {
        if (!url) return ""
        url = url.trim()
        if (url.startsWith("//")) return "https:" + url
        if (url.startsWith("/")) return this.BASE + url
        if (url.startsWith("http")) return url
        return ""
    }


    _parseCard(item) {
        const link = item.querySelector("a.item-link")
        const href = link ? link.attributes["href"] : ""
        if (!href) return null

        const id = href  // full URL like https://www.hentaiclub.net/r15/70472.html

        const img = item.querySelector("img.item-img")
        const coverRaw = img ? (img.attributes["data-original"] || img.attributes["src"] || "") : ""
        const cover = this._abs(coverRaw) || this.SITE_ICON

        const titleEl = item.querySelector("div.item-link-text")
        const title = titleEl ? titleEl.text.trim() : ""

        const numEl = item.querySelector("span.item-num")
        const numText = numEl ? numEl.text.trim() : ""
        // e.g. "[94P]" or "[94P] "  -> we store in description
        const pageCount = numText.replace(/[\[\]]/g, "").trim()

        // Cache cover for detail fallback
        if (id && cover) this._coverCache[id] = cover

        return new Comic({
            id: id,
            title: title,
            cover: cover,
            description: pageCount,
        })
    }


    _maxPageOf(doc, currentPage) {
        let mp = currentPage || 1
        const nav = doc.querySelector("ol.page-navigator")
        if (!nav) return mp

        const links = nav.querySelectorAll("li a")
        for (const a of links) {
            const href = a.attributes["href"] || ""
            // Exclude "next"/"prev" which have no numeric text
            const text = a.text.trim()
            const textNums = text.match(/\d+/g)
            if (!textNums || textNums.length === 0) continue
            const textLast = parseInt(textNums[textNums.length - 1])
            const hrefNums = href.match(/(\d+)/g)
            if (!hrefNums) continue
            const hrefLast = parseInt(hrefNums[hrefNums.length - 1])
            // Only trust the link when text and href agree on the number
            if (textLast === hrefLast && textLast > mp) {
                mp = textLast
            }
        }
        return mp
    }

    async _fetchList(path, page, pagePrefix) {
        let url
        // Normalize: strip trailing slash so pagination builds cleanly.
        const cleanPath = path.replace(/\/+$/, "")
        if (page <= 1) {
            // sort pages are first-page at the bare .html path; tag/search pages
            // canonicalize with a trailing slash (bare path 302-redirects).
            url = cleanPath.endsWith(".html")
                ? `${this.BASE}/${cleanPath}`
                : `${this.BASE}/${cleanPath}/`
        } else {
            // Pagination: /sort/r15.html/2/  or  /tag/xxx/2/  or  /search/xxx/2/
            url = `${this.BASE}/${cleanPath}/${page}/`
        }

        const res = await Network.get(url)
        if (res.status !== 200) {
            throw `Invalid status code: ${res.status}`
        }
        const doc = new HtmlDocument(res.body)

        const items = doc.querySelectorAll("div.item.col-xs-6")
        const comics = []
        for (const item of items) {
            const c = this._parseCard(item)
            if (c) comics.push(c)
        }

        const maxPage = this._maxPageOf(doc, page)
        doc.dispose()
        return { comics, maxPage }
    }

    /**
     * Truncate comics list to `limit` items.
     */
    _head(comics, limit) {
        return comics.slice(0, limit)
    }


    explore = [
        {
            title: "绅士会所",
            type: "multiPartPage",
            load: async () => {
                const [r15, r18] = await Promise.all([
                    this._fetchList("sort/r15.html", 1, "sort/r15.html"),
                    this._fetchList("sort/r18.html", 1, "sort/r18.html"),
                ])

                return [
                    {
                        title: "R-15",
                        comics: this._head(r15.comics, this.EXPLORE_PREVIEW),
                        viewMore: {
                            page: "category",
                            attributes: {
                                category: "R-15",
                                param: "sort/r15.html",
                            },
                        },
                    },
                    {
                        title: "R-18",
                        comics: this._head(r18.comics, this.EXPLORE_PREVIEW),
                        viewMore: {
                            page: "category",
                            attributes: {
                                category: "R-18",
                                param: "sort/r18.html",
                            },
                        },
                    },
                ]
            },
        },
    ]



    category = {
        title: "绅士会所",
        parts: [
 
            // <<<TAG_PARTS>>>
// Top 200 tags (by work count) — 10-5 layout 2026-10-05
            {
                name: "作品数Top 50",
                type: "fixed",
                itemType: "category",
                categories: [
                    "蠢沫沫", "いくみ", "森萝财团", "星之迟迟", "桜桃喵", "水淼Aqua", "疯猫ss", "咬一口兔娘", "霜月shimo", "Byoru",
                    "日奈娇", "小仓千代w", "PotatoGodzilla", "布丁大法", "神楽坂真冬", "UmekoJ", "PureMedia", "Elyee", "Kitaro绮太郎", "桜井宁宁",
                    "KuukoW", "G44不会受伤", "过期米线线喵", "年年", "yuuhui玉汇", "习呆呆", "けんけん", "あつき", "PoppaChan", "Atsuki",
                    "Caticornplay", "rioko凉凉子", "面饼仙儿", "miko酱ww", "迷之呆梨", "九曲Jean", "钛合金TiTi", "麻花酱", "鱼子酱Fish", "ZinieQ",
                    "Arty亚缇", "Shika小鹿鹿", "蜜汁猫裘", "factory", "lMusicl", "秋和柯基", "小丁", "半半子", "HanaBunny", "Ayame",
                ],
                categoryParams: [
                    "tag/%E8%A0%A2%E6%B2%AB%E6%B2%AB", "tag/%E3%81%84%E3%81%8F%E3%81%BF", "tag/%E6%A3%AE%E8%90%9D%E8%B4%A2%E5%9B%A2", "tag/%E6%98%9F%E4%B9%8B%E8%BF%9F%E8%BF%9F", "tag/%E6%A1%9C%E6%A1%83%E5%96%B5",
                    "tag/%E6%B0%B4%E6%B7%BCAqua", "tag/%E7%96%AF%E7%8C%ABss", "tag/%E5%92%AC%E4%B8%80%E5%8F%A3%E5%85%94%E5%A8%98", "tag/%E9%9C%9C%E6%9C%88shimo", "tag/Byoru",
                    "tag/%E6%97%A5%E5%A5%88%E5%A8%87", "tag/%E5%B0%8F%E4%BB%93%E5%8D%83%E4%BB%A3w", "tag/PotatoGodzilla", "tag/%E5%B8%83%E4%B8%81%E5%A4%A7%E6%B3%95", "tag/%E7%A5%9E%E6%A5%BD%E5%9D%82%E7%9C%9F%E5%86%AC",
                    "tag/UmekoJ", "tag/PureMedia", "tag/Elyee", "tag/Kitaro%E7%BB%AE%E5%A4%AA%E9%83%8E", "tag/%E6%A1%9C%E4%BA%95%E5%AE%81%E5%AE%81",
                    "tag/KuukoW", "tag/G44%E4%B8%8D%E4%BC%9A%E5%8F%97%E4%BC%A4", "tag/%E8%BF%87%E6%9C%9F%E7%B1%B3%E7%BA%BF%E7%BA%BF%E5%96%B5", "tag/%E5%B9%B4%E5%B9%B4", "tag/yuuhui%E7%8E%89%E6%B1%87",
                    "tag/%E4%B9%A0%E5%91%86%E5%91%86", "tag/%E3%81%91%E3%82%93%E3%81%91%E3%82%93", "tag/%E3%81%82%E3%81%A4%E3%81%8D", "tag/PoppaChan", "tag/Atsuki",
                    "tag/Caticornplay", "tag/rioko%E5%87%89%E5%87%89%E5%AD%90", "tag/%E9%9D%A2%E9%A5%BC%E4%BB%99%E5%84%BF", "tag/miko%E9%85%B1ww", "tag/%E8%BF%B7%E4%B9%8B%E5%91%86%E6%A2%A8",
                    "tag/%E4%B9%9D%E6%9B%B2Jean", "tag/%E9%92%9B%E5%90%88%E9%87%91TiTi", "tag/%E9%BA%BB%E8%8A%B1%E9%85%B1", "tag/%E9%B1%BC%E5%AD%90%E9%85%B1Fish", "tag/ZinieQ",
                    "tag/Arty%E4%BA%9A%E7%BC%87", "tag/Shika%E5%B0%8F%E9%B9%BF%E9%B9%BF", "tag/%E8%9C%9C%E6%B1%81%E7%8C%AB%E8%A3%98", "tag/factory", "tag/lMusicl",
                    "tag/%E7%A7%8B%E5%92%8C%E6%9F%AF%E5%9F%BA", "tag/%E5%B0%8F%E4%B8%81", "tag/%E5%8D%8A%E5%8D%8A%E5%AD%90", "tag/HanaBunny", "tag/Ayame",
                ],
            },

            {
                name: "作品数Top51-100",
                type: "fixed",
                itemType: "category",
                categories: [
                    "AeryTiefling", "瓜希酱", "Natsuko夏夏子", "少女映畫", "RocksyLight", "爆机少女喵小吉", "阿包也是兔娘", "白银81", "Coscchi", "二佐Nisa",
                    "阿雪雪", "铃木美咲", "九言", "雪晴Astra", "Peachmilky", "Azami", "轩萧学姐", "清水由乃", "Tokar浵卡", "兔子Zzz不吃胡萝卜",
                    "屿鱼", "鹿八岁", "PuyPuyChan", "鳗鱼霏儿", "ブロッコリー", "林檎蜜紀", "サク", "云溪溪", "奈汐酱nice", "三度_69",
                    "SayoMomo", "封疆疆v", "邦尼", "AT鲨", "紧急企划", "柒柒不可爱", "贝贝琪Becky", "HidoriRose", "小南宫w", "JeanWanWan",
                    "木绵绵OwO", "南桃", "KaYa萱", "抱走莫子A", "依酱", "PingPing", "逐月SU", "童贞杀手毛衣", "露背毛衣", "怪蜀黍的乖萝莉",
                ],
                categoryParams: [
                    "tag/AeryTiefling", "tag/%E7%93%9C%E5%B8%8C%E9%85%B1", "tag/Natsuko%E5%A4%8F%E5%A4%8F%E5%AD%90", "tag/%E5%B0%91%E5%A5%B3%E6%98%A0%E7%95%AB", "tag/RocksyLight",
                    "tag/%E7%88%86%E6%9C%BA%E5%B0%91%E5%A5%B3%E5%96%B5%E5%B0%8F%E5%90%89", "tag/%E9%98%BF%E5%8C%85%E4%B9%9F%E6%98%AF%E5%85%94%E5%A8%98", "tag/%E7%99%BD%E9%93%B681", "tag/Coscchi", "tag/%E4%BA%8C%E4%BD%90Nisa",
                    "tag/%E9%98%BF%E9%9B%AA%E9%9B%AA", "tag/%E9%93%83%E6%9C%A8%E7%BE%8E%E5%92%B2", "tag/%E4%B9%9D%E8%A8%80", "tag/%E9%9B%AA%E6%99%B4Astra", "tag/Peachmilky",
                    "tag/Azami", "tag/%E8%BD%A9%E8%90%A7%E5%AD%A6%E5%A7%90", "tag/%E6%B8%85%E6%B0%B4%E7%94%B1%E4%B9%83", "tag/Tokar%E6%B5%B5%E5%8D%A1", "tag/%E5%85%94%E5%AD%90Zzz%E4%B8%8D%E5%90%83%E8%83%A1%E8%90%9D%E5%8D%9C",
                    "tag/%E5%B1%BF%E9%B1%BC", "tag/%E9%B9%BF%E5%85%AB%E5%B2%81", "tag/PuyPuyChan", "tag/%E9%B3%97%E9%B1%BC%E9%9C%8F%E5%84%BF", "tag/%E3%83%96%E3%83%AD%E3%83%83%E3%82%B3%E3%83%AA%E3%83%BC",
                    "tag/%E6%9E%97%E6%AA%8E%E8%9C%9C%E7%B4%80", "tag/%E3%82%B5%E3%82%AF", "tag/%E4%BA%91%E6%BA%AA%E6%BA%AA", "tag/%E5%A5%88%E6%B1%90%E9%85%B1nice", "tag/%E4%B8%89%E5%BA%A6_69",
                    "tag/SayoMomo", "tag/%E5%B0%81%E7%96%86%E7%96%86v", "tag/%E9%82%A6%E5%B0%BC", "tag/AT%E9%B2%A8", "tag/%E7%B4%A7%E6%80%A5%E4%BC%81%E5%88%92",
                    "tag/%E6%9F%92%E6%9F%92%E4%B8%8D%E5%8F%AF%E7%88%B1", "tag/%E8%B4%9D%E8%B4%9D%E7%90%AABecky", "tag/HidoriRose", "tag/%E5%B0%8F%E5%8D%97%E5%AE%ABw", "tag/JeanWanWan",
                    "tag/%E6%9C%A8%E7%BB%B5%E7%BB%B5OwO", "tag/%E5%8D%97%E6%A1%83", "tag/KaYa%E8%90%B1", "tag/%E6%8A%B1%E8%B5%B0%E8%8E%AB%E5%AD%90A", "tag/%E4%BE%9D%E9%85%B1",
                    "tag/PingPing", "tag/%E9%80%90%E6%9C%88SU", "tag/%E7%AB%A5%E8%B4%9E%E6%9D%80%E6%89%8B%E6%AF%9B%E8%A1%A3", "tag/%E9%9C%B2%E8%83%8C%E6%AF%9B%E8%A1%A3", "tag/%E6%80%AA%E8%9C%80%E9%BB%8D%E7%9A%84%E4%B9%96%E8%90%9D%E8%8E%89",
                ],
            },

            {
                name: "作品数Top101-150",
                type: "fixed",
                itemType: "category",
                categories: [
                    "邻座的怪阿松", "冷reng", "Junkenstein", "皮皮奶可可爱了啦", "Nagisa魔物喵", "Limerence", "不呆猫", "橙子喵酱", "SallyDorasnow", "姜仁卿",
                    "Nyako喵子", "洛璃LoLiSAMA", "杨晨晨", "Messie", "星澜是澜澜叫澜妹呀", "花铃", "黑川", "羽天Shine", "Tsunnyanchan", "小羊蛋卷",
                    "阿半今天很开心", "香草喵露露", "贰加六", "阿薰kaOri", "千阳", "ちよ", "鬼畜瑶", "TinyAsa", "ATFMaker", "萌芽儿o0",
                    "Neppu", "陆萱萱", "Duckie", "白栎Shirly", "ChuChuMAGIC", "安然anran", "是一只熊仔吗", "焖焖碳", "抖娘利世", "Tsubaki",
                    "HatoriSama", "Seya狮砸", "落落Raku", "Meenfox", "幼愛Youmeko", "葱油饼er", "柚木", "西园寺南歌", "Dal", "aazsxx2",
                ],
                categoryParams: [
                    "tag/%E9%82%BB%E5%BA%A7%E7%9A%84%E6%80%AA%E9%98%BF%E6%9D%BE", "tag/%E5%86%B7reng", "tag/Junkenstein", "tag/%E7%9A%AE%E7%9A%AE%E5%A5%B6%E5%8F%AF%E5%8F%AF%E7%88%B1%E4%BA%86%E5%95%A6", "tag/Nagisa%E9%AD%94%E7%89%A9%E5%96%B5",
                    "tag/Limerence", "tag/%E4%B8%8D%E5%91%86%E7%8C%AB", "tag/%E6%A9%99%E5%AD%90%E5%96%B5%E9%85%B1", "tag/SallyDorasnow", "tag/%E5%A7%9C%E4%BB%81%E5%8D%BF",
                    "tag/Nyako%E5%96%B5%E5%AD%90", "tag/%E6%B4%9B%E7%92%83LoLiSAMA", "tag/%E6%9D%A8%E6%99%A8%E6%99%A8", "tag/Messie", "tag/%E6%98%9F%E6%BE%9C%E6%98%AF%E6%BE%9C%E6%BE%9C%E5%8F%AB%E6%BE%9C%E5%A6%B9%E5%91%80",
                    "tag/%E8%8A%B1%E9%93%83", "tag/%E9%BB%91%E5%B7%9D", "tag/%E7%BE%BD%E5%A4%A9Shine", "tag/Tsunnyanchan", "tag/%E5%B0%8F%E7%BE%8A%E8%9B%8B%E5%8D%B7",
                    "tag/%E9%98%BF%E5%8D%8A%E4%BB%8A%E5%A4%A9%E5%BE%88%E5%BC%80%E5%BF%83", "tag/%E9%A6%99%E8%8D%89%E5%96%B5%E9%9C%B2%E9%9C%B2", "tag/%E8%B4%B0%E5%8A%A0%E5%85%AD", "tag/%E9%98%BF%E8%96%B0kaOri", "tag/%E5%8D%83%E9%98%B3",
                    "tag/%E3%81%A1%E3%82%88", "tag/%E9%AC%BC%E7%95%9C%E7%91%B6", "tag/TinyAsa", "tag/ATFMaker", "tag/%E8%90%8C%E8%8A%BD%E5%84%BFo0",
                    "tag/Neppu", "tag/%E9%99%86%E8%90%B1%E8%90%B1", "tag/Duckie", "tag/%E7%99%BD%E6%A0%8EShirly", "tag/ChuChuMAGIC",
                    "tag/%E5%AE%89%E7%84%B6anran", "tag/%E6%98%AF%E4%B8%80%E5%8F%AA%E7%86%8A%E4%BB%94%E5%90%97", "tag/%E7%84%96%E7%84%96%E7%A2%B3", "tag/%E6%8A%96%E5%A8%98%E5%88%A9%E4%B8%96", "tag/Tsubaki",
                    "tag/HatoriSama", "tag/Seya%E7%8B%AE%E7%A0%B8", "tag/%E8%90%BD%E8%90%BDRaku", "tag/Meenfox", "tag/%E5%B9%BC%E6%84%9BYoumeko",
                    "tag/%E8%91%B1%E6%B2%B9%E9%A5%BCer", "tag/%E6%9F%9A%E6%9C%A8", "tag/%E8%A5%BF%E5%9B%AD%E5%AF%BA%E5%8D%97%E6%AD%8C", "tag/Dal", "tag/aazsxx2",
                ],
            },

            {
                name: "作品数Top151-200",
                type: "fixed",
                itemType: "category",
                categories: [
                    "桃良阿宅", "虎森森", "Kyokoyaki", "Mikomin", "Himee", "Kizami", "轻兰映画", "宫本桜", "Aokotan", "lunana",
                    "沖田凜花Rinka", "五更百鬼", "MACHI", "AlinaBecker", "唐安琪", "少女秩序", "鹿野希", "nonsummerjack", "ゆい", "樱岛嗷",
                    "Momoko葵葵", "CandyBall", "拿相机的执义", "十万珍吱伏特", "七月喵子", "Kovicki", "玲川茜", "菌烨tako", "Zia", "千叶双子",
                    "九柒喵", "Sia不吃鱼", "Xenon", "凯竹Quinn", "ちず", "雯妹不讲道理", "JoyceLin2x", "王馨瑶", "时雨Jiu", "一北亦北",
                    "Jangjoo", "Peachuu", "ShiroganeSama", "Nookkizz", "キツネ", "纸悦Etsuko", "爱老师_PhD", "Quan冉有点饿", "小野妹子w", "果咩酱w",
                ],
                categoryParams: [
                    "tag/%E6%A1%83%E8%89%AF%E9%98%BF%E5%AE%85", "tag/%E8%99%8E%E6%A3%AE%E6%A3%AE", "tag/Kyokoyaki", "tag/Mikomin", "tag/Himee",
                    "tag/Kizami", "tag/%E8%BD%BB%E5%85%B0%E6%98%A0%E7%94%BB", "tag/%E5%AE%AB%E6%9C%AC%E6%A1%9C", "tag/Aokotan", "tag/lunana",
                    "tag/%E6%B2%96%E7%94%B0%E5%87%9C%E8%8A%B1Rinka", "tag/%E4%BA%94%E6%9B%B4%E7%99%BE%E9%AC%BC", "tag/MACHI", "tag/AlinaBecker", "tag/%E5%94%90%E5%AE%89%E7%90%AA",
                    "tag/%E5%B0%91%E5%A5%B3%E7%A7%A9%E5%BA%8F", "tag/%E9%B9%BF%E9%87%8E%E5%B8%8C", "tag/nonsummerjack", "tag/%E3%82%86%E3%81%84", "tag/%E6%A8%B1%E5%B2%9B%E5%97%B7",
                    "tag/Momoko%E8%91%B5%E8%91%B5", "tag/CandyBall", "tag/%E6%8B%BF%E7%9B%B8%E6%9C%BA%E7%9A%84%E6%89%A7%E4%B9%89", "tag/%E5%8D%81%E4%B8%87%E7%8F%8D%E5%90%B1%E4%BC%8F%E7%89%B9", "tag/%E4%B8%83%E6%9C%88%E5%96%B5%E5%AD%90",
                    "tag/Kovicki", "tag/%E7%8E%B2%E5%B7%9D%E8%8C%9C", "tag/%E8%8F%8C%E7%83%A8tako", "tag/Zia", "tag/%E5%8D%83%E5%8F%B6%E5%8F%8C%E5%AD%90",
                    "tag/%E4%B9%9D%E6%9F%92%E5%96%B5", "tag/Sia%E4%B8%8D%E5%90%83%E9%B1%BC", "tag/Xenon", "tag/%E5%87%AF%E7%AB%B9Quinn", "tag/%E3%81%A1%E3%81%9A",
                    "tag/%E9%9B%AF%E5%A6%B9%E4%B8%8D%E8%AE%B2%E9%81%93%E7%90%86", "tag/JoyceLin2x", "tag/%E7%8E%8B%E9%A6%A8%E7%91%B6", "tag/%E6%97%B6%E9%9B%A8Jiu", "tag/%E4%B8%80%E5%8C%97%E4%BA%A6%E5%8C%97",
                    "tag/Jangjoo", "tag/Peachuu", "tag/ShiroganeSama", "tag/Nookkizz", "tag/%E3%82%AD%E3%83%84%E3%83%8D",
                    "tag/%E7%BA%B8%E6%82%A6Etsuko", "tag/%E7%88%B1%E8%80%81%E5%B8%88_PhD", "tag/Quan%E5%86%89%E6%9C%89%E7%82%B9%E9%A5%BF", "tag/%E5%B0%8F%E9%87%8E%E5%A6%B9%E5%AD%90w", "tag/%E6%9E%9C%E5%92%A9%E9%85%B1w",
                ],
            },
// <<<END_TAG_PARTS>>>
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            const { comics, maxPage } = await this._fetchList(param, page, param)
            return { comics, maxPage }
        },
    }


    search = {
        load: async (keyword, options, page) => {
            const encoded = encodeURIComponent(keyword)
            // POST to / then follow redirect
            let url
            if (page <= 1) {
                url = `${this.BASE}/search/${encoded}/`
            } else {
                url = `${this.BASE}/search/${encoded}/${page}/`
            }

            const res = await Network.get(url)
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`
            }
            const doc = new HtmlDocument(res.body)

            const items = doc.querySelectorAll("div.item.col-xs-6")
            const comics = []
            for (const item of items) {
                const c = this._parseCard(item)
                if (c) comics.push(c)
            }

            const maxPage = this._maxPageOf(doc, page)
            doc.dispose()
            return { comics, maxPage }
        },
    }

    comic = {
        loadInfo: async (id) => {
            const res = await Network.get(id)
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`
            }
            const doc = new HtmlDocument(res.body)

            // Title: first .post-info-box .post-info-text
            const infoBoxes = doc.querySelectorAll("div.post-info-box")
            let title = ""
            let views = ""
            for (let i = 0; i < infoBoxes.length; i++) {
                const titleEl = infoBoxes[i].querySelector("span.post-info-title")
                const textEl = infoBoxes[i].querySelector("span.post-info-text")
                const label = titleEl ? titleEl.text.trim() : ""
                const value = textEl ? textEl.text.trim() : ""
                if (i === 0) {
                    title = value  // "主题：xxx"
                } else if (label.includes("浏览") || label.includes("點閱")) {
                    views = value
                }
            }

            // Cover: prefer cached list thumbnail, else first gallery image
            let cover = this._coverCache[id] || ""
            if (!cover) {
                const firstImg = doc.querySelector("img.post-item-img")
                const coverRaw = firstImg
                    ? (firstImg.attributes["data-original"] || firstImg.attributes["src"] || "")
                    : ""
                cover = this._abs(coverRaw) || this.SITE_ICON
            }

            // Tags
            const tags = {}
            const tagLinks = doc.querySelectorAll("div.post-tags.color-tags a")
            const tagNames = []
            for (const a of tagLinks) {
                const name = a.text.trim()
                if (name) tagNames.push(name)
            }
            if (tagNames.length > 0) {
                tags["Tags"] = tagNames
            }

            // Description: page count from cached card + views
            const description = views ? `Views: ${views}` : ""

            // Related
            const relatedItems = doc.querySelectorAll("div.related div.item.col-xs-6")
            const recommend = []
            for (const item of relatedItems) {
                const rc = this._parseCard(item)
                if (rc) recommend.push(rc)
            }

            // Chapters: virtual single chapter for photo gallery
            const chapters = { "0": "View All Photos" }

            doc.dispose()
            return new ComicDetails({
                id: id,
                title: title,
                cover: cover,
                description: description,
                tags: tags,
                chapters: chapters,
                recommend: recommend,
            })
        },

        loadEp: async (comicId, epId) => {
            const res = await Network.get(comicId)
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`
            }
            const doc = new HtmlDocument(res.body)

            const imgEls = doc.querySelectorAll("img.post-item-img.lazy")
            const images = []
            for (const img of imgEls) {
                const src = img.attributes["data-original"] || img.attributes["src"] || ""
                const absSrc = this._abs(src)
                if (absSrc) images.push(absSrc)
            }

            doc.dispose()
            return { images }
        },

    }
}