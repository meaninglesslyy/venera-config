# Venera 多平台漫画源合集

> 持续更新 · 欢迎投稿 · 共 **18** 个源，覆盖真人图包 / 生肉 / 汉化 / 正经漫画

[Mihon](https://github.com/mihonapp/mihon) 拥有海量漫画站资源，但无法在 iOS 设备上使用；而 [venera-config](https://github.com/venera-app/venera-configs) 又未收录部分站点。本项目应运而生——借助可运行于 iOS 的 **venera** 与漫画源 `.js` 文件，实现平替效果。

仓库内文件的前期准备、部分解密思路参考了 GitHub 开源项目与 issues 区同好大佬的研究，代码部分由 deepseek-v4-flash / deepseek-v4-pro / deepseek-v4.1-flash 编写，技术文档来源于原版 [venera-config](https://github.com/venera-app/venera-configs)。可能仍有瑕疵，敬请包容。

---

## 目录

- [快速开始](#快速开始)
- [图文教程](#图文教程)
- [源列表](#源列表)
- [网络提示](#网络提示)
- [反馈与更新](#反馈与更新)

---

## 快速开始

### 1. 添加仓库地址

在 venera 的仓库地址栏填入：

```text
https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/index.json
```

### 2. 如果不想影响原版仓库源的更新，推荐下面的做法：

| 方案 | 推荐指数 | 说明 |
| :--- | :---: | :--- |
| 使用最新的 [venera-prime](https://github.com/venera-app/venera-prime) | ⭐⭐⭐⭐⭐ | 可同时使用多个仓库源，互不干扰 |
| 自行备份原仓库地址 | ⭐ | 需要备份并来回切换地址，非常麻烦 |

原版仓库地址（备份用）：

```text
https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/index.json
```

---

## 图文教程

<p align="center">
  <img src="https://github.com/user-attachments/assets/53c25129-b53f-4f33-bceb-9c74a779fb0c" width="30%" alt="添加仓库源" /><br>
  <img src="https://github.com/user-attachments/assets/0c73bdc0-206b-454d-82dc-588e5b250a16" width="30%" alt="源列表" /><br>
  <img src="https://github.com/user-attachments/assets/0b3210e5-4520-4e68-963d-36b4230bb15d" width="30%" alt="阅读界面" /><br>
</p>

---

## 源列表

> 详细更新日志与功能介绍见 **[ALL-introduce.md](https://github.com/meaninglesslyy/venera-config/blob/main/ALL-introduce.md)**。

### 真人图包（11）

| 源 | 文件 |
| :--- | :--- |
| 4khd | [4khd.js](https://github.com/meaninglesslyy/venera-config/blob/main/real_person_photo_book/4khd.js) |
| cosplaytele | [cosplaytele.js](https://github.com/meaninglesslyy/venera-config/blob/main/real_person_photo_book/cosplaytele.js) |
| JJCOS | [jjcos.js](https://github.com/meaninglesslyy/venera-config/blob/main/real_person_photo_book/jjcos.js) |
| FoamGirl | [foamgirl.js](https://github.com/meaninglesslyy/venera-config/blob/main/real_person_photo_book/foamgirl.js) |
| buondua | [buondua.js](https://github.com/meaninglesslyy/venera-config/blob/main/real_person_photo_book/buondua.js) |
| V2PH | [v2ph.js](https://github.com/meaninglesslyy/venera-config/blob/main/real_person_photo_book/v2ph.js) |
| Xiutaku | [xiutaku.js](https://github.com/meaninglesslyy/venera-config/blob/main/real_person_photo_book/xiutaku.js) |
| kiutaku | [kiutaku.js](https://github.com/meaninglesslyy/venera-config/blob/main/real_person_photo_book/kiutaku.js) |
| Mitaku | [mitaku.js](https://github.com/meaninglesslyy/venera-config/blob/main/real_person_photo_book/mitaku.js) |
| Ososedki | [ososedki.js](https://github.com/meaninglesslyy/venera-config/blob/main/real_person_photo_book/ososedki.js) |
| 绅士会所 | [hentaiclub.js](https://github.com/meaninglesslyy/venera-config/blob/main/real_person_photo_book/hentaiclub.js) |

### 生肉（2）

| 源 | 文件 |
| :--- | :--- |
| mangaforfree | [mangaforfree.js](https://github.com/meaninglesslyy/venera-config/blob/main/raw_comic/mangaforfree.js) |
| manga18fx | [manga18fx.js](https://github.com/meaninglesslyy/venera-config/blob/main/raw_comic/manga18fx.js) |

### 汉化漫画（1）

| 源 | 文件 |
| :--- | :--- |
| 鸟鸟韩漫 | [nnhanman.js](https://github.com/meaninglesslyy/venera-config/blob/main/translated/nnhanman.js) |

### 正经漫画（4）

| 源 | 文件 |
| :--- | :--- |
| zero搬运网 | [zerobyw33.js](https://github.com/meaninglesslyy/venera-config/blob/main/normal_comic/zerobyw33.js) |
| 51漫画 | [51manga.js](https://github.com/meaninglesslyy/venera-config/blob/main/normal_comic/51manga.js) |
| 如漫画 | [rumanhua.js](https://github.com/meaninglesslyy/venera-config/blob/main/normal_comic/rumanhua.js) |
| 嗶哩漫畫 | [bilimanga.js](https://github.com/meaninglesslyy/venera-config/blob/main/normal_comic/bilimanga.js) |

---

## 网络提示

部分站点对**网络环境与 IP 纯净度**要求较高。如果不想为家宽 IP 付费，可以参考以下教程：

- [CFnew 免服务器家宽部署教程](https://www.youtube.com/watch?v=FfVstgssKaQ&t=301s)
- [edgetunnel 家宽优选列表部署教程](https://youtu.be/WEDHp7pNDaA?si=FgSBBtM2YFxly1P6)

---

## 反馈与更新

- 站点改版常导致接口失效、无法观看，请及时在 [Issues](https://github.com/meaninglesslyy/venera-config/issues) 区反馈。
- 更新日志与各源功能说明：[ALL-introduce.md](https://github.com/meaninglesslyy/venera-config/blob/main/ALL-introduce.md)
