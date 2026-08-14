# 数据源调研：谭图 + CHGIS + 元丰九域志 + 舆地广记

> 调研日期：2026-08-13。目标：为 HistoryMap 宋朝（960-1279）补充**州府级政区 / 县治地名**数据，并评估古籍文本数据源。
> 所有链接均经实际访问验证，未能访问的已明确标注。

---

## 一、谭图（谭其骧《中国历史地图集》）

### 高清扫描件（栅格，作矢量化底图）

| 来源 | URL | 说明 |
|---|---|---|
| Internet Archive · 第六册宋辽金 | https://archive.org/details/20250621_20250621_0102 | PDF 图像型（13–26MB/册），含第2/3/5/6册、目录、东北资料汇编；**第六册即北宋/南宋图组**，人工矢量化首选底图 |
| Internet Archive · 全8册 ZIP | https://archive.org/details/2_20250621 | 打包版（version1/2），疑似全8册 |
| OSGeo 中国 · 地图云集 | https://osgeo.cn/map/m0513/ | 宋辽西夏金类目 48 项，含两浙路、河北东路、秦凤路、永兴军路等**分路图** |
| OSGeo 在线查看器 | https://history-map.osgeo.cn/ | SPA「左图右史」，基于谭图扫描 |
| 历史地图网 | http://www.laozhaopian5.com/ditu/beisongliao.html | 北宋辽全图（四京/二十四路治/路界/府州治所） |
| 国学导航 | http://www.guoxue123.com/other/map/zgmap/ | 全8册图档 + 文字版图组说明 |

### 矢量数据（重点：州府级）

| 来源 | URL | 说明 |
|---|---|---|
| **DGSD 宋代数字地名录**（UC Merced, Ruth Mostern）| http://songgis.ucmerced.edu | **宋代专项**：4009 个宋地名，路—府州—县层级 + 建置/人口/存废年份，shapefile/SQL 免费下载；带 Cloudflare 验证，需联系获取。来源为 Hope Wright 宋地名表+历史地理学方法，**并非直接矢量化谭图**。介绍文：https://www.dhcn.cn/dhjournal/202101/18374.html |
| CHGIS 复旦版时间序列 | https://yugong.fudan.edu.cn/CHGIS/sjxz.htm | 含**府级界线/府级治所**图层（秦—清），正规学术渠道，非商业许可 |
| aourednik/historical-basemaps（GitHub）| https://github.com/aourednik/historical-basemaps | 政权级 GeoJSON（900–1300 各年份），GPL-3.0，**项目已在用**；无州府级 |
| 地图书/观沧海 | https://www.ditushu.com / https://www.ageeye.cn | 谭图矢量化图层社区（有北宋/路级图层），注册后检索，导出有积分门槛 |

### 关键结论
- 全网公开渠道**未发现现成的「谭图北宋州府级 GeoJSON」成品**；最接近的是 DGSD（宋地名点+属性）与 CHGIS 时间序列（府级界线，宋代覆盖有缺口需核实）。
- 版权：谭图 1982–1987 中国地图出版社出版，**仍在版权保护期**；archive.org 条目为未授权上传，仅限个人学习。国界线绘制另受《地图管理条例》约束。
- 中研院 CCTS 提供**已配准瓦片**（北宋 1111 / 南宋 1208）：https://gis.sinica.edu.tw/showwmts/index.php?s=ccts&l=ad1111（WMTS，maxzoom 19，非商业），可作 three.js 场景配准参考层。
- geodataonline.cn 与「清华 geodata」本次均无法访问，未能核实。

---

## 二、CHGIS（中国历史地理信息系统）

### 官方渠道
| 来源 | URL | 说明 |
|---|---|---|
| 哈佛主站 | http://chgis.fas.harvard.edu/ | 版本页列出 V1–V6；新域名 chgis.fairbank.fas.harvard.edu（本次 TLS 失败） |
| 哈佛 Dataverse 数据仓 | https://dataverse.harvard.edu/dataverse/chgis | 全部数据托管于此，免费直接下载 zip（shapefile，GBK/UTF8 × WGS84/Xian80），**无需注册** |
| 复旦禹贡 | http://yugong.fudan.edu.cn/CHGIS/ | 数据下载 sjxz.htm、数据说明 sjsm.htm、版权声明 bqsm.htm；提供 **V4 rar 直链**（时间序列/1820 层/1911 层/DEM） |
| 复旦 TGaz 地名查询 API | https://tgaz.fudan.edu.cn/tgaz/ | 按年份（-222 至 1911）与行政等级查地名，可在线补聚落点，无需分发数据 |

