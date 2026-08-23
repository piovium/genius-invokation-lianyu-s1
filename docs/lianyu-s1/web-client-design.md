# 恋雨杯 S1 Web 前端设计文档

> 对应需求：[requirements.md](./requirements.md)  
> 后端契约：[server-design.md](./server-design.md)

## 1. 目标与范围

本文描述 `packages/web-client` 的赛事前端改造。设计继续使用 SolidJS、`@solidjs/router`、Axios、UnoCSS/Una UI、现有牌组编辑器和棋盘组件，不引入新的全局状态库。

改造范围包括：

- 用 QQ 注册、密码/Passkey 登录替换 GitHub OAuth；
- 注册时的群成员校验、注册码帮助和游客牌组自动上传；
- 报名入口、候补反馈、“我的比赛”和赛事对局确认；
- 比赛牌组分组、设置、锁定和耗尽状态；
- 管理员参赛管理、批量场次创建、盘次/对局介入；
- 排名筛选预览、业务 metrics 和场次 JSON 导出；
- 管理员绕过普通房间可见性/观战限制后的入口展示。

现有普通房间创建、加入房间、SSE 对局页、游客本地资料和本地牌组能力继续保留。

## 2. 设计原则

1. 用户看到的禁用状态必须解释原因，例如“场次已进入进行中，比赛牌组已锁定”，不能只灰掉按钮。
2. 所有阶段、权限和牌组限制以后端响应为准；前端本地校验用于提前反馈。
3. 普通房间和赛事房间复用同一棋盘页；赛事只增加一个锁定配置的确认入口。
4. 管理员高风险操作使用明确的二次确认、原因字段和结果摘要。
5. 状态不仅用颜色表达，同时显示文字、图标或 badge，保证可访问性。
6. 新页面保持移动端可用；复杂的批量编排以桌面端为主要场景，但移动端不能出现不可操作区域。
7. API 分支依赖稳定的业务错误 `code`，不解析服务端 message 文本。

## 3. 信息架构与路由

### 3.1 用户路由

| 路由                     | 页面                             | 访问条件                  |
| ------------------------ | -------------------------------- | ------------------------- |
| `/`                      | 首页：登录、报名、我的比赛、房间 | 所有人                    |
| `/login`                 | QQ 密码/Passkey登录、游客入口    | 未登录                    |
| `/register`              | QQ 注册                          | 未登录                    |
| `/user/:id`              | 用户资料                         | 已登录/游客自己的本地资料 |
| `/decks`                 | 我的牌组及比赛牌组               | 已登录或游客模式          |
| `/decks/:id`             | 新建/编辑牌组                    | 已登录或游客模式          |
| `/competition/games/:id` | 赛事对局确认                     | 该局参赛选手              |
| `/rooms/:code`           | 现有棋盘页                       | 玩家或获准观战者          |

`/register` 接收 `qq`、`code`、`name` search params，只用于预填普通文本字段；不得从 URL 接收密码、Passkey 数据或登录 token。

### 3.2 管理员路由

| 路由                 | 页面                     |
| -------------------- | ------------------------ |
| `/admin`             | 管理首页和异常摘要       |
| `/admin/users`       | 报名/参赛管理            |
| `/admin/events`      | 场次列表                 |
| `/admin/events/new`  | 创建场次与盘次           |
| `/admin/events/:id`  | 场次详情、步进、导出     |
| `/admin/matches/:id` | 盘次、对局和比赛牌组管理 |
| `/admin/statistics`  | 卡牌、组合、用户业务统计 |
| `/admin/audit-logs`  | 审计记录                 |

`AdminRoute` 在渲染前检查 `auth.user.role === "ADMIN"`。前端守卫只避免误入，后端仍独立鉴权。管理员使用与普通用户相同的 QQ 登录页，不提供特殊登录表单。

### 3.3 导航

Header 调整为：

