#!/usr/bin/env node
/**
 * T1d 时空库构建器：三源合并 → 时间版本化实体 → PostgreSQL(PostGIS) upsert
 *
 * 输入：
 *   server/data/geo/song/jiuyuzhi-1080.json   元丰快照（294 州府：户口/土贡/属县）
 *   server/data/geo/song/yudi-guangji.json    舆地广记（fullEvolution 北宋沿革）
 *   server/data/geo/song/songshi-dili.json    宋史·地理志（南宋沿革）
 *   server/data/geo/song/place-events.json    T1b 变更事件（升/废/置/改…）
 *   _generated/song-seats-1080.json           治所坐标（CHGIS/人工标定）
 *   historical/prefectures.geojson            Voronoi 州府面（近似）
 *
 * 输出：
 *   _generated/temporal-places.json           合并中间件（离线可生成，供校验）
 *   PostgreSQL 写入（schema-temporal.sql 定义的表，需 DATABASE_URL）
 *
 * 版本语义：实体生命周期默认 [960, 1279]（宋亡）；事件切分——
 *   废州 → valid_to = 废年；新置 → valid_from = 置年；升府/改名 → 区间切分（name_at_time 变化）
 * 1080 快照校验：九域志州府在 1080 必存在（事件与之冲突则记录 warning）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SONG_DIR = path.join(ROOT, 'server', 'data', 'geo', 'song');
const HISTORICAL = path.join(ROOT, 'server', 'data', 'geo', 'historical');
const GENERATED = path.join(HISTORICAL, '_generated');

const SONG_END = 1279;
const SNAPSHOT_YEAR = 1080;

function readJson(p, required = false) {
  if (!fs.existsSync(p)) {
    if (required) throw new Error(`缺少输入文件: ${p}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** 事件按年份排序；year=null（近似）排最后 */
function sortEvents(events) {
  return [...events].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
}

/**
 * 合并单州府生命周期：从 960 到 1279 的版本区间序列。
 * @returns {Array<{validFrom, validTo, nameAtTime, eventRefs}>}
 */
