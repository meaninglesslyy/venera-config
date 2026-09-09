// xchina source for Venera – photo section of xchina.co
// 简化版：确保基本功能正常

class XChinaPhoto extends ComicSource {
  name = "小黄书 xChina 照片";
  key = "xchina_photo";
  version = "1.3.1";
  minAppVersion = "1.6.0";
  url = "";

  get baseUrl() { return "https://xchina.co"; }
  get imgBaseUrl() { return "https://img.xchina.io"; }

  // 请求头
  pageHeaders() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Referer": this.baseUrl + "/",
    };
  }

  // 网络请求
  async fetchBody(label, url) {
    const res = await Network.get(url, this.pageHeaders());
    if (res.status !== 200) throw new Error(`${label} 请求失败: ${res.status}`);
    return res.body;
  }

  // 从 .pager 分页链接中解析最大页数
  parseMaxPage(html, fallback) {
    let max = 1;
    try {
      const doc = new HtmlDocument(html);
      for (let a of doc.querySelectorAll(".pager a.pager-num")) {
        const text = a.text ? a.text.trim() : "";
        if (/^\d+$/.test(text)) {
          const n = parseInt(text, 10);
          if (n > max) max = n;
        }
      }
      doc.dispose();
    } catch (e) {}
    return max > 1 ? max : fallback;
  }

  // 解析列表（基于 HtmlDocument，只取外层缩略图链接，避免重复）
  parseList(html) {
    const items = [];
    const doc = new HtmlDocument(html);
    // 每个图包在页面里有外层缩略图 <a> 和内层标题 <a>，只取外层（.item.photo 的直接子 a）
    const anchors = doc.querySelectorAll('.item.photo > a[href*="/photo/id-"]');
    for (const a of anchors) {
      const href = a.attributes["href"] || "";
      const m = href.match(/\/photo\/id-([a-z0-9]+)\.html/);
      if (!m) continue;
      const id = m[1];
      const title = a.attributes["title"] || id;

      // 封面：取内层 .img 元素的 background-image 完整 URL
      let cover = "";
      const imgEl = a.querySelector(".img");
      if (imgEl) {
        const style = imgEl.attributes["style"] || "";
        const cm = style.match(
          /background-image:url\(['"]?(https:\/\/img\.xchina\.io\/photos\/[^'")\s]+)['"]?\)/i
        );
        if (cm) cover = cm[1];
      }

      items.push({
        id: id,
        title: title,
        cover: cover,
        url: this.baseUrl + "/photo/id-" + id + ".html",
      });
    }
    doc.dispose();
    return items;
  }

  // 发现页
  explore = [
    {
      title: "小黄书最新套图",
      type: "multiPageComicList",
      load: async (page) => {
        const url = page === 1 ? this.baseUrl + "/photos.html" : this.baseUrl + "/photos/" + page + ".html";
        const html = await this.fetchBody("explore", url);
        const items = this.parseList(html);
        const maxPage = this.parseMaxPage(html, items.length ? page : 1);
        return { comics: items, maxPage: Math.max(maxPage, page) };
      },
    },
  ];

  // 分类
  category = {
    title: "小黄书 xChina",
    parts: [
      {
        name: "中国工作室",
        type: "fixed",
        itemType: "category",
        categories: [
          "PANS", "黄甫", "轰趴猫", "其他中国工作室", "行色", "潘多拉",
          "风吟鸟唱", "相约中国", "丽图100", "希威社", "推女郎", "A4U",
          "爱丝", "深夜企划", "蜜丝", "蜜柚摄影", "ISS系列", "U238",
          "北京天使", "无忌影社", "SK丝库", "妖精社", "头条女神", "爱尤物",
          "果团网", "东莞V女郎", "DDY", "尤美",
        ],
        categoryParams: [
          "6310ce9b90056", "665f8bafab4bc", "5f1ae6caae922", "665f7d787d681", "64f44d99ce673", "5f23c44cd66bd",
          "6666a7ac3ba9c", "5f1dcdeaee582", "5f1d784995865", "665f8595408fa", "5f14a5eb5b0d7", "5f60b98248a81",
          "5f15f389e993e", "638e5a60b1770", "5f2089564c6c2", "676c3e9b90749", "646c69b675f3d", "67028a27d02a6",
          "622c7f95220a4", "619a92aa1fa7a", "5f382ba894af4", "5f4b5f4eb8b71", "5f14806585bef", "5f148046cb2c7",
          "5f1817b42772b", "5f22ea422221c", "5f15f727df393", "61b997728043b",
        ],
      },
      {
        name: "各国其他套图",
        type: "fixed",
        itemType: "category",
        categories: ["国模套图", "韩模套图", "日模套图", "台模套图", "港模套图", "其他地区套图"],
        categoryParams: ["64be21c972ca4", "64be22b4a0fa0", "64be2283bf3af", "64be21ef4cc51", "64be224b662c0", "64be239ce73d4"],
      },
      {
        name: "秀人网旗下",
        type: "fixed",
        itemType: "category",
        categories: [
          "全部秀人旗下", "私购流出", "秀人网", "星颜社", "语画界", "尤蜜荟",
          "模范学院", "花漾", "爱蜜社", "美媛馆", "蜜桃社", "FEILIN嗲囡囡",
          "尤物馆", "瑞丝馆", "影私荟",
        ],
        categoryParams: [
          "6660093348354", "66600a3a227ee", "5f1476781eab4", "6141c88882a36", "601ef80997845", "5f184ff551888",
          "5f181625966a6", "5fc4ce40386af", "5f71afc92d8ab", "5f1495dbda4de", "5f1dd5a7ebe9a", "5f14a3105d3e8",
          "60673bec9dd11", "61263de287e2f", "63d435352808c",
        ],
      },
      {
        name: "韩国工作室",
        type: "fixed",
        itemType: "category",
        categories: ["Pure Media", "Makemodel", "ArtGravia", "Espacia Korea", "Loozy"],
        categoryParams: ["6224e755e21f4", "665f81885f103", "60a4a953ca563", "665a2385a2367", "62888afad416b"],
      },
      {
        name: "日本工作室",
        type: "fixed",
        itemType: "category",
        categories: [
          "Urabon", "Graphis", "周刊ポストデジタル写真集", "Super Pose Book", "FRIDAY",
          "Prestige", "X-City", "アサ芸SEXY", "Escape", "FLASHデジタル写真集",
        ],
        categoryParams: [
          "6692ea004cc75", "6450b47c9db0b", "66e68b9c96ab0", "62a0a15911f16", "66659e2d94489",
          "670791f5f2f0f", "66fb8cca706ae", "670d7142b3d88", "66603af933ec9", "672a2029d6a32",
        ],
      },
      {
        name: "台湾工作室",
        type: "fixed",
        itemType: "category",
        categories: ["JVID", "ED Mosaic", "Fantasy Factory", "TPimage"],
        categoryParams: ["637b2029d2347", "68610041d0aa8", "5f889afb37619", "5f7a0a80d3d66"],
      },
      {
        name: "其他套图",
        type: "fixed",
        itemType: "category",
        categories: ["书籍扫描", "AI图区", "街拍"],
        categoryParams: ["6860e3d718c78", "6443d480eb757", "6836cd1a2d51d"],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const url = page === 1 ? this.baseUrl + "/photos/series-" + param + ".html" : this.baseUrl + "/photos/series-" + param + "/" + page + ".html";
      const html = await this.fetchBody("category", url);
      const items = this.parseList(html);
      const maxPage = this.parseMaxPage(html, items.length ? page : 1);
      return { comics: items, maxPage: Math.max(maxPage, page) };
    },
    optionList: [],
  };

  // 搜索
  search = {
    load: async (keyword, options, page) => {
      const kw = encodeURIComponent(keyword.trim().replace(/\s+/g, "+"));
      const url = page === 1 ? this.baseUrl + "/photos/keyword-" + kw + ".html" : this.baseUrl + "/photos/keyword-" + kw + "/" + page + ".html";
      const html = await this.fetchBody("search", url);
      const items = this.parseList(html);
      const maxPage = this.parseMaxPage(html, items.length ? page : 1);
      return { comics: items, maxPage: Math.max(maxPage, page) };
    },
    optionList: [],
    enableTagsSuggestions: false,
  };

  // 单本图集
  comic = {
    loadInfo: async (comicId) => {
      const url = this.baseUrl + "/photo/id-" + comicId + ".html";
      let html = "";
      try {
        html = await this.fetchBody("detail", url);
      } catch (e) {
        // 忽略错误
      }
      
      let title = comicId;
      let description = "";
      let cover = "";
      
      if (html) {
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)">/);
        title = titleMatch ? titleMatch[1] : comicId;
        
        const descMatch = html.match(/<meta property="og:description" content="([^"]+)">/);
        description = descMatch ? descMatch[1] : "";
        
        const imgMatch = html.match(/background-image:url\(['"]?(https:\/\/img\.xchina\.io\/photos\/[^'")\s]+_600x0\.(?:webp|jpg))['"]?\)/i);
        cover = imgMatch ? imgMatch[1] : "";
      }
      
      return new ComicDetails({
        title: title,
        cover: cover,
        description: description,
        tags: {},
        chapters: new Map([["1", "图集"]]),
      });
    },

    loadEp: async (comicId, epId) => {
      // 详情页只渲染前若干张预览；完整图数需从 photoShow 页面的 photoCount 获取
      const detailUrl = this.baseUrl + "/photo/id-" + comicId + ".html";
      const html = await this.fetchBody("ep", detailUrl);

      // 从详情页取第一个 photoShow id（加密）
      const showMatch = html.match(/\/photoShow\.html\?id=([^"']+)/);
      if (!showMatch) return { images: [] };

      // 请求 photoShow 页拿总张数 photoCount
      const showHtml = await this.fetchBody(
        "ep-show",
        this.baseUrl + "/photoShow.html?id=" + encodeURIComponent(showMatch[1])
      );
      const countMatch = showHtml.match(/photoCount\s*=\s*(\d+)/);
      const count = countMatch ? parseInt(countMatch[1], 10) : 0;
      if (!count || count <= 0) return { images: [] };

      // 按连续编号生成全部图片（高清原图 .jpg）
      const images = [];
      for (let i = 1; i <= count; i++) {
        const numStr = String(i).padStart(5, "0");
        images.push(
          this.imgBaseUrl + "/photos/" + comicId + "/" + numStr + ".jpg"
        );
      }
      return { images: images };
    },


    onThumbnailLoad: (url) => {
      return {
        url: url,
        headers: {
          Referer: this.baseUrl + "/photos.html",
          "User-Agent": this.pageHeaders()["User-Agent"],
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
      };
    },

    onImageLoad: (url, comicId, epId) => {
      return {
        url: url,
        headers: {
          Referer: this.baseUrl + "/photo/id-" + comicId + ".html",
          "User-Agent": this.pageHeaders()["User-Agent"],
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
      };
    },
  };

  // 链接解析
  link = {
    domains: ["xchina.co"],
    linkToId: (url) => {
      const m = url.match(/\/photo\/id-([a-z0-9]+)\.html/);
      return m ? m[1] : null;
    },
  };

  translation = {
    'zh_CN': {
      '最新套图': "最新套图",
      '搜索': "搜索",
      '分类': "分类",
      '图集': "图集",
    },
    'zh_TW': {},
    'en': {},
  };
}

// 导出兼容多种环境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = XChinaPhoto;
}
if (typeof exports !== 'undefined') {
  exports.XChinaPhoto = XChinaPhoto;
}
if (typeof globalThis !== 'undefined') {
  globalThis.XChinaPhoto = XChinaPhoto;
}
