/**
 * 连线上「流动」的光带：选中 / 悬停 / 与选中相连的线，沿数据的方向走一串彗尾光点。
 *
 * 一道光带是一串紧挨着的小圆点（头大尾小、头亮尾淡），每个点都在线上走、只是比前一个
 * 晚出发一点点——所以光带永远贴着曲线弯，也不会伸出线的两头压到卡片上。每个点走到线
 * 两头时各自淡入淡出：光带是从端点里「长出来」、再「没进」另一头的。颜色跟所在的线一致。
 *
 * 只动 transform 与 opacity，交给合成线程跑，不占主线程、不触发重绘：
 * - 按 pathSample.ts 纯 JS 采样出整条线的长度与等距点，每个点外层的 HTML 元素用
 *   Web Animations 按这些点做 translate 关键帧（里层只管大小和颜色）；
 * - 关键帧每条线只解析一次，各点拷一份再改延迟；线变了只换关键帧，动画进度不重来；
 * - 路径在连续变（拖卡片时每帧都变）就先把整组淡出停住，停下来按最终的线铺好再淡入；
 * - 整组淡入淡出只动 opacity：不会突然出现、突然消失。
 *
 * 与原版（Minglink/dsh-jailbreak-workflow，MIT License）的差异：
 * - 画布平移 / 缩放时点跟着 viewport transform 走，无需暂停；只有路径连续变才藏。
 * - 点的大小、间距按 1/zoom 反向补偿（clamp 0.55–1.8），任何缩放级别手感一致。
 */

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EdgeLabelRenderer } from "@xyflow/react";
import { measurePath, type MeasuredPath } from "./pathSample.ts";

/** 一条线上最多几道光带；短线只放一道。 */
const MAX_STREAKS = 2;
/** 每多这么长放一道。 */
const SPACING = 200;
/** 一道光带由几个点组成、点与点沿线相隔多远（画布像素×unit）。 */
const TRAIL = 16;
const TRAIL_GAP = 1.7;
/** 沿线走的速度（画布像素 / 秒）与一圈的时长上下限。 */
const SPEED = 110;
const MIN_MS = 1300;
const MAX_MS = 5000;
/** 端点处淡入淡出的长度（画布像素×unit）。 */
const FADE = 22;
/** 整组淡出用多久（与 CSS 过渡一致），之后才卸载。 */
const LEAVE_MS = 320;
/** 线「活」起来后等多久才挂光带：让卡片 / 线的淡入过渡先走一段。 */
const ENTER_DELAY_MS = 200;
/** 路径两次变化隔得比这短就算「正在动」；停下来这么久才按最终的线重新铺点。 */
const SETTLE_MS = 140;

/** 这么长的线放几道光带。 */
function streakCount(length: number): number {
  return Math.max(1, Math.min(MAX_STREAKS, Math.round(length / SPACING)));
}

/** 光带里第 index 个点（0 = 头）的大小与透明度：头大尾小、头亮尾淡。 */
function dotStyle(index: number, unit: number): React.CSSProperties {
  const t = index / (TRAIL - 1);
  // 点比间距大，相邻的点互相压住，连成一条渐细的光带而不是一串珠子。
  const size = (5 - 3 * t) * unit;
  return {
    width: size,
    height: size,
    marginLeft: -size / 2,
    marginTop: -size / 2,
    opacity: 1 - 0.9 * t * t,
  };
}

/** 沿路径等距取点，带上两头的淡入淡出。 */
function sample(path: MeasuredPath, unit: number): Keyframe[] {
  const { length } = path;
  const count = Math.max(16, Math.min(72, Math.round(length / 8)));
  const fade = Math.min(FADE * unit, length / 3);
  return path.sample(count).map((point, index) => ({
    offset: index / (count - 1),
    transform: `translate(${point.x}px, ${point.y}px)`,
    opacity: Math.max(0, Math.min(1, point.at / fade, (length - point.at) / fade)),
  }));
}

/** 按画布缩放反推的尺寸单位：任何缩放级别光带的屏幕尺寸都一致。 */
function unitOf(zoom: number): number {
  return Math.min(1.8, Math.max(0.55, 1 / (zoom > 0 ? zoom : 1)));
}