### 版本要点
- V6（2016，收官版）：Time Series Prefecture Points (DOI 10.7910/DVN/WW1PD6) / Polygons (10.7910/DVN/I0Q7SM)，覆盖 221 BCE–1911 CE；**官方声明府级 1350 年前（含宋）覆盖有缺口**，宋代完整度低于明清，需下载实测。
- 1820 Layers（10.7910/DVN/ST5KKM 等）：省/府/县 点+面、**村镇点 twn_pts、河流 coded_rvr_lin、湖泊 lks_pgn**。
- V5（10.7910/DVN/M7WEFY）：1820 全要素 + 1911 层 + v4_time_prov 省级时间序列。
- V2（10.7910/DVN/ZZKZ6U）：**约 239MB**，1820/1911 + 时间序列层 + Access 关系库。

### 许可（关键风险）
- 复旦《CHGIS V2.0 用户协议》：**仅限非商业学术研究与教育；未经管理委员会书面同意不得以任何形式再发布；不得整体纳入自有成果**；商业使用须另签协议。
- 对开源项目含义：数据**不能随开源仓库再分发**。可行做法：仓库只放转换脚本/处理流程，数据本体本地保留（参考 https://github.com/fusiwei339/chgis-1911-topojson 的「脚本+流程」模式）。

### 第三方参考（GitHub）
- cga-harvard/chgis（官方镜像）、cga-harvard/chgis.github.io
- fusiwei339/chgis-1911-topojson（CHGIS V5 → topojson 转换示例）
- huajibing/CHGIS_MCP_Server、cbdb-project/CBDB-CHGIS-MCP（时空地名查询 MCP 封装）
- **Hartwell China Historical GIS**（10.7910/DVN/29302）：742/1080/1200/1280/1391 年近似区域图，**1080 即元丰时期**；但官网注明与 CHGIS 官方数据不相干，引用需谨慎。

---

## 三、《元丰九域志》（北宋·王存等，1080）

### 全文电子文本（按机器可读性排序）
| 来源 | URL | 说明 |
|---|---|---|
| **kanripo KR2k0005**（京都大学汉籍项目，推荐主源）| https://github.com/kanripo/KR2k0005 | 11 个纯文本文件（卷首+卷1-10），UTF-8，文渊阁四库本；raw 直链可循环下载：`https://raw.githubusercontent.com/kanripo/KR2k0005/master/KR2k0005_00X.txt`。**无 wikitext 模板噪声，最适合脚本解析** |
| 维基文库·四库全书本（推荐校验源）| https://zh.wikisource.org/wiki/元豐九域志_(四庫全書本) | 卷01–卷10 全（注意两位编号），`?action=raw` 可 API 拉取；无标点，个别 OCR 讹误 |
| ctext 维基版（带标点）| https://ctext.org/wiki.pl?if=gb&res=508139 | 人工阅读/交叉校验；四库影印本 res=533；禁止批量抓取 |
| 识典古籍 | https://www.shidianguji.com/ | 分路组织+译文，JS 渲染需登录，仅人工查阅 |
| 国学大师/古籍在线/殆知阁 | — | 本次网络均无法访问（殆知阁基本可判定停服） |

### 内容结构（与项目需求高度匹配）
- 全书 10 卷：卷1 四京+京东/京西，卷2-9 河北、河东、陕西、两浙、淮南、江南、荆湖、福建、成都府、梓州、利州、夔州、广南等 **23 路**，卷10 省废州军+化外州+羁縻州。
- 每州/府/军/监条目固定字段：**地里（四至八到+至东京里程）、户口（主/客户数）、土贡、属县（等第 赤畿望紧上中下 + 镇/监名）**。
- 提要：4 京府 + 10 次府 + 242 州 + 37 军 + 4 监 + **1135 县**。

