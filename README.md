# 智慧课时管理（SmartHours）

微信小程序 — 培训机构课时管理系统。支持课程管理、排课、自动/手动消课、日历看板、统计图表和操作审计。

## 技术栈

- **前端**：微信小程序原生开发（WXML / WXSS / JS）
- **后端**：微信云开发（云函数 + 云数据库 + 定时触发器）
- **图表**：echarts-for-weixin

## 项目结构

```
smart-hours/
├── miniprogram/          # 小程序前端（9页面 + 5组件 + 工具函数）
├── cloudfunctions/       # 云函数（8个）+ 公共模块（5个）
├── docs/                 # 文档（部署指南 + 用户手册 + 测试计划 + CHANGELOG）
└── project.config.json   # 微信开发者工具配置
```

## 快速开始

1. 微信开发者工具打开本项目
2. 修改 `miniprogram/env.js` 中的 `CLOUD_ENV_ID` 为你的云环境 ID
3. 右键 `cloudfunctions/` → 上传并部署所有云函数
4. 执行 `initDB` 云函数初始化数据库索引
5. 配置 `autoDeduct` 定时触发器（`0 */30 * * * * *`）
6. 点击「预览」开始使用

详见 [docs/deployment.md](docs/deployment.md)
