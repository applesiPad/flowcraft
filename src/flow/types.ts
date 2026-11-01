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
  /** 输入型元素的变量名：原型预览 / 导出播放器收集输入值时作为条件变量 key */
  name?: string;
  /** 输入校验规则（仅 input 元素在原型里生效）：任何规则都要求非空 */
  validation?: InputValidation;
  /** 有 box 且界面 layout=free 时按绝对坐标渲染 */
  box?: ElementBox;
};

/** 输入校验规则：required 必填 / phone 11 位手机号 / number 数字 */
export type InputValidation = "required" | "phone" | "number";

/** 原型条件：变量名 + 比较符 + 期望值。变量未配置时判断节点走默认「是」分支。 */
export type ConditionSpec = {
  variable: string;
  op: ">=" | ">" | "<=" | "<" | "==" | "!=" | "empty" | "notEmpty";
  value?: string;
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
  /** 原型预览 / 导出播放器评估的条件；缺省走默认「是」分支 */
  condition?: ConditionSpec | null;
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