- 左侧保留 Logo/首页；
- 已登录用户显示“我的牌组”；
- 管理员额外显示“赛事管理”；
- 右侧保留语言、QQ 头像、资料和退出；
- 游客仍显示本地头像，但文案明确标记“游客”。

移动端将新增入口收进可键盘操作的菜单，不在 Header 中横向堆叠所有链接。

## 4. 前端分层

建议目录：

```text
src/
  api/
    client.ts
    auth.ts
    decks.ts
    competition.ts
    admin.ts
    statistics.ts
    errors.ts
  auth/
    AuthProvider.tsx
    passkey.ts
    route-guards.tsx
  competition/
    models.ts
    CompetitionStatusBadge.tsx
    MyMatches.tsx
    TournamentGameCard.tsx
  admin/
    AdminLayout.tsx
    PlayerPairingEditor.tsx
    RankingPreview.tsx
    InterventionDialog.tsx
  pages/
    ...现有页面
    Login.tsx
    Register.tsx
    TournamentGame.tsx
    admin/...
```

职责划分：

- `api/*` 只负责请求、响应类型和问题响应归一化；
- Provider/页面负责资源生命周期和刷新；
- 纯组件通过 props 接收数据，不在列表项内部隐式重复请求；
- 跨端 DTO 优先从 `@gi-tcg/typings` 导入，页面专用 view model 留在 web-client。

## 5. 核心前端状态

### 5.1 Auth 状态

将当前模块级 `useAuth()` 重构为单一 `AuthProvider`，状态为判别联合：

```ts
type AuthState =
  | { type: "loading" }
  | { type: "anonymous" }
  | { type: "guest"; guest: GuestInfo }
  | { type: "user"; user: UserInfo };

interface UserInfo {
  id: number;
  qq: string;
  name: string;
  avatarUrl: string;
  role: "USER" | "ADMIN";
  competitionStatus: "NONE" | "REGISTERED" | "PLAYER";
  appliedAt: string | null;
  queuePosition: number | null;
  waitlisted: boolean;
  activeMatchId: number | null;
  chessboardColor: string | null;
}
```

Provider 提供 `loginWithPassword`、`loginWithPasskey`、`completeRegistration`、`refresh`、`enterGuestMode` 和 `logout`。任何正式登录或注册成功都先清除本地 `guestInfo`，避免当前实现中 guest 状态优先遮蔽已登录用户。

Access token 沿用 `localStorage` 和 Axios Bearer interceptor。收到正式用户 token 后覆盖可能存在的游客 token。退出时清除 token 和内存 User；是否回到游客模式由用户重新选择，不自动恢复旧游客身份。

### 5.2 赛事上下文

首页分别加载：

- `GET /registration/settings`；
- `GET /users/me`；
- 对 `PLAYER` 加载 `GET /users/me/matches?active=true`；
- 现有 `GET /rooms/current` 和 `GET /rooms`。

牌组列表响应中的 `competitionContext` 作为当前比赛牌组的唯一上下文，不由页面用用户状态自行猜测阶段和限制。

### 5.3 刷新策略

- 房间列表沿用 10 秒轮询；
- “我的比赛”在页面可见时每 5 秒刷新，用于覆盖内存 `runtimeStatus`；
- 管理员盘次页在有 `PENDING/PLAYING` 对局时每 3 秒刷新，否则停止轮询；
- 报名设置、牌组和场次详情在 mutation 成功后主动 refetch；
- `document.visibilityState !== "visible"` 时暂停业务轮询；
- 所有可重入请求使用 AbortController 或请求序号，避免旧响应覆盖新筛选条件。

首版不为管理面板增加 WebSocket/SSE；棋盘对局的 SSE 链路保持不变。

## 6. API 客户端与错误处理

### 6.1 客户端封装

保留全局 Axios `baseURL`，增加统一的 `ApiProblem`：

```ts
interface ApiProblem {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}
```

