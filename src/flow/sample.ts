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
        el("phone", "input", { label: "手机号", placeholder: "请输入手机号", hotspot: true, action: "输入手机号", name: "phone", validation: "phone" }),
        el("code", "input", { label: "验证码", placeholder: "6 位验证码", hotspot: true, action: "输入验证码", name: "code" }),
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
  /* ── 医院挂号流程专用模板 ── */
  hospitalHome: {
    name: "医院首页",
    icon: "🏥",
    data: {
      title: "智慧医院",
      elements: [
        el("logo", "logo", { label: "市第一人民医院", sublabel: "三甲 · 在线挂号平台", icon: "sparkle" }),
        el("search", "search", { placeholder: "搜索科室、医生或症状", hotspot: true, action: "搜索" }),
        el("dept1", "list-item", { icon: "heart", label: "心血管内科", sublabel: "12 位专家 · 今日可约", hotspot: true, action: "选择心血管内科" }),
        el("dept2", "list-item", { icon: "bone", label: "骨科", sublabel: "8 位专家 · 今日可约", hotspot: true, action: "选择骨科" }),
        el("dept3", "list-item", { icon: "brain", label: "神经内科", sublabel: "6 位专家 · 明日可约", hotspot: true, action: "选择神经内科" }),
        el("dept4", "list-item", { icon: "eye", label: "眼科", sublabel: "5 位专家 · 今日可约", hotspot: true, action: "选择眼科" }),
        el("tabbar", "tabbar", { hotspot: true, action: "切换 Tab" }),
      ],
    },
  },
  doctorList: {
    name: "医生列表",
    icon: "👨‍⚕️",
    data: {
      title: "心血管内科",
      elements: [
        el("banner", "banner", { label: "今日剩余号源 23 个", sublabel: "号源实时刷新 · 先到先得" }),
        el("doc1", "card", { label: "张明华 主任医师", sublabel: "擅长：冠心病、高血压 · 30年经验", icon: "user", hotspot: true, action: "选择张明华" }),
        el("doc2", "card", { label: "李秀英 副主任医师", sublabel: "擅长：心律失常 · 18年经验", icon: "user", hotspot: true, action: "选择李秀英" }),
        el("doc3", "card", { label: "王建国 主治医师", sublabel: "擅长：心脏康复 · 10年经验", icon: "user", hotspot: true, action: "选择王建国" }),
        el("back", "button", { label: "返回科室", tone: "ghost", hotspot: true, action: "返回" }),
      ],
    },
  },
  registerForm: {
    name: "挂号表单",
    icon: "📝",
    data: {
      title: "填写挂号信息",
      elements: [
        el("doctor", "text", { label: "👨‍⚕️ 张明华 · 心血管内科 · 今日 14:30" }),
        el("name", "input", { label: "患者姓名", placeholder: "请输入真实姓名", hotspot: true, action: "输入姓名", name: "patientName", validation: "required" }),
        el("phone", "input", { label: "联系电话", placeholder: "接收挂号短信", hotspot: true, action: "输入手机号", name: "patientPhone", validation: "phone" }),
        el("idcard", "input", { label: "身份证号", placeholder: "用于实名挂号", hotspot: true, action: "输入身份证号", name: "idCard", validation: "required" }),
        el("symptom", "input", { label: "症状描述", placeholder: "简述您的症状，方便医生提前了解", hotspot: true, action: "描述症状", name: "symptom" }),
        el("submit", "button", { label: "下一步：确认挂号", tone: "primary", hotspot: true, action: "提交挂号信息" }),
        el("back", "button", { label: "返回选医生", tone: "ghost", hotspot: true, action: "返回" }),
      ],
    },
  },
  confirmRegister: {
    name: "确认挂号",
    icon: "📋",
    data: {
      title: "确认挂号信息",
      elements: [
        el("summary", "card", { label: "挂号摘要", sublabel: "心血管内科 · 张明华主任医师", icon: "receipt" }),
        el("info1", "list-item", { icon: "user", label: "患者", sublabel: "以表单填写为准", hotspot: false }),
        el("info2", "list-item", { icon: "card", label: "挂号费", sublabel: "¥ 25.00（医保可报销 80%）" }),
        el("hasInsurance", "toggle", { label: "使用医保卡", hotspot: true, action: "切换医保" }),
        el("confirm", "button", { label: "确认并支付", tone: "primary", hotspot: true, action: "确认支付" }),
        el("back", "button", { label: "返回修改", tone: "ghost", hotspot: true, action: "返回修改" }),
      ],
    },
  },
  payResult: {
    name: "支付结果",
    icon: "💰",
    data: {
      title: "挂号成功",
      elements: [
        el("icon", "logo", { icon: "check", label: "挂号成功", sublabel: "请按时到诊室报到" }),
        el("queue", "text", { label: "您的排队序号：A032" }),
        el("time", "text", { label: "预计就诊时间：14:30 - 15:00" }),
        el("room", "text", { label: "诊室位置：3楼 心血管科 第2诊室" }),
        el("sms", "text", { label: "📱 挂号短信已发送至手机" }),
        el("viewQueue", "button", { label: "查看排队进度", tone: "primary", hotspot: true, action: "查看排队" }),
        el("backHome", "button", { label: "返回首页", tone: "ghost", hotspot: true, action: "返回首页" }),
      ],
    },
  },
  queueView: {
    name: "排队进度",
    icon: "🔢",
    data: {
      title: "排队进度",
      elements: [
        el("current", "banner", { label: "当前叫号：A028", sublabel: "您前方还有 4 人" }),
        el("q1", "list-item", { icon: "check", label: "A028 王**", sublabel: "就诊中" }),
        el("q2", "list-item", { icon: "clock", label: "A029 李**", sublabel: "等待中" }),
        el("q3", "list-item", { icon: "clock", label: "A030 张**", sublabel: "等待中" }),
        el("q4", "list-item", { icon: "clock", label: "A031 陈**", sublabel: "等待中" }),
        el("q5", "list-item", { icon: "star", label: "A032 您", sublabel: "请做好准备" }),
        el("refresh", "button", { label: "刷新进度", tone: "primary", hotspot: true, action: "刷新" }),
        el("back", "button", { label: "返回", tone: "ghost", hotspot: true, action: "返回" }),
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
  /* ── 医院挂号就诊全链路 ──
   * 主路径水平排列（y=100），间距 600px，分支在下方不交叉。
   * 主路径：首页 → 选科室 → 选医生 → 填表 → 确认 → 支付 → 挂号成功 → 排队
   * 条件分支：是否使用医保 → 医保支付 / 自费支付 → 汇合到挂号成功
   * 排队判断：叫到号 → 诊室 / 没叫到 → 继续等
   */
  screen("n-home", 80, 100, "hospitalHome", "智慧医院"),
  screen("n-doctors", 680, 100, "doctorList", "心血管内科"),
  screen("n-form", 1280, 100, "registerForm", "填写挂号信息"),
  screen("n-confirm", 1880, 100, "confirmRegister", "确认挂号"),
  {
    id: "d-insurance",
    type: "decision",
    position: { x: 1880, y: 820 },
    data: { title: "使用医保？", yes: "医保支付", no: "自费支付" } as unknown as Record<string, unknown>,
  },
  screen("n-pay-medical", 2480, 600, "pay", "医保支付"),
  screen("n-pay-self", 2480, 1040, "pay", "自费支付"),
  screen("n-success", 3080, 100, "payResult", "挂号成功"),
  screen("n-queue", 3680, 100, "queueView", "排队进度"),
  {
    id: "d-queue-status",
    type: "decision",
    position: { x: 3680, y: 820 },
    data: { title: "叫到号了？", yes: "进入诊室", no: "继续等待" } as unknown as Record<string, unknown>,
  },
  screen("n-clinic", 4280, 600, "detail", "诊室报到"),
  {
    id: "a-send-sms",
    type: "action",
    position: { x: 3080, y: 820 },
    data: { title: "发送挂号短信", subtitle: "通知患者就诊时间和诊室" } as unknown as Record<string, unknown>,
  },
  {
    id: "note-insurance",
    type: "note",
    position: { x: 2480, y: 1300 },
    data: {
      title: "医保规则",
      body: "医保患者需绑定社保卡，报销比例 80%；自费患者全额支付，支持微信/支付宝。",
      tone: "info",
      anchor: { nodeId: "d-insurance", side: "bottom", gap: 28 },
    } as unknown as Record<string, unknown>,
  },
];

export const initialEdges: Edge[] = [
  // ── 主路径（水平向右，干净直线） ──
  { id: "e1", source: "n-home", sourceHandle: "dept1", target: "n-doctors", targetHandle: "in", type: "flow", data: { label: "选择心血管内科" } },
  { id: "e2", source: "n-doctors", sourceHandle: "doc1", target: "n-form", targetHandle: "in", type: "flow", data: { label: "选择张明华" } },
  { id: "e3", source: "n-form", sourceHandle: "submit", target: "n-confirm", targetHandle: "in", type: "flow", data: { label: "提交信息" } },
  { id: "e4", source: "n-confirm", sourceHandle: "confirm", target: "d-insurance", targetHandle: "in", type: "flow", data: { label: "确认支付" } },
  // ── 条件分支：医保 / 自费（从判断节点分叉到下方） ──
  { id: "e5", source: "d-insurance", sourceHandle: "yes", target: "n-pay-medical", targetHandle: "in", type: "flow", data: { label: "医保支付" } },
  { id: "e6", source: "d-insurance", sourceHandle: "no", target: "n-pay-self", targetHandle: "in", type: "flow", data: { label: "自费支付" } },
  // ── 两条支付路径汇合到挂号成功（从下方回到主路径） ──
  { id: "e7", source: "n-pay-medical", sourceHandle: "pay", target: "n-success", targetHandle: "in", type: "flow", data: { label: "支付完成" } },
  { id: "e8", source: "n-pay-self", sourceHandle: "pay", target: "n-success", targetHandle: "in", type: "flow", data: { label: "支付完成" } },
  // ── 发送短信 → 进入排队 ──
  { id: "e9", source: "n-success", sourceHandle: "viewQueue", target: "a-send-sms", targetHandle: "in", type: "flow", data: { label: "查看排队" } },
  { id: "e10", source: "a-send-sms", sourceHandle: "out", target: "n-queue", targetHandle: "in", type: "flow", data: { label: "进入排队" } },
  // ── 排队判断 ──
  { id: "e11", source: "n-queue", sourceHandle: "refresh", target: "d-queue-status", targetHandle: "in", type: "flow", data: { label: "刷新进度" } },
  { id: "e12", source: "d-queue-status", sourceHandle: "yes", target: "n-clinic", targetHandle: "in", type: "flow", data: { label: "进入诊室" } },
  { id: "e13", source: "d-queue-status", sourceHandle: "no", target: "n-queue", targetHandle: "in", type: "flow", data: { label: "继续等待" } },
  // ── 返回路径（从右侧回到左侧，走下方避免交叉） ──
  { id: "e14", source: "n-doctors", sourceHandle: "back", target: "n-home", targetHandle: "in", type: "flow", data: { label: "返回科室" } },
  { id: "e15", source: "n-form", sourceHandle: "back", target: "n-doctors", targetHandle: "in", type: "flow", data: { label: "返回选医生" } },
  { id: "e16", source: "n-confirm", sourceHandle: "back", target: "n-form", targetHandle: "in", type: "flow", data: { label: "返回修改" } },
  { id: "e17", source: "n-success", sourceHandle: "backHome", target: "n-home", targetHandle: "in", type: "flow", data: { label: "返回首页" } },
];

export type ScreenNodeData = ScreenData;
export type DecisionNodeData = DecisionData;
export type NoteNodeData = NoteData;