function buildVersions(name, events) {
  const sorted = sortEvents(events);
  // 生命周期边界
  let from = 960;
  let to = SONG_END;
  const renames = []; // {year, name} 升府/改名切分点
  const conflicts = [];

  for (const e of sorted) {
    if (e.year === null) continue; // 无年份事件只记录不切分
    // 事件归属他州（如「废春州入恩州」——春州事件挂在恩州名下）→ 不切分当前州
    if (e.targetOther) continue;
    // 短 detail（<4 字）或无语义宾语：上下文丢失（如单字「废」），不切分
    if (e.detail.replace(/[，。]/g, '').length < 3) continue;
    // 军额变化（「军废」「并为军」「降为防御/团练」）是等级变化不是废州，不切分
    if (/军废|废军|并为军|并州为军|降为防禦|降为防御|降為團練|降为团練|改為防禦|改为防御|升為防禦|升为防御|為軍|为军/.test(e.detail)) continue;
    // 州级废州/省并：detail 宾语必须是「X州/府/军/监」（如「废拱州…」「省X州」）；
    // 「废X县/镇」「省入X」等县级/模糊事件不切分
    if (e.eventType === '废州' || e.eventType === '省并') {
      if (!/^(?:废|省)[\u3400-\u9fff]{1,4}?[府州軍監]/.test(e.detail)) continue;
    }
    // 新置/析置：宾语是州名（「建拱州于…」「置X州」）→ 州级新置；
    // 否则 detail 含 县/镇/寨/砦/监/堡/关/城/使/帅府/乡/筑/置治/进筑
    // → 县级、职能机构、城池营建或乡级析分，不是新置州，不后移 valid_from
    if (e.eventType === '新置' || e.eventType === '析置') {
      const isStateLevel = /^(?:建|置|立|增置)[\u3400-\u9fff]{1,4}?[府州軍監]/.test(e.detail);
      if (!isStateLevel && /县|縣|鎮|镇|寨|砦|监|堡|关|關|城|使|帅府|乡|鄉|筑|置治|进筑/.test(e.detail)) continue;
    }
    // 快照优先：九域志（1080）有载的州府，在 1080 前的新置/析置事件不后移 from
    // （史料差异，如河州 1073 收复、宋史称崇宁升州——以当代快照为准）
    if ((e.eventType === '新置' || e.eventType === '析置') && e.year <= SNAPSHOT_YEAR) continue;
    // 升格：仅「升为X府/升X府」是政区升格（切分）；「升X军节度/升为州」是军额/等级
    // 变化，州仍存在，不切分
    if (e.eventType === '升格' && !/府/.test(e.detail)) continue;
    // 改名：仅「改X州/X府」是政区改名（切分）；「改X军」是军额改名，不切分
    if (e.eventType === '改名' && !/[府州]/.test(e.detail)) continue;
    switch (e.eventType) {
      case '废州':
      case '省并':
        // 废州后若复置则区间恢复；这里记录「废至」边界（复置事件会重新开启）
        if (e.year >= from && e.year <= to) {
          // 若此前已有废点，取最早；简化：记录所有废点，最后合成
          if (!to || e.year < to) to = e.year - 1;
        }
        break;
      case '新置':
      case '析置':
        // 新置州：区间从置年开始（若事件在快照年后，valid_from 后移）
        if (e.year > from) from = e.year;
        break;
      case '升格':
      case '改名':
        // 升府/改名：区间切分点（name_at_time 变化）
        if (e.year > from && e.year <= to) renames.push({ year: e.year, type: e.eventType });
        break;
      case '复置':
        // 复置：若已废（to 已提前），从复置年恢复
        if (to < e.year) {
          if (e.year > from) {
            // 恢复区间 [复置年, SONG_END]——需要记录「前一段已结束」
            renames.push({ year: e.year, type: '复置' });
            to = SONG_END;
          }
        }
        break;
      default:
        break;
    }
  }

  // 合成版本区间：按 renames 切分 [from, to]
  const points = [...new Set([from, ...renames.map((r) => r.year), to + 1])]
    .filter((y) => y >= from && y <= to + 1)
    .sort((a, b) => a - b);
  const versions = [];
  for (let i = 0; i < points.length - 1; i++) {
    const vFrom = points[i];
    const vTo = points[i + 1] - 1;
    if (vTo < vFrom) continue;
    const rename = renames.find((r) => r.year === vFrom);
    versions.push({
      validFrom: vFrom,
      validTo: vTo >= SONG_END ? null : vTo,
      nameAtTime: rename ? `${name}（${rename.type === '升格' ? '升府' : '改名'}后）` : name,
      eventRefs: sorted.filter((e) => e.year !== null && e.year >= vFrom && e.year <= vTo).map((e) => e.idx),
    });
  }
  if (versions.length === 0) {
    versions.push({ validFrom: from, validTo: to >= SONG_END ? null : to, nameAtTime: name, eventRefs: [] });
  }
  return { versions, conflicts };
}