`toApiProblem(error)` 处理 Axios 错误、网络错误和未知错误。业务组件根据 `code` 显示 i18n 文案，开发环境可附上 message；不再在每个组件里重复 `instanceof AxiosError`。

建议提供领域函数而不是在 JSX 中拼 URL，例如：

```ts
checkRegistrationQq(qq);
registerWithPassword(payload);
setCompetitionDeck(deckId);
getMyMatches();
createTournamentEvent(draft);
interveneGame(gameId, input);
```

### 6.2 401/403

- 正式用户接口返回 401 时清除正式 token，保存当前 URL 到 `redirect`，跳转登录；
- 游客房间 token 失效时不误跳 QQ 登录，显示“游客会话已失效”并回首页；
- 403 `ADMIN_REQUIRED` 显示无权限页；
- 403 `QQ_NOT_IN_GROUP` 在注册/报名流程内就地显示，不使用全局 toast。

### 6.3 Mutation 反馈

- 按钮提交期间禁用并显示 loading；
- 成功后更新/刷新资源，再显示简短结果；
- 失败保留表单输入和选中项；
- 批量接口按返回项展示成功数、失败数和失败原因，可一键只重选失败项；
- 不用 `window.alert` 承担复杂流程，新增统一的 inline alert、toast 和确认 dialog。现有简单错误可逐步迁移。

## 7. 注册与登录

### 7.1 注册页

注册表单分三步，但保持在同一路由，避免长表单一次展示：

#### 第一步：验证 QQ

- QQ 输入框从 `searchParams.qq` 预填；
- 点击“验证群成员”调用 `POST /auth/registration/qq-check`；
- 成功后锁定已验证 QQ、预填群昵称，并解锁后续字段；
- 修改 QQ 会清除验证结果和后续敏感状态；
- 不在群时显示加群入口，不暴露其它成员信息；
- Bot 服务不可用时显示可重试状态，不误报“不在群”。

#### 第二步：填写资料

- 注册码从 `searchParams.code` 预填；
- 昵称优先使用 `searchParams.name`，否则使用群昵称，仍可编辑；
- 认证方式切换为“密码”或“Passkey”；
- 密码方式显示密码/确认密码，前端校验一致和最小长度；
- 报名 checkbox 默认值为首次加载时 `opensAt <= now < cutoffAt`，用户可取消；
- “我已知晓比赛需在模拟器进行”默认不勾选且必选；未勾选提交时聚焦该项并显示提示。

注册码字段旁提供“如何获取”按钮，打开帮助 dialog：

- 展示 `qq_group.png`；
- 展示并可复制加群链接；
- 明确提示“入群后向 Bot 发起私聊获取注册码”；
- 图片有替代文本，链接可由键盘访问。

#### 第三步：创建认证凭据

- 密码方式直接调用 `POST /auth/register/password`；
- Passkey 方式调用 options 接口，使用 `navigator.credentials.create()`，再调用 verify；
- 浏览器不支持 WebAuthn 或非安全上下文时禁用 Passkey，并提示改用密码；
- 用户取消系统 Passkey 弹窗时保留表单，可再次尝试。

注册成功响应包含报名结果。如果 `waitlisted=true`，成功页醒目显示：

> 当前报名人数已满，您还可继续候补但不保证参赛。

这不是注册失败，不能用错误样式或阻止进入首页。

### 7.2 游客牌组自动上传

注册开始前先读取当前 localStorage 中的游客牌组快照。正式 token 设置并刷新用户后：

1. 清除游客身份，但暂不清除游客牌组；
2. 调用 `POST /decks/import`，每项携带稳定的 `clientImportKey`；
3. 成功项从 localStorage 移除，失败项保留；
4. 全部成功则进入首页；部分失败则展示名称和原因，并允许“稍后重试”或“继续进入”。

刷新页面后重复提交不会生成重复牌组，由后端幂等键保证。登录已有账号时不自动上传，避免把共享设备中的游客数据误并入账号；自动上传只发生在注册成功流程。

