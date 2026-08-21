-- 宋朝人物 seed（P1 人物视角）：persons 表 + event_person 关联
-- 人物身份 (dynasty_id, name)；事件关联按事件身份 (dynasty_id, year, short) SELECT 定位，
-- 全部 upsert 幂等，重复启动无副作用。生卒年仅录史实确凿者，不详置 NULL。

INSERT INTO persons (dynasty_id, name, title, birth_year, death_year, note) VALUES
  ('song', '赵匡胤', '宋太祖 · 开国皇帝', 927, 976, '涿郡人，后周殿前都点检。陈桥兵变代周建宋，杯酒释兵权根除藩镇之祸，定重文轻武之制，奠定三百年基业。'),
  ('song', '赵光义', '宋太宗 · 完成统一', 939, 997, '太祖之弟。灭北汉结束五代十国分裂，两度伐辽皆败，转而确立守内虚外国策，扩大科举取士。'),
  ('song', '赵恒', '宋真宗 · 澶渊定盟', 968, 1022, '太宗之子。寇准力劝下亲征澶州，与辽订澶渊之盟换得百年和平，晚年热衷天书封禅，耗费国帑。'),
  ('song', '刘娥', '章献皇后 · 临朝称制', 969, 1033, '真宗皇后。真宗晚年多病渐预朝政，仁宗幼年临朝称制十一年，号令严明，史称有吕武之才而无吕武之恶。'),
  ('song', '寇准', '北宋名相 · 澶渊定策', 961, 1023, '华州人。澶州之战力主真宗亲征，奠定澶渊之盟大局，晚年被贬雷州。刚直足智，为北宋名相第一人。'),
  ('song', '赵祯', '宋仁宗 · 仁政盛治', 1010, 1063, '在位四十二年，恭俭仁恕。庆历年间用范仲淹行新政，嘉祐年间人才鼎盛，庙号曰仁，为帝王谥之极美。'),
  ('song', '范仲淹', '先忧后乐 · 名臣风范', 989, 1052, '苏州人。戍边御夏有范韩之名，主持庆历新政开北宋改革先声，岳阳楼记先忧后乐为士大夫精神典范。'),
  ('song', '赵顼', '宋神宗 · 锐意变法', 1048, 1085, '英宗之子。少年即位慨然兴革，任王安石行熙宁变法，支持王韶拓熙河、五路伐夏，壮志未竟而崩。'),
  ('song', '王安石', '荆国公 · 熙宁变法主持', 1021, 1086, '临川人。两度拜相主持熙宁变法，青苗募役方田诸法意在富国强兵，新旧党争由此绵延五十年。'),
  ('song', '司马光', '温国公 · 资治通鉴主编', 1019, 1086, '涑水先生。历十九年主编编年通史资治通鉴，反对新法退居洛阳著书，元祐更化尽废新法。'),
  ('song', '苏轼', '东坡居士 · 千古文豪', 1037, 1101, '眉山人。嘉祐二年进士，乌台诗案几死贬黄州，诗词文书画皆冠绝一代，知杭州疏浚西湖筑苏堤。'),
  ('song', '苏辙', '颍滨遗老 · 唐宋八大家', 1039, 1112, '苏轼之弟，嘉祐二年同榜进士。乌台诗案上书营救兄长，文章汪洋澹泊，与父兄并称三苏。'),
  ('song', '欧阳修', '文坛宗师 · 一代文宗', 1007, 1072, '庐陵人。嘉祐二年知贡举拔擢苏轼苏辙，主编新唐书，诗文革新领袖，庆历新政参与者。'),
  ('song', '张择端', '翰林图画院 · 清明上河图作者', NULL, NULL, '东武人，供职徽宗画院。所绘清明上河图写汴京汴河两岸市井繁华，为北宋城市生活第一手图像史料。'),
  ('song', '赵佶', '宋徽宗 · 艺极政昏', 1082, 1135, '书画造诣冠绝古今，创瘦金体，然宠信六贼，崇宁绍述耗竭民力，终致靖康之变北掳五国城。'),
  ('song', '蔡京', '六贼之首 · 四度拜相', 1047, 1126, '兴化军人。崇宁年间四度拜相，绍述新法实则聚敛，花石纲激化矛盾，方腊起义由此而生，贬死潭州。'),
  ('song', '童贯', '六贼 · 太监掌兵', 1054, 1126, '以宦官掌枢密二十年，主持海上之盟与北伐，镇压方腊，接收燕京，靖康之变后被诛。'),
  ('song', '李纲', '东京保卫战统帅', 1083, 1140, '靖康元年临危受命守汴京却敌，南宋初年任相整军经武，旋遭罢斥，壮志难酬。'),
  ('song', '宗泽', '东京留守 · 三呼过河', 1060, 1128, '义军出身，南宋首任东京留守，连上二十四疏请高宗还都北伐，忧愤成疾，临终三呼过河而卒。'),
  ('song', '赵构', '宋高宗 · 南渡建炎', 1107, 1187, '徽宗第九子。靖康之变后即位应天府，定都临安建立南宋，苗刘兵变一度退位，晚年与金议和杀岳飞。'),
  ('song', '岳飞', '抗金名将 · 精忠报国', 1103, 1142, '相州人。收复襄汉六郡，郾城大捷兵锋直指汴京，十二道金牌召还，以莫须有冤死风波亭。'),
  ('song', '韩世忠', '黄天荡鏖战金军', 1090, 1151, '延安人。黄天荡以八千围金军十万四十八日，夫人梁氏亲执桴鼓，晚年杜门谢客自号清凉居士。'),
  ('song', '吴玠', '和尚原却金 · 保蜀名将', 1093, 1139, '德顺军人。和尚原之战以强弩破金军完颜宗弼，绍兴和议前镇守川陕十余年，金军不得入蜀。'),
  ('song', '刘锜', '顺昌大捷统帅', 1098, 1162, '德顺军人。顺昌之战以不满两万破金军十万，大破完颜宗弼铁浮屠，中兴战功第一。'),
  ('song', '张浚', '主战派领袖', 1097, 1164, '绵竹人。高孝两朝主战领袖，淮西军变符离之败皆在其手，屡败屡战志不改，卒谥忠献。'),
  ('song', '秦桧', '主和权相', 1090, 1155, '江宁人。二次为相凡十九年，绍兴和议主持者，以莫须有害岳飞，主和误国，遗臭千年。'),
  ('song', '虞允文', '采石书生却敌', 1110, 1174, '隆州人。采石之战以稿军参谋身代主帅，大破完颜亮六十万之众，一介书生退敌，名垂青史。'),
  ('song', '赵昚', '宋孝宗 · 乾淳之治', 1127, 1194, '太祖七世孙。为岳飞平反，用张浚发动隆兴北伐，内政励精图治，史称乾淳之治，南宋治世第一。'),
  ('song', '朱熹', '理学集大成者', 1130, 1200, '徽州婺源人。白鹿洞书院讲学订立学规，集理学之大成，晚年遭庆元党禁，身后理学成为元明清官学。'),
  ('song', '陆游', '放翁 · 位卑未敢忘忧国', 1125, 1210, '山阴人。一生主战，南郑从军为诗风转折，临终示儿王师北定中原日，存诗九千余首为宋人之冠。'),
  ('song', '范成大', '石湖居士 · 使金纪行', 1126, 1193, '吴县人。乾道六年出使金国争陵寝地节钺礼，不辱使命，揽辔录记中原遗民之痛，田园诗独步南宋。'),
  ('song', '辛弃疾', '稼轩 · 词中之龙', 1140, 1207, '济南人。二十一岁聚众抗金南归，带湖闲居近二十年，开禧北伐前夕忧愤而卒，词风雄浑为豪放大家。'),
  ('song', '李清照', '易安居士 · 婉约词宗', 1084, 1155, '济南人。靖康之变后南渡，晚年寓临安金石录后序叙丧乱流离，词擅当行本色，为婉约派宗主。'),
  ('song', '韩侂胄', '权相 · 开禧北伐主持', 1152, 1207, '相州人。以外戚专政，兴庆元党禁禁伪学，开禧北伐惨败后被史弥远函首送金。'),
  ('song', '史弥远', '权相 · 嘉定和议', 1164, 1233, '鄞县人。诛韩侂胄夺权，函首安金行嘉定和议，专政二十六年，名士遭摈斥。'),
  ('song', '孟珙', '京湖防线统帅', 1195, 1246, '枣阳人。联蒙灭金一雪靖康之耻，江陵之战阻蒙古南下，构建京湖防线，宋末柱石之将。'),
  ('song', '余玠', '四川山城防御体系', NULL, 1253, '蕲州人。主持四川防务，筑钓鱼城等山城体系，蒙古铁骑不得越雷池，后遭猜忌仰药而卒。'),
  ('song', '贾似道', '权相 · 公田法', 1213, 1275, '台州人。鄂州之战后弄权，行公田法病民，丁家洲之战丧师误国，贬徙途中被杀。'),
  ('song', '文天祥', '正气照汗青', 1236, 1283, '吉州人。散尽家财起兵勤王，出使被扣逃归再举，兵败被囚四年不降，留取丹心照汗青。'),
  ('song', '张世杰', '宋末三杰 · 海上行朝', NULL, 1279, '范阳人。益王即位福州后统军转战闽粤，崖山兵败飓风覆舟，海上行朝最后的统帅。'),
  ('song', '陆秀夫', '负帝蹈海 · 宋末三杰', 1236, 1279, '楚州人。益王即位后签书枢密院事，崖山兵败负幼主昺投海，君臣殉国，从死者十余万。'),
  ('song', '毕昇', '活字印刷发明者', NULL, 1051, '杭州人。庆历年间发明胶泥活字，开活字印刷之先河，沈括梦溪笔谈详记其法。'),
  ('song', '沈括', '梦溪笔谈作者', 1031, 1095, '杭州人。博学通天文律历方志医药，元丰伐夏参议军务，晚年居润州梦溪园著书二十六卷。'),
  ('song', '苏颂', '水运仪象台主持', 1020, 1101, '泉州同安人。元祐年间主持造水运仪象台，集天文机械之大成，被誉为钟表之祖。'),
  ('song', '周敦颐', '濂溪先生 · 理学开山', 1017, 1073, '道州人。晚年庐山莲花峰下濂溪讲学，太极图说通书开理学之先河，二程曾从其学。'),
  ('song', '张载', '横渠先生 · 民胞物与', 1020, 1077, '凤翔郿县人。横渠镇讲学关中，为关学宗师，横渠四句为天地立心为生民立命为往圣继绝学为万世开太平。'),
  ('song', '程颢', '明道先生 · 洛学宗师', 1032, 1085, '洛阳人。与弟颐并称二程，创洛学，天理论开启程朱理学体系。'),
  ('song', '程颐', '伊川先生 · 洛学宗师', 1033, 1107, '程颢之弟。讲学伊川，格物致知之说下开朱子，绍圣年间坐元祐党被贬。'),
  ('song', '宋慈', '世界法医学鼻祖', 1186, 1249, '建阳人。四任提点刑狱，淳祐七年著洗冤集录，为世界现存第一部系统法医学专著。'),
  ('song', '陈规', '守城专家 · 管形火器先驱', 1072, 1141, '密州人。绍兴二年守德安，以火炮药制成竹竿火枪，为世界最早的管形火器记载。'),
  ('song', '王韶', '熙河开边统帅', 1030, 1081, '江州德安人。熙宁年间上平戎策，拓地熙河两千余里，为北宋对外用兵最大胜利。'),
  ('song', '钱俶', '吴越国王 · 纳土归宋', 929, 988, '杭州人。审时度势纳两浙十三州归宋，兵不血刃完成统一，钱氏子孙与宋偕亡百科全书式家族。'),
  ('song', '王小波', '茶农起义领袖', NULL, 993, '青城味江人。以均贫富为号召聚茶农起义，下青城彭山，战死于江原，余部由李顺继之。'),
  ('song', '钟相', '洞庭湖起义首领', NULL, 1130, '鼎州人。建炎四年起事，号法天行道均贫富，被俘遇害，余部杨幺继领其众。'),
  ('song', '杨幺', '洞庭湖起义领袖', NULL, 1135, '龙阳人。继钟相领洞庭湖义军，水耕陆战机轮船只，绍兴五年为岳飞所破。'),
  ('song', '方腊', '睦州起义领袖', NULL, 1121, '睦州青溪人。以花石纲之扰起事，旬月间连陷六州五十二县，宣和三年兵败被俘。'),
  ('song', '李元昊', '西夏开国皇帝', 1003, 1048, '党项族。1038 年称帝建大夏，三川口好水川定川寨三败宋军，宋夏以庆历和议收场。'),
  ('song', '完颜阿骨打', '金太祖 · 女真崛起', 1068, 1123, '女真完颜部首领。1115 年建金，十年间灭辽，与宋海上之盟约共伐辽，为金之开国雄主。'),
  ('song', '蒙哥', '大汗 · 折鞭钓鱼城', 1209, 1259, '蒙古第四任大汗。亲征南宋围钓鱼城五月不克，死于军中，西征因此中止，世界史为之改变。'),
  ('song', '忽必烈', '元世祖 · 大元开国', 1215, 1294, '蒙哥之弟。鄂州之战后北归夺位，1271 年取大哉乾元建号大元，灭宋统一全国，定都大都。')
