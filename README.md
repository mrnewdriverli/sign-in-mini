# 扫码签到系统 - 微信小程序云开发

## 功能特性

- **扫码填信息**：参会人员填写姓名、手机号、部门完成签到
- **动态二维码防转发**：每 10 秒自动刷新二维码，截图/转发无效
- **后台核销签到**：工作人员扫码核销，自动标记签到状态
- **数据留存**：所有签到记录存储在微信云数据库
- **Excel 导出**：一键导出 CSV 格式签到报表

## 部署步骤（10 分钟完成）

### 1. 准备工作
- 注册微信小程序账号（https://mp.weixin.qq.com）
- 下载安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
- 在小程序后台「开发 → 云开发」开通云环境

### 2. 修改配置
1. 用开发者工具打开本项目目录
2. 修改 `project.config.json` 中的 `appid` 为你的小程序 AppID
3. 修改 `miniprogram/app.js` 中的 `env` 为你的云环境 ID（在云开发控制台查看）

### 3. 创建数据库集合
打开云开发控制台 → 数据库 → 新建集合：
- 集合名称：`signinRecords`
- 权限设置：「所有用户可读，仅创建者可写」

### 4. 部署云函数
在开发者工具中，依次右键以下目录 →「上传并部署：云端安装依赖」：
- `cloudfunctions/addSignin`
- `cloudfunctions/exportExcel`
- `cloudfunctions/verifySignin`

### 5. 设置 TabBar 图标
在 `miniprogram/` 目录下创建 `images/` 文件夹，放入以下图标（或删除 tabBar 配置中的图标路径）：
- `signin.png` / `signin-active.png`
- `verify.png` / `verify-active.png`

## 使用流程

### 参会人员签到
1. 扫描小程序码进入系统
2. 填写姓名、手机号、部门
3. 提交后自动跳转到动态二维码页
4. 向工作人员出示二维码

### 工作人员核销
1. 切换到「核销」tab
2. 点击「扫码核销」扫描参会人员二维码
3. 系统自动验证并标记签到状态
4. 点击「导出签到 Excel」下载报表

## 防转发机制

| 机制 | 说明 |
|------|------|
| 动态二维码 | 每 10 秒自动刷新，包含时间戳 |
| 时效验证 | 扫码后校验 30 秒内有效，过期作废 |
| Token 绑定 | 每个用户唯一 token，与 openid 关联 |
| 单次核销 | 核销后标记已签到，无法重复使用 |
| OpenID 锁定 | 同一微信用户只能签到一次 |

## 项目结构

```
sign-in-mini/
├── cloudfunctions/
│   ├── addSignin/        # 提交签到信息
│   ├── exportExcel/      # 导出签到报表
│   └── verifySignin/     # 核销签到
├── miniprogram/
│   ├── pages/
│   │   ├── index/        # 签到表单页
│   │   ├── qrcode/       # 动态二维码页
│   │   └── verify/       # 核销管理页
│   ├── utils/
│   │   └── weapp-qrcode.js  # 二维码生成库
│   ├── app.js
│   ├── app.json
│   └── app.wxss
└── project.config.json
```
