# 循序 · Study Coach

一个面向 LeetCode Hot 100、LLM 手写算法和面试复习的中文学习工作台。原生 HTML / CSS / JavaScript，无构建依赖，可直接部署到 GitHub Pages。

在线地址：https://taskii-lei.github.io/study-coach/

## 网页功能

- 今日三项学习清单：算法 30 分钟、LLM 手写 20 分钟、LLM 口述 10 分钟。
- 「再来一题」可选择任意路线自由加练：先选到期复习，再选新题，题库练完后可提前复习；当天已安排的题不重复派发。
- 今日加练独立展示，原任务和草稿保留。加练自评后按同一规则安排复习，未完成的可选加练不会自动成为明天的必做任务。
- 150 道题的路线、关键词、练习状态筛选。
- 作答编辑器：Python 回车自动缩进、Tab / Shift+Tab 调整选中行，自动保存草稿。
- Hot 100：通过浏览器扩展提交到力扣官方，回传通过、错误、超时、耗时及失败用例，附官方提交链接。
- 已登录浏览器中一次安装，[安装说明](extension/README.md)；Ctrl / Cmd+Enter 可直接提交。
- 学习设置中填写用户名和计划起始日期，可同步力扣近期 AC（查不到不代表失败）。
- LLM 手写和口述题保存提交后，可复制给 Codex 教练批改。
- 专注倒计时、提交版本历史，支持把已提交版本复制给教练。
- 分级学习提示；提示是预编写教学内容，不是在线大模型生成。
- 显式自评，按 1/3/7/14/30 天安排间隔复习；失败次日重做，未完成顺延。
- 数据备份导入/导出，兼容同项目 Python 队列的 `progress.json`。
- 「复制给教练」生成包含题意、代码、思路和提示使用情况的作答包，可粘贴到 Codex 聊天获得批改。
作答、进度、草稿均保存在当前浏览器的 localStorage，不上传 GitHub，也不会跨设备自动同步。GitHub Pages 只托管静态网页，不运行 Python 或 AI 服务。官方判题通过同一 Chrome / Edge 浏览器中安装的扩展完成，登录会话不上传到本站。力扣反馈来自用户浏览器中向力扣发起的真实提交；扩展不连接时，网页不会代判或伪造通过。网页自评、官方判题和教练反馈分别标记。定时提醒由已配置的 Codex 自动化提供，GitHub Pages 本身不会在网页关闭后发送提醒。

## 本地启动

需要 Python 3.9+：

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory web
```

打开 `http://127.0.0.1:8765/`。本地预览和 GitHub Pages 属于不同来源，浏览器存档彼此独立；用 JSON 备份交换。浏览器隐私模式或清理网站数据可能删除记录，请定期备份。

## 验证

```sh
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -v
```

## GitHub Pages 发布

网页源文件在 `web/`，发布文件在 `docs/`。更新网页后先同步 `web/` 到 `docs/`，再提交：

```sh
cp web/* docs/
```

GitHub 仓库 Settings → Pages 选择 **Deploy from a branch**，分支 `main`，目录 `/docs`。`docs/.nojekyll` 让 Pages 直接使用静态文件。`.github/workflows/pages.yml` 提供可手动运行的附加校验；不参与日常网页发布。

作答和个人记录不会提交到公开仓库。无需任何额外 API Key。

## Python 队列

`coach.py` 仍可作为独立本地学习队列使用：

```sh
python3 coach.py daily
python3 coach.py check
python3 coach.py status
```

在网页设置中导入它生成的 `progress.json` 可合并教练反馈。网页导出的备份也保留 Python 队列所需字段；请先备份原记录，再显式将备份作为 `--state` 参数使用。Python CLI 更新队列时不主动同步已打开的网页。

Hot 100 使用[力扣官方学习计划](https://leetcode.cn/studyplan/top-100-liked/)的初始化题目列表，完整题意与约束以原题链接为准；LLM 练习为原创教学题。
