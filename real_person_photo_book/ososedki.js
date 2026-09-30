/** @type {import('./_venera_.js')} */

//============================================================

const OS_BASE = "https://ososedki.com";

// 列表每页条数（全站统一 24）
const OS_PER_PAGE = 24;

// 探索页每个区块先露多少条，其余走 "View More"
const OS_PREVIEW = 10;

// 非图片请求的全局最小间隔（毫秒）。
// 站点的 Cloudflare 先限流 403、再升级成 "Just a moment" 托管挑战，
// 一旦被打进挑战名单，冷却要按小时算。宁可慢也别调小。
const OS_MIN_INTERVAL = 600;

// 图片请求的最小间隔（毫秒）。比页面闸门松得多，翻页手感不受影响；
// 但整章下载会一口气要几百张图，这条闸门把并发压到 ~12/s，降低撞 CF 限流的概率。
// 设 0 可完全关掉。
const OS_IMG_INTERVAL = 80;

// 单张图最多降级几跳。app 自己的 retryLimit 是 5，这里留余量。
const OS_IMG_MAX_HOPS = 3;

// 探测首页 / Top 真实末页时的搜索上界（两站导航都声称 2555 页）
const OS_PROBE_HI = 2688;

// maxPage 探测结果的持久缓存时长：一天。站点总页数增长很慢，
// 但也不能永久缓存，否则新内容会被旧 maxPage 挡在分页之外。
const OS_PROBE_TTL = 24 * 60 * 60 * 1000;

const OS_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": OS_BASE + "/",
};

// ---------------------------------------------------------------------------
//  分区表：每个可列出图集的入口一条
//  key   = categoryComics.load 收到的 param
//  label = 分类页显示名 / explore 的 viewMore 跳转名
// ---------------------------------------------------------------------------
const OS_SECTIONS = [
    { key: "home", label: "Home Page", path: "/" },
    { key: "top", label: "Top Galleries", path: "/top" },

    { key: "asian", label: "Asian", path: "/category/asian" },
    { key: "thots", label: "Thots", path: "/category/thots" },
    { key: "tiktok", label: "TikTok", path: "/category/tiktok" },
    { key: "art", label: "Art", path: "/category/art" },
    { key: "celebs", label: "Celebs", path: "/category/celebs" },
    { key: "erotic", label: "Erotic", path: "/category/erotic" },
    { key: "tattoo", label: "Tattoo", path: "/category/tattoo" },
    { key: "dark", label: "Dark", path: "/category/dark" },
    { key: "fitness", label: "Fitness", path: "/category/fitness" },
    { key: "porno", label: "Porno", path: "/category/porno" },
    { key: "amateur", label: "Amateur", path: "/category/amateur" },
];

const OS_SECTION_BY_KEY = {};
OS_SECTIONS.forEach((s) => {
    OS_SECTION_BY_KEY[s.key] = s;
});

// 探索页两个区块（各露 OS_PREVIEW 条，其余进 View More）
const OS_EXPLORE_PARTS = ["home", "top"];

// 只有这两个分区有卡片接口 /api/albums，也只有它们的 maxPage 需要靠 API 二分探测。
// 其余分区（分类 / cosplay / model / fandom / search）页头都带可信计数。
const OS_API_SECTIONS = { home: 1, top: 1 };

