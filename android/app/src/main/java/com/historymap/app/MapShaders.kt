package com.historymap.app

/**
 * GLSL 着色器源（A5 拆分自 MapRenderer）：顶点着色器 ×3 + 河道带着色器。
 * 着色器为编译期常量，与渲染 pass 的绑定逻辑仍留在 MapRenderer。
 */

/** NDC 直通顶点（宣纸底用） */
internal const val VERT_NDC = """
            attribute vec2 aPos;
            void main() {
                gl_Position = vec4(aPos, 0.0, 1.0);
            }
        """

/** 纹理 quad：世界坐标 + UV（uOffset 供阴影 pass 平移整张 quad） */
internal const val VERT_TEX = """
            attribute vec2 aPos;
            attribute vec2 aUv;
            uniform mat4 uViewProj;
            uniform vec2 uOffset;
            varying vec2 vUv;
            void main() {
                vUv = aUv;
                gl_Position = uViewProj * vec4(aPos + uOffset, 0.0, 1.0);
            }
        """

/** 河道带：世界坐标（已含镜像）+ 跨河坐标 side + 弧长 s */
internal const val VERT_RIVER = """
            attribute vec2 aPos;
            attribute float aSide;
            attribute float aS;
            uniform mat4 uViewProj;
            varying float vSide;
            varying float vS;
            void main() {
                vSide = aSide;
                vS = aS;
                gl_Position = uViewProj * vec4(aPos, 0.0, 1.0);
            }
        """


internal const val FRAG_RIVER = """
            precision mediump float;
            uniform vec4 uWash;
            uniform vec4 uBody;
            uniform vec4 uSpine;
            uniform vec4 uFracs;
            uniform vec3 uFlow;
            uniform float uAlpha;
            varying float vSide;
            varying float vS;
            void main() {
                float a = abs(vSide);
                // 顺流微动画：相位随弧长推进，时间项让波峰向下游移动
                float flow = 0.5 + 0.5 * cos(6.28318 * (vS / uFlow.x - uFlow.y * uFlow.z));
                vec3 bodyRgb = uBody.rgb * (1.0 + (flow - 0.5) * uFracs.w);
                // 水痕（最宽，两岸羽化）
                float washA = uWash.a * (1.0 - smoothstep(0.55, 1.0, a));
                vec3 rgb = uWash.rgb;
                float alpha = washA;
                // 主体带（src-over 覆盖水痕）
                float bodyMask = 1.0 - smoothstep(uFracs.x - 0.06, uFracs.x + 0.06, a);
                rgb = mix(rgb, bodyRgb, bodyMask);
                alpha = alpha + uBody.a * bodyMask * (1.0 - alpha);
                // 脊线（仅主流；随流动轻微呼吸，避免死线）
                if (uFracs.z > 0.5) {
                    float spineMask = (1.0 - smoothstep(uFracs.y, uFracs.y + 0.3, a)) * (0.8 + 0.2 * flow);
                    rgb = mix(rgb, uSpine.rgb, spineMask);
                    alpha = alpha + uSpine.a * spineMask * (1.0 - alpha) * 0.55;
                }
                gl_FragColor = vec4(rgb, alpha * uAlpha);
            }
        """
