class FoamGirl extends ComicSource {
    name = "FoamGirl"
    key = "foamgirl"
    version = "1.2.1"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/foamgirl.js"

    base = "https://foamgirl.net"

    // 站点是 WordPress + CX-UDY 主题，纯 HTML 抓取，无加密无签名
    // 列表结构有两种：
    //   li.i_list   图片网格（首页/分类/搜索/相关推荐），封面在 img[data-original]，带 !320x440 缩略图后缀
    //   li.img_list 文字列表（/download 分类），封面在 img[src]，无后缀
    // 详情页图集容器：div#image_div > p > a.imageclick-imgbox[href] 为原图
    // 图集分页：/{id}.html, /{id}_2.html, /{id}_3.html ...

    headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": this.base + "/",
        }
    }

    // 请求页面，同时返回解析树和原始 body
    async request(path) {
        let url = path.indexOf("http") === 0 ? path : this.base + path
        let res = await Network.get(url, this.headers())
        if (res.status !== 200) {
            throw `Invalid status code: ${res.status}`
        }
        return { doc: new HtmlDocument(res.body), body: res.body }
    }

    // 取元素属性，属性名缺失时返回空串
    attr(el, name) {
        if (!el) return ""
        let a = el.attributes
        return a && a[name] ? a[name] : ""
    }

    // 从列表项解析 Comic，兼容 i_list 与 img_list 两种结构
    parseComic(el) {
        let link = el.querySelector("a.thumb-srcbox") || el.querySelector("a")
        if (!link) return null

        let href = this.attr(link, "href")
        let m = href.match(/\/(\d+)\.html/)
        if (!m) return null
        let id = m[1]

        let titleEl = el.querySelector("a.meta-title")
        let title = titleEl
            ? titleEl.text.trim()
            : (this.attr(link, "title") || link.text || "").trim()
        if (!title) title = id

        let img = el.querySelector("img")
        let cover = img ? (this.attr(img, "data-original") || this.attr(img, "src")) : ""
        // 去掉 !320x440 之类的缩略图后缀，拿原图
        cover = cover.replace(/!.*$/, "")

        return new Comic({
            id: id,
            title: title,
            cover: cover,
        })
    }

    parseList(doc) {
        let items = doc.querySelectorAll("li.i_list")
        if (items.length === 0) {
            items = doc.querySelectorAll("li.img_list")
        }
        let comics = []
        for (let it of items) {
            let c = this.parseComic(it)
            if (c) comics.push(c)
        }
        return comics
    }

    // 从分页链接里取最大页码
    // pattern: 分类/首页/搜索用 /\/page\/(\d+)/，图集用 /_(\d+)\.html/
    maxPage(doc, pattern) {
        let max = 1
        let links = doc.querySelectorAll("a.page-numbers")
        for (let l of links) {
            let m = this.attr(l, "href").match(pattern)
            if (m) {
                let n = parseInt(m[1])
                if (n > max) max = n
            }
        }
        return max
    }

    // 图集图片，取 a.imageclick-imgbox 的 href（原图）
    parseImages(doc) {
        let out = []
        let boxes = doc.querySelectorAll("a.imageclick-imgbox")
        for (let b of boxes) {
            let href = this.attr(b, "href")
            if (href && out.indexOf(href) < 0) out.push(href)
        }
        return out
    }

    // 分块并发抓图集分页，避免一次打太多请求触发 Cloudflare
    async loadGalleryPages(id, from, to) {
        const CHUNK = 4
        let images = []
        for (let start = from; start <= to; start += CHUNK) {
            let tasks = []
            for (let p = start; p < Math.min(start + CHUNK, to + 1); p++) {
                tasks.push(this.request(`/${id}_${p}.html`))
            }
            let pages = await Promise.all(tasks)
            for (let pg of pages) {
                for (let url of this.parseImages(pg.doc)) {
                    if (images.indexOf(url) < 0) images.push(url)
                }
                pg.doc.dispose()
            }
        }
        return images
    }

    explore = [
        {
            title: "FoamGirl-最新更新",
            type: "multiPageComicList",
            load: async (page) => {
                let path = page === 1 ? "/" : `/page/${page}`
                let r = await this.request(path)
                let comics = this.parseList(r.doc)
                let max = this.maxPage(r.doc, /\/page\/(\d+)/)
                r.doc.dispose()
                return { comics: comics, maxPage: max }
            },
        },
        {
            title: "FoamGirl-分类浏览",
            type: "multiPartPage",
            load: async (page) => {
                let parts = []
                // 分类浏览仍带 Cosplay 入口（分类页里 Cosplay 是单独标签组，这里保留一条直达）
                let list = this.categories.concat([{ name: "Cosplay", slug: "cosplay" }])
                for (let c of list) {
                    let r = await this.request(`/${c.slug}`)
                    let comics = this.parseList(r.doc)
                    r.doc.dispose()
                    if (comics.length === 0) continue
                    parts.push({
                        title: c.name,
                        comics: comics,
                        viewMore: {
                            page: "category",
                            attributes: {
                                category: c.name,
                                param: c.slug,
                            },
                        },
                    })
                }
                return parts
            },
        },
    ]

    categories = [
        { name: "Chinese 华语", slug: "chinese" },
        { name: "Korea 韩国", slug: "korea" },
        { name: "Japan 日本", slug: "japan" },
        { name: "Thailand 泰国", slug: "thailand" },
        { name: "19+ Download", slug: "download" },
    ]

    // Cosplay 分类页内置 tag（div.filter-tag，共 30 个，cat=10），
    // 作为「Cosplay」大组单列，地区组里不再重复出现 Cosplay。
    // 注意第 2 个是站点上的脏 tag，名称就是那个坏掉的 HTML 转义串，照搬保持一致性。
    COSPLAY_CAT_ID = "10"

    cosplayTags = [
        { id: "5142", name: "[MimiChan ミミちゃん]" },
        { id: "6016", name: "蠢沫沫" },
        { id: "4035", name: "51酱" },
        { id: "3016", name: "Akemi101xoxo" },
        { id: "2429", name: "Akisoso秋楚楚" },
        { id: "3473", name: "anna苏拉" },
        { id: "1446", name: "Arty亞緹" },
        { id: "4204", name: "Asagiriai愛ちゃん" },
        { id: "3834", name: "Atsukiあつき" },
        { id: "2250", name: "Ayase_绫濑酱" },
        { id: "1451", name: "Azami" },
        { id: "3209", name: "Azuki Coser" },
        { id: "1463", name: "Baijin Jiang" },
        { id: "5645", name: "Bangni邦尼" },
        { id: "1699", name: "Byoru ビヨル" },
        { id: "5497", name: "Candy_Ball" },
        { id: "2427", name: "CherryS" },
        { id: "2378", name: "Chihiro" },
        { id: "7330", name: "China" },
        { id: "3833", name: "Chinese Model" },
        { id: "6022", name: "Chinese Model Private Photo" },
        { id: "2525", name: "Choi Ji-Yun" },
        { id: "1744", name: "Chono Black ちょうの" },
        { id: "4083", name: "Cien恩恩" },
        { id: "1465", name: "coli厨 水無月みり" },
        { id: "1439", name: "Cosplay" },
        { id: "5583", name: "Cosplay 小樱" },
        { id: "5767", name: "Cosplay、 樱梨梨" },
        { id: "4319", name: "Dearie" },
        { id: "2161", name: "Dishwasher1910" },
    ]

    category = {
        title: "FoamGirl",
        parts: [
            {
                name: "地区",
                type: "fixed",
                itemType: "category",
                categories: this.categories.map((c) => c.name),
                categoryParams: this.categories.map((c) => c.slug),
            },
            {
                name: "Cosplay",
                type: "fixed",
                itemType: "category",
                categories: this.cosplayTags.map((t) => t.name),
                categoryParams: this.cosplayTags.map((t) => "tag:" + t.id),
            },
        ],
    }

    categoryComics = {
        // 排序选项只在 Cosplay 标签组里展示（站点该 widget 带 Sort: Time/Comments/Liked），
        // 普通地区分类走静态 GET 分页，服务端不认 orderby，故不误导。
        optionList: [
            {
                label: "排序",
                options: [
                    "date-最新",
                    "comment_count-评论最多",
                    "zan-点赞最多",
                ],
                showWhen: this.cosplayTags.map((t) => t.name),
            },
        ],

        load: async (category, param, options, page) => {
            let p = param || "japan"
            // Cosplay 标签组走 AJAX 筛选接口
            if (p.indexOf("tag:") === 0) {
                return await this.loadTagComics(p.slice(4), options, page)
            }
            let path = page === 1 ? `/${p}` : `/${p}/page/${page}`
            let r = await this.request(path)
            let comics = this.parseList(r.doc)
            let max = this.maxPage(r.doc, /\/page\/(\d+)/)
            r.doc.dispose()
            return { comics: comics, maxPage: max }
        },
    }

    // Cosplay 标签分类：POST /wp-admin/admin-ajax.php
    // action=postlist_newajax, type=sxpost, cat=10, tag[]={id}, term=category, paged=N, orderby=...
    // 响应 { success:"ok", data:{ html:"<li class=\"i_list\">...</li>...", starus: 1|0, arr:{paged:N} } }
    // starus=1 说明还有下一页；没有更多页时 starus=0，此时 maxPage 返回当前页数封顶。
    async loadTagComics(tagId, options, page) {
        let orderby = (options && options[0]) || "date"
        let body =
            "action=postlist_newajax" +
            "&type=sxpost" +
            `&cat=${this.COSPLAY_CAT_ID}` +
            `&tag[]=${encodeURIComponent(tagId)}` +
            "&term=category" +
            `&paged=${page}` +
            `&orderby=${encodeURIComponent(orderby)}`
        let res = await Network.post(this.base + "/wp-admin/admin-ajax.php", {
            ...this.headers(),
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": this.base + "/cosplay",
        }, body)
        if (res.status !== 200) {
            throw `Invalid status code: ${res.status}`
        }
        let json = JSON.parse(res.body)
        if (json.success !== "ok") {
            throw `Ajax failed: ${json.msg || "unknown"}`
        }
        let html = json.data.html || ""
        let doc = new HtmlDocument("<ul>" + html + "</ul>")
        let comics = this.parseList(doc)
        doc.dispose()
        let more = json.data.starus === 1 || json.data.starus === "1"
        return { comics: comics, maxPage: more ? page + 1 : page }
    }

    search = {
        load: async (keyword, options, page) => {
            let q = encodeURIComponent(keyword)
            let path = page === 1 ? `/?s=${q}` : `/page/${page}?s=${q}`
            let r = await this.request(path)
            let comics = this.parseList(r.doc)
            let max = this.maxPage(r.doc, /\/page\/(\d+)/)
            r.doc.dispose()
            return { comics: comics, maxPage: max }
        },
        enableTagsSuggestions: false,
    }

    comic = {
        loadInfo: async (id) => {
            let r = await this.request(`/${id}.html`)
            let doc = r.doc

            let titleEl = doc.querySelector("h1")
            let title = titleEl ? titleEl.text.replace(/\(\d+\s*P\)/g, "").trim() : id

            let images = this.parseImages(doc)
            let cover = images.length > 0 ? images[0] : ""

            // 标签
            let tags = []
            for (let a of doc.querySelectorAll("span.single-tags a")) {
                let t = a.text.trim()
                if (t) tags.push(t)
            }
            let catEl = doc.querySelector("span.image-info-cat a")
            let catName = catEl ? catEl.text.trim() : ""

            // 元信息：日期 / 作者 / 分类 / 浏览
            // 注意：所有 .text 必须在 doc.dispose() 之前读成字符串，
            // 否则 dispose 后再访问元素会抛 Null check operator used on a null value
            let timeEl = doc.querySelector("span.image-info-time")
            let authorEl = doc.querySelector("span.image-info-author a")
            let viewsEl = doc.querySelector("span.cx-views")
            let uploader = authorEl ? authorEl.text.trim() : ""
            let updateTime = timeEl ? timeEl.text.trim() : ""
            let views = viewsEl ? viewsEl.text.trim() : ""

            let desc = []
            if (catName) desc.push(`分类: ${catName}`)
            if (updateTime) desc.push(`发布: ${updateTime}`)
            if (views) desc.push(`浏览: ${views}`)

            // 相关推荐
            let recommend = this.parseList(doc)

            let max = this.maxPage(doc, /_(\d+)\.html/)
            // 章节名固定，不显示张数：images 只是第一页的图，全量张数要翻完所有分页才知道，
            // 用第一页数量命名会与实际图包对不上（详情页只加载第一页用于取封面）。
            let chapters = {}
            chapters["1"] = "View All Photos"

            let details = new ComicDetails({
                title: title,
                cover: cover,
                description: desc.join(" / "),
                tags: tags.length > 0 ? { "标签": tags } : {},
                chapters: chapters,
                uploader: uploader,
                updateTime: updateTime,
                url: `${this.base}/${id}.html`,
                recommend: recommend,
                maxPage: max,
            })

            doc.dispose()
            return details
        },

        loadEp: async (comicId, epId) => {
            let r = await this.request(`/${comicId}.html`)
            let images = this.parseImages(r.doc)
            let max = this.maxPage(r.doc, /_(\d+)\.html/)
            r.doc.dispose()

            if (max > 1) {
                let rest = await this.loadGalleryPages(comicId, 2, max)
                for (let url of rest) {
                    if (images.indexOf(url) < 0) images.push(url)
                }
            }

            return { images: images }
        },

        onImageLoad: (url, comicId, epId) => {
            return {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                    "Referer": this.base + "/",
                },
            }
        },

        onThumbnailLoad: (url) => {
            return {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                    "Referer": this.base + "/",
                },
            }
        },

        idMatch: "^\\d+$",

        link: {
            domains: ["foamgirl.net", "cdn.foamgirl.net"],
            linkToId: (url) => {
                let m = url.match(/\/(\d+)(?:_\d+)?\.html/)
                return m ? m[1] : null
            },
        },

        enableTagsTranslate: false,
    }
}