// 分类页第二个分区起：cosplay 专区，按 IP 归类。
// 数据由 cosplay_parts.tsv 生成，改完 TSV 跑 `python gen_cosplay.py` 重灌。
// 形如：[分区名, [[显示名, "fandom"|"cosplay", 站点目标名], ...]]
// <<<COSPLAY_DATA>>>
const OS_COSPLAY_GROUPS = [
   
    [
        "游戏IP",
        [
            ["原神", "fandom", "Genshin Impact"],
            ["崩坏：星穹铁道", "fandom", "Honkai Star Rail"],
            ["绝区零", "fandom", "Zenless Zone Zero"],
            ["鸣潮", "fandom", "Wuthering Waves"],
            ["明日方舟", "fandom", "Arknights"],
            ["蔚蓝档案", "fandom", "Blue Archive"],
            ["胜利女神：妮姬", "fandom", "Goddess of Victory: Nikke|Goddess Of Victory: Nikke|Goddess Of Victory Nikke"],
            ["碧蓝航线", "fandom", "Azur Lane"],
            ["少女前线", "fandom", "Girls Frontline"],
            ["命运-冠位指定", "fandom", "Fate Grand Order|Fate"],
            ["英雄联盟", "fandom", "League of Legends"],
            ["无畏契约", "fandom", "Valorant"],
            ["守望先锋", "fandom", "Overwatch"],
            ["DOTA2", "fandom", "Defense Of The Ancients"],
            ["尼尔：机械纪元", "fandom", "Nier: Automata"],
            ["最终幻想", "fandom", "Final Fantasy"],
            ["生化危机", "fandom", "Resident Evil"],
            ["赛博朋克2077", "fandom", "Cyberpunk 2077|Cyberpunk: Edgerunners|Cyberpunk Edgerunners"],
            ["艾尔登法环", "fandom", "Elden Ring"],
            ["剑星", "fandom", "Stellar Blade"],
            ["古墓丽影", "fandom", "Tomb Raider"],
            ["寂静岭", "fandom", "Silent Hill"],
            ["女神异闻录5", "fandom", "Persona 5"],
            ["死或生", "fandom", "Dead or Alive"],
            ["恶魔战士", "fandom", "Darkstalkers"],
            ["拳皇", "fandom", "The King of Fighters"],
            ["巧克力与香子兰", "fandom", "Nekopara"],
            ["舰队Collection", "fandom", "Kantai Collection"],
            ["棕色尘埃", "fandom", "Brown Dust"],
            ["米塔", "fandom", "Miside"],
        ],
    ],
    // 游戏角色（213 项）
    [
        "游戏角色",
        [
            ["2B", "cosplay", "2B"],
            ["A2", "cosplay", "A2"],
            ["凯妮", "cosplay", "Kaine"],
            ["甘雨", "cosplay", "Ganyu"],
            ["雷电将军", "cosplay", "Raiden Shogun"],
            ["八重神子", "cosplay", "Yae Miko"],
            ["申鹤", "cosplay", "Shenhe"],
            ["优菈", "cosplay", "Eula"],
            ["刻晴", "cosplay", "Keqing"],
            ["莫娜", "cosplay", "Mona"],
            ["罗莎莉亚", "cosplay", "Rosaria"],
            ["夜兰", "cosplay", "Yelan"],
            ["纳西妲", "cosplay", "Nahida"],
            ["阿蕾奇诺", "cosplay", "Arlecchino"],
            ["神里绫华", "cosplay", "Ayaka Kamisato"],
            ["胡桃", "cosplay", "Hu Tao"],
            ["凝光", "cosplay", "Ningguang"],
            ["妮露", "cosplay", "Nilou"],
            ["宵宫", "cosplay", "Yoimiya"],
            ["珊瑚宫心海", "cosplay", "Kokomi"],
            ["芙宁娜", "cosplay", "Furina"],
            ["丽莎", "cosplay", "Lisa"],
            ["砂糖", "cosplay", "Sucrose"],
            ["安柏", "cosplay", "Amber"],
            ["琴", "cosplay", "Jean"],
            ["荧", "cosplay", "Lumine"],
            ["迪希雅", "cosplay", "Dehya"],
            ["诺艾尔", "cosplay", "Noelle"],
            ["菲谢尔", "cosplay", "Fischl"],
            ["娜维娅", "cosplay", "Navia"],
            ["玛薇卡", "cosplay", "Mavuika"],
            ["琳妮特", "cosplay", "Lynette"],
            ["卡芙卡", "cosplay", "Kafka"],
            ["银狼", "cosplay", "Silver Wolf"],
            ["黑天鹅", "cosplay", "Black Swan"],
            ["姬子", "cosplay", "Himeko"],
            ["花火", "cosplay", "Sparkle"],
            ["阮·梅", "cosplay", "Ruan Mei"],
            ["流萤", "cosplay", "Firefly"],
            ["停云", "cosplay", "Tingyun"],
            ["阿格莱雅", "cosplay", "Aglaea"],
            ["符玄", "cosplay", "Fu Xuan"],
            ["飞霄", "cosplay", "Feixiao"],
            ["三月七", "cosplay", "March 7th"],
            ["黑塔", "cosplay", "The Herta"],
            ["黄泉", "cosplay", "Acheron"],
            ["铃", "cosplay", "Belle"],
            ["简·杜", "cosplay", "Jane Doe"],
            ["艾莲·乔", "cosplay", "Ellen Joe"],
            ["妮可·德玛拉", "cosplay", "Nicole Demara"],
            ["柏妮思", "cosplay", "Burnice White"],
            ["星见雅", "cosplay", "Miyabi Hoshimi"],
            ["伊芙琳", "cosplay", "Evelyn Chevalier"],
            ["月城柳", "cosplay", "Yanagi Tsukishiro"],
            ["仪玄", "cosplay", "Yixuan"],
            ["可琳", "cosplay", "Corin Wickes"],
            ["耀嘉音", "cosplay", "Astra Yao"],
            ["椿", "cosplay", "Camellya"],
            ["长离", "cosplay", "Changli"],
            ["守岸人", "cosplay", "The Shorekeeper"],
            ["折枝", "cosplay", "Zhezhi"],
            ["珂莱塔", "cosplay", "Carlotta"],
            ["菲比", "cosplay", "Phoebe"],
            ["赞妮", "cosplay", "Zani"],
            ["坎特蕾拉", "cosplay", "Cantarella"],
            ["一之濑明日奈", "cosplay", "Asuna Ichinose"],
            ["月读时", "cosplay", "Toki Asuma"],
            ["妃咲", "cosplay", "Kisaki Ryuuge"],
            ["月读莉央", "cosplay", "Rio Tsukatsuki"],
            ["亚子", "cosplay", "Ako Amau"],
            ["白子", "cosplay", "Shiroko Sunaookami"],
            ["小春", "cosplay", "Koharu Shimoe"],
            ["花梨", "cosplay", "Karin Kakudate"],
            ["花子", "cosplay", "Urawa Hanako"],
            ["伊织", "cosplay", "Iori Shiromi"],
            ["优香", "cosplay", "Yuuka Hayase"],
            ["和纱", "cosplay", "Kazusa Kyouyama"],
            ["未花", "cosplay", "Mika Misono"],
            ["爱丽丝", "cosplay", "Alice"],
            ["毒蛇", "cosplay", "Viper"],
            ["拉毗", "cosplay", "Rapi"],
            ["米哈拉", "cosplay", "Mihara"],
            ["多萝西", "cosplay", "Dorothy"],
            ["安妮丝", "cosplay", "Anis"],
            ["红帽", "cosplay", "Red Hood"],
            ["爱宕", "cosplay", "Atago"],
            ["大凤", "cosplay", "Taihou"],
            ["柴郡", "cosplay", "Cheshire"],
            ["圣路易斯", "cosplay", "St. Louis"],
            ["信浓", "cosplay", "Shinano"],
            ["天狼星", "cosplay", "Sirius"],
            ["可畏", "cosplay", "Formidable"],
            ["欧根亲王", "cosplay", "Prinz Eugen"],
            ["樫野", "cosplay", "Kashino"],
            ["贝尔法斯特", "cosplay", "Belfast"],
            ["布雷默顿", "cosplay", "Bremerton"],
            ["玛修·基列莱特", "cosplay", "Mashu Kyrielight"],
            ["阿尔托莉雅", "cosplay", "Artoria Pendragon"],
            ["贞德", "cosplay", "Jeanne d'Arc"],
            ["玉藻前", "cosplay", "Tamamo no Mae"],
            ["伊什塔尔", "cosplay", "Ishtar"],
            ["斯卡哈", "cosplay", "Scathach"],
            ["酒吞童子", "cosplay", "Shuten-Douji"],
            ["迦摩", "cosplay", "Kama"],
            ["尼禄", "cosplay", "Nero Claudius"],
            ["艾蕾什基伽尔", "cosplay", "Ereshkigal"],
            ["远坂凛", "cosplay", "Rin Tohsaka"],
            ["冲田总司", "cosplay", "Okita Souji"],
            ["护士", "cosplay", "Nurse"],
        ],
    ],

    [
        "动漫IP",
        [
            ["电锯人", "fandom", "Chainsaw Man"],
            ["更衣人偶坠入爱河", "fandom", "My Dress-Up Darling"],
            ["火影忍者", "fandom", "Naruto"],
            ["鬼灭之刃", "fandom", "Demon Slayer: Kimetsu no Yaiba"],
            ["Re:从零开始的异世界生活", "fandom", "Re:Zero"],
            ["海贼王", "fandom", "One Piece"],
            ["葬送的芙莉莲", "fandom", "Frieren Beyond Journeys End"],
            ["间谍过家家", "fandom", "Spy x Family"],
            ["DARLING in the FRANXX", "fandom", "DARLING in the FRANXX"],
            ["新世纪福音战士", "fandom", "Evangelion"],
            ["VOCALOID", "fandom", "Vocaloid"],
            ["一拳超人", "fandom", "One Punch Man"],
            ["进击的巨人", "fandom", "Attack on Titan|Attack On Titan"],
            ["咒术回战", "fandom", "Jujutsu Kaisen"],
            ["OVERLORD", "fandom", "Overlord"],
            ["胆大党", "fandom", "Dandadan"],
            ["美少女战士", "fandom", "Sailor Moon"],
            ["孤独摇滚", "fandom", "Bocchi The Rock"],
            ["小林家的龙女仆", "fandom", "Kobayashi-san-chi No Maid Dragon"],
            ["反叛的鲁路修", "fandom", "Code Geass"],
            ["我推的孩子", "fandom", "Oshi No Ko"],
            ["死亡笔记", "fandom", "Death Note"],
            ["狂赌之渊", "fandom", "Kakegurui"],
            ["约会大作战", "fandom", "Date A Live"],
            ["刀剑神域", "fandom", "Sword Art Online"],
            ["龙珠", "fandom", "Dragon Ball"],
            ["无职转生", "fandom", "Mushoku Tensei"],
            ["斩·赤红之瞳", "fandom", "Akame Ga Kill"],
            ["罪恶王冠", "fandom", "Guilty Crown"],
            ["盾之勇者成名录", "fandom", "Rising Of The Shield Hero"],
            ["七大罪", "fandom", "The Seven Deadly Sins"],
            ["吊带袜天使", "fandom", "Panty And Stocking With Garterbelt"],
            ["憧憬成为魔法少女", "fandom", "Mahou Shoujo Ni Akogarete"],
            ["青春猪头少年", "fandom", "Seishun Buta Yarou"],
            ["攻壳机动队", "fandom", "Ghost in the Shell"],
            ["Love Live!", "fandom", "Love Live!"],
        ],
    ],
    // 动漫角色（83 项）
    [
        "动漫角色",
        [
            ["玛奇玛", "cosplay", "Makima"],
            ["帕瓦", "cosplay", "Power"],
            ["蕾塞", "cosplay", "Reze"],
            ["姬野", "cosplay", "Himeno"],
            ["喜多川海梦", "cosplay", "Marin Kitagawa"],
            ["黑江雫", "cosplay", "Shizuku Kuroe"],
            ["日向雏田", "cosplay", "Hinata Hyuga"],
            ["春野樱", "cosplay", "Sakura Haruno"],
            ["纲手", "cosplay", "Tsunade"],
            ["漩涡鸣人", "cosplay", "Naruto Uzumaki"],
            ["甘露寺蜜璃", "cosplay", "Mitsuri Kanroji"],
            ["灶门祢豆子", "cosplay", "Nezuko Kamado"],
            ["蝴蝶忍", "cosplay", "Shinobu Kocho"],
            ["堕姬", "cosplay", "Daki"],
            ["蕾姆", "cosplay", "Rem"],
            ["拉姆", "cosplay", "Ram"],
            ["艾米莉娅", "cosplay", "Emilia"],
            ["艾尔莎", "cosplay", "Elsa Granhiert"],
            ["娜美", "cosplay", "Nami"],
            ["妮可·罗宾", "cosplay", "Nico Robin"],
            ["波雅·汉库克", "cosplay", "Boa Hancock"],
            ["大和", "cosplay", "Yamato"],
            ["芙莉莲", "cosplay", "Frieren"],
            ["菲伦", "cosplay", "Fern"],
            ["尤贝尔", "cosplay", "Ubel"],
            ["约尔·福杰", "cosplay", "Yor Forger"],
            ["阿尼亚·福杰", "cosplay", "Anya Forger"],
            ["02", "cosplay", "Zero Two"],
            ["惣流·明日香", "cosplay", "Asuka Langley Soryu"],
            ["绫波丽", "cosplay", "Rei Ayanami"],
            ["真希波", "cosplay", "Mari Illustrious Makinami"],
            ["葛城美里", "cosplay", "Misato Katsuragi"],
            ["渡我被身子", "cosplay", "Himiko Toga"],
            ["丽日御茶子", "cosplay", "Ochako Uraraka"],
            ["午夜", "cosplay", "Midnight"],
            ["蛙吹梅雨", "cosplay", "Tsuyu Asui"],
            ["初音未来", "cosplay", "Miku Hatsune"],
            ["战栗的龙卷", "cosplay", "Senritsu No Tatsumaki"],
            ["地狱的吹雪", "cosplay", "Jigoku No Fubuki"],
            ["缠流子", "cosplay", "Ryuko Matoi"],
            ["鬼龙院皋月", "cosplay", "Satsuki Kiryuuin"],
            ["三笠·阿克曼", "cosplay", "Mikasa Ackerman"],
            ["钉崎野蔷薇", "cosplay", "Nobara Kugisaki"],
            ["禅院真希", "cosplay", "Maki Zenin"],
            ["宿傩", "cosplay", "Sukuna"],
            ["冥冥", "cosplay", "Mei Mei"],
            ["雅儿贝德", "cosplay", "Albedo"],
            ["绫濑桃", "cosplay", "Momo Ayase"],
            ["绫濑星子", "cosplay", "Seiko Ayase"],
            ["四枫院夜一", "cosplay", "Yoruichi Shihoin"],
            ["松本乱菊", "cosplay", "Rangiku Matsumoto"],
            ["后藤一里", "cosplay", "Hitori Gotou"],
            ["露科亚", "cosplay", "Lucoa"],
            ["C.C.", "cosplay", "C.C."],
            ["卡莲·休妲菲尔", "cosplay", "Kallen Stadtfeld"],
            ["莉雅丝·吉蒙里", "cosplay", "Rias Gremory"],
            ["姬岛朱乃", "cosplay", "Akeno Himejima"],
            ["星野爱", "cosplay", "Ai Hoshino"],
            ["弥海砂", "cosplay", "Misa Amane"],
            ["蛇喰梦子", "cosplay", "Yumeko Jabami"],
            ["时崎狂三", "cosplay", "Kurumi Tokisaki"],
            ["结城明日奈", "cosplay", "Asuna Yuuki"],
            ["优娜", "cosplay", "Yuna"],
            ["布尔玛", "cosplay", "Bulma"],
            ["18号", "cosplay", "Android 18"],
            ["赫萝", "cosplay", "Holo"],
            ["玛露希尔", "cosplay", "Marcille Donato"],
            ["由鹤", "cosplay", "Yuzuriha"],
            ["艾斯德斯", "cosplay", "Esdeath"],
            ["楪祈", "cosplay", "Inori Yuzuriha"],
            ["拉芙塔莉雅", "cosplay", "Raphtalia"],
            ["伊丽莎白·里昂妮丝", "cosplay", "Elizabeth Liones"],
            ["白木芽衣子", "cosplay", "Meiko Shiraki"],
            ["布莱尔", "cosplay", "Blair"],
            ["菲·瓦伦丁", "cosplay", "Faye Valentine"],
            ["洋子·利特纳", "cosplay", "Yoko Littner"],
            ["史朵金", "cosplay", "Stocking Anarchy"],
            ["柊宇天那", "cosplay", "Utena Hiiragi"],
            ["樱岛麻衣", "cosplay", "Mai Sakurajima"],
            ["草薙素子", "cosplay", "Motoko Kusanagi"],
            ["黑魔导女孩", "cosplay", "Dark Magician Girl"],
            ["梦见莉亚梦", "cosplay", "Riamu Yumemi"],
            ["江之岛盾子", "cosplay", "Junko Enoshima"],
        ],
    ],
];
// <<<END_COSPLAY_DATA>>>

