import type { Edge, Node } from "@xyflow/react";
import type { DecisionData, NoteData, ScreenData, ScreenTemplate } from "./types";

const el = (
  id: string,
  kind: ScreenData["elements"][number]["kind"],
  props: Partial<ScreenData["elements"][number]> = {},
) => ({ id, kind, ...props });

/** 预置界面模板：拖到画布即可得到一张「能点」的高保真界面。 */
export const screenTemplates: Record<string, ScreenTemplate> = {
  login: {
    name: "登录页",
    icon: "🔐",
    data: {
      title: "登录",
      elements: [
        el("logo", "logo", { label: "FlowCraft", sublabel: "把交互画成真实界面", icon: "sparkle" }),
        el("phone", "input", { label: "手机号", placeholder: "请输入手机号", hotspot: true, action: "输入手机号" }),
        el("code", "input", { label: "验证码", placeholder: "6 位验证码", hotspot: true, action: "输入验证码" }),
        el("send", "button", { label: "获取验证码", tone: "ghost", hotspot: true, action: "获取验证码" }),
        el("submit", "button", { label: "登录", tone: "primary", hotspot: true, action: "登录" }),
        el("wechat", "button", { label: "微信一键登录", tone: "ghost", hotspot: true, action: "微信登录" }),
        el("tip", "text", { label: "登录即代表同意《用户协议》与《隐私政策》" }),
      ],
    },
  },
  home: {
    name: "列表页",
    icon: "🗂️",
    data: {
      title: "工作台",
      elements: [
        el("search", "search", { placeholder: "搜索项目、模板或成员", hotspot: true, action: "搜索" }),
        el("banner", "banner", { label: "本周新增 12 个流程", sublabel: "查看团队设计规范 →", hotspot: true, action: "查看规范" }),
        el("row1", "list-item", { icon: "phone", label: "点单小程序", sublabel: "12 个界面 · 3 人协作", hotspot: true, action: "打开点单小程序" }),
        el("row2", "list-item", { icon: "receipt", label: "后台结算台", sublabel: "8 个界面 · 1 人协作", hotspot: true, action: "打开后台结算台" }),
        el("row3", "list-item", { icon: "headset", label: "客服工作台", sublabel: "草稿", hotspot: true, action: "打开客服工作台" }),
        el("tabbar", "tabbar", { hotspot: true, action: "切换 Tab" }),
      ],
    },
  },
  detail: {
    name: "详情页",
    icon: "🧩",
    data: {
      title: "项目详情",
      elements: [
        el("card", "card", { label: "点单小程序 V2", sublabel: "最后更新 2 小时前", icon: "image", hotspot: true, action: "查看项目" }),
        el("desc", "text", { label: "覆盖堂食点单、加料、支付与新品尝鲜四条主链路，共 12 个界面。" }),
        el("member", "list-item", { icon: "users", label: "协作成员", sublabel: "3 人", hotspot: true, action: "管理成员" }),
        el("publish", "button", { label: "发布流程给团队", tone: "primary", hotspot: true, action: "发布流程" }),
        el("back", "button", { label: "返回工作台", tone: "ghost", hotspot: true, action: "返回" }),
      ],
    },
  },
  settings: {
    name: "设置页",
    icon: "⚙️",
    data: {
      title: "设置",
      elements: [
        el("avatar", "avatar", { label: "王小明", sublabel: "产品设计师" }),
        el("notify", "toggle", { label: "消息通知", hotspot: true, action: "切换通知" }),
        el("dark", "toggle", { label: "深色模式", hotspot: true, action: "切换主题" }),
        el("about", "list-item", { icon: "info", label: "关于我们", sublabel: "v1.0.0", hotspot: true, action: "查看关于" }),
        el("logout", "button", { label: "退出登录", tone: "danger", hotspot: true, action: "退出登录" }),
      ],
    },
  },
  pay: {
    name: "支付弹窗",
    icon: "💳",
    data: {
      title: "确认支付",
      elements: [
        el("amount", "text", { label: "¥ 128.00" }),
        el("method", "list-item", { icon: "card", label: "微信支付", sublabel: "默认", hotspot: true, action: "选择支付方式" }),
        el("pay", "button", { label: "立即支付", tone: "primary", hotspot: true, action: "支付" }),
        el("cancel", "button", { label: "取消", tone: "ghost", hotspot: true, action: "取消" }),
      ],
    },
  },
  success: {
    name: "成功页",
    icon: "✅",
    data: {
      title: "支付成功",
      elements: [
        el("icon", "logo", { icon: "check", label: "支付成功", sublabel: "订单号 20261031-0042" }),
        el("back", "button", { label: "返回工作台", tone: "primary", hotspot: true, action: "返回" }),
      ],
    },
  },
};