### 其他
- 点校本：《元丰九域志》（中国古代地理总志丛刊），王文楚、魏嵩山点校，中华书局，ISBN 9787101045277（约 ¥98-121），无免费电子版，作准确度基准。
- 结构化数据：GitHub 未发现现成 CSV/JSON，需自行解析（卷目边界 + 州条目标题可机械切分）。
- 关联：CHGIS 编制北宋政区的主要史料之一即《元丰九域志》；1077 年图层是否存在需下载 V6 Data Dictionary（10.7910/DVN/SNCEAU）核实，**未经验证勿引用**。

---

## 四、《舆地广记》（南宋·欧阳忞，政和年间成书，38 卷）

### 全文电子文本
| 来源 | URL | 说明 |
|---|---|---|
| **维基文库·四库全书本（推荐主源）** | https://zh.wikisource.org/wiki/輿地廣記_(四庫全書本)/卷01 | **38 卷全**（卷01–卷38 已逐一验证存在），MediaWiki API 可批量导出。⚠️ 坑：正文挂在「輿地廣記 (四庫全書本)」名下，裸标题「輿地廣記」只是未完成目录页；「輿」字 URL 编码 `%E8%BC%BF` |
| **kanripo KR2k0006**（交叉校对源）| https://github.com/kanripo/KR2k0006 | 每卷一个 txt，文渊阁本；⚠️ **GBK 编码**，需 `iconv` 转码 + 剥离 mandoku 标记 |
| ctext | https://ctext.org/wiki.pl?if=gb&res=925161 | OCR 未校对，自称有错字，站点禁止批量下载，仅人工对照 |
| 识典古籍 | — | 站内搜索 0 条结果，未收录 |

### 内容结构与版本
- 38 卷：前 4 卷叙历代疆域沿革（禹贡九州→秦郡→汉…），**卷 5–38 叙宋代路府州军监沿革**（重沿革，区别于九域志重当代建制）。
- 点校本：**中华书局 2023 年 2 月**《舆地广记》（全二册），中国古代地理总志丛刊，李勇先、王小红校注，ISBN 9787101160154，¥168。
- 其他版本：宋刻本（国图出版社影印）、士礼居黄氏丛书本（ctext res=77364）、丛书集成初编本（孙星华校勘记）。
- 结构化数据：未发现现成 CSV/JSON，需自行解析。

### 同代总志横向参考（维基文库/ctext 收录情况）
| 书名 | 维基文库 | ctext |
|---|---|---|
| 《太平寰宇记》 | 部分卷（四库全书本全覽6/7 等）| 有（OCR 未校对）|
| 《舆地纪胜》 | 无（仅碑目）| 有 OCR |
| 《方舆胜览》 | 无 | 有 OCR |

结论：《舆地广记》是**维基文库上唯一录全 38 卷的宋代地理总志**，机器可用性反而最好。

---

## 五、落地建议（按项目需求排序）

### 目标 A：宋 州府级政区边界
1. **CHGIS 复旦 V4 时间序列（府级界线）**：先下载验证宋代年份（如 1077）实际要素数——V6 声明 1350 年前有缺口，实测为准。
2. **DGSD（songgis.ucmerced.edu）**：4009 个宋地名含层级关系，补政区树；通过 Cloudflare 验证或邮件联系 UC Merced。
3. 若以上不足：以 archive.org 第六册扫描件 + osgeo.cn 分路图为底图人工矢量化（数百州府，工作量大）。

### 目标 B：州县级地名与坐标
1. 古籍解析：**元丰九域志 = kanripo KR2k0005**（含户口/土贡/属县），**舆地广记 = 维基文库四库本 38 卷**（含沿革），写解析器按「路→府州军监→县」抽取。
2. 坐标对照/补点：CHGIS 时间序列府级治所点 + 1820 村镇点 + 复旦 TGaz API 按年查询。

### 目标 C：配准与校验
- 中研院 CCTS 北宋 1111 / 南宋 1208 瓦片，叠加到 three.js 场景校验形位。
- aourednik/historical-basemaps 现有政权级数据（项目已在用）。

### 许可红线（务必遵守）
- CHGIS：**不可再分发、不可商用**——数据本体不进 git 仓库，只提交转换脚本；如需公开分发先联系管理委员会。
- 谭图扫描件：仅个人学习参考，不随项目分发。
- 古籍全文：维基文库/kanripo 均免费开放，可放心用于数据提取与再加工。