### 7.3 登录页

登录卡片包括：

- QQ 输入框；
- 密码登录；
- “使用 Passkey”按钮，仍先提供 QQ；
- “注册账号”链接，保留 redirect；
- 分隔后的游客昵称入口。

Passkey 流程使用 `navigator.credentials.get()`。密码/Passkey错误统一显示“QQ 或凭据不正确”，不提示账号是否存在。管理员使用相同入口，登录后根据 role 显示管理导航。

移除以下旧逻辑：

- GitHub popup、`window.message` 登录回调；
- `GITHUB_AUTH_REDIRECT_URL` 和固定 GitHub Client ID；
- GitHub 头像 URL 与“推荐 GitHub 登录”文案。

## 8. 用户资料

正式用户资料页显示昵称、QQ、报名/参赛状态和实时 QQ 头像。只有昵称和棋盘颜色可编辑：

- 注册用户不显示头像选择器或头像 URL 输入；
- 头像函数统一为 `getQqAvatarUrl(qq)`，玩家接口若直接给 `avatarUrl` 则优先使用；
- 游客仍可使用现有本地随机头像/头像选择能力；
- 昵称更新成功后刷新 AuthProvider，使 Header、房间和资料页一致。

删除 `login`（GitHub username）依赖，所有显示名统一使用 `name`。

## 9. 首页、报名和“我的比赛”

### 9.1 首页排列

正式用户首页从上到下为：

1. 欢迎和报名 CTA；
2. `PLAYER` 的“我的比赛”；
3. 创建/加入普通房间；
4. 公开房间列表；
5. 牌组快捷区域。

报名 CTA 必须位于创建房间控件上方且视觉突出：

- `competitionStatus=NONE` 且报名开放：显示“报名参赛”；
- 截止后：显示截止时间和“报名已结束”，按钮禁用；
- `REGISTERED`：显示报名时间、当前名次/候补状态和“取消报名”；
- `PLAYER`：显示参赛选手 badge 和“退赛”；
- 游客/匿名用户：不显示可直接调用报名的按钮，可显示“注册后报名”的引导。

点击报名无需额外表单，直接调用 `POST /users/me/registration`。成功后根据响应显示正常报名或候补提示。取消/退赛使用确认 dialog；`USER_IN_RUNNING_GAME` 时提示先完成对局或联系管理员。

### 9.2 我的比赛

每个 `MyMatchCard` 展示：

- 所属场次名称和阶段；
- 对手昵称；轮空时显示“轮空”；
- 预计开始/结束时间，按浏览器时区格式化，并在 title 中保留完整时间；
- 模式、目标局数/胜局数和当前盘分；
- 该盘全部对局，按创建时间升序；
- 盘次赢家/完成状态。

赛事对局卡片与普通房间卡片使用不同边框和“赛事”badge，但不只依赖颜色。状态：

- `PENDING + runtimeStatus=null/WAITING`：未开始，可点击；
- `PENDING + runtimeStatus=PLAYING`：进行中，本方可重连；
- `PENDING + runtimeStatus=FINALIZING`：结算中，不显示进入按钮；
- `FINISHED`：显示原始结果；若存在管理员结果，再单独显示“裁定结果”；
- 非本方、已结束或条件不允许时不可进入。

点击可进入的卡片跳转 `/competition/games/:id`，不直接猜测四位房间码。

## 10. 牌组管理

### 10.1 牌组列表

`GET /decks` 返回的牌组按以下分区：

1. 当前比赛牌组；
2. 已耗尽比赛牌组（仅场次进行中时显示）；
3. 其它牌组。

比赛牌组卡片显示：场次名、盘次对手、可用/已耗尽状态、角色组合和锁定原因。建议使用紫/金色强调，普通牌组保持现有样式。已耗尽项保留在比赛分区便于用户理解本盘可用资源，但不能在进入对局时选择。

收集阶段：