// 分类页第一个分区：普通分类（cosplay 专区在下面单独分区）
const OS_PLAIN_KEYS = [
    "asian",
    "thots",
    "tiktok",
    "art",
    "celebs",
    "erotic",
    "tattoo",
    "dark",
    "fitness",
    "porno",
    "amateur",
];

// ---------------------------------------------------------------------------
//  小工具
// ---------------------------------------------------------------------------

function osDecode(text) {
    if (text == null) return "";
    return String(text).replace(
        /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
        (whole, body) => {
            if (body.charAt(0) === "#") {
                const hex = body.charAt(1) === "x" || body.charAt(1) === "X";
                const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
                if (isNaN(code)) return whole;
                return code > 0xffff
                    ? String.fromCharCode(
                          0xd800 + ((code - 0x10000) >> 10),
                          0xdc00 + ((code - 0x10000) & 0x3ff),
                      )
                    : String.fromCharCode(code);
            }
            switch (body.toLowerCase()) {
                case "amp":
                    return "&";
                case "lt":
                    return "<";
                case "gt":
                    return ">";
                case "quot":
                    return '"';
                case "apos":
                    return "'";
                case "nbsp":
                    return " ";
                case "hellip":
                    return "…";
                case "mdash":
                    return "—";
                case "ndash":
                    return "–";
                default:
                    return whole;
            }
        },
    );
}