export const FlowStreaks = memo(function FlowStreaks(props: {
  path: string;
  /** 光带颜色：和这条线此刻的描边色一致。 */
  color: string;
  /** 线是不是「活」的。变成 false 后先淡出、再卸载。 */
  active: boolean;
  zoom: number;
  reducedMotion: boolean;
}): React.JSX.Element | null {
  const { path, color, active, zoom, reducedMotion } = props;
  const unit = unitOf(zoom);
  const [mounted, setMounted] = useState(active);
  useEffect(() => {
    if (mounted === active) return;
    if (!active) {
      const timer = setTimeout(() => setMounted(false), LEAVE_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setMounted(true), ENTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active, mounted]);
  if (reducedMotion || !mounted) return null;
  return <Trail path={path} color={color} unit={unit} leaving={!active} />;
});

function Trail(props: { path: string; color: string; unit: number; leaving: boolean }): React.JSX.Element {
  const { path, color, unit, leaving } = props;
  /** 挂几道光带的点（按线长；线变长、变短时跟着 lay 改）。 */
  const [slots, setSlots] = useState(() => {
    const measured = measurePath(path);
    return measured === null ? 1 : streakCount(measured.length);
  });
  /** 路径在连续变：整组藏起来停住，停稳再铺。 */
  const [hidden, setHidden] = useState(false);
  const dots = useRef<(HTMLSpanElement | null)[]>([]);
  const running = useRef<(Animation | null)[]>([]);
  /** 淡出 / 藏起时点停在原地（effect 里同步，供定时器回调读取）。 */
  const stoppedRef = useRef(false);
  /** 上一次路径变的时刻；正在动时等它停下来的定时器。 */
  const changed = useRef(Number.NEGATIVE_INFINITY);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lay = useCallback((d: string, u: number, paused: boolean): void => {
    const measured = measurePath(d);
    if (measured === null) return;
    const streaks = streakCount(measured.length);
    setSlots(streaks);
    const duration = Math.min(MAX_MS, Math.max(MIN_MS, (measured.length / SPEED) * 1000));
    const lag = ((TRAIL_GAP * u) / SPEED) * 1000;
    // 关键帧只解析这一次：各点拷一份（拷贝不重新解析），再改各自的延迟。
    const base = new KeyframeEffect(null, sample(measured, u), {
      duration,
      iterations: Number.POSITIVE_INFINITY,
      easing: "linear",
    });
    for (let streak = 0; streak < MAX_STREAKS; streak += 1) {
      for (let index = 0; index < TRAIL; index += 1) {
        const slot = streak * TRAIL + index;
        const dot = dots.current[slot];
        const current = running.current[slot] ?? null;
        if (dot === null || dot === undefined || streak >= streaks) {
          current?.cancel();
          running.current[slot] = null;
          continue;
        }
        // 全是负的延迟：一挂上去就在半路，第 index 个点比头晚 index 个间隔。
        const delay = index * lag - (duration * streak) / streaks - duration;
        const effect = new KeyframeEffect(base);
        effect.target = dot;
        effect.updateTiming({ delay });
        if (current !== null) {
          // 换效果不换动画：当前进度留着，点接着从原来的位置走。
          current.effect = effect;
          continue;
        }
        const animation = new Animation(effect, document.timeline);
        animation.play();
        running.current[slot] = animation;
      }
    }
    if (paused) {
      for (const animation of running.current) animation?.pause();
    }
  }, []);

  // 停 / 走状态先进 ref，定时器回调与下面的 effect 都从它读。
  useLayoutEffect(() => {
    stoppedRef.current = leaving || hidden;
  }, [leaving, hidden]);

  useLayoutEffect(() => {
    const now = performance.now();
    const rapid = now - changed.current < SETTLE_MS || settle.current !== null;
    changed.current = now;
    if (!rapid) {
      lay(path, unit, stoppedRef.current);
      return;
    }
    // 路径在连续变：先淡出、暂停，停下来再按最终的线铺一次。
    if (settle.current === null) {
      setHidden(true);
      for (const animation of running.current) animation?.pause();
    }
    if (settle.current !== null) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = null;
      lay(path, unit, stoppedRef.current);
      if (!stoppedRef.current) {
        for (const animation of running.current) animation?.play();
      }
      setHidden(false);
    }, SETTLE_MS);
  }, [path, unit, lay]);

  // 淡出时点停在原地，又活过来就接着走。
  useLayoutEffect(() => {
    if (leaving || hidden) {
      for (const animation of running.current) animation?.pause();
      return;
    }
    if (settle.current === null) {
      for (const animation of running.current) animation?.play();
    }
  }, [leaving, hidden]);

  // 线变长、多出一道光带：新挂上的点等这次渲染完才有，这里补上它们的动画。
  const laidSlots = useRef(slots);
  useLayoutEffect(() => {
    if (laidSlots.current === slots) return;
    laidSlots.current = slots;
    if (settle.current === null) lay(path, unit, stoppedRef.current);
  }, [slots, path, unit, lay]);

  useLayoutEffect(
    () => () => {
      if (settle.current !== null) clearTimeout(settle.current);
      for (const animation of running.current) animation?.cancel();
      running.current = [];
    },
    [],
  );

  return (
    <EdgeLabelRenderer>
      <div
        className="fc-edge-streaks"
        data-leaving={leaving}
        data-hidden={hidden}
        style={{ "--fc-streak": color } as React.CSSProperties}
      >
        {Array.from({ length: slots * TRAIL }, (_, slot) => (
          <span
            // 点是固定的槽位，下标就是身份
            // eslint-disable-next-line react/no-array-index-key
            key={slot}
            ref={(element) => {
              dots.current[slot] = element;
            }}
            className="fc-edge-streak-dot"
            data-head={slot % TRAIL === 0 ? "" : undefined}
          >
            <span style={dotStyle(slot % TRAIL, unit)} />
          </span>
        ))}
      </div>
    </EdgeLabelRenderer>
  );
}