- 普通牌组卡片提供“设为比赛牌组”；
- 比赛牌组提供“取消设置”；
- 显示 `已选择 n / 上限 m`；上限 0 显示“不限”；
- 达到上限时禁用其它设置按钮并显示原因；
- 相同角色组合由前端提前检测并标记，但仍提交后端作为最终判定。

进行中/结束阶段：

- 不显示可执行的设置/取消按钮；
- 比赛牌组显示锁图标和阶段说明；
- 场次结束后历史关联不再分区展示，用户牌组恢复为普通牌组。

### 10.2 编辑页

打开比赛牌组时读取服务端返回的 `competition` 元数据：

- `DECK_COLLECTION`：允许改名、行动牌和角色顺序；角色增删被锁定；
- 其它阶段：整个比赛牌组只读，不允许保存、导入或删除；仍允许导出分享码；
- 非比赛牌组保持现有完整编辑能力。

为了允许角色换序但禁止增删，可给 `@gi-tcg/deck-builder` 增加 `lockedCharacterSet`/`readOnlyCharacters` 能力，或在 `onChangeDeck` 中比较排序后的角色键并拒绝变化。即使前端漏拦，后端 `COMPETITION_DECK_LOCKED` 或 `DUPLICATE_CHARACTER_SET` 也会阻止保存。

若用户确实想更换角色，页面显示“请先取消比赛牌组，再新建或选择牌组”的直接指引。

### 10.3 卡片操作一致性

现有删除、置顶、编辑入口集中到 `DeckBriefInfo` 的 action 区：

- 比赛牌组锁定时隐藏删除并显示原因 tooltip；
- 删除一个收集阶段比赛牌组前提示该操作也会取消比赛设置；
- mutation 成功后统一刷新列表和首页快捷牌组，避免局部状态不同步。

## 11. 赛事对局确认页

`/competition/games/:id` 调用 `GET /tournament-games/:id/join-options`，展示与 `RoomDialog` 相同的布局，但：

- 场次、盘次、对手、局号放在顶部；
- 模拟器版本、对局版本、时间配置、公开性、观战和先后手全部只读；
- 页面不显示任何可修改配置的控件，或使用 disabled + 明确锁定说明；
- 唯一可操作字段为牌组选择；
- 无限制模式列出所有合法用户牌组；
- 决斗/征服模式只列出本盘 `usable=true` 的比赛牌组，并显示已耗尽项但不可选；
- 无可用牌组时禁用“进入比赛”，提示联系管理员，不显示自动判负文案。

提交 `POST /tournament-games/:id/join { deckId }` 后，使用返回的 `roomId/playerId` 跳转现有 `/rooms/:code?player=...&action=1`。重复点击或刷新必须幂等进入同一内存 Room；按钮提交期间禁用，防止并发请求。

建议把现有 `RoomDialog` 拆为：

- `RoomConfigView`：配置字段，可通过 `readOnly` 控制；
- `DeckSelector`：统一牌组卡片选择；
- `RoomEntryActions`：普通创建/加入；
- `TournamentGameEntry`：赛事固定入口。

这样保留视觉一致性，又不会在一个组件中继续堆叠普通房间和赛事分支。

普通房间中的对局版本也改为只读展示服务器外部配置所确定的版本，不再把 `gameVersion` 放入创建房间请求；时间、公开性、观战等其它普通房间配置保持现状。

## 12. 管理员：参赛管理

### 12.1 用户列表

`/admin/users` 使用服务端分页，列包括：

- checkbox、昵称、QQ、注册时间；
- 报名状态、报名时间、候补名次；
- 当前活跃场次/盘次；
- 是否正在内存对局中。

顶部提供状态筛选和报名时间升/降序。批量操作：设为参赛选手、取消报名、强制退赛。

交互要求：

- 当前页全选与“选择筛选结果”分开，首版只实现当前页全选，避免误操作大量用户；
- 取消报名/强制退赛必须填写原因并二次确认；
- 进行中用户在行内标记，提交后按服务端失败项保留选择；
- 成功结果显示审计已记录，不需要前端构造审计内容。

