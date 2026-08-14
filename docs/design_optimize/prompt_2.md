# 地图视觉设计 tokens 与坐标基准

可以。先说明一个关键限制：PNG 本身不携带 Compose/Canvas 的原始 dp、sp、alpha、fontWeight 等参数，因此下面的尺寸和字体是根据刚才最终效果图反推并归一化到 1080×2244 后得到的可复现参数；颜色则优先采用你生成时明确指定的 HEX 值，而不是重新设计。原始设计文档也明确要求最终通过 token 固化数值。

## 1. design-tokens.json

```json
{
  "canvas": {
    "width": 1080,
    "height": 2244,
    "aspectRatio": "9:19.5"
  },

  "colors": {
    "paperMap": "#E6D8B5",
    "paperPanel": "#F8F4E9",
    "paperCard": "#FDF8EC",

    "ink": "#3A3428",
    "inkSecondary": "#5B5141",
    "inkFaint": "#807665",

    "vermilion": "#B03A2E",
    "gold": "#D6824A",

    "regime": {
      "song": "#8E2F24",
      "liao": "#5D7F8C",
      "westernXia": "#D6C174",
      "jin": "#6F8BA8",
      "dali": "#6A886E",
      "tubo": "#A4886B"
    },

    "eventCategory": {
      "politics": "#B03A2E",
      "people": "#6E5A7E",
      "military": "#A0622D",
      "economy": "#5F7D4F",
      "culture": "#46647F"
    },

    "map": {
      "riverWash": "#7F9BA0",
      "riverBody": "#52767D",
      "mountainInk": "#51483B",
      "paperGrain": "#8A7658",
      "warmWash": "#E0CEA8"
    }
  },

  "alpha": {
    "topBar": 224,
    "legendBackground": 184,
    "bubbleBackground": 238,
    "bubbleBorder": 170,
    "bubbleShadow": 35,

    "yearWatermark": 26,

    "mapWatercolorBody": 117,
    "mapWatercolorBloom": 82,
    "mapWatercolorMottleMin": 13,
    "mapWatercolorMottleMax": 31,

    "mapBoundary": 122,
    "mapDryEdge": 71,

    "riverMajorWash": 46,
    "riverMajorBody": 110,
    "riverMajorSpine": 140,
    "riverMinorWash": 30,
    "riverMinorBody": 70,

    "mountain": 96,

    "paperGrain": 26,
    "vignette": 97,
    "centerLight": 26,

    "timelineTrack": 36,
    "timelineShadow": 38
  },

  "spacing": {
    "screenHorizontal": 12,
    "topBarHeight": 154,
    "legendLeft": 24,
    "legendTop": 194,
    "bubbleGap": 24,
    "timelineBottomSafeArea": 28
  },

  "radius": {
    "legend": 10,
    "bubble": 8,
    "timeline": 14,
    "playButton": 6,
    "slider": 999
  },

  "stroke": {
    "topBarDivider": 1,
    "bubble": 1,
    "mapBoundary": 1.8,
    "mapDryEdge": 0.8,
    "eventLeader": 1.2,
    "slider": 3
  },

  "type": {
    "topTitle": {
      "size": 18,
      "weight": "normal",
      "letterSpacing": 4,
      "lineHeight": 26,
      "family": "serif"
    },

    "dynasty": {
      "size": 15,
      "weight": "bold",
      "letterSpacing": 2,
      "lineHeight": 22,
      "family": "serif"
    },

    "eventMenu": {
      "size": 14,
      "weight": "normal",
      "letterSpacing": 2,
      "lineHeight": 20,
      "family": "serif"
    },

    "legendTitle": {
      "size": 14,
      "weight": "bold",
      "letterSpacing": 2,
      "lineHeight": 20,
      "family": "serif"
    },

    "legendItem": {
      "size": 13,
      "weight": "normal",
      "letterSpacing": 1,
      "lineHeight": 22,
      "family": "serif"
    },

    "mapLabel": {
      "size": 13,
      "weight": "normal",
      "letterSpacing": 1,
      "lineHeight": 20,
      "family": "serif"
    },

    "bubbleTitle": {
      "size": 14,
      "weight": "bold",
      "letterSpacing": 1,
      "lineHeight": 20,
      "family": "serif"
    },

    "bubbleBody": {
      "size": 11,
      "weight": "normal",
      "letterSpacing": 0,
      "lineHeight": 18,
      "family": "serif"
    },

    "yearWatermark": {
      "size": 120,
      "weight": "normal",
      "letterSpacing": 8,
      "lineHeight": 130,
      "family": "serif",
      "alpha": 26
    },

    "timelineYear": {
      "size": 42,
      "weight": "normal",
      "letterSpacing": 3,
      "lineHeight": 52,
      "family": "serif"
    },

    "timelineRange": {
      "size": 13,
      "weight": "normal",
      "letterSpacing": 1,
      "lineHeight": 18,
      "family": "serif"
    },

    "timelineCategory": {
      "size": 11,
      "weight": "normal",
      "letterSpacing": 1,
      "lineHeight": 16,
      "family": "serif"
    }
  },

  "map": {
    "area": {
      "top": 154,
      "bottom": 1410
    },

    "watercolor": {
      "bloomBlur": 24,
      "bloomAlpha": 82,
      "bodyBlur": 6,
      "bodyAlpha": 117,
      "mottleCount": 60,
      "mottleAlpha": [
        13,
        31
      ],
      "edgeWidth": 1.8,
      "edgeAlpha": 122,
      "dryEdgeWidth": 0.8,
      "dryEdgeAlpha": 71
    },

    "river": {
      "major": {
        "washWidth": 12,
        "washAlpha": 46,
        "bodyWidth": 3.2,
        "bodyAlpha": 110,
        "spineWidth": 1.1,
        "spineAlpha": 140
      },
      "minor": {
        "washWidth": 6,
        "washAlpha": 30,
        "bodyWidth": 2,
        "bodyAlpha": 70
      }
    },

    "mountain": {
      "strokeWidth": 1.2,
      "alpha": 96,
      "peaksPerGlyph": 3
    },

    "paper": {
      "grainStrength": 0.10,
      "grainAlpha": 26,
      "vignetteStrength": 0.38,
      "vignetteStart": 0.36,
      "vignetteEnd": 0.86,
      "centerLight": 0.10
    }
  },

  "bubble": {
    "width": 260,
    "height": 112,
    "radius": 8,
    "borderWidth": 1,
    "categoryBarWidth": 6,
    "shadowOffsetY": 3,
    "shadowBlur": 6,
    "shadowAlpha": 35,
    "leaderWidth": 1.2,
    "leaderDashLength": 8,
    "leaderGap": 7,
    "arrowLength": 8,
    "arrowWidth": 5,
    "eventPointDiameter": 10
  },

  "timeline": {
    "left": 42,
    "right": 42,
    "bottom": 28,
    "width": 996,
    "height": 280,
    "radius": 14,

    "playButton": {
      "width": 56,
      "height": 56,
      "radius": 6
    },

    "track": {
      "height": 6,
      "thumbDiameter": 32,
      "thumbStroke": 3,
      "eventDotDiameter": 10
    }
  }
}
```

