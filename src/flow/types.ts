export type ElementKind =
  | "logo"
  | "input"
  | "button"
  | "list-item"
  | "card"
  | "search"
  | "tabbar"
  | "text"
  | "toggle"
  | "banner"
  | "chip"
  | "avatar"
  | "divider";

/** 自由排版下元素在界面里的位置（单位：界面本地 px，与画布缩放无关） */
export type ElementBox = {
  x: number;
  y: number;
  w: number;
  h?: number;
};

/** 界面里的一个元素。hotspot=true 表示可以它是交互热点，可以拉出跳转连线。 */
export type ScreenElement = {
  id: string;
  kind: ElementKind;
  label?: string;
  sublabel?: string;
  placeholder?: string;
  tone?: "primary" | "ghost" | "danger";
  icon?: string;
  hotspot?: boolean;
  /** 点击行为描述，用于自动生成连线文案，例如「登录」「项目卡片」 */
  action?: string;
  /** 有 box 且界面 layout=free 时按绝对坐标渲染 */
  box?: ElementBox;
};

export type ScreenData = {
  title: string;
  subtitle?: string;
  platform?: "mobile";
  theme?: "light" | "dark";
  /** stack=模板自动竖排（默认）；free=元素绝对定位，可拖拽排版 */
  layout?: "stack" | "free";
  elements: ScreenElement[];
};

export type ScreenTemplate = {
  id?: string;
  name: string;
  icon: string;
  data: ScreenData;
};

export type DecisionData = {
  title: string;
  yes?: string;
  no?: string;
};

export type NoteAnchorSide = "right" | "bottom";

/** 让备注始终解释某张界面；目标移动时按此关系重算位置。 */
export type NoteAnchor = {
  nodeId: string;
  side?: NoteAnchorSide;
  gap?: number;
};

export type NoteData = {
  title: string;
  body?: string;
  tone?: "note" | "warning" | "success";
  anchor?: NoteAnchor;
};

export const HOTSPOT_IN = "in";