ON CONFLICT(dynasty_id, name) DO UPDATE SET
  title = excluded.title,
  birth_year = excluded.birth_year,
  death_year = excluded.death_year,
  note = excluded.note
;

-- 事件 ↔ 人物关联（role = lead 主导 / involved 牵连）
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵匡胤'
WHERE e.dynasty_id = 'song' AND e.year = 960 AND e.short = '陈桥兵变'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵匡胤'
WHERE e.dynasty_id = 'song' AND e.year = 963 AND e.short = '杯酒释兵权'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵匡胤'
WHERE e.dynasty_id = 'song' AND e.year = 978 AND e.short = '吴越纳土'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵光义'
WHERE e.dynasty_id = 'song' AND e.year = 979 AND e.short = '北汉灭亡'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵光义'
WHERE e.dynasty_id = 'song' AND e.year = 979 AND e.short = '高梁河之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵光义'
WHERE e.dynasty_id = 'song' AND e.year = 986 AND e.short = '雍熙北伐'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵光义'
WHERE e.dynasty_id = 'song' AND e.year = 997 AND e.short = '真宗即位'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '钱俶'
WHERE e.dynasty_id = 'song' AND e.year = 978 AND e.short = '吴越纳土'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '王小波'
WHERE e.dynasty_id = 'song' AND e.year = 993 AND e.short = '王小波起义'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵恒'
WHERE e.dynasty_id = 'song' AND e.year = 997 AND e.short = '真宗即位'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵恒'
WHERE e.dynasty_id = 'song' AND e.year = 1004 AND e.short = '澶州之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵恒'
WHERE e.dynasty_id = 'song' AND e.year = 1005 AND e.short = '澶渊之盟'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵恒'
WHERE e.dynasty_id = 'song' AND e.year = 1008 AND e.short = '天书封禅'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '寇准'
WHERE e.dynasty_id = 'song' AND e.year = 1004 AND e.short = '澶州之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '寇准'
WHERE e.dynasty_id = 'song' AND e.year = 1005 AND e.short = '澶渊之盟'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '寇准'
WHERE e.dynasty_id = 'song' AND e.year = 1023 AND e.short = '刘太后临朝'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '刘娥'
WHERE e.dynasty_id = 'song' AND e.year = 1023 AND e.short = '刘太后临朝'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '刘娥'
WHERE e.dynasty_id = 'song' AND e.year = 1033 AND e.short = '仁宗亲政'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵祯'
WHERE e.dynasty_id = 'song' AND e.year = 1033 AND e.short = '仁宗亲政'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵祯'
WHERE e.dynasty_id = 'song' AND e.year = 1043 AND e.short = '庆历新政'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵祯'
WHERE e.dynasty_id = 'song' AND e.year = 1057 AND e.short = '嘉祐二年榜'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '李元昊'
WHERE e.dynasty_id = 'song' AND e.year = 1038 AND e.short = '西夏建立'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '李元昊'
WHERE e.dynasty_id = 'song' AND e.year = 1040 AND e.short = '三川口之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '李元昊'
WHERE e.dynasty_id = 'song' AND e.year = 1041 AND e.short = '好水川之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '李元昊'
WHERE e.dynasty_id = 'song' AND e.year = 1042 AND e.short = '定川寨之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '范仲淹'
WHERE e.dynasty_id = 'song' AND e.year = 1040 AND e.short = '范仲淹戍边'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '范仲淹'
WHERE e.dynasty_id = 'song' AND e.year = 1041 AND e.short = '好水川之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '范仲淹'
WHERE e.dynasty_id = 'song' AND e.year = 1043 AND e.short = '庆历新政'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '欧阳修'
WHERE e.dynasty_id = 'song' AND e.year = 1043 AND e.short = '庆历新政'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '欧阳修'
WHERE e.dynasty_id = 'song' AND e.year = 1057 AND e.short = '嘉祐二年榜'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '欧阳修'
WHERE e.dynasty_id = 'song' AND e.year = 1060 AND e.short = '新唐书成书'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '毕昇'
WHERE e.dynasty_id = 'song' AND e.year = 1045 AND e.short = '毕昇活字'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '沈括'
WHERE e.dynasty_id = 'song' AND e.year = 1045 AND e.short = '毕昇活字'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵顼'
WHERE e.dynasty_id = 'song' AND e.year = 1067 AND e.short = '神宗即位'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵顼'
WHERE e.dynasty_id = 'song' AND e.year = 1069 AND e.short = '熙宁变法'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵顼'
WHERE e.dynasty_id = 'song' AND e.year = 1081 AND e.short = '五路伐夏'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵顼'
WHERE e.dynasty_id = 'song' AND e.year = 1082 AND e.short = '永乐城之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '王安石'
WHERE e.dynasty_id = 'song' AND e.year = 1069 AND e.short = '熙宁变法'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '王安石'
WHERE e.dynasty_id = 'song' AND e.year = 1072 AND e.short = '市易法'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '司马光'
WHERE e.dynasty_id = 'song' AND e.year = 1069 AND e.short = '熙宁变法'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '司马光'
WHERE e.dynasty_id = 'song' AND e.year = 1084 AND e.short = '资治通鉴成书'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '司马光'
WHERE e.dynasty_id = 'song' AND e.year = 1085 AND e.short = '元祐更化'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '周敦颐'
WHERE e.dynasty_id = 'song' AND e.year = 1071 AND e.short = '濂溪讲学'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '张载'
WHERE e.dynasty_id = 'song' AND e.year = 1070 AND e.short = '张载讲学'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '王韶'
WHERE e.dynasty_id = 'song' AND e.year = 1072 AND e.short = '熙河开边'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '程颢'
WHERE e.dynasty_id = 'song' AND e.year = 1080 AND e.short = '洛学兴起'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '程颐'
WHERE e.dynasty_id = 'song' AND e.year = 1080 AND e.short = '洛学兴起'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '程颐'
WHERE e.dynasty_id = 'song' AND e.year = 1094 AND e.short = '绍圣绍述'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '沈括'
WHERE e.dynasty_id = 'song' AND e.year = 1081 AND e.short = '五路伐夏'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '沈括'
WHERE e.dynasty_id = 'song' AND e.year = 1088 AND e.short = '梦溪笔谈'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '苏轼'
WHERE e.dynasty_id = 'song' AND e.year = 1079 AND e.short = '乌台诗案'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '苏轼'
WHERE e.dynasty_id = 'song' AND e.year = 1057 AND e.short = '嘉祐二年榜'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '苏轼'
WHERE e.dynasty_id = 'song' AND e.year = 1090 AND e.short = '疏浚西湖'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '苏辙'
WHERE e.dynasty_id = 'song' AND e.year = 1057 AND e.short = '嘉祐二年榜'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '苏辙'
WHERE e.dynasty_id = 'song' AND e.year = 1079 AND e.short = '乌台诗案'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '苏颂'
WHERE e.dynasty_id = 'song' AND e.year = 1092 AND e.short = '水运仪象台'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵佶'
WHERE e.dynasty_id = 'song' AND e.year = 1100 AND e.short = '徽宗即位'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵佶'
WHERE e.dynasty_id = 'song' AND e.year = 1120 AND e.short = '海上之盟'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵佶'
WHERE e.dynasty_id = 'song' AND e.year = 1123 AND e.short = '燕云交割'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵佶'
WHERE e.dynasty_id = 'song' AND e.year = 1127 AND e.short = '靖康之变'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '蔡京'
WHERE e.dynasty_id = 'song' AND e.year = 1102 AND e.short = '崇宁新政'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '蔡京'
WHERE e.dynasty_id = 'song' AND e.year = 1120 AND e.short = '方腊起义'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '童贯'
WHERE e.dynasty_id = 'song' AND e.year = 1120 AND e.short = '海上之盟'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '童贯'
WHERE e.dynasty_id = 'song' AND e.year = 1123 AND e.short = '燕云交割'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '童贯'
WHERE e.dynasty_id = 'song' AND e.year = 1120 AND e.short = '方腊起义'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '方腊'
WHERE e.dynasty_id = 'song' AND e.year = 1120 AND e.short = '方腊起义'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '张择端'
WHERE e.dynasty_id = 'song' AND e.year = 1122 AND e.short = '清明上河图'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '完颜阿骨打'
WHERE e.dynasty_id = 'song' AND e.year = 1115 AND e.short = '金朝建立'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '完颜阿骨打'
WHERE e.dynasty_id = 'song' AND e.year = 1120 AND e.short = '海上之盟'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '完颜阿骨打'
WHERE e.dynasty_id = 'song' AND e.year = 1125 AND e.short = '金灭辽'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '李纲'
WHERE e.dynasty_id = 'song' AND e.year = 1126 AND e.short = '东京保卫战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '宗泽'
WHERE e.dynasty_id = 'song' AND e.year = 1126 AND e.short = '东京保卫战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵构'
WHERE e.dynasty_id = 'song' AND e.year = 1127 AND e.short = '南宋建立'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵构'
WHERE e.dynasty_id = 'song' AND e.year = 1129 AND e.short = '搜山检海'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵构'
WHERE e.dynasty_id = 'song' AND e.year = 1129 AND e.short = '苗刘兵变'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵构'
WHERE e.dynasty_id = 'song' AND e.year = 1141 AND e.short = '绍兴和议'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '李清照'
WHERE e.dynasty_id = 'song' AND e.year = 1127 AND e.short = '靖康之变'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '李清照'
WHERE e.dynasty_id = 'song' AND e.year = 1132 AND e.short = '李清照南渡'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '韩世忠'
WHERE e.dynasty_id = 'song' AND e.year = 1130 AND e.short = '黄天荡之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '韩世忠'
WHERE e.dynasty_id = 'song' AND e.year = 1129 AND e.short = '搜山检海'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '钟相'
WHERE e.dynasty_id = 'song' AND e.year = 1130 AND e.short = '钟相杨幺起义'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '杨幺'
WHERE e.dynasty_id = 'song' AND e.year = 1130 AND e.short = '钟相杨幺起义'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '吴玠'
WHERE e.dynasty_id = 'song' AND e.year = 1131 AND e.short = '和尚原之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '陈规'
WHERE e.dynasty_id = 'song' AND e.year = 1132 AND e.short = '陈规火枪'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '岳飞'
WHERE e.dynasty_id = 'song' AND e.year = 1134 AND e.short = '收复襄汉'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '岳飞'
WHERE e.dynasty_id = 'song' AND e.year = 1136 AND e.short = '岳飞北伐'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '岳飞'
WHERE e.dynasty_id = 'song' AND e.year = 1140 AND e.short = '郾城大捷'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '岳飞'
WHERE e.dynasty_id = 'song' AND e.year = 1141 AND e.short = '绍兴和议'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '岳飞'
WHERE e.dynasty_id = 'song' AND e.year = 1130 AND e.short = '钟相杨幺起义'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '刘锜'
WHERE e.dynasty_id = 'song' AND e.year = 1140 AND e.short = '顺昌大捷'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '张浚'
WHERE e.dynasty_id = 'song' AND e.year = 1137 AND e.short = '淮西军变'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '秦桧'
WHERE e.dynasty_id = 'song' AND e.year = 1138 AND e.short = '秦桧独相'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '秦桧'
WHERE e.dynasty_id = 'song' AND e.year = 1141 AND e.short = '绍兴和议'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵昚'
WHERE e.dynasty_id = 'song' AND e.year = 1162 AND e.short = '孝宗即位'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵昚'
WHERE e.dynasty_id = 'song' AND e.year = 1163 AND e.short = '符离之败'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵昚'
WHERE e.dynasty_id = 'song' AND e.year = 1165 AND e.short = '榷场重开'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '虞允文'
WHERE e.dynasty_id = 'song' AND e.year = 1161 AND e.short = '采石之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '张浚'
WHERE e.dynasty_id = 'song' AND e.year = 1163 AND e.short = '符离之败'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '范成大'
WHERE e.dynasty_id = 'song' AND e.year = 1170 AND e.short = '范成大使金'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '陆游'
WHERE e.dynasty_id = 'song' AND e.year = 1153 AND e.short = '陆游除名'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '陆游'
WHERE e.dynasty_id = 'song' AND e.year = 1172 AND e.short = '南郑从军'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '陆游'
WHERE e.dynasty_id = 'song' AND e.year = 1210 AND e.short = '放翁示儿'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '朱熹'
WHERE e.dynasty_id = 'song' AND e.year = 1175 AND e.short = '朱熹讲学'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '朱熹'
WHERE e.dynasty_id = 'song' AND e.year = 1190 AND e.short = '漳州经界'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '朱熹'
WHERE e.dynasty_id = 'song' AND e.year = 1195 AND e.short = '庆元党禁'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '辛弃疾'
WHERE e.dynasty_id = 'song' AND e.year = 1182 AND e.short = '带湖闲居'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '辛弃疾'
WHERE e.dynasty_id = 'song' AND e.year = 1206 AND e.short = '开禧北伐'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '韩侂胄'
WHERE e.dynasty_id = 'song' AND e.year = 1195 AND e.short = '庆元党禁'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '韩侂胄'
WHERE e.dynasty_id = 'song' AND e.year = 1206 AND e.short = '开禧北伐'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '史弥远'
WHERE e.dynasty_id = 'song' AND e.year = 1207 AND e.short = '史弥远专权'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '史弥远'
WHERE e.dynasty_id = 'song' AND e.year = 1217 AND e.short = '嘉定之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '宋慈'
WHERE e.dynasty_id = 'song' AND e.year = 1247 AND e.short = '洗冤集录'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '孟珙'
WHERE e.dynasty_id = 'song' AND e.year = 1234 AND e.short = '联蒙灭金'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '孟珙'
WHERE e.dynasty_id = 'song' AND e.year = 1236 AND e.short = '江陵之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '余玠'
WHERE e.dynasty_id = 'song' AND e.year = 1243 AND e.short = '余玠守蜀'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '余玠'
WHERE e.dynasty_id = 'song' AND e.year = 1258 AND e.short = '钓鱼城之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '蒙哥'
WHERE e.dynasty_id = 'song' AND e.year = 1258 AND e.short = '钓鱼城之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '忽必烈'
WHERE e.dynasty_id = 'song' AND e.year = 1271 AND e.short = '元朝建立'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '忽必烈'
WHERE e.dynasty_id = 'song' AND e.year = 1259 AND e.short = '鄂州之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '忽必烈'
WHERE e.dynasty_id = 'song' AND e.year = 1276 AND e.short = '临安陷落'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '忽必烈'
WHERE e.dynasty_id = 'song' AND e.year = 1279 AND e.short = '崖山海战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '贾似道'
WHERE e.dynasty_id = 'song' AND e.year = 1259 AND e.short = '鄂州之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '贾似道'
WHERE e.dynasty_id = 'song' AND e.year = 1263 AND e.short = '公田法'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '贾似道'
WHERE e.dynasty_id = 'song' AND e.year = 1275 AND e.short = '丁家洲之战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '文天祥'
WHERE e.dynasty_id = 'song' AND e.year = 1275 AND e.short = '文天祥勤王'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '文天祥'
WHERE e.dynasty_id = 'song' AND e.year = 1276 AND e.short = '临安陷落'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '文天祥'
WHERE e.dynasty_id = 'song' AND e.year = 1279 AND e.short = '崖山海战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '张世杰'
WHERE e.dynasty_id = 'song' AND e.year = 1276 AND e.short = '益王即位'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '张世杰'
WHERE e.dynasty_id = 'song' AND e.year = 1279 AND e.short = '崖山海战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'lead'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '陆秀夫'
WHERE e.dynasty_id = 'song' AND e.year = 1279 AND e.short = '崖山海战'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
INSERT INTO event_person (event_id, person_id, role)
SELECT e.id, p.id, 'involved'
FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '陆秀夫'
WHERE e.dynasty_id = 'song' AND e.year = 1276 AND e.short = '益王即位'
ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role;