## 2. 元素坐标表

以下全部已经换算成 1080×2244 画布的百分比。

| 元素 | X | Y | 宽度 | 高度 | 其他 |
|------|---|----|----|----|------|
| 顶栏 | 0% | 0% | 100% | 6.86% | 154px |
| 顶栏标题 | 5.0% | 1.55% | 18.0% | 2.0% | 18sp |
| 朝代按钮 | 58.0% | 1.35% | 11.0% | 3.0% | ≥44dp触摸区 |
| 事件按钮 | 72.0% | 1.35% | 14.0% | 3.0% | ≥44dp |
| 设置按钮 | 90.0% | 1.35% | 5.0% | 3.0% | ≥44dp |
| 地图区域 | 0% | 6.86% | 100% | 56.0% | y=154~1410 |
| 政权标签 | 2.2% | 8.6% | 10.5% | 3.0% | 朱砂底 |
| 政权图例 | 2.2% | 10.5% | 16.0% | 13.0% | 半透明纸笺 |
| 年份水印 | 58.0% | 9.0% | 34.0% | 8.0% | 120sp / α26 |
| 事件泡泡① | 43.0% | 17.0% | 24.1% | 5.0% | 260×112px |
| 事件泡泡② | 75.5% | 37.5% | 24.1% | 5.0% | 260×112px |
| 事件泡泡③ | 22.0% | 50.5% | 24.1% | 5.0% | 260×112px |
| 泡泡①事件点 | 64.5% | 25.5% | 0.93% | 0.45% | 10px |
| 泡泡②事件点 | 71.0% | 43.5% | 0.93% | 0.45% | 10px |
| 泡泡③事件点 | 54.0% | 45.0% | 0.93% | 0.45% | 10px |
| 时间轴卡片 | 3.9% | 62.9% | 92.2% | 12.5% | 996×280px |
| 播放按钮 | 6.3% | 64.2% | 5.2% | 2.5% | 56×56px |
| 时间轴年份 | 35.0% | 64.0% | 25.0% | 3.0% | 42sp |
| 年份范围 | 75.0% | 65.0% | 17.0% | 2.0% | 13sp |
| 时间轨道 | 7.4% | 69.2% | 85.2% | 0.27% | 6px |
| 滑块 | 39.0% | 68.3% | 3.0% | 1.43% | 32px |
| 事件刻度区 | 7.4% | 71.8% | 85.2% | 3.0% | 5个分类点 |
| 底部安全区 | 0% | 94.2% | 100% | 5.8% | 约130px |