function osText(el) {
    if (!el) return "";
    return osDecode(el.text || "")
        .replace(/\s+/g, " ")
        .trim();
}

/** 站内相对地址补全。只用于从 HTML 里刮出来的地址，不碰 app 喂进来的 url。 */
function osAbs(url) {
    if (!url) return "";
    let s = String(url).trim();
    if (!s) return "";
    if (s.indexOf("//") === 0) return "https:" + s;
    if (s.charAt(0) === "/") return OS_BASE + s;
    return s;
}

/**
 * 路径段编码，对齐站点 sitemap 里的规范写法：
 * 空格 -> `+`，`!'()*` 也一并转义（encodeURIComponent 默认不转这几个）。
 */
function osEncodePath(s) {
    return encodeURIComponent(String(s == null ? "" : s))
        .replace(/'/g, "%27")
        .replace(/!/g, "%21")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29")
        .replace(/\*/g, "%2A")
        .replace(/%20/g, "+");
}

/** "13,601" -> 13601 */
function osNum(s) {
    const m = /(\d[\d,]*)/.exec(String(s == null ? "" : s));
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
}

// ---------------------------------------------------------------------------
//  图片加载：轻量闸门 + 失败降级链（给 app 的「下载整章」用）
// ---------------------------------------------------------------------------

let osImgChain = Promise.resolve();
let osImgLastReq = 0;

/** 图片请求闸门：串行 + 最小间隔 */
function osImgThrottle() {
    if (!OS_IMG_INTERVAL) return Promise.resolve();
    let release;
    const gate = new Promise((r) => {
        release = r;
    });
    const prev = osImgChain;
    osImgChain = gate;
    return prev.then(async () => {
        try {
            const wait = osImgLastReq + OS_IMG_INTERVAL - Date.now();
            if (wait > 0) await new Promise((r) => setTimeout(r, wait));
            osImgLastReq = Date.now();
        } finally {
            release();
        }
    });
}

// 每张图的降级跳数。按原图地址计数，防止链条绕回去
const OS_IMG_HOPS = {};

/**
 * 第 n 跳该用哪个地址。
 * 站点同一张图有大小两套目录：`/images/a/1280/`（原图）和 `/images/a/604/`（详情页
 * data-src 用的缩略图，站点自己在用，可信降级目标）。
 * 第 1 跳原址重试（多为此站偶发的 403 / 连接被掐），第 2 跳降到 604，第 3 跳再试一次。
 */
function osImgRetryUrl(url, hop) {
    if (hop === 2 && url.indexOf("/images/a/1280/") >= 0) {
        return url.replace("/images/a/1280/", "/images/a/604/");
    }
    return url;
}

/** 造一份带降级链的 ImageLoadingConfig。**每一跳都必须挂 onLoadFailed**，
 *  否则 app 的降级链第一跳就断（它每轮循环都重新读 configs['onLoadFailed']）。 */
function osImgConfig(url, key) {
    return {
        url: url,
        onLoadFailed: () => {
            const hop = (OS_IMG_HOPS[key] || 0) + 1;
            if (hop > OS_IMG_MAX_HOPS) {
                delete OS_IMG_HOPS[key];
                return null; // 放弃，让 app 抛错
            }
            OS_IMG_HOPS[key] = hop;
            return osImgConfig(osImgRetryUrl(url, hop), key);
        },
    };
}

function osClass(el) {
    if (!el) return "";
    return String((el.attributes && el.attributes["class"]) || "");
}

/** `/photos/-10000001_10016268` -> `-10000001_10016268`；非图集链接返回空串 */
function osIdFromHref(href) {
    let s = String(href || "").trim();
    if (!s) return "";
    s = s.replace(/^https?:\/\/[^/]+/i, "");
    s = s.split("#")[0].split("?")[0];
    const m = /^\/photos\/([^/]+)\/?$/.exec(s);
    return m ? m[1] : "";
}

/** 粘贴详情 URL / 裸 id 都认 */
function osIdFromKeyword(kw) {
    const s = String(kw || "").trim();
    if (!s) return "";
    if (/^[A-Za-z0-9_-]+$/.test(s) && s.indexOf("_") > 0) return s;
    const m = /ososedki\.com\/photos\/([^/?#]+)/i.exec(s);
    return m ? m[1] : "";
}

/** id -> 封面地址（列表封面缺席时的兜底） */
function osCoverFromId(id) {
    const s = String(id || "");
    const i = s.lastIndexOf("_");
    if (i <= 0) return "";
    return OS_BASE + "/images/albums/" + s.slice(0, i) + "/" + s.slice(i + 1) + ".webp";
}

/** `Hidori Rose – Double Flavor (34 leaked photos) from Onlyfans, Patreon and Fansly`
 *  -> `Hidori Rose – Double Flavor` */
function osCleanTitle(title) {
    let s = osDecode(title || "").trim();
    s = s.replace(/\s*\(\s*\d[\d,]*\s+(?:leaked\s+)?photos?\s*\)\s*from\b[\s\S]*$/i, "");
    s = s.replace(/\s*\(\s*\d[\d,]*\s+(?:leaked\s+)?photos?\s*\)\s*$/i, "");
    return s.replace(/\s+/g, " ").trim();
}

/** 详情页里的 schema.org JSON-LD */
function osJsonLd(html) {
    const m = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i.exec(
        String(html || ""),
    );
    if (!m) return null;
    try {
        const d = JSON.parse(m[1]);
        if (Array.isArray(d)) return d[0] || null;
        return d;
    } catch (e) {
        return null;
    }
}

/** 页头的图集总数："13,601 albums" / "(291 results)" / "876 albums" */
function osCountFromHeader(html) {
    const s = String(html || "");
    // 只在前半段找，避开正文/页脚里可能出现的零散词
    const cut = s.indexOf('id="gallery"');
    const head = cut > 0 ? s.slice(0, cut) : s;
    let m = /([\d][\d,]*)\s*albums?\b/i.exec(head);
    if (m) return osNum(m[1]);
    m = /\(([\d][\d,]*)\s+results?\)/i.exec(head);
    if (m) return osNum(m[1]);
    return 0;
}

/** 分页器里的最大页码（限定在含 pagination 的 <nav> 内，避开正文零散的 page= 参数） */
function osPaginationMax(html) {
    const s = String(html || "");
    const navRe = /<nav[^>]*>[\s\S]*?<\/nav>/g;
    let max = 0;
    let m;
    while ((m = navRe.exec(s)) !== null) {
        const blk = m[0];
        if (blk.indexOf("pagination") < 0) continue;
        const re = /[?&]page=(\d+)/g;
        let m2;
        while ((m2 = re.exec(blk)) !== null) {
            const n = parseInt(m2[1], 10);
            if (!isNaN(n) && n > max) max = n;
        }
    }
    return max;
}

// ---------------------------------------------------------------------------
//  卡片解析：列表页 / 详情页「相关推荐」共用同一套 article.gallery-item 结构
// ---------------------------------------------------------------------------

function osParseCards(html) {
    const out = [];
    let doc = null;
    try {
        doc = new HtmlDocument(html);
        const items = doc.querySelectorAll("article.gallery-item");
        for (const it of items) {
            const a = it.querySelector("a.gallery-link");
            if (!a) continue;
            const href = (a.attributes && a.attributes["href"]) || "";
            const id = osIdFromHref(href);
            if (!id) continue;

            const img = it.querySelector("img.gallery-img");
            let cover = "";
            let alt = "";
            if (img) {
                const at = img.attributes || {};
                cover = osAbs(at["src"] || at["data-src"] || "");
                alt = osDecode(at["alt"] || "");
            }
            if (!cover || cover.indexOf("data:image") === 0) cover = osCoverFromId(id);

            const h3 = it.querySelector("h3");
            let title = osText(h3);
            if (!title) title = osCleanTitle(alt);
            if (!title) title = id;

            // 左下角彩色 badge = 模特名；右下角 bg-dark badge = 张数
            let author = "";
            let count = 0;
            for (const b of it.querySelectorAll("span.badge")) {
                if (osClass(b).indexOf("bg-dark") >= 0) {
                    count = osNum(osText(b));
                } else if (!author) {
                    author = osText(b);
                }
            }
            if (!count) {
                const m = /(\d[\d,]*)\s+(?:leaked\s+)?(?:nude\s+)?photos?/i.exec(alt);
                if (m) count = osNum(m[1]);
            }

            out.push({ id, title, cover, author, count });
        }
    } catch (e) {
        // 解析异常不抛，返回已拿到的部分
    } finally {
        if (doc) {
            try {
                doc.dispose();
            } catch (e) {}
        }
    }
    return out;
}

function osToComic(c) {
    return new Comic({
        id: c.id,
        title: c.title,
        cover: c.cover || osCoverFromId(c.id),
        subTitle: c.author || "",
        tags: [],
        description: c.count > 0 ? c.count + " photos" : "",
    });
}

// ---------------------------------------------------------------------------
//  源
// ---------------------------------------------------------------------------

class Ososedki extends ComicSource {
    name = "Ososedki";

    key = "ososedki";

    version = "1.1.1";

    minAppVersion = "1.6.0";

    url =
        "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/real_person_photo_book/ososedki.js";

    // ==================== 网络：闸门 + 去重 + 缓存 + 退避 ====================

    sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    _boot() {
        if (!this._chain) this._chain = Promise.resolve();
        if (!this._lastReq) this._lastReq = 0;
        if (!this._inflight) this._inflight = {};
        if (!this._mem) this._mem = {};
        if (!this._maxPage) this._maxPage = {};
        if (this._minInterval == null) this._minInterval = OS_MIN_INTERVAL;
    }

    /** 全局闸门：非图片请求串行，且间隔 >= _minInterval */
    async throttle() {
        this._boot();
        const self = this;
        let release;
        const gate = new Promise((r) => {
            release = r;
        });
        const prev = self._chain;
        self._chain = gate;
        await prev;
        try {
            const wait = (self._lastReq || 0) + self._minInterval - Date.now();
            if (wait > 0) await self.sleep(wait);
            self._lastReq = Date.now();
        } finally {
            release();
        }
    }

    _memGet(url, ttl) {
        this._boot();
        const o = this._mem[url];
        if (o && Date.now() - o.t < (ttl || 60000)) return o.b;
        return null;
    }

    _memPut(url, body) {
        this._boot();
        const keys = Object.keys(this._mem);
        if (keys.length > 120) {
            for (const k of keys.slice(0, 60)) delete this._mem[k];
        }
        this._mem[url] = { t: Date.now(), b: body };
    }

    isChallenge(body) {
        const s = String(body || "");
        return (
            s.indexOf("Just a moment") >= 0 ||
            s.indexOf("__cf_chl") >= 0 ||
            s.indexOf("cf-challenge") >= 0
        );
    }

    /**
     * 带闸门/去重/缓存/退避的 GET。
     * 站点连续请求会 403 且冷却很久，所以 403/429/5xx 一律退避重试。
     */
    async fetch(url, opts) {
        this._boot();
        const o = opts || {};
        const ttl = o.ttl || 60000;

        if (!o.noCache) {
            const hit = this._memGet(url, ttl);
            if (hit != null) return hit;
        }
        if (this._inflight[url]) return this._inflight[url];

        const self = this;
        const task = (async function () {
            let last = "";
            for (let i = 0; i < 4; i++) {
                try {
                    await self.throttle();
                    const res = await Network.get(url, OS_HEADERS);
                    const status = res ? res.status : 0;
                    const body = res && res.body ? res.body : "";
                    if (status === 404) throw "404 Not Found: " + url;
                    // 长度阈值只用来挡 CF 拦截页。卡片接口的「末页」响应本来就短
                    // （{"html":"","hasMore":false} 才 27 字节），必须放行，
                    // 否则二分探测会把合法的空页当成失败，整段探测作废。
                    const minLen = o.minLen == null ? 128 : o.minLen;
                    if (status === 200 && body.length >= minLen && !self.isChallenge(body)) {
                        if (!o.noCache) self._memPut(url, body);
                        return body;
                    }
                    last = "status=" + status + " len=" + body.length;
                } catch (e) {
                    const m = String(e && e.message ? e.message : e);
                    if (m.indexOf("404") >= 0) throw m;
                    last = m;
                }
                if (i < 3) await self.sleep(1000 * Math.pow(2, i));
            }
            throw "请求失败：" + url + " (" + last + ")";
        })();

        this._inflight[url] = task;
        try {
            return await task;
        } finally {
            delete this._inflight[url];
        }
    }

    // ==================== URL 组装 ====================

    listUrl(sec, page) {
        const p = page || 1;
        let u = OS_BASE + sec.path;
        if (p > 1) u += (sec.path.indexOf("?") >= 0 ? "&" : "?") + "page=" + p;
        return u;
    }

    /** 首页与 /top 的卡片接口；其余分区没有对应接口（返回 null） */
    apiUrl(sec, page) {
        if (!OS_API_SECTIONS[sec.key]) return null;
        if (sec.key === "top") {
            return OS_BASE + "/api/albums?page=" + page + "&type=top&value=1";
        }
        return OS_BASE + "/api/albums?page=" + page;
    }

    detailUrl(id) {
        return OS_BASE + "/photos/" + id;
    }

    /** cosplay 角色页 /cosplay/{tag} */
    cosplayUrl(tag, page) {
        let u = OS_BASE + "/cosplay/" + osEncodePath(tag);
        if (page > 1) u += "?page=" + page;
        return u;
    }

    /** 作品/IP 页 /fandom/{name} */
    fandomUrl(name, page) {
        let u = OS_BASE + "/fandom/" + osEncodePath(name);
        if (page > 1) u += "?page=" + page;
        return u;
    }

    // ==================== maxPage ====================

    /** 某一页有没有内容。返回 true/false，网络异常返回 null（语义：不知道） */
    async hasApiPage(sec, page) {
        try {
            const body = await this.fetch(this.apiUrl(sec, page), {
                noCache: true,
                ttl: 0,
                minLen: 0,
            });
            const d = JSON.parse(body);
            return !!(d && d.html && String(d.html).trim());
        } catch (e) {
            return null;
        }
    }

    /**
     * 首页 / Top 没有可信计数，靠卡片接口二分找真实末页。
     *
     * 探测要打十几个请求，而站点是「连续请求就 403」的脾气，
     * 所以结果**持久化**：一次装好后每 OS_PROBE_TTL 天才重探一次，
     * 会话内的内存缓存挡第二层。
     *
     * 先确认上界确实越界再二分 —— 站点总页数会随时间增长，
     * 写死上界迟早会把 maxPage 卡在旧值上。越界就把上界翻倍重试。
     */
    async probeMaxPage(sec) {
        this._boot();
        const key = "maxpage:" + sec.key;
        if (this._maxPage[sec.key]) return this._maxPage[sec.key];

        try {
            const raw = this.loadData(key);
            if (raw) {
                const o = JSON.parse(raw);
                if (o && o.p > 0 && Date.now() - (o.t || 0) < OS_PROBE_TTL) {
                    this._maxPage[sec.key] = o.p;
                    return o.p;
                }
            }
        } catch (e) {
            // 读不到就当没缓存
        }

        let lo = 1;
        let hi = OS_PROBE_HI;

        for (let guard = 0; guard < 8; guard++) {
            const beyond = await this.hasApiPage(sec, hi);
            if (beyond === null) {
                // 被限流 / 网络抖动：不落盘，也别把上限压死
                return Math.max(OS_PROBE_HI, lo);
            }
            if (!beyond) break;
            lo = hi;
            hi = hi * 2;
        }

        while (lo + 1 < hi) {
            const mid = (lo + hi) >> 1;
            const ok = await this.hasApiPage(sec, mid);
            if (ok === null) return Math.max(OS_PROBE_HI, lo);
            if (ok) lo = mid;
            else hi = mid;
        }

        this._maxPage[sec.key] = lo;
        try {
            this.saveData(key, JSON.stringify({ p: lo, t: Date.now() }));
        } catch (e) {
            // 落盘失败不影响本次结果
        }
        return lo;
    }

    async maxPageFor(sec, html, page) {
        const count = osCountFromHeader(html);
        if (count > 0) {
            const byNav = osPaginationMax(html);
            const byCount = Math.ceil(count / OS_PER_PAGE);
            return Math.max(page, byNav || byCount);
        }
        if (OS_API_SECTIONS[sec.key]) {
            const probed = await this.probeMaxPage(sec);
            return Math.max(page, probed);
        }
        // 没有计数、也没有卡片接口（例如计数为 0 的空分类）：
        // 退回分页器末页号，再退回当前页 —— 绝不能拿去打首页的 API，
        // 那样会把首页的总页数（2264）当成这个分类的总页数。
        return Math.max(page, osPaginationMax(html) || page);
    }

    // ==================== 详情页 ====================

    async detailHtml(id, noCache) {
        return await this.fetch(this.detailUrl(id), { ttl: 300000, noCache: !!noCache });
    }

    /**
     * 从详情页 HTML 抽出结构化信息。
     * 返回 { title, cover, description, photos, date, views, model, cosplays, fandoms, recommend }
     */
    parseDetail(html, id) {
        const ld = osJsonLd(html) || {};

        let doc = null;
        let model = "";
        const cosplays = [];
        const fandoms = [];
        let h1 = "";
        let photosFromH1 = 0;
        const recommend = [];
        try {
            doc = new HtmlDocument(html);

            const h1el = doc.querySelector("h1");
            h1 = osText(h1el);
            if (h1) {
                const m = /\((\d[\d,]*)\s+leaked\s+photos?\)/i.exec(h1);
                if (m) photosFromH1 = osNum(m[1]);
            }

            // .album-info 里的模特 / cosplay / fandom 按钮
            for (const a of doc.querySelectorAll(".album-info a")) {
                const href = String((a.attributes && a.attributes["href"]) || "");
                const name = osText(a);
                if (!name) continue;
                if (href.indexOf("/model/") === 0) {
                    if (!model) model = name;
                } else if (href.indexOf("/cosplay/") === 0) {
                    if (cosplays.indexOf(name) < 0) cosplays.push(name);
                } else if (href.indexOf("/fandom/") === 0) {
                    if (fandoms.indexOf(name) < 0) fandoms.push(name);
                }
            }

            // 正文图片数（最可靠）
            const figs = doc.querySelectorAll("figure.photo-item");
            if (figs.length) photosFromH1 = Math.max(photosFromH1, figs.length);
        } catch (e) {
            // 忽略，走 JSON-LD 兜底
        } finally {
            if (doc) {
                try {
                    doc.dispose();
                } catch (e) {}
            }
        }

        // 「YOU MAY ALSO LIKE」里的卡片（详情页只有这一处 article.gallery-item）
        for (const c of osParseCards(html)) {
            if (c.id === id) continue;
            recommend.push(osToComic(c));
        }

        let title = osCleanTitle(ld.name || "") || osCleanTitle(h1) || id;

        // ⚠️ 封面一定取 `/images/albums/{a}/{b}.webp` —— 这是站点自己在列表/相关推荐里
        // 真正加载的地址（全站快照里 432 处 <img src> 全是 .webp）。
        // JSON-LD 的 thumbnailUrl 是 `.jpg`，**站点从来不加载它**（只出现在 meta 标签里，
        // 全站仅 4 处），实测 404。
        // 而 app 下载整章时会**先下封面**，封面走 loadThumbnail 没有降级链 ——
        // 取错了整包下载直接失败（"Failed to download cover"）。
        let cover = osCoverFromId(id);
        if (!cover) cover = osAbs(ld.thumbnailUrl || "");
        if (!cover) cover = recommend.length ? recommend[0].cover : "";

        let photos = osNum(ld.numberOfItems) || photosFromH1 || 0;
        if (!photos) photos = recommend.length ? 0 : 0;

        const date = String(ld.datePublished || "").slice(0, 10);
        const views = osNum(
            ld.interactionStatistic && ld.interactionStatistic.userInteractionCount,
        );

        return {
            title,
            cover,
            ldDescription: String(ld.description || "").trim(),
            photos,
            date,
            views,
            model,
            cosplays,
            fandoms,
            recommend,
        };
    }

    /** 详情页 -> ComicDetails */
    async buildDetails(id) {
        const html = await this.detailHtml(id);
        const d = this.parseDetail(html, id);

        // tags：key 不可点，value 可点 -> 走 onClickTag 转搜索
        const tags = {};
        if (d.model) tags["Model"] = [d.model];
        if (d.cosplays.length) tags["Cosplay"] = d.cosplays;
        if (d.fandoms.length) tags["Fandom"] = d.fandoms;

        const lines = [];
        if (d.ldDescription) lines.push(d.ldDescription);
        const meta = [];
        if (d.photos > 0) meta.push(d.photos + " photos");
        if (d.date) meta.push(d.date);
        if (d.views > 0) meta.push(d.views + " views");
        if (meta.length) lines.push(meta.join(" · "));
        if (d.model) lines.push("Model: " + d.model);
        if (d.cosplays.length) lines.push("Cosplay: " + d.cosplays.join(", "));
        if (d.fandoms.length) lines.push("Fandom: " + d.fandoms.join(", "));

        const chapters = {};
        chapters["0"] =
            d.photos > 0 ? "View All Photos (" + d.photos + ")" : "View All Photos";

        return new ComicDetails({
            id: id,
            title: d.title,
            cover: d.cover,
            description: lines.join("\n"),
            tags: tags,
            chapters: chapters,
            uploader: d.model || undefined,
            uploadTime: d.date || undefined,
            url: this.detailUrl(id),
            recommend: d.recommend.slice(0, 16),
        });
    }

    // ==================== 模块：explore ====================

    explore = [
        {
            title: "Ososedki",

            type: "multiPartPage",

            load: async (page) => {
                const out = [];
                for (const key of OS_EXPLORE_PARTS) {
                    const sec = OS_SECTION_BY_KEY[key];
                    let comics = [];
                    try {
                        const html = await this.fetch(this.listUrl(sec, 1));
                        comics = osParseCards(html).slice(0, OS_PREVIEW).map(osToComic);
                    } catch (e) {
                        comics = [];
                    }
                    out.push({
                        title: sec.label,
                        comics: comics,
                        viewMore: {
                            page: "category",
                            attributes: {
                                category: sec.label,
                                param: sec.key,
                            },
                        },
                    });
                }
                return out;
            },
        },
    ];

    // ==================== 模块：category ====================

    category = {
        title: "Ososedki",

        parts: [
            {
                name: "普通分类",
                type: "fixed",
                categories: OS_PLAIN_KEYS.map((k) => ({
                    label: OS_SECTION_BY_KEY[k].label,
                    target: {
                        page: "category",
                        attributes: {
                            category: OS_SECTION_BY_KEY[k].label,
                            param: k,
                        },
                    },
                })),
            },
            // <<<COSPLAY_PART>>>
            ...OS_COSPLAY_GROUPS.map((g) => ({
                name: g[0],
                type: "fixed",
                categories: g[1].map((it) => ({
                    label: it[0],
                    target: {
                        page: "category",
                        attributes: {
                            category: it[0],
                            param: it[1] + ":" + it[2],
                        },
                    },
                })),
            })),
            // <<<END_COSPLAY_PART>>>
        ],

        enableRankingPage: false,
    };

    // ==================== 模块：categoryComics ====================

    categoryComics = {
        load: async (category, param, options, page) => {
            const p = page && page > 0 ? page : 1;
            const key = String(param || "");

            if (key.indexOf("fandom:") === 0) {
                return await this.loadFandom(key.slice(7), p);
            }
            if (key.indexOf("cosplay:") === 0) {
                return await this.loadCosplayTag(key.slice(8), p);
            }

            const sec = OS_SECTION_BY_KEY[param];
            if (!sec) throw "未知分类：" + param;

            const html = await this.fetch(this.listUrl(sec, p));
            const comics = osParseCards(html).map(osToComic);
            const maxPage = await this.maxPageFor(sec, html, p);

            return { comics: comics, maxPage: maxPage };
        },
    };

    /** 列表页 HTML -> {comics, maxPage}，cosplay/fandom 页与分类页结构一致 */
    listingFrom(html, page) {
        const comics = osParseCards(html).map(osToComic);
        const count = osCountFromHeader(html);
        let maxPage;
        if (count > 0) {
            maxPage = Math.max(page, osPaginationMax(html) || Math.ceil(count / OS_PER_PAGE));
        } else {
            maxPage = Math.max(page, osPaginationMax(html) || page);
        }
        return { comics: comics, maxPage: maxPage };
    }

    /** 单个 cosplay 角色/服装 tag 页 */
    async loadCosplayTag(tag, page) {
        const html = await this.fetch(this.cosplayUrl(tag, page), { ttl: 120000 });
        return this.listingFrom(html, page);
    }

    /**
     * 一个 IP 页。targets 用 `|` 分隔时是**备选**：
     * 站点对同一个作品存在多种大小写/拼写（例如 Nikke 有三种写法、Cyberpunk 有无冒号两种），
     * 这里逐个取，某个 404 就跳过，最后按 id 去重合并。
     * 分页是「各源各取第 N 页再合并」，所以页数取各源最大值。
     */
    async loadFandom(target, page) {
        const names = String(target || "").split("|").filter((x) => x);
        if (names.length === 0) throw "空 fandom";

        const comics = [];
        const seen = {};
        let maxPage = 1;
        let okCount = 0;
        let lastErr = "";

        for (const name of names) {
            let html;
            try {
                html = await this.fetch(this.fandomUrl(name, page), { ttl: 120000 });
            } catch (e) {
                lastErr = String(e && e.message ? e.message : e);
                continue;
            }
            okCount++;
            for (const c of osParseCards(html)) {
                if (seen[c.id]) continue;
                seen[c.id] = 1;
                comics.push(osToComic(c));
            }
            const count = osCountFromHeader(html);
            if (count > 0) {
                maxPage = Math.max(
                    maxPage,
                    osPaginationMax(html) || Math.ceil(count / OS_PER_PAGE),
                );
            }
        }

        if (okCount === 0) throw "请求失败：" + names.join(", ") + " (" + lastErr + ")";
        return { comics: comics, maxPage: Math.max(page, maxPage) };
    }

    // ==================== 模块：search ====================

    search = {
        load: async (keyword, options, page) => {
            const kw = String(keyword || "").trim();
            if (!kw) return { comics: [], maxPage: 0 };

            // 粘贴详情 URL / 裸 id -> 直接出那一本
            const id = osIdFromKeyword(kw);
            if (id) {
                try {
                    const details = await this.buildDetails(id);
                    const one = new Comic({
                        id: id,
                        title: details.title,
                        cover: details.cover,
                        tags: [],
                    });
                    return { comics: [one], maxPage: 1 };
                } catch (e) {
                    return { comics: [], maxPage: 0 };
                }
            }

            const p = page && page > 0 ? page : 1;
            let url = OS_BASE + "/search?q=" + encodeURIComponent(kw);
            if (p > 1) url += "&page=" + p;

            const html = await this.fetch(url);
            const comics = osParseCards(html).map(osToComic);

            const count = osCountFromHeader(html);
            let maxPage;
            if (count > 0) {
                maxPage = Math.max(p, osPaginationMax(html) || Math.ceil(count / OS_PER_PAGE));
            } else if (comics.length) {
                maxPage = p;
            } else {
                maxPage = 0;
            }
            return { comics: comics, maxPage: maxPage };
        },

        enableTagsSuggestions: false,
    };

    // ==================== 模块：comic ====================

    comic = {
        loadInfo: async (id) => {
            return await this.buildDetails(id);
        },

        loadEp: async (comicId, epId) => {
            const html = await this.detailHtml(comicId);

            const map = {};
            let doc = null;
            try {
                doc = new HtmlDocument(html);
                for (const a of doc.querySelectorAll("figure.photo-item a")) {
                    const at = (a && a.attributes) || {};
                    let href = String(at["href"] || "");
                    if (!href) {
                        const img = a.querySelector("img");
                        const iat = (img && img.attributes) || {};
                        href = String(iat["data-src"] || iat["src"] || "");
                        if (href.indexOf("/images/a/604/") >= 0) {
                            href = href.replace("/images/a/604/", "/images/a/1280/");
                        }
                    }
                    if (!href || href.indexOf("/images/a/") < 0) continue;
                    const m = /\/(\d+)\.(?:webp|jpg|jpeg|png)$/i.exec(href);
                    if (!m) continue;
                    const n = parseInt(m[1], 10);
                    if (isNaN(n)) continue;
                    map[n] = osAbs(href);
                }
            } catch (e) {
                // 忽略，走下面的正则兜底
            } finally {
                if (doc) {
                    try {
                        doc.dispose();
                    } catch (e) {}
                }
            }

            if (Object.keys(map).length === 0) {
                // HtmlDocument 失败时的正则兜底
                const re = /\/images\/a\/1280\/[^"']*?\/(\d+)\.(?:webp|jpg|jpeg|png)/gi;
                let m;
                while ((m = re.exec(html)) !== null) {
                    const n = parseInt(m[1], 10);
                    if (!isNaN(n) && !map[n]) map[n] = osAbs(m[0]);
                }
            }

            // 站点把正文图按「文件名字符串」排序（1, 10, 11, …, 2, 20 …），
            // 文件名是纯整数，这里按数值重排成真正的阅读顺序。
            const nums = Object.keys(map)
                .map((k) => parseInt(k, 10))
                .sort((a, b) => a - b);

            return { images: nums.map((n) => map[n]) };
        },

        /** 详情页的 Model / Cosplay / Fandom 芯片点了就转搜索 */
        /**
         * 图片加载配置 —— app 的「下载整章」全靠这条链。
         *
         * ⚠️ 送进来的 url 不一定是网络地址：已经下载好的图包会把相对路径
         * （`cover.webp`）或 `file://` / `content://` 喂进来。**绝不能拿站名去拼**，
         * 否则 app 对本地路径的判定失效，症状是「下载好的漫画进详情页封面报错，
         * 但离线图包还能看」。非 http(s) 一律原样透传（返回空对象 = 不改 url）。
         */
        onImageLoad: async (url, comicId, epId) => {
            const raw = String(url || "").trim();
            if (!/^https?:/i.test(raw) && raw.indexOf("//") !== 0) return {};

            const abs = raw.indexOf("//") === 0 ? "https:" + raw : raw;
            await osImgThrottle();

            // 每次新的加载重新起算跳数；次数上限由 app 的 retryLimit 兜底
            OS_IMG_HOPS[abs] = 0;
            if (Object.keys(OS_IMG_HOPS).length > 500) {
                for (const k of Object.keys(OS_IMG_HOPS).slice(0, 250)) {
                    delete OS_IMG_HOPS[k];
                }
            }
            return osImgConfig(abs, abs);
        },

        /**
         * 缩略图/封面加载配置。这一路**没有 onLoadFailed**（app 明确忽略），
         * 只能靠这里把 url 换成对的。
         *
         * 兜底场景：站点 og:image / JSON-LD 给的封面是 `/images/albums/xxx.jpg`，
         * 而真实文件只有 `.webp` —— 实测 404，且 app 下载整章会先下封面，
         * 封面 404 会让整包失败。app 缓存里可能还留着旧的 .jpg 地址，所以这里再兜一道。
         *
         * ⚠️ 本地地址（相对路径 / file:// / content://）一律原样透传，绝不拼站名。
         */
        onThumbnailLoad: (url) => {
            const raw = String(url || "").trim();
            if (!/^https?:\/\//i.test(raw) && raw.indexOf("//") !== 0) return {};
            const abs = raw.indexOf("//") === 0 ? "https:" + raw : raw;
            if (/\/images\/albums\/[^/?#]+\/[^/?#]+\.jpe?g$/i.test(abs)) {
                return { url: abs.replace(/\.jpe?g$/i, ".webp") };
            }
            return { url: abs };
        },

        onClickTag: (namespace, tag) => {
            const t = String(tag || "").trim();
            if (!t) return null;
            return {
                page: "search",
                attributes: {
                    keyword: t,
                },
            };
        },

        idMatch: "ososedki\\.com/photos/([^/?#]+)",
    };
}
