# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

MoonTV 是一个基于 Next.js 14 的影视聚合播放器，支持多资源搜索、在线播放、收藏同步、播放记录等功能。项目采用 TypeScript + Tailwind CSS + App Router 架构。

## 常用开发命令

```bash
# 开发启动（生成 manifest 并启动开发服务器）
pnpm dev

# 构建项目
pnpm build

# 生产启动
pnpm start

# 代码质量检查
pnpm lint                 # ESLint 检查
pnpm lint:fix            # 自动修复 ESLint 问题
pnpm lint:strict         # 严格模式，0 warnings
pnpm typecheck           # TypeScript 类型检查

# 代码格式化
pnpm format              # Prettier 格式化
pnpm format:check        # 检查格式化状态

# 测试
pnpm test                # 运行所有测试
pnpm test:watch          # 监听模式运行测试

# 生成 manifest
pnpm gen:manifest        # 生成 PWA manifest.json
```

## 核心架构

### 存储层架构

项目采用统一的存储抽象层 `IStorage` 接口，支持多种存储后端：

- **Kvrocks**: 推荐的生产环境存储（基于 RocksDB）
- **Redis**: 标准 Redis 存储
- **Upstash**: 云端 Redis 服务
- **LocalStorage**: 浏览器本地存储（开发环境）

存储层管理通过 `DbManager` 类统一处理用户数据、播放记录、收藏、管理员配置等。

### 数据流架构

- **用户认证**: 通过 middleware 实现基于签名的认证系统
- **配置管理**: 支持文件配置和数据库配置的混合模式，通过 `getConfig()` 统一获取
- **资源聚合**: 支持多个影视资源站点的聚合搜索和播放

### 组件架构

- **PageLayout**: 统一的页面布局组件，处理侧边栏和移动端导航
- **VideoCard**: 通用视频卡片组件，支持多种来源（豆瓣、搜索结果、收藏等）
- **ThemeProvider**: 主题管理（暗色/亮色模式）
- **SiteProvider**: 全局站点配置提供者

### API 路由结构

项目使用 Next.js App Router，API 路由集中在 `src/app/api/` 目录：

- `admin/*`: 管理员功能 API
- `search/*`: 搜索相关 API
- `proxy/*`: 代理服务 API（图片、视频流等）
- `live/*`: 直播相关 API

## 开发注意事项

### 环境变量配置

关键环境变量：

- `NEXT_PUBLIC_STORAGE_TYPE`: 存储类型（kvrocks/redis/upstash）
- `USERNAME` / `PASSWORD`: 管理员认证信息
- `KVROCKS_URL` / `REDIS_URL` / `UPSTASH_URL`: 存储连接信息
- `NEXT_PUBLIC_SITE_NAME`: 站点名称

### 配置文件系统

项目支持 JSON 配置文件来管理资源站点：

```json
{
  "cache_time": 7200,
  "api_site": {
    "site_key": {
      "api": "http://example.com/api.php/provide/vod",
      "name": "示例资源",
      "detail": "http://example.com"
    }
  },
  "custom_category": [...],
  "lives": {...}
}
```

### Docker 部署架构

项目采用多阶段 Docker 构建：

1. 依赖安装阶段 (deps)
2. 项目构建阶段 (builder)
3. 运行时镜像 (runner)

运行时使用 Next.js standalone 模式，通过自定义 `start.js` 脚本启动。

### 代码规范

- 使用 TypeScript 严格模式
- ESLint + Prettier 代码格式化
- Husky + lint-staged Git hooks
- 组件采用函数式组件 + Hooks
- 统一使用 `@/*` 路径别名

### 测试框架

- Jest + Testing Library
- 测试配置文件: `jest.config.js`, `jest.setup.js`
- 支持 SVG mock 和模块别名

### PWA 支持

项目集成 next-pwa，支持：

- 离线缓存
- 桌面安装
- 移动端原生体验
- 自动生成 manifest.json

## 特殊功能模块

### 豆瓣数据集成

集成豆瓣 API 获取影视信息和推荐内容，支持多种代理模式以应对网络限制。

### 直播功能

支持 IPTV 直播源管理，包括频道列表、EPG 节目单等功能。

### 视频播放

集成 ArtPlayer + HLS.js 提供流畅的在线播放体验，支持多种视频格式和字幕。

### 智能广告跳过

实验性功能，支持自动跳过视频中的片头片尾广告。
