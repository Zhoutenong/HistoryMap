-- 事件月级日期（月份化）：按 (dynasty_id, year, short) 身份 UPDATE 全部事件的 month/month_end。
-- 由 scripts/gen-event-months.mjs 从 .data-months/*.json 生成，幂等可重跑（提交前请勿手改）。
-- month 为事件发生月；month_end 为显示窗口结束月（对应原 year_end，多为跨年窗口的近似）。

-- [high] 显德七年正月初四（960年正月）于陈桥驿黄袍加身，正月≈公历1月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 960 AND short = '陈桥兵变';
-- [medium] 史实为建隆二年（961）七月；seed 取963年，仍取农历七月。
UPDATE events SET month = 7, month_end = 12 WHERE dynasty_id = 'song' AND year = 963 AND short = '杯酒释兵权';
-- [high] 太平兴国四年五月（979年5月）克太原，北汉刘继元降。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'song' AND year = 979 AND short = '北汉灭亡';
-- [medium] 景德元年（1004）十一月真宗至澶州督战；辽军南下始于闰九月。
UPDATE events SET month = 11, month_end = 11 WHERE dynasty_id = 'song' AND year = 1004 AND short = '澶州之战';
-- [high] 景德元年（1004）十二月议定，公历跨至1005年1月，取1月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1005 AND short = '澶渊之盟';
-- [medium] 宝元元年（1038）十月元昊称帝建国号大夏。
UPDATE events SET month = 10, month_end = 12 WHERE dynasty_id = 'song' AND year = 1038 AND short = '西夏建立';
-- [medium] 庆历三年（1043）九月范仲淹上《答手诏条陈十事》。
UPDATE events SET month = 9, month_end = 12 WHERE dynasty_id = 'song' AND year = 1043 AND short = '庆历新政';
-- [medium] 熙宁二年（1069）二月王安石拜参知政事，新法始行。
UPDATE events SET month = 2, month_end = 12 WHERE dynasty_id = 'song' AND year = 1069 AND short = '熙宁变法';
-- [medium] 元丰七年（1084）冬，司马光进呈《资治通鉴》，约十二月。
UPDATE events SET month = 12, month_end = 12 WHERE dynasty_id = 'song' AND year = 1084 AND short = '资治通鉴成书';
-- [high] 元符三年（1100）正月哲宗崩，赵佶即位。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1100 AND short = '徽宗即位';
-- [high] 收国元年（1115）正月，完颜阿骨打称帝建金。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1115 AND short = '金朝建立';
-- [low] 宣和二年（1120）宋金缔结海上之盟，具体月不详，取年初推断。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1120 AND short = '海上之盟';
-- [high] 保大五年（1125）二月金俘辽天祚帝，辽亡。
UPDATE events SET month = 2, month_end = 12 WHERE dynasty_id = 'song' AND year = 1125 AND short = '金灭辽';
-- [high] 靖康二年（1127）三月末徽钦二帝北迁，北宋亡，取四月。
UPDATE events SET month = 4, month_end = 12 WHERE dynasty_id = 'song' AND year = 1127 AND short = '靖康之变';
-- [high] 建炎元年（1127）五月，赵构即位于应天府。
UPDATE events SET month = 5, month_end = 12 WHERE dynasty_id = 'song' AND year = 1127 AND short = '南宋建立';
-- [low] 绍兴六年（1136）岳飞北伐伪齐；seed 中郾城/朱仙镇实为1140年事，月取推断（约七月）。
UPDATE events SET month = 7, month_end = 7 WHERE dynasty_id = 'song' AND year = 1136 AND short = '岳飞北伐';
-- [high] 绍兴十一年（1141）十一月宋金和议议定。
UPDATE events SET month = 11, month_end = 12 WHERE dynasty_id = 'song' AND year = 1141 AND short = '绍兴和议';
-- [high] 绍兴三十二年（1162）六月高宗禅位，孝宗即位。
UPDATE events SET month = 6, month_end = 12 WHERE dynasty_id = 'song' AND year = 1162 AND short = '孝宗即位';
-- [medium] 开禧二年（1206）五月南宋下诏北伐。
UPDATE events SET month = 5, month_end = 12 WHERE dynasty_id = 'song' AND year = 1206 AND short = '开禧北伐';
-- [low] 1206年春铁木真于斡难河源称成吉思汗，取3月（约）。
UPDATE events SET month = 3, month_end = 12 WHERE dynasty_id = 'song' AND year = 1206 AND short = '蒙古崛起';
-- [high] 端平元年（1234）正月宋蒙联军破蔡州，金亡。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1234 AND short = '联蒙灭金';
-- [low] 战事跨1258—1259年，蒙哥汗于1259年八月身死；seed 取战起之年1258，月取年初推断。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1258 AND short = '钓鱼城之战';
-- [high] 至元八年（1271）十一月忽必烈定国号大元。
UPDATE events SET month = 11, month_end = 12 WHERE dynasty_id = 'song' AND year = 1271 AND short = '元朝建立';
-- [high] 祥兴二年（1279）二月崖山陷，陆秀夫负帝投海，南宋亡。
UPDATE events SET month = 2, month_end = 2 WHERE dynasty_id = 'song' AND year = 1279 AND short = '崖山海战';
-- [low] 开宝四年（971）宋灭南汉后于广州设市舶司，具体月不详，取三月推断。
UPDATE events SET month = 3, month_end = 12 WHERE dynasty_id = 'song' AND year = 971 AND short = '市舶司设立';
-- [medium] 天圣元年（1023—1024）置益州交子务；seed 取1024，改元取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1024 AND short = '交子发行';
-- [low] 绍兴三十年（1160）会子始行用，具体月不详，取一月推断。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1160 AND short = '会子行用';
-- [high] 元丰二年（1079）七月苏轼下御史台狱。
UPDATE events SET month = 7, month_end = 12 WHERE dynasty_id = 'song' AND year = 1079 AND short = '乌台诗案';
-- [low] seed 1175 与书院重建（1179—1180）不符，白鹿洞讲学跨年，月取年初推断。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1175 AND short = '朱熹讲学';
-- [high] 德祐元年（1275）正月文天祥起兵勤王。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1275 AND short = '文天祥勤王';
-- [low] 开宝九年（976）朱洞创建岳麓书院，具体月不详，取一月推断。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 976 AND short = '岳麓书院';
-- [high] 太平兴国三年（978）五月钱俶纳土归宋。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'song' AND year = 978 AND short = '吴越纳土';
-- [high] 太平兴国四年（979）七月宋辽高梁河之战。
UPDATE events SET month = 7, month_end = 7 WHERE dynasty_id = 'song' AND year = 979 AND short = '高梁河之战';
-- [high] 雍熙三年（986）三月宋太宗三路北伐。
UPDATE events SET month = 3, month_end = 3 WHERE dynasty_id = 'song' AND year = 986 AND short = '雍熙北伐';
-- [medium] 淳化四年（993）春王小波青城起义，取二月（约）。
UPDATE events SET month = 2, month_end = 12 WHERE dynasty_id = 'song' AND year = 993 AND short = '王小波起义';
-- [high] 至道三年（997）三月太宗崩，真宗即位。
UPDATE events SET month = 3, month_end = 12 WHERE dynasty_id = 'song' AND year = 997 AND short = '真宗即位';
-- [high] 大中祥符元年（1008）十月真宗东封泰山；天书降于正月。
UPDATE events SET month = 10, month_end = 12 WHERE dynasty_id = 'song' AND year = 1008 AND short = '天书封禅';
-- [medium] 大中祥符二年（1009）二月应天府书院获赐额。
UPDATE events SET month = 2, month_end = 12 WHERE dynasty_id = 'song' AND year = 1009 AND short = '应天书院';
-- [low] 大中祥符年间汴河岁漕达七百万石，制度性事件，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1015 AND short = '汴河漕运';
-- [medium] 天圣元年（1023）改元，刘太后临朝称制，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1023 AND short = '刘太后临朝';
-- [high] 明道二年（1033）三月刘太后崩，仁宗始亲政。
UPDATE events SET month = 3, month_end = 12 WHERE dynasty_id = 'song' AND year = 1033 AND short = '仁宗亲政';
-- [high] 康定元年（1040）正月宋夏三川口之战。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'song' AND year = 1040 AND short = '三川口之战';
-- [low] 康定元年（1040）范仲淹知延州，具体月不详，取六月推断。
UPDATE events SET month = 6, month_end = 12 WHERE dynasty_id = 'song' AND year = 1040 AND short = '范仲淹戍边';
-- [high] 庆历元年（1041）二月宋夏好水川之战。
UPDATE events SET month = 2, month_end = 2 WHERE dynasty_id = 'song' AND year = 1041 AND short = '好水川之战';
-- [high] 庆历二年（1042）九月宋夏定川寨之战。
UPDATE events SET month = 9, month_end = 9 WHERE dynasty_id = 'song' AND year = 1042 AND short = '定川寨之战';
-- [medium] 庆历四年（1044）《武经总要》进呈，具体月不详，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1044 AND short = '武经总要';
-- [medium] 庆历年间毕昇创胶泥活字，seed 取1045，具体月不详，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1045 AND short = '毕昇活字';
-- [medium] 庆历七年（1047）十一月王则于贝州起事。
UPDATE events SET month = 11, month_end = 12 WHERE dynasty_id = 'song' AND year = 1047 AND short = '王则之乱';
-- [high] 嘉祐二年（1057）三月贡举放榜（欧阳修知贡举）。
UPDATE events SET month = 3, month_end = 12 WHERE dynasty_id = 'song' AND year = 1057 AND short = '嘉祐二年榜';
-- [medium] 嘉祐五年（1060）欧阳修等奏上新修《唐书》，约六月。
UPDATE events SET month = 6, month_end = 12 WHERE dynasty_id = 'song' AND year = 1060 AND short = '新唐书成书';
-- [high] 治平四年（1067）正月英宗崩，神宗即位。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1067 AND short = '神宗即位';
-- [low] 熙宁三年（1070）张载退居横渠讲学，具体月不详，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1070 AND short = '张载讲学';
-- [low] 熙宁四年（1071）周敦颐筑书堂于庐山，具体月不详，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1071 AND short = '濂溪讲学';
-- [medium] 熙宁五年（1072）王韶收复熙州，约五月（推断）。
UPDATE events SET month = 5, month_end = 12 WHERE dynasty_id = 'song' AND year = 1072 AND short = '熙河开边';
-- [high] 熙宁五年（1072）三月颁市易法，置市易务。
UPDATE events SET month = 3, month_end = 12 WHERE dynasty_id = 'song' AND year = 1072 AND short = '市易法';
-- [low] 元丰年间二程讲学洛阳，seed 取1080，具体月不详，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1080 AND short = '洛学兴起';
-- [high] 元丰四年（1081）七月宋五路大军伐夏。
UPDATE events SET month = 7, month_end = 7 WHERE dynasty_id = 'song' AND year = 1081 AND short = '五路伐夏';
-- [high] 元丰五年（1082）九月永乐城之败。
UPDATE events SET month = 9, month_end = 9 WHERE dynasty_id = 'song' AND year = 1082 AND short = '永乐城之战';
-- [high] 元丰八年（1085）五月高太后起用司马光，元祐更化。
UPDATE events SET month = 5, month_end = 12 WHERE dynasty_id = 'song' AND year = 1085 AND short = '元祐更化';
-- [medium] 元祐二年（1087）泉州设市舶司，具体月不详，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1087 AND short = '泉州市舶司';
-- [low] 元祐三年（1088）沈括退居梦溪园撰书，具体月不详，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1088 AND short = '梦溪笔谈';
-- [medium] 元祐五年（1090）春苏轼知杭州浚西湖，取三月。
UPDATE events SET month = 3, month_end = 12 WHERE dynasty_id = 'song' AND year = 1090 AND short = '疏浚西湖';
-- [low] 元祐七年（1092）苏颂建成水运仪象台，具体月不详，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1092 AND short = '水运仪象台';
-- [high] 绍圣元年（1094）四月改元绍圣，新党复位。
UPDATE events SET month = 4, month_end = 12 WHERE dynasty_id = 'song' AND year = 1094 AND short = '绍圣绍述';
-- [high] 崇宁元年（1102）九月立元祐党籍碑于端礼门。
UPDATE events SET month = 9, month_end = 12 WHERE dynasty_id = 'song' AND year = 1102 AND short = '崇宁新政';
-- [low] 宣和元年（1119）朱彧《萍洲可谈》记罗盘航海，具体月不详，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1119 AND short = '指南针航海';
-- [high] 宣和二年（1120）十一月方腊于睦州青溪起事。
UPDATE events SET month = 11, month_end = 12 WHERE dynasty_id = 'song' AND year = 1120 AND short = '方腊起义';
-- [low] 宣和年间张择端绘《清明上河图》，seed 取1122，具体月不详，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1122 AND short = '清明上河图';
-- [medium] 宣和五年（1123）金以燕京归宋，约四月。
UPDATE events SET month = 4, month_end = 4 WHERE dynasty_id = 'song' AND year = 1123 AND short = '燕云交割';
-- [high] 靖康元年（1126）正月李纲临危守汴京。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'song' AND year = 1126 AND short = '东京保卫战';
-- [medium] 建炎三年（1129）春金军渡江搜山检海，约二月。
UPDATE events SET month = 2, month_end = 12 WHERE dynasty_id = 'song' AND year = 1129 AND short = '搜山检海';
-- [high] 建炎三年（1129）三月苗傅刘正彦于杭州兵变。
UPDATE events SET month = 3, month_end = 3 WHERE dynasty_id = 'song' AND year = 1129 AND short = '苗刘兵变';
-- [high] 建炎四年（1130）三月韩世忠黄天荡之战。
UPDATE events SET month = 3, month_end = 3 WHERE dynasty_id = 'song' AND year = 1130 AND short = '黄天荡之战';
-- [high] 建炎四年（1130）二月钟相于鼎州起义。
UPDATE events SET month = 2, month_end = 12 WHERE dynasty_id = 'song' AND year = 1130 AND short = '钟相杨幺起义';
-- [high] 绍兴元年（1131）十月吴玠和尚原大捷。
UPDATE events SET month = 10, month_end = 10 WHERE dynasty_id = 'song' AND year = 1131 AND short = '和尚原之战';
-- [low] 绍兴元年（1131）淮南营田实边，制度性事件，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1131 AND short = '淮南屯田';
-- [medium] 绍兴二年（1132）陈规守德安以火枪御敌，取一月。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'song' AND year = 1132 AND short = '陈规火枪';
-- [low] 李清照南渡跨建炎三年至绍兴二年，取一月推断。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1132 AND short = '李清照南渡';
-- [high] 绍兴四年（1134）五月岳飞出师收复襄汉六郡。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'song' AND year = 1134 AND short = '收复襄汉';
-- [high] 绍兴七年（1137）八月郦琼率淮西军叛降伪齐。
UPDATE events SET month = 8, month_end = 8 WHERE dynasty_id = 'song' AND year = 1137 AND short = '淮西军变';
-- [medium] 绍兴八年（1138）三月秦桧再相，独专和议。
UPDATE events SET month = 3, month_end = 12 WHERE dynasty_id = 'song' AND year = 1138 AND short = '秦桧独相';
-- [high] 绍兴十年（1140）六月刘锜顺昌大捷。
UPDATE events SET month = 6, month_end = 6 WHERE dynasty_id = 'song' AND year = 1140 AND short = '顺昌大捷';
-- [high] 绍兴十年（1140）七月岳飞郾城破拐子马。
UPDATE events SET month = 7, month_end = 7 WHERE dynasty_id = 'song' AND year = 1140 AND short = '郾城大捷';
-- [low] 绍兴间市舶岁入鼎盛，制度性事件，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1150 AND short = '市舶鼎盛';
-- [low] 绍兴二十三年（1153）陆游锁厅试被黜，秋季试，取八月推断。
UPDATE events SET month = 8, month_end = 12 WHERE dynasty_id = 'song' AND year = 1153 AND short = '陆游除名';
-- [high] 绍兴三十一年（1161）十一月虞允文采石大捷。
UPDATE events SET month = 11, month_end = 11 WHERE dynasty_id = 'song' AND year = 1161 AND short = '采石之战';
-- [high] 隆兴元年（1163）五月宋军符离溃败。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'song' AND year = 1163 AND short = '符离之败';
-- [medium] 隆兴和议后（1165）复开盱眙诸榷场，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1165 AND short = '榷场重开';
-- [medium] 乾道六年（1170）范成大使金，约五月。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'song' AND year = 1170 AND short = '范成大使金';
-- [medium] 乾道八年（1172）陆游入王炎幕，从戎南郑，取一月。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'song' AND year = 1172 AND short = '南郑从军';
-- [low] 淳熙八年（1181）冬辛弃疾罢居带湖，seed 取1182，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1182 AND short = '带湖闲居';
-- [medium] 绍熙元年（1190）朱熹知漳州行经界，约九月。
UPDATE events SET month = 9, month_end = 12 WHERE dynasty_id = 'song' AND year = 1190 AND short = '漳州经界';
-- [high] 绍熙五年（1194）七月宁宗受禅即位。
UPDATE events SET month = 7, month_end = 7 WHERE dynasty_id = 'song' AND year = 1194 AND short = '绍熙内禅';
-- [high] 庆元元年（1195）二月韩侂胄逐赵汝愚，开伪学之禁。
UPDATE events SET month = 2, month_end = 12 WHERE dynasty_id = 'song' AND year = 1195 AND short = '庆元党禁';
-- [high] 开禧三年（1207）十一月史弥远矫诏诛韩侂胄。
UPDATE events SET month = 11, month_end = 12 WHERE dynasty_id = 'song' AND year = 1207 AND short = '史弥远专权';
-- [low] 嘉定三年（1210）两淮行铁钱会子，制度性事件，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1210 AND short = '铁钱会子';
-- [medium] 嘉定二年（1209）十二月陆游卒，公历为1210年1月；seed 取1210，月1。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'song' AND year = 1210 AND short = '放翁示儿';
-- [medium] 嘉定十年（1217）二月金军大举南侵，嘉定之战起。
UPDATE events SET month = 2, month_end = 12 WHERE dynasty_id = 'song' AND year = 1217 AND short = '嘉定之战';
-- [low] 嘉定十六年（1223）陈耆卿《赤城志》成书，取一月。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'song' AND year = 1223 AND short = '赤城志';
-- [medium] 端平三年（1236）九月孟珙江陵却敌。
UPDATE events SET month = 9, month_end = 9 WHERE dynasty_id = 'song' AND year = 1236 AND short = '江陵之战';
-- [low] 淳祐三年（1243）余玠开府重庆筑山城，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1243 AND short = '余玠守蜀';
-- [low] 淳祐七年（1247）宋慈《洗冤集录》成书，取一月。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'song' AND year = 1247 AND short = '洗冤集录';
-- [medium] 开庆元年（1259）十一月忽必烈允和北返，鄂州围解。
UPDATE events SET month = 11, month_end = 11 WHERE dynasty_id = 'song' AND year = 1259 AND short = '鄂州之战';
-- [low] 开庆元年（1259）寿春府造突火枪，具体月不详，取一月。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'song' AND year = 1259 AND short = '突火枪';
-- [high] 景定四年（1263）三月贾似道行公田法于浙西。
UPDATE events SET month = 3, month_end = 12 WHERE dynasty_id = 'song' AND year = 1263 AND short = '公田法';
-- [medium] 咸淳三年（1267）蒙古筑城围襄阳，襄樊之战起，取一月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'song' AND year = 1267 AND short = '襄樊之战';
-- [high] 德祐元年（1275）二月贾似道丁家洲大溃。
UPDATE events SET month = 2, month_end = 2 WHERE dynasty_id = 'song' AND year = 1275 AND short = '丁家洲之战';
-- [high] 德祐二年（1276）正月临安降元。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'song' AND year = 1276 AND short = '临安陷落';
-- [high] 景炎元年（1276）五月益王赵昰即位于福州。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'song' AND year = 1276 AND short = '益王即位';
-- [high] 辽天庆四年(1114)九月阿骨打率女真军首破宁江州，史有明文
UPDATE events SET month = 9, month_end = 9 WHERE dynasty_id = 'jin' AND year = 1114 AND short = '宁江州之战';
-- [high] 收国元年(1115)正月阿骨打称帝建国，国号金，改元收国
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'jin' AND year = 1115 AND short = '金朝建立';
-- [medium] 收国二年金军攻取东京辽阳府及辽东诸州，约在年初，月属推断
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'jin' AND year = 1116 AND short = '金取辽东';
-- [medium] 改元天辅通常于岁首；纪元对应(天辅元年实为1117)有出入，取年初并记约
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'jin' AND year = 1119 AND short = '收国改元';
-- [medium] 宋金渡海盟约达成于宣和二年(1120)；使节往来跨1118-1120，月属推断
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'jin' AND year = 1120 AND short = '海上之盟';
-- [medium] 宣和四年(1122)十二月金军攻克燕京(南京析津府)
UPDATE events SET month = 12, month_end = 12 WHERE dynasty_id = 'jin' AND year = 1122 AND short = '金克燕京';
-- [medium] 保大五年(1125)二月辽天祚帝于应州被俘，辽亡
UPDATE events SET month = 2, month_end = 2 WHERE dynasty_id = 'jin' AND year = 1125 AND short = '辽朝灭亡';
-- [medium] 宣和七年(1125)十月金以宋纳张觉为由两路南下攻宋
UPDATE events SET month = 10, month_end = 10 WHERE dynasty_id = 'jin' AND year = 1125 AND short = '第一次攻宋';
-- [medium] 靖康元年闰十一月金军破汴京；徽钦于次年(1127)二月被俘
UPDATE events SET month = 11, month_end = 11 WHERE dynasty_id = 'jin' AND year = 1126 AND short = '靖康之变';
-- [low] seed年份偏早：刘豫为齐帝实为金天会八年(1130)九月，月按史实取九月
UPDATE events SET month = 9, month_end = 9 WHERE dynasty_id = 'jin' AND year = 1127 AND short = '刘豫立齐';
-- [medium] 金军南侵(约1128-1129)突破淮河防线，跨年事件，月属推断
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'jin' AND year = 1128 AND short = '金军渡淮';
-- [medium] 建炎四年(1130)三月至四月韩世忠于黄天荡阻击金兀术
UPDATE events SET month = 4, month_end = 12 WHERE dynasty_id = 'jin' AND year = 1130 AND short = '兀术北撤';
-- [medium] 绍兴四年(1134)九月刘豫兵分多路南侵
UPDATE events SET month = 9, month_end = 9 WHERE dynasty_id = 'jin' AND year = 1134 AND short = '伪齐攻宋';
-- [medium] 金天会十五年(1137)十一月废黜刘豫、撤伪齐
UPDATE events SET month = 11, month_end = 11 WHERE dynasty_id = 'jin' AND year = 1137 AND short = '废刘豫';
-- [high] 绍兴十一年(1141)十一月宋金达成绍兴和议，淮水—大散关为界
UPDATE events SET month = 11, month_end = 11 WHERE dynasty_id = 'jin' AND year = 1141 AND short = '绍兴和议';
-- [medium] 贞元元年(1153)三月海陵王迁都燕京，改名中都
UPDATE events SET month = 3, month_end = 12 WHERE dynasty_id = 'jin' AND year = 1153 AND short = '海陵迁都';
-- [high] 绍兴三十一年(1161)十一月采石大捷，海陵王随后在军中被杀
UPDATE events SET month = 11, month_end = 11 WHERE dynasty_id = 'jin' AND year = 1161 AND short = '采石之战';
-- [medium] 大定元年(1161)十月世宗即位，开启大定之治(至1189)
UPDATE events SET month = 10, month_end = 10 WHERE dynasty_id = 'jin' AND year = 1161 AND short = '大定之治';
-- [medium] 大定十三年(1173)设女真进士科、推行女真文字教育，月份推断
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'jin' AND year = 1173 AND short = '女真文字教育';
-- [medium] 开禧二年(1206)春夏宋军发动北伐(嘉定战争)，月份约属推断
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'jin' AND year = 1206 AND short = '宋金再战';
-- [medium] 金大安三年(1211)秋成吉思汗攻金；中都在1215年陷落
UPDATE events SET month = 8, month_end = 8 WHERE dynasty_id = 'jin' AND year = 1211 AND short = '蒙古南侵';
-- [low] seed年份偏晚：金宣宗南迁开封实为贞祐二年(1214)五月，月按史实取五月
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'jin' AND year = 1217 AND short = '金迁汴守局';
-- [medium] 正大九年(1232)正月蒙古军于三峰山击溃金军主力
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'jin' AND year = 1232 AND short = '三峰山之战';
-- [medium] 天兴三年(1234)正月宋蒙联军破蔡州，金哀宗自缢，金亡
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'jin' AND year = 1234 AND short = '蔡州城破';
-- [high] 神册元年正月称帝建国，改元神册，史有明文。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'liao' AND year = 916 AND short = '阿保机称帝';
-- [low] 神册三年起营建皇都（后称上京临潢府），属营建起点，常年工程；月不详，按起点性事件取岁首。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'liao' AND year = 918 AND short = '建上京临潢府';
-- [high] 神册五年正月（920年1月25日）颁行契丹大字，史有明文。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'liao' AND year = 920 AND short = '创制契丹文字';
-- [medium] 天显元年正月亲征渤海，七月攻陷忽汗城、渤海王降，国亡。
UPDATE events SET month = 7, month_end = 7 WHERE dynasty_id = 'liao' AND year = 926 AND short = '灭渤海国';
-- [medium] 会同元年（938）石敬瑭正式将幽云十六州割让契丹，诸州逐一移交；月不详，取改元会同之十一月。
UPDATE events SET month = 11, month_end = 11 WHERE dynasty_id = 'liao' AND year = 938 AND short = '得燕云十六州';
-- [medium] 大同元年正月入汴，改国号大辽；改号具体在正月或二月略有歧异，取入汴首月。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'liao' AND year = 947 AND short = '改国号大辽';
-- [high] 宋军六月围幽州，七月高粱河之战大败，宋太宗中箭南逃。
UPDATE events SET month = 7, month_end = 7 WHERE dynasty_id = 'liao' AND year = 979 AND short = '高粱河之战';
-- [high] 雍熙三年五月庚午辽军于岐沟关大破宋东路军，宋军全线溃退。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'liao' AND year = 986 AND short = '雍熙北伐';
-- [high] 景德元年十二月（翌年一月）宋辽在澶州订立盟约，宋输岁币；seed 年份跨 1004–1005。
UPDATE events SET month = 12, month_end = 12 WHERE dynasty_id = 'liao' AND year = 1004 AND short = '澶渊之盟';
-- [medium] 澶渊之盟后于雄州、霸州等设榷场通商；月不详，取盟约缔结后年初。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'liao' AND year = 1005 AND short = '设榷场互市';
-- [medium] 重熙十一年（宋庆历二年，1042）辽兴宗遣使索关南十县，富弼使辽，宋增岁币；seed 年份取 1041–1042，月取春索地、秋罢兵增币。
UPDATE events SET month = 3, month_end = 7 WHERE dynasty_id = 'liao' AND year = 1041 AND short = '关南地之争';
-- [medium] 重熙十三年（1044）九月辽兴宗亲征西夏，十月败于贺兰山、河曲一带，不得已与西夏议和。
UPDATE events SET month = 10, month_end = 10 WHERE dynasty_id = 'liao' AND year = 1044 AND short = '贺兰山之败';
-- [high] 乾亨四年九月景宗崩，圣宗年幼，承天太后萧绰奉遗诏摄政；统和二十七年（1009）十二月太后薨、圣宗亲政。
UPDATE events SET month = 9, month_end = 12 WHERE dynasty_id = 'liao' AND year = 982 AND short = '萧太后摄政';
-- [medium] 乾统元年正月道宗崩，天祚帝耶律延禧即位。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'liao' AND year = 1101 AND short = '天祚帝即位';
-- [medium] 天庆四年九月完颜阿骨打攻取宁江州，女真首捷；十月出河店再胜。
UPDATE events SET month = 9, month_end = 9 WHERE dynasty_id = 'liao' AND year = 1114 AND short = '宁江州之败';
-- [medium] 天庆五年（1115）十一月护步答冈之战，辽军主力瓦解。
UPDATE events SET month = 11, month_end = 11 WHERE dynasty_id = 'liao' AND year = 1115 AND short = '护步答冈之败';
-- [medium] 天庆六年（1116）高永昌据东京叛辽，金军乘乱攻取东京辽阳府；月不详，取春三月。
UPDATE events SET month = 3, month_end = 3 WHERE dynasty_id = 'liao' AND year = 1116 AND short = '辽阳府失守';
-- [medium] 天辅四年（1120）五月金军攻破上京临潢府，辽统治中心陷落。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'liao' AND year = 1120 AND short = '金陷上京';
-- [medium] 保大二年（1122）三月耶律淳于燕京称帝（天锡帝），史称北辽。
UPDATE events SET month = 3, month_end = 3 WHERE dynasty_id = 'liao' AND year = 1122 AND short = '北辽建立';
-- [medium] 保大四年（1124）耶律大石自夹山出走，率契丹余部西迁，后建西辽；月不详，取夏秋。
UPDATE events SET month = 7, month_end = 7 WHERE dynasty_id = 'liao' AND year = 1124 AND short = '耶律大石西走';
-- [medium] 保大五年（1125）二月金军俘天祚帝于应州，辽亡；月或有正月之说，取二月。
UPDATE events SET month = 2, month_end = 2 WHERE dynasty_id = 'liao' AND year = 1125 AND short = '天祚帝被俘';
-- [high] 至元八年十一月十五日（1271年12月18日）忽必烈颁《建国号诏》，取「大哉乾元」定国号大元。
UPDATE events SET month = 11, month_end = 11 WHERE dynasty_id = 'yuan' AND year = 1271 AND short = '定国号大元';
-- [high] 至元九年（1272）三月（1272年3月28日）改中都为大都并定为国都。
UPDATE events SET month = 3, month_end = 3 WHERE dynasty_id = 'yuan' AND year = 1272 AND short = '改中都为大都';
-- [medium] 至元十年正月破樊城、二月（1273）吕文焕举襄阳降，元军陷襄阳（略破城于二月）。
UPDATE events SET month = 2, month_end = 2 WHERE dynasty_id = 'yuan' AND year = 1273 AND short = '元军陷襄阳';
-- [medium] 至元十二年（1275）二月贾似道率军与伯颜战于丁家洲，宋军溃败。
UPDATE events SET month = 2, month_end = 2 WHERE dynasty_id = 'yuan' AND year = 1275 AND short = '丁家洲之战';
-- [medium] 约至元十二年（1275）抵大都供职，月份史无明文，推断约在岁中；供职至1292年离华。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'yuan' AND year = 1275 AND short = '马可·波罗居元';
-- [medium] 至元十三年正月（1276年2月）元军入临安、恭帝与谢太后奉表出降（2月4日为正月十八）。
UPDATE events SET month = 2, month_end = 2 WHERE dynasty_id = 'yuan' AND year = 1276 AND short = '临安城破';
-- [high] 至元十六年（1279年3月19日）崖山决战，陆秀夫负帝昺投海，南宋亡。
UPDATE events SET month = 3, month_end = 3 WHERE dynasty_id = 'yuan' AND year = 1279 AND short = '崖山海战';
-- [medium] 至元十八年（1281）夏两路元军会攻日本，闰七月遭台风（神风）船毁师覆，月份约在夏季。
UPDATE events SET month = 6, month_end = 6 WHERE dynasty_id = 'yuan' AND year = 1281 AND short = '二征日本';
-- [high] 至元十九年十二月（1283年1月）文天祥于大都柴市就义（12月9日）。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'yuan' AND year = 1283 AND short = '文天祥就义';
-- [medium] 至元二十六年（1289）会通河竣工通航，月份史无明文，约在岁中。
UPDATE events SET month = 6, month_end = 6 WHERE dynasty_id = 'yuan' AND year = 1289 AND short = '会通河竣工';
-- [medium] 至元二十九年（1292）秋郭守敬主持开工；至元三十年（1293）秋竣工，漕船直达积水潭（monthEnd取次年秋）。
UPDATE events SET month = 8, month_end = 9 WHERE dynasty_id = 'yuan' AND year = 1292 AND short = '开凿通惠河';
-- [high] 至元三十一年正月（1294年2月18日）忽必烈于大都病逝，皇孙铁穆耳即位为成宗。
UPDATE events SET month = 2, month_end = 2 WHERE dynasty_id = 'yuan' AND year = 1294 AND short = '忽必烈崩';
-- [high] 皇庆二年（1313）十一月十八日仁宗下诏恢复科举，首科延祐二年举行。
UPDATE events SET month = 11, month_end = 11 WHERE dynasty_id = 'yuan' AND year = 1313 AND short = '延祐复科';
-- [high] 至正三年（1343）三月顺帝命修辽金宋三史；至正五年（1345）修成（monthEnd取成书之年冬）。
UPDATE events SET month = 3, month_end = 11 WHERE dynasty_id = 'yuan' AND year = 1343 AND short = '诏修三史';
-- [high] 至正四年（1344）五月黄河于曹州白茅堤决口，泛滥数路。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'yuan' AND year = 1344 AND short = '黄河决白茅堤';
-- [high] 至正十一年（1351）五月韩山童、刘福通以红巾为号于颍州起兵。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'yuan' AND year = 1351 AND short = '红巾军起义';
-- [medium] 至正十五年（1355）二月刘福通迎韩林儿称帝，号小明王，国号宋，都亳州。
UPDATE events SET month = 2, month_end = 2 WHERE dynasty_id = 'yuan' AND year = 1355 AND short = '小明王称帝';
-- [high] 至正十六年（1356）三月朱元璋克集庆路，改名应天府。
UPDATE events SET month = 3, month_end = 3 WHERE dynasty_id = 'yuan' AND year = 1356 AND short = '朱元璋克集庆';
-- [high] 至正二十三年（1363）八月朱元璋与陈友谅鄱阳湖决战，火攻破陈，友谅中箭亡。
UPDATE events SET month = 8, month_end = 8 WHERE dynasty_id = 'yuan' AND year = 1363 AND short = '鄱阳湖大战';
-- [medium] 洪武元年闰七月元顺帝北走上都，八月初二（1368年9月）明军入大都，元朝亡。
UPDATE events SET month = 8, month_end = 8 WHERE dynasty_id = 'yuan' AND year = 1368 AND short = '徐达克大都';
-- [high] 武德元年（618年）五月甲子，李渊长安称帝，国号唐，都长安。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'tang' AND year = 618 AND short = '李渊建唐';
-- [high] 武德四年（621年）五月，李世民虎牢关大破窦建德，一战擒两王。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'tang' AND year = 621 AND short = '虎牢关之战';
-- [high] 武德九年（626年）六月庚申，李世民玄武门伏杀李建成、李元吉。
UPDATE events SET month = 6, month_end = 6 WHERE dynasty_id = 'tang' AND year = 626 AND short = '玄武门之变';
-- [medium] 贞观元年（627年）正月改元，治世约止于贞观二十三年（649年）五月太宗崩。
UPDATE events SET month = 1, month_end = 5 WHERE dynasty_id = 'tang' AND year = 627 AND short = '贞观之治';
-- [medium] 贞观三年（629年）秋八月玄奘西行；贞观十九年（645年）正月归长安（出发年月学者有争议，约）。
UPDATE events SET month = 8, month_end = 8 WHERE dynasty_id = 'tang' AND year = 629 AND short = '玄奘西行';
-- [high] 贞观四年（630年）正月李靖夜袭定襄，二月颉利可汗被俘，东突厥亡。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'tang' AND year = 630 AND short = '灭东突厥';
-- [high] 贞观十四年（640年）唐灭高昌，九月置安西都护府于交河城。
UPDATE events SET month = 9, month_end = 9 WHERE dynasty_id = 'tang' AND year = 640 AND short = '置安西都护府';
-- [high] 贞观十五年（641年）正月，文成公主远嫁吐蕃松赞干布。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'tang' AND year = 641 AND short = '文成公主入藏';
-- [high] 贞观二十三年（649年）五月己巳，唐太宗病逝于含风殿。
UPDATE events SET month = 5, month_end = 5 WHERE dynasty_id = 'tang' AND year = 649 AND short = '太宗崩';
-- [medium] 显庆二年（657年）闰正月苏定方出师，十二月沙钵罗可汗被擒，西突厥亡。
UPDATE events SET month = 12, month_end = 12 WHERE dynasty_id = 'tang' AND year = 657 AND short = '灭西突厥';
-- [high] 龙朔三年（663年）八月，刘仁轨白江口大破倭国与百济联军。
UPDATE events SET month = 8, month_end = 8 WHERE dynasty_id = 'tang' AND year = 663 AND short = '白江口之战';
-- [high] 天授元年（690年）九月，武则天称帝，改唐为周。
UPDATE events SET month = 9, month_end = 9 WHERE dynasty_id = 'tang' AND year = 690 AND short = '武周代唐';
-- [high] 神龙元年（705年）正月，张柬之等逼武则天退位，迎中宗复唐。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'tang' AND year = 705 AND short = '神龙政变';
-- [medium] 开元元年（713年）正月改元开元，盛世约止于开元二十九年（741年）十二月。
UPDATE events SET month = 1, month_end = 12 WHERE dynasty_id = 'tang' AND year = 713 AND short = '开元盛世';
-- [medium] 天宝十载（751年）七月，高仙芝与黑衣大食战于怛罗斯，唐军败绩。
UPDATE events SET month = 7, month_end = 7 WHERE dynasty_id = 'tang' AND year = 751 AND short = '怛罗斯之战';
-- [high] 天宝十四载（755年）十一月安禄山范阳起兵；广德元年（763年）正月史朝义自缢，乱平。
UPDATE events SET month = 11, month_end = 11 WHERE dynasty_id = 'tang' AND year = 755 AND short = '安史之乱';
-- [high] 天宝十五载（756年）六月，马嵬驿禁军哗变，杨贵妃被缢死。
UPDATE events SET month = 6, month_end = 6 WHERE dynasty_id = 'tang' AND year = 756 AND short = '马嵬驿兵变';
-- [high] 广德元年（763年）正月，史朝义穷蹙自缢，安史之乱告平。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'tang' AND year = 763 AND short = '乱平藩镇兴';
-- [high] 建中元年（780年）正月，杨炎奏行两税法。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'tang' AND year = 780 AND short = '两税法';
-- [low] 飞钱（便换）兴起于宪宗元和年间（约810年，推断），记载无确切月份，按制度起于点取年初。
UPDATE events SET month = 1, month_end = 1 WHERE dynasty_id = 'tang' AND year = 810 AND short = '飞钱问世';
-- [high] 咸通九年（868年）四月十五日，王玠刻印《金刚经》，卷末题记明载。
UPDATE events SET month = 4, month_end = 4 WHERE dynasty_id = 'tang' AND year = 868 AND short = '金刚经雕版';
-- [medium] 乾符二年（875年）六月王仙芝长垣首义，七月黄巢冤句响应；取首义月（约）。
UPDATE events SET month = 6, month_end = 6 WHERE dynasty_id = 'tang' AND year = 875 AND short = '黄巢起义';
-- [high] 广明元年（880年）十二月，黄巢破长安称帝，国号大齐。
UPDATE events SET month = 12, month_end = 12 WHERE dynasty_id = 'tang' AND year = 880 AND short = '黄巢克长安';
-- [high] 中和四年（884年）六月，黄巢在狼虎谷为外甥林言所杀。
UPDATE events SET month = 6, month_end = 6 WHERE dynasty_id = 'tang' AND year = 884 AND short = '黄巢败亡';
-- [high] 天祐四年（907年）四月，朱温废唐哀帝称帝，后梁建，唐亡。
UPDATE events SET month = 4, month_end = 4 WHERE dynasty_id = 'tang' AND year = 907 AND short = '朱温篡唐';

-- 共 199 条事件
