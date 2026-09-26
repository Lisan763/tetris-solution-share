# Tetris Solution Share

[中文](#中文) · [English](#english)

## 中文

一个轻量、离线运行的俄罗斯方块解法编辑与分享工具。

你可以手动输入局面和牌序，自己摆出解法，然后导出 GIF 或 Share Code 发给别人。

非官方社区工具，与 TETR.IO 或 The Tetris Company 无隶属关系。

### 功能

- 手动画 10×20 场地
- 设置 Current / Hold / Next
- 键盘与手机虚拟按键操作
- TETR.IO 风格默认多键位
- 自定义多键位并自动保存
- 按落块边界撤销 / 重来
- 导出低 / 中 / 高三档分辨率 GIF
- 导出 / 导入 Share Code
- Code → GIF
- 中文 / English / 日本語 / 한국어
- 完全离线，单 HTML 文件即可运行

### 下载

推荐直接从 [Releases](https://github.com/Lisan763/tetris-solution-share/releases) 下载最新的：

```text
Tetris-Solution-Share.html
```

下载后直接用浏览器打开即可，不需要安装或启动服务器。

### 分享方式

- 只想展示解法：发送 GIF
- 想让对方恢复局面并继续修改：同时发送 Share Code

Share Code 带校验码，可以检测复制缺失或内容损坏。

### 默认桌面键位

| 操作 | 默认键位 |
| --- | --- |
| 左移 | ← / Numpad4 |
| 右移 | → / Numpad6 |
| 软降 | ↓ / Numpad2 |
| 硬降 | Space / Numpad8 |
| 逆时针旋转 | Ctrl / Z / Numpad3 / Numpad7 |
| 顺时针旋转 | ↑ / X / Numpad1 / Numpad5 / Numpad9 |
| 180° | A |
| Hold | Shift / C / Numpad0 |
| 撤销 | Backspace |
| 重来 | R |

所有键位都可以自行修改，并会保存在浏览器中。

### 从源码构建

```bash
npm ci
npm run build
```

运行测试：

```bash
npm test
```

### License

[MIT License](LICENSE) · Copyright (c) 2026 Lisan763

第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

### Credits

- Project owner / maintainer: [Lisan763](https://github.com/Lisan763)
- Development assistance: OpenAI ChatGPT

---

## English

A lightweight, fully offline Tetris solution editor and sharing tool.

Enter a field and piece sequence, build a solution manually, then share it as a GIF or Share Code.

Unofficial community tool; not affiliated with TETR.IO or The Tetris Company.

### Features

- Manual 10×20 field editor
- Current / Hold / Next input
- Keyboard and mobile virtual controls
- TETR.IO-style default multi-key bindings
- Custom multi-key bindings with local persistence
- Whole-placement undo / restart
- Low / Medium / High resolution GIF export
- Share Code export / import
- Code → GIF
- Chinese / English / Japanese / Korean UI
- Fully offline, single-file HTML release

### Download

Download the latest:

```text
Tetris-Solution-Share.html
```

from [Releases](https://github.com/Lisan763/tetris-solution-share/releases), then open it directly in your browser. No installation or local server is required.

### Sharing

- To show a solution visually: send the GIF.
- To let someone reconstruct and edit the position: send the Share Code as well.

Share Codes include a checksum to detect truncation or corruption.

### Default desktop controls

| Action | Default bindings |
| --- | --- |
| Move left | ← / Numpad4 |
| Move right | → / Numpad6 |
| Soft drop | ↓ / Numpad2 |
| Hard drop | Space / Numpad8 |
| Rotate counterclockwise | Ctrl / Z / Numpad3 / Numpad7 |
| Rotate clockwise | ↑ / X / Numpad1 / Numpad5 / Numpad9 |
| Rotate 180° | A |
| Hold | Shift / C / Numpad0 |
| Undo | Backspace |
| Restart | R |

All bindings are customizable and saved locally in the browser.

### Build from source

```bash
npm ci
npm run build
```

Run tests:

```bash
npm test
```

### License

[MIT License](LICENSE) · Copyright (c) 2026 Lisan763

Third-party notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Credits

- Project owner / maintainer: [Lisan763](https://github.com/Lisan763)
- Development assistance: OpenAI ChatGPT