### 12.2 报名设置

同页侧栏/顶部卡片编辑报名开始时间、截止时间和限额：

- `datetime-local` 在提交时转换为 UTC ISO；
- 两端都填写时，开始时间必须早于截止时间；
- 同时展示浏览器本地时区；
- 限额 0 显示“不限”；
- 保存前预览当前正式范围与候补人数；
- 修改限额不会自动更改用户状态，只会重新计算候补标记。

## 13. 管理员：创建场次

### 13.1 页面结构

页面分三块：

1. 场次与盘次模板；
2. 上方玩家 0 / 玩家 1 两列；
3. 下方候选参赛选手表。

模板字段包括名称、初始阶段、牌组上限、总局数、胜局数、预计时间、模式、房间配置和自动创建开关。表单即时校验 `maxGames >= winsRequired >= 1`。

### 13.2 两侧玩家列表

`PlayerPairingEditor` 本地维护：

```ts
interface PairingDraft {
  player0Ids: number[];
  player1Ids: number[];
}
```

每列提供：

- 洗牌：使用 Fisher–Yates，只改变当前列；
- 倒序；
- 每名玩家的上移、下移、移除；
- 从一侧移到另一侧；
- 当前序号。

两列按索引以横向连线/同一行预览配对，末尾空位明确显示“轮空”，让管理员在提交前看到实际盘次。拖拽排序可作为增强，但上/下按钮是必须能力，保证触屏和键盘可用。

### 13.3 候选列表和排名预览

候选 API 只返回 `PLAYER` 且未处于活跃场次的用户。表格支持：

- 单选、多选、当前筛选结果全选；
- 一键加入玩家 0 或玩家 1；
- 每行单独加入某侧；
- 已在任一上方列表的用户禁用并标注所在侧；
- 昵称/QQ 搜索。

选择多个历史场次后调用 `POST /admin/rankings/preview`。表格显示：

- 参与盘数、获胜盘数；
- 小分和小小分小数；
- hover/展开显示分子、分母和对手明细；
- 后端返回的稳定排序，不在浏览器重新计算规则。

补充文档规定只保留参与盘数大于 0 的选手。清空历史场次筛选后恢复全部候选参赛选手的默认列表。

### 13.4 提交

提交前展示确认摘要：场次阶段、盘次数、双人盘数、轮空盘数、选手总数和牌组限制。调用 `POST /admin/events` 时直接发送两侧有序 ID 数组。

创建、编辑和步进场次等正常管理流程不要求填写审计原因；审计记录仍由服务端自动生成。

若后端返回 `USER_ALREADY_IN_ACTIVE_EVENT`，根据 `details.userIds` 高亮已失效选择，并保留其它草稿；管理员修正后可再次提交。成功后跳转场次详情。

## 14. 管理员：场次与盘次

### 14.1 场次详情

`/admin/events/:id` 显示：

- 场次元信息和阶段 stepper；
- 盘次完成数、进行数、异常数；
- 盘次列表（双方、日程、比分、赢家、开放对局）；
- 允许阶段内的编辑字段；
- “步进阶段”和“导出 JSON”。

步进到进行中前确认：比赛牌组将固化、符合条件的盘次会自动开第一局。结束场次前确认：正在运行的对局将被中止、未开始局将关闭、比赛牌组将清除。确认框列出受影响数量。

编辑、步进场次以及编辑盘次、手动创建新局、轮空胜利等正常流程不展示审计原因输入框。

导出使用 Blob 下载服务端响应，不在前端重新拼装，也不下载 State Log。

### 14.2 盘次管理

`/admin/matches/:id` 顶部显示双方选手、是否退赛、模式、局数/胜局数、当前比分、赢家和自动创建状态。其下按局号列出：

