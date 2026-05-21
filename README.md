# 扫码签到系统 - 微信小程序云开发

## 功能特性

- **扫码签到**：参会者扫动态二维码 → 填表提交，管理员无需额外设备
- **动态二维码防转发**：每 10 秒自动刷新，截图/转发无效
- **权限分离**：管理员密码保护签到码和管理页，普通用户仅可签到
- **数据留存**：所有签到记录存储在微信云数据库
- **Excel 导出**：一键导出 CSV 格式签到报表

## 使用流程

| 角色 | 操作 | 页面 |
|------|------|------|
| 管理员 | 输密码进入「签到码」→ 展示动态二维码 | 签到码 tab |
| 参会者 | 打开「签到」→ 扫码 → 填表 → 提交 | 签到 tab |
| 管理员 | 输密码进入「管理」→ 查看记录 → 导出 Excel | 管理 tab |

默认管理员密码：`admin888`

## 部署步骤

### 1. 准备工作
- 注册微信小程序账号（https://mp.weixin.qq.com）
- 下载[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
- 在小程序后台「开发 → 云开发」开通云环境

### 2. 修改配置
1. 用开发者工具打开本项目目录
2. 修改 `project.config.json` 中的 `appid` 为你的小程序 AppID
3. 修改 `miniprogram/app.js` 中的 `env` 为你的云环境 ID

### 3. 创建数据库
云开发控制台 → 数据库 → 添加集合：
- 名称：`signinRecords`
- 权限：「所有用户可读，仅创建者可写」

### 4. 部署云函数
在开发者工具中依次右键以下目录 →「上传并部署：云端安装依赖」：
- `cloudfunctions/addSignin`
- `cloudfunctions/exportExcel`

## 防转发机制

| 机制 | 说明 |
|------|------|
| 动态二维码 | 每 10 秒自动刷新，包含时间戳 |
| 时效验证 | 扫码后 60 秒内提交有效，过期作废 |
| OpenID 绑定 | 同一微信用户只能签到一次 |

## 项目结构

```
sign-in-mini/
├── cloudfunctions/
│   ├── addSignin/        # 提交签到信息
│   └── exportExcel/      # 查询/导出签到报表
├── miniprogram/
│   ├── pages/
│   │   ├── index/        # 签到表单页（扫码+填表）
│   │   ├── qrcode/       # 动态签到码页（管理员）
│   │   └── verify/       # 签到管理页（管理员）
│   ├── app.js
│   ├── app.json
│   └── app.wxss
└── project.config.json
```
