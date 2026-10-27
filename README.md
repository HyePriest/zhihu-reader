# 知乎回答读取器

一个轻量的 Chrome / Edge 扩展，将知乎页面中**已经加载的回答**整理成文字，支持复制和导出 Markdown。无需 API Key、Python 或后端服务。

当前版本：**0.1.1**。真实知乎网页的兼容性尚待实测；自动化测试使用本地模拟页面，不能证明可以读取任意真实问题。详细边界见 [验证记录](验证记录.md)。

## 能做什么

- 读取问题页中已加载的回答，或按回答编号读取单个回答。
- 尝试展开“阅读全文”，等待动态内容加载；仍折叠时提示可能不完整。
- 按需滚动 3 屏并继续读取，同一阅读页内按回答编号合并结果。
- 复制正文、作者和来源；导出保留基本格式、代码、链接和图片地址的 Markdown。
- 支持浅色、深色模式与窄屏布局。

不读取评论，不支持专栏或短链接；不能绕过登录、验证码、付费限制或已删除内容。图片仅保留链接，公式、视频、复杂表格和特殊排版需对照原页面。**不保证覆盖全部回答，也不保证完整还原原文。**

## 安装

1. 从 [Releases](https://github.com/HyePriest/zhihu-reader/releases) 下载发布包，或下载仓库源码 ZIP，解压到固定文件夹。
2. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
3. 开启“开发者模式”，点击“加载已解压的扩展程序”。
4. 选择包含 `manifest.json` 的文件夹，并将扩展固定到工具栏。

安装使用不需要运行 npm。更新时替换文件，再在扩展管理页点击“重新加载”。

## 使用

1. 打开知乎问题或回答页，再点击扩展图标；也可以在阅读页输入网址后点击“读取”。
2. 若提示登录或验证，点击“打开原页面”处理，等正文出现后返回重试。
3. 问题页可点击“再加载 3 屏并读取”，逐步累积已读到的回答。
4. 点击“复制正文”或“导出 Markdown”。**关闭或刷新阅读页会丢失结果，请先导出。**

支持的网址形式（数字为示例）：

```text
https://www.zhihu.com/question/123456
https://www.zhihu.com/question/123456/answer/789012
```

分享链接中的查询参数和锚点会被移除。暂不支持 `zhihu.com` 裸域名、`zhuanlan.zhihu.com`、短链接及移动端域名。

## 工作原理与隐私

扩展使用 Manifest V3 和原生 HTML/CSS/JavaScript，通过 `chrome.scripting.executeScript` 在知乎标签页中执行 DOM 提取脚本。**没有使用知乎私有 API、爬虫框架、外部 AI 或第三方正文提取服务。**

正文只保留在阅读页内，代码不读取 Cookie、不上传正文、不持久化阅读记录。打开知乎、展开内容和滚动时，浏览器仍会正常访问知乎，并使用其现有登录状态。导出的图片链接会在你使用的 Markdown 阅读器中产生相应的图片请求。详见 [隐私说明](PRIVACY.md)。

权限：

| 权限 | 用途 |
| --- | --- |
| `scripting` | 在目标知乎标签页执行提取脚本 |
| `activeTab` | 点击扩展图标时获取当前标签页的信息 |
| `https://www.zhihu.com/*` | 查找知乎标签页并读取其页面内容 |

## 开发与验证

需要 Node.js 22 或更新版本。Playwright 仅用于开发测试，扩展运行时不依赖它。

```sh
npm ci
npm run check
npm test
```

Windows 默认使用已安装的 Edge，以临时浏览器环境运行测试，不使用日常浏览器配置。Linux/macOS 首次运行需先安装测试用 Chromium：

```sh
npx playwright install chromium
```

也可以通过 `BROWSER_CHANNEL` 指定 Playwright 支持的本机浏览器通道，例如 `chrome` 或 `msedge`。Linux CI 使用 `npx playwright install --with-deps chromium`。

测试覆盖网址校验、指定回答匹配、动态展开、折叠提示、滚动合并、链接处理、Markdown 导出、阅读页渲染、复制与下载。阅读页交互测试模拟扩展 API；安装后的真实扩展调用和真实知乎页面仍需手动检查，见 [贡献指南](CONTRIBUTING.md)。

Windows 打包：

```sh
npm run package
```

Linux/macOS 安装 PowerShell 7 后可运行 `pwsh -File scripts/package.ps1`。生成文件位于 `dist/zhihu-reader-v0.1.1.zip`；脚本只打包明确列出的运行文件、使用说明、隐私说明和许可证。GitHub Actions 在检查与测试通过后生成同样的发布包，供下载验证，不会自动创建公开 Release。

## 项目结构

```text
manifest.json         扩展配置与权限
background.js         扩展按钮入口
reader.html/css/js    阅读、复制、导出界面
extract.js            页面 DOM 提取与正文格式转换
shared.js             网址、去重、导出和文件名处理
tests/                单元与模拟页面浏览器测试
scripts/              静态检查与发布打包
```

## 反馈与许可证

请通过仓库 Issues 反馈问题，并提供浏览器版本、扩展版本、脱敏后的公开网址、操作步骤及错误提示。不要提交 Cookie、登录凭据、验证码、私人回答全文或未经处理的 HAR 文件。

项目以 **GPL-3.0-only** 发布，完整条款见 [LICENSE](LICENSE)。软件许可证适用于本项目代码；知乎页面内容的权利归其相应权利人，请尊重作者权益和网站规则。本项目与知乎官方无关联。