- 数据库状态和内存运行态；
- 每局先后手、所用牌组、原始赢家、裁定赢家；
- 结束原因、是否计入统计、State Log 下载权限；
- 管理员介入入口。

操作区域根据后端能力字段 `allowedActions` 控制：

- 手动创建新局；
- 单人盘自动胜利；
- 显式开/关自动创建；
- 设置/清空盘次赢家；
- 为选手指定比赛牌组。

不要在前端复制复杂条件判断。详情响应返回 `allowedActions` 和不可用原因，按钮据此显示。

### 14.3 管理员介入 dialog

对局介入表单允许：

- 目标状态 `PENDING/FINISHED`；
- 手动赢家 0/1/空；
- 是否计入统计；
- 必填原因。

若对局正在进行，确认文本明确说明“将立即中止双方当前游戏”。提交成功后提示：

- 本盘自动创建已关闭；
- 已耗尽牌组不会恢复；
- 其它已创建对局不会自动终止。

盘次赢家使用独立 dialog，避免用户误以为改盘次赢家会同步改每局原始结果。

### 14.4 管理员指定比赛牌组

从该用户当前牌组中多选，实时展示角色组合重复和上限。进行中场次新增的牌组标记“管理员指定”，提交必须填写原因。成功后刷新双方比赛牌组和对局可选牌组。

## 15. 管理员：业务统计

`/admin/statistics` 顶部固定数据源筛选：全部、比赛对局、普通对局。切换后所有 tab 同步刷新。

### 15.1 卡牌与组合 tab

分为角色牌、行动牌、三角色组合三个子 tab，列出：

- 图片/名称；
- 出场数、出场率；
- 胜场、胜率；
- 三角色组合额外显示外战场数、外战胜率。

表头 tooltip 说明“出场率分母为 2×对局数”“胜负按模拟器原始赢家”。页面顶部显示样本对局数和被排除的不计统计局数，避免误读。

### 15.2 用户 tab

用户表显示昵称、QQ、对局数、胜场、胜率。展开行显示所有使用过的去重牌组、使用次数和角色头像。分页、排序由后端执行；牌组详情按行展开时再渲染，避免首屏大量图片。

### 15.3 数据口径提示

页面常驻提示：

> 本页按对局原始赢家统计，并排除“不计入统计”的对局；排名和小分按盘次赢家计算，管理员裁定可能使二者不同。

## 16. 房间列表与观战

普通用户沿用原过滤结果。管理员从 `GET /rooms` 得到额外的 private、禁止游客或不可观战房间时：

- 卡片显示 `私密`、`禁止观战` 等原始配置 badge；
- 管理员仍显示“以管理员身份观战”；
- 跳转继续使用现有 Room 页，但不设置玩家 action 参数；
- 管理员只获得观察能力，不显示玩家行动按钮。

赛事进行中房间优先从盘次页进入，普通首页公开房间列表中的显示与否以后端返回为准。

## 17. 组件与视觉状态

新增或拆分的主要组件：

| 组件                     | 职责                        |
| ------------------------ | --------------------------- |
| `RegistrationBanner`     | 首页报名、候补、取消/退赛   |
| `MyMatches`              | 活跃盘次列表与刷新          |
| `TournamentGameCard`     | 赛事对局状态和入口          |
| `CompetitionDeckSection` | 比赛/耗尽/普通牌组分区      |
| `CompetitionStatusBadge` | NONE/REGISTERED/PLAYER/候补 |
| `DeckSelector`           | 普通/赛事共用牌组选择       |
| `PlayerPairingEditor`    | 管理员左右列表和配对预览    |
| `RankingPreview`         | 小分数据与筛选              |
| `InterventionDialog`     | 管理员介入确认和原因        |
| `ApiErrorAlert`          | 业务错误统一展示            |

建议状态色：普通房间保留现有蓝/绿；赛事卡片使用金色边框；比赛牌组使用紫色；异常/介入使用橙红。每种状态同时提供文字 badge，颜色不是唯一信息来源。