### 地图内部主要视觉坐标

| 元素 | X | Y | 宽度 | 高度 |
|------|---|----|----|----|
| 宋疆域视觉中心 | 43% | 38% | 38% | 30% |
| 辽疆域视觉中心 | 62% | 28% | 37% | 28% |
| 西夏视觉中心 | 30% | 30% | 23% | 18% |
| 金视觉中心 | 72% | 34% | 20% | 23% |
| 大理视觉中心 | 27% | 48% | 20% | 18% |
| 吐蕃视觉中心 | 12% | 38% | 25% | 25% |
| 主要山脉区域 | 5% | 12% | 30% | 54% |
| 主要河流网络 | 20% | 28% | 62% | 37% |

## 3. 图层顺序

严格按照最终画面的视觉关系：

1. 宣纸基础底色 #E6D8B5
2. 中心提亮径向层
3. 四周暖褐暗角
4. 纸张颗粒纹理
5. 山脉淡墨笔触
6. 历史政权水彩晕染层
7. 政权水彩主体层
8. 水彩斑驳纹理
9. 政权边界淡墨描边
10. 政权干笔边缘
11. 河流宽淡水痕
12. 河流主线
13. 河流细脊线
14. 城市/地点标记
15. 地图地名
16. 年份 1127 年 淡墨水印
17. 政权图例
18. 事件位置圆点
19. 事件虚线指向线
20. 事件箭头
21. 事件泡泡阴影
22. 事件泡泡纸面
23. 事件泡泡朱砂描边
24. 事件分类竖条
25. 事件文字
26. 顶部半透明宣纸顶栏
27. 顶栏底部 1px 淡墨分隔线
28. 顶栏标题/按钮
29. 底部时间轴阴影
30. 底部时间轴纸卡
31. 播放按钮
32. 年份文字
33. 时间范围文字
34. 时间进度轨道
35. 时间进度朱砂→赭金渐变
36. 时间滑块
37. 事件分类刻度点
38. 分类文字

这样可以直接作为 MapVisualTokens.kt / Compose / GLES2 的视觉基准。尤其需要注意，原设计要求的核心原则就是图片负责视觉方向，tokens.json 负责确定数值，代码只从 token 取值。
