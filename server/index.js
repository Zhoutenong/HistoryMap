import express from 'express';
import cors from 'cors';
import { getDb } from './db.js';
import mapRoutes from './routes/map.js';
import eventsRoutes from './routes/events.js';
import overlayRoutes from './routes/overlay.js';
import metaRoutes from './routes/meta.js';
import dynastiesRoutes from './routes/dynasties.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());               // 开发期前端 5173 直连 3001 也允许
app.use(express.json());

// 触发数据库初始化（建表 + seed），better-sqlite3 同步完成
getDb();
console.log('[db] 就绪');

// 挂载路由（统一 /api 前缀）
app.use('/api/map/overlay', overlayRoutes); // 注意：overlay 要在 map 之前注册，避免被 / 截获
app.use('/api/map', mapRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/dynasties', dynastiesRoutes);

// 健康检查
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[server] HistoryMap API 运行在 http://localhost:${PORT}`);
  console.log(`[server]   地图  : GET /api/map`);
  console.log(`[server]   事件  : GET /api/events?dynasty=song`);
  console.log(`[server]   叠加层: GET /api/map/overlay?dynasty=song`);
  console.log(`[server]   元信息: GET /api/meta?dynasty=song`);
  console.log(`[server]   朝代  : GET /api/dynasties`);
});