## 18. 响应式与可访问性

- 注册页单列，二维码在窄屏按容器缩放；
- “我的比赛”桌面两列、移动单列；
- 管理员左右配对桌面并排，移动端改为按盘次索引的纵向卡片；
- 大表格在移动端允许横向滚动，并固定首列/操作列；
- dialog 设置初始焦点、焦点循环、Esc 关闭（强制确认进行中时除外）和关闭后焦点恢复；
- 所有 icon button 提供 `aria-label`，洗牌/倒序后用 live region 报告结果；
- 表单错误通过 `aria-describedby` 关联输入，不只显示 toast；
- 时间同时显示本地格式和完整 ISO/title；
- QQ 头像提供昵称 alt，加载失败回退到本地随机头像。

## 19. i18n

所有新增文案同时加入 `src/locales/zh-CN.ts` 和 `en.ts`。业务错误建立显式映射：

```ts
const ERROR_I18N_KEYS: Partial<Record<ApiProblem["code"], I18nKey>> = {
  QQ_NOT_IN_GROUP: "qqNotInTournamentGroup",
  REGISTRATION_CLOSED: "registrationClosed",
  DUPLICATE_CHARACTER_SET: "duplicateCompetitionCharacterSet",
  COMPETITION_DECK_LOCKED: "competitionDeckLocked",
  USER_IN_RUNNING_GAME: "leaveRunningGameFirst",
};
```

未知 code 显示通用失败文案并附服务端 message。场次名、昵称等用户内容原样显示并依赖 JSX 转义，不作为 HTML 注入。

## 20. 前端测试

### 20.1 单元/组件测试

- AuthProvider 在 guest token、user token、401 和 logout 下的状态转换；
- URL 预填、QQ 修改后清除验证状态；
- 未勾选比赛平台确认时阻止注册；
- Passkey 创建/获取成功、取消、不支持环境；
- 游客牌组批量导入的全部成功、部分失败和幂等重试；
- 比赛牌组分区、上限、重复角色组合和阶段锁定；
- 配对编辑器的洗牌、倒序、移动、移除和轮空预览；
- 排名分子/分母展示；
- 管理员介入确认文案与必填原因。

### 20.2 API mock 集成测试

- 注册成功且候补仍进入登录态；
- 报名时 QQ 已退群；
- 后端阶段在页面打开后变化，保存返回 `EVENT_PHASE_MISMATCH`；
- 两次点击进入赛事对局只导航一次；
- 管理员批量操作部分失败后保留失败选择；
- 场次结束确认展示运行中和未开始对局影响数量；
- 统计 source 切换不会显示上一请求的旧数据。

### 20.3 E2E

- 游客建牌/对局基础回归；
- QQ 密码和 Passkey 两条注册登录路径；
- 报名 → 管理员设为选手 → 选比赛牌组 → 场次开始；
- 双方从“我的比赛”进入固定赛事房间并完成一局；
- 决斗/征服后可选牌组正确减少；
- 管理员在运行中介入并看到审计；
- 管理员查看 private/不可观战房间，普通用户不可见。

## 21. 实施顺序

1. 建立 typed API client、`ApiProblem` 和 AuthProvider。
2. 替换 GitHub 登录/头像，完成 QQ 注册、密码和 Passkey。
3. 完成游客牌组注册后批量上传。
4. 增加首页报名和“我的比赛”。
5. 改造牌组列表/编辑锁定和赛事对局确认页。
6. 完成管理员用户、报名设置和批量场次创建。
7. 完成场次/盘次管理、介入、导出和审计页。
8. 完成业务统计页、响应式和可访问性回归。
9. 与 server 共享 DTO 对齐后执行全流程 E2E。

发布前必须在目标 HTTPS 域名验证 Passkey RP 配置、QQ 头像跨域加载、加群二维码资源路径、移动端赛事确认页和管理员大列表。