const screen = (id: string, x: number, y: number, tplKey: string, title?: string): Node => {
  const tpl = screenTemplates[tplKey];
  const data: ScreenData = { ...tpl.data, title: title ?? tpl.data.title };
  return {
    id,
    type: "screen",
    position: { x, y },
    data: data as unknown as Record<string, unknown>,
    style: { width: 320 },
  };
};

export const initialNodes: Node[] = [
  // 电商支付全链路示例：6 列主路径 + 下方异常/售后闭环。
  // 横向宽度控制在约 6 列，最后一条回边在售后区域内闭环。
  screen("n-home", 80, 180, "home", "商品工作台"),
  screen("n-login", 680, 180, "login", "账号登录"),
  screen("n-detail", 1280, 180, "detail", "商品详情"),
  screen("n-settings", 1280, 820, "settings", "收货信息"),
  screen("n-pay", 1880, 180, "pay", "确认订单"),
  screen("n-success", 2480, 180, "success", "支付成功"),
  screen("n-detail-2", 2480, 820, "detail", "订单追踪"),
  screen("n-settings-2", 1880, 820, "settings", "售后退款"),
  {
    id: "d-need-login",
    type: "decision",
    position: { x: 680, y: 820 },
    data: { title: "需要登录？", yes: "是", no: "否" } as unknown as Record<string, unknown>,
  },
  {
    id: "d-pay-result",
    type: "decision",
    position: { x: 2480, y: 620 },
    data: { title: "支付成功？", yes: "是", no: "否" } as unknown as Record<string, unknown>,
  },
  {
    id: "a-timeout",
    type: "action",
    position: { x: 1880, y: 500 },
    data: { title: "支付超时", subtitle: "关闭订单并提示重新下单" } as unknown as Record<string, unknown>,
  },
  {
    id: "note-1",
    type: "note",
    position: { x: 2860, y: 620 },
    data: {
      title: "支付回调",
      body: "支付结果由服务端回调确认；超时或取消时回到商品详情，不生成成功订单。",
      tone: "warning",
      anchor: { nodeId: "d-pay-result", side: "bottom", gap: 28 },
    } as unknown as Record<string, unknown>,
  },
];
// 连线：真实业务链路覆盖正常支付、异常回退与售后闭环。
export const initialEdges: Edge[] = [
  { id: "e1", source: "n-home", sourceHandle: "row1", target: "n-login", targetHandle: "in", type: "flow", data: { label: "点击商品" } },
  { id: "e2", source: "n-login", sourceHandle: "submit", target: "d-need-login", targetHandle: "in", type: "flow", data: { label: "登录" } },
  { id: "e3", source: "d-need-login", sourceHandle: "yes", target: "n-detail", targetHandle: "in", type: "flow", data: { label: "是" } },
  { id: "e4", source: "d-need-login", sourceHandle: "no", target: "n-detail", targetHandle: "in", type: "flow", data: { label: "游客浏览" } },
  { id: "e5", source: "n-detail", sourceHandle: "publish", target: "n-pay", targetHandle: "in", type: "flow", data: { label: "立即购买" } },
  { id: "e6", source: "n-detail", sourceHandle: "member", target: "n-settings", targetHandle: "in", type: "flow", data: { label: "修改收货信息" } },
  { id: "e7", source: "n-pay", sourceHandle: "pay", target: "d-pay-result", targetHandle: "in", type: "flow", data: { label: "提交支付" } },
  { id: "e8", source: "d-pay-result", sourceHandle: "yes", target: "n-success", targetHandle: "in", type: "flow", data: { label: "是" } },
  { id: "e9", source: "d-pay-result", sourceHandle: "no", target: "n-detail", targetHandle: "in", type: "flow", data: { label: "否，返回" } },
  { id: "e10", source: "n-pay", sourceHandle: "cancel", target: "a-timeout", targetHandle: "in", type: "flow", data: { label: "支付超时" } },
  { id: "e11", source: "a-timeout", sourceHandle: "out", target: "n-detail", targetHandle: "in", type: "flow", data: { label: "重试下单" } },
  { id: "e12", source: "n-success", sourceHandle: "back", target: "n-detail-2", targetHandle: "in", type: "flow", data: { label: "查看订单" } },
  { id: "e13", source: "n-detail-2", sourceHandle: "member", target: "n-settings-2", targetHandle: "in", type: "flow", data: { label: "申请售后" } },
  { id: "e14", source: "n-settings-2", sourceHandle: "logout", target: "n-detail-2", targetHandle: "in", type: "flow", data: { label: "退款完成，返回订单" } },
];

export type ScreenNodeData = ScreenData;
export type DecisionNodeData = DecisionData;
export type NoteNodeData = NoteData;
