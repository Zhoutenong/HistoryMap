-- 宋朝事件考据信息 seed（P4 考据感显性化）：
-- 按 batch/分类标注史料来源与置信度（正史纪传编年均为公版古籍）。
-- UPDATE 语句幂等（每次启动重放，seed 即事实来源——与 A4 upsert 语义一致）。

-- 北宋政治军事：正史 + 编年
UPDATE events SET
  source = '《宋史》《续资治通鉴长编》综合整理',
  confidence = 'medium', license = '公版古籍'
WHERE dynasty_id = 'song' AND category IN ('era', 'military') AND year <= 1126;

-- 南宋政治军事：正史 + 系年要录
UPDATE events SET
  source = '《宋史》《建炎以来系年要录》《三朝北盟会编》综合整理',
  confidence = 'medium', license = '公版古籍'
WHERE dynasty_id = 'song' AND category IN ('era', 'military') AND year >= 1127;

-- 经济变革：食货志为主
UPDATE events SET
  source = '《宋史·食货志》《文献通考》综合整理',
  confidence = 'medium', license = '公版古籍'
WHERE dynasty_id = 'song' AND category = 'economy';

-- 科技发明：笔记与官修书
UPDATE events SET
  source = '《梦溪笔谈》《武经总要》《萍洲可谈》等宋人笔记及官修书记载',
  confidence = 'high', license = '公版古籍'
WHERE dynasty_id = 'song' AND category = 'invention';

-- 名人轨迹：正史纪传（生卒与行迹多为史有明文，置信度较高）
UPDATE events SET
  source = '《宋史》纪传（本传）',
  confidence = 'high', license = '公版古籍'
WHERE dynasty_id = 'song' AND category = 'figure';