function main() {
  const jiuyuzhi = readJson(path.join(SONG_DIR, 'jiuyuzhi-1080.json'), true);
  const yudi = readJson(path.join(SONG_DIR, 'yudi-guangji.json'));
  const songshi = readJson(path.join(SONG_DIR, 'songshi-dili.json'));
  const eventsData = readJson(path.join(SONG_DIR, 'place-events.json'));
  const seatsData = readJson(path.join(GENERATED, 'song-seats-1080.json'));
  const prefsGeo = readJson(path.join(HISTORICAL, 'prefectures.geojson'));

  // 索引
  const yudiByName = new Map((yudi?.prefectures || []).map((p) => [p.name, p]));
  const songshiByName = new Map((songshi?.prefectures || []).map((p) => [p.name, p]));
  const seatsByName = new Map((seatsData?.seats || []).map((s) => [s.name, s]));
  const faceByName = new Map((prefsGeo?.features || [])
    .filter((f) => f.properties.kind === 'prefecture')
    .map((f) => [f.properties.name, f]));
  const eventsByPlace = new Map();
  (eventsData?.events || []).forEach((e, idx) => {
    const list = eventsByPlace.get(e.placeName) || [];
    list.push({ ...e, idx });
    eventsByPlace.set(e.placeName, list);
  });

  const sources = [
    { id: 'jiuyuzhi', title: '元丰九域志', juan: '十卷', edition: '文渊阁四库全书本（kanripo KR2k0005）', url: 'https://github.com/kanripo/KR2k0005', license: '公版古籍' },
    { id: 'yudi-guangji', title: '舆地广记', juan: '三十八卷', edition: '文渊阁四库全书本（维基文库）', url: 'https://zh.wikisource.org/wiki/輿地廣記_(四庫全書本)', license: '公版古籍' },
    { id: 'songshi-dili', title: '宋史·地理志', juan: '卷八十五至九十', edition: 'ctext.org 完整版', url: 'https://ctext.org/wiki.pl?if=gb&res=975976', license: '公版古籍' },
  ];

  const places = [];
  const warnings = [];
  const sourcesUsed = new Set();
  const jyzByName = new Map(jiuyuzhi.prefectures.map((p) => [p.name, p]));

  // 宋史·地理志独有的州府（九域志 1080 后新置/改名，如拱州/延安府/袭庆府/恭州/叙州）
  const songshiOnly = (songshi?.prefectures || [])
    .filter((p) => !jyzByName.has(p.name) && !/^\(/.test(p.name));

  /** 建实体（九域志州府与宋史独有州府共用） */
  function buildPlace({ name, nameRaw, type, route, seat, face, yudiEntry, ssEntry, events, snapshotCheck }) {
    const { versions, conflicts } = buildVersions(name, events);
    warnings.push(...conflicts.map((c) => `[冲突] ${name}: ${c}`));

    if (snapshotCheck) {
      // 1080 快照校验：九域志州府在 1080 必存在。冲突时**快照优先**——
      // 九域志是当代记录（1080），比后世沿革叙述更可信：合并为单版本 [960, null]，
      // 废州/升置切分让位于快照，冲突记录 warning 供人工裁决。
      const at1080 = versions.some((v) => v.validFrom <= SNAPSHOT_YEAR && (v.validTo === null || v.validTo >= SNAPSHOT_YEAR));
      if (!at1080) {
        versions.length = 1;
        versions[0].validFrom = 960;
        versions[0].validTo = null;
        versions[0].nameAtTime = name;
        versions[0].note = '快照优先：元丰九域志（1080）已载此州，事件切分（废/升置）让位于当代快照';
        warnings.push(`[快照冲突·快照优先] ${name}: 元丰九域志（1080）有载，事件时间线不覆盖 1080，已合并为 [960, 宋亡]`);
      }
    }

    const sourceIds = ['jiuyuzhi'];
    if (yudiEntry) sourceIds.push('yudi-guangji');
    if (ssEntry) sourceIds.push('songshi-dili');
    sourceIds.forEach((s) => sourcesUsed.add(s));

    // 实体
    const placeId = `song-${name}`;
    places.push({
      id: placeId,
      name,
      nameVariants: [nameRaw, ssEntry?.nameRaw || null].filter(Boolean),
      type,
      dynasty: 'song',
      route,
      parentId: null,
      confidence: seat ? (seat.confidence === 'high' ? 0.9 : 0.6) : 0.35,
      sourceIds,
      versions: versions.map((v) => {
        const geomJson = face ? face.geometry : null;
        return {
          placeId,
          validFrom: v.validFrom,
          validTo: v.validTo,
          nameAtTime: v.nameAtTime,
          seatPoint: seat ? seat.coord : null,
          faceGeometry: geomJson,
          confidence: face ? 0.35 : (seat ? 0.9 : 0.3),
          sourceIds,
          note: v.note || (face ? '州府面为 Voronoi 近似（非精确政区界线）；治所坐标精确' : seat ? '仅治所点（海南三军等无面）' : '宋史·地理志记载的州府，无治所坐标（Voronoi 面未生成）'),
          eventRefs: v.eventRefs,
        };
      }),
    });
  }

  for (const p of jiuyuzhi.prefectures) {
    if (p.type === '監' || /^\(/.test(p.name)) continue; // 監与占位州本期不建实体
    buildPlace({
      name: p.name,
      nameRaw: p.nameRaw,
      type: 'prefecture',
      route: p.route,
      seat: seatsByName.get(p.name),
      face: faceByName.get(p.name),
      yudiEntry: yudiByName.get(p.name),
      ssEntry: songshiByName.get(p.name),
      events: eventsByPlace.get(p.name) || [],
      snapshotCheck: true,
    });
  }

  // 宋史·地理志独有的州府（九域志 1080 后新置/改名，如拱州/延安府/袭庆府/恭州/叙州）
  for (const p of songshiOnly) {
    if (jyzByName.has(p.name)) continue;
    buildPlace({
      name: p.name,
      nameRaw: p.nameRaw,
      type: 'prefecture',
      route: p.route,
      seat: null,
      face: null,
      yudiEntry: null,
      ssEntry: p,
      events: eventsByPlace.get(p.name) || [],
      snapshotCheck: false,
    });
  }

  // 事件扁平化（带 placeId）
  const placeEvents = [];
  places.forEach((pl) => {
    (eventsByPlace.get(pl.name) || []).forEach((e) => {
      placeEvents.push({
        placeId: pl.id,
        year: e.year,
        yearApprox: !!e.yearApprox,
        eventType: e.eventType,
        detail: e.detail,
        sourceId: e.sourceId,
        confidence: e.confidence,
      });
    });
  });

  // 中间件输出（离线可生成）
  const out = {
    meta: {
      source: '三源合并（元丰九域志快照 + 舆地广记/宋史·地理志沿革 + 变更事件）',
      snapshotYear: SNAPSHOT_YEAR,
      songEnd: SONG_END,
      counts: { places: places.length, versions: places.reduce((a, p) => a + p.versions.length, 0), events: placeEvents.length },
      warnings,
    },
    sources,
    places,
    placeEvents,
  };
  fs.mkdirSync(GENERATED, { recursive: true });
  fs.writeFileSync(path.join(GENERATED, 'temporal-places.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(`中间件: ${path.join(GENERATED, 'temporal-places.json')}`);
  console.log(`实体 ${places.length} | 版本 ${out.meta.counts.versions} | 事件 ${placeEvents.length}`);
  console.log(`史料源: ${[...sourcesUsed].join(', ')}`);
  if (warnings.length) {
    console.log(`\n[warning] ${warnings.length} 条`);
    warnings.slice(0, 10).forEach((w) => console.log('  ' + w));
  }

  // PG 写入（DATABASE_URL 存在时执行）
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    writeToPostgres(dbUrl, out);
  } else {
    console.log('\n[DATABASE_URL 未设置，跳过 PostgreSQL 写入——中间件已生成，可随时导入]');
    console.log('  示例: DATABASE_URL=postgres://postgres:postgres@localhost:5432/historymap node scripts/build-temporal-db.mjs');
  }
}

/** PostgreSQL 写入（pg 驱动，幂等：先清空再写入） */
async function writeToPostgres(dbUrl, data) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE place_events, place_versions, places, sources RESTART IDENTITY CASCADE');

    // sources
    for (const s of data.sources) {
      await client.query(
        'INSERT INTO sources (id, title, juan, edition, url, license) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title',
        [s.id, s.title, s.juan, s.edition, s.url, s.license],
      );
    }

    // places
    for (const p of data.places) {
      await client.query(
        `INSERT INTO places (id, name, name_variants, type, dynasty, route, parent_id, confidence, source_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [p.id, p.name, p.nameVariants, p.type, p.dynasty, p.route, p.parentId, p.confidence, p.sourceIds],
      );
    }

    // place_versions（几何：有面存面（Polygon，含治所点于 note），无面存治所 Point）
    for (const p of data.places) {
      for (const v of p.versions) {
        const cols = ['place_id', 'valid_from', 'valid_to', 'name_at_time', 'confidence', 'source_ids', 'note'];
        const params = [v.placeId, v.validFrom, v.validTo, v.nameAtTime, v.confidence, v.sourceIds, v.note];
        let geomExpr = null;
        if (v.faceGeometry) {
          geomExpr = `ST_SetSRID(ST_GeomFromGeoJSON($${cols.length + 1}), 4326)`;
          params.push(JSON.stringify(v.faceGeometry));
        } else if (v.seatPoint) {
          geomExpr = `ST_SetSRID(ST_MakePoint($${cols.length + 1}, $${cols.length + 2}), 4326)`;
          params.push(v.seatPoint[0], v.seatPoint[1]);
        }
        if (geomExpr) {
          cols.push('geom');
          params.push(geomExpr); // 表达式占位，下方替换
          const exprIdx = params.length;
          const placeholders = cols.map((c, i) => (c === 'geom' ? params[exprIdx - 1] : `$${i + 1}`));
          // 重排：几何表达式放最后（使用其占位符）
          const plain = params.slice(0, exprIdx - 1);
          await client.query(
            `INSERT INTO place_versions (${cols.join(',')}) VALUES (${placeholders.join(',')})`,
            plain,
          );
        } else {
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
          await client.query(`INSERT INTO place_versions (${cols.join(',')}) VALUES (${placeholders})`, params);
        }
      }
    }

    // place_events
    for (const e of data.placeEvents) {
      await client.query(
        `INSERT INTO place_events (place_id, year, year_approx, event_type, detail, source_id, confidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [e.placeId, e.year, e.yearApprox, e.eventType, e.detail, e.sourceId, e.confidence],
      );
    }

    await client.query('COMMIT');
    console.log(`\nPostgreSQL 写入完成: ${data.places.length} 实体 / ${data.placeEvents.length} 事件`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

try {
  main();
} catch (err) {
  console.error('[build-temporal-db] 失败:', err.message);
  process.exit(1);
}
