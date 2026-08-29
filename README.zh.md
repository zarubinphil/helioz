# Helioz

Helioz 让长时间的智能体工作跨越会话、检查和交接继续推进，你睡觉的时候活也不停。

[English](README.md) · [Русский](README.ru.md)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Stars](https://img.shields.io/github/stars/zarubinvibe/helioz?style=flat&color=C9A87A)](https://github.com/zarubinvibe/helioz/stargazers) [![Status](https://img.shields.io/badge/status-working-brightgreen.svg)](https://github.com/zarubinvibe/helioz) [![Olympuz](https://img.shields.io/badge/olympuz-family-B8D6EA.svg)](https://github.com/zarubinvibe/athena#olympuz-family)

<p align="center"><img src="docs/assets/pantheon/hero.png" alt="白色大理石的赫利俄斯手持金色日轮站在古典石柱旁，蓝色与金色的丝线把玻璃卡片汇成一条传送带" width="100%"></p>

<!-- owner-welcome:start -->

> 你好。我是一名律师，有两个女儿和一份咖啡生意，晚上的时间很短。做 Helioz 是因为：只要我合上笔记本，活就停了。智能体忘记任务，把没做完的说成做完了，还为一个小岔路半夜叫醒我。
>
> 它每天都在我自己的机器上跑。如果它能在你睡觉的时候推进你的工作，就拿去，把它变成你自己的。
>
> — Filipp Zarubin

<!-- owner-welcome:end -->

## 目录

- [这是什么](#这是什么)
- [它解决什么问题](#它解决什么问题)
- [最大的优势](#最大的优势)
- [工作流程](#工作流程)
- [快速开始](#快速开始)
- [简单对比](#简单对比)
- [简单词汇](#简单词汇)
- [安全与隐私](#安全与隐私)
- [局限](#局限)
- [点亮星标与参与](#点亮星标与参与)

<!-- beginner-readme:start -->

## 这是什么

Helioz 是一条智能体工作的传送带。你只说一次要做什么。它逐条追问，写出计划，把任务交给编码智能体，再让第二个智能体检查结果，然后向你汇报。它跑在你自己的电脑上，所有状态都写在磁盘里。

## 它解决什么问题

智能体在会话之间会忘记任务，没做完也说“做完了”，还会为一个小岔路在半夜叫醒你。Helioz 对每一条毛病都给出一件工具：状态写在磁盘、盲检的验证者、夜间议事会。早上你看到的是进展，而不是停住的对话框。

## 最大的优势

**最大的优势：** 完成标记由代码写下，而不是由干活的那个智能体自己写。

**为什么这样更好：** 标记里记着前后两个提交、改动文件的哈希和检查命令的退出码。复制来的或手写的标记会被发现，并被当场点名。

## 工作流程

一个节拍循环运行。每一步都在磁盘上留下文件，所以会话被杀掉，也能从同一行继续。

<!-- workflow-diagram:start -->

```text
  ┌──────┐   ┌──────┐   ┌──────┐
  │ 追问 │ ▶ │ 计划 │ ▶ │ 闸门 │
  └──────┘   └──────┘   └──────┘
      ▼
  ┌──────┐   ┌──────┐   ┌──────┐
  │ 执行 │ ▶ │ 验证 │ ▶ │ 标记 │
  └──────┘   └──────┘   └──────┘
      ▼
  ┌──────┐
  │ 交接 │
  └──────┘
```

<!-- workflow-diagram:end -->

| 阶段 | 会发生什么 |
|---|---|
| 1. 追问 | 一句话变成填好的槽位和写下来的目标 |
| 2. 计划 | 两份独立的计划，由第三个智能体合并 |
| 3. 闸门 | 槽位、依赖、预算和一个“停”的开关 |
| 4. 执行 | 真实探针挑出真正能跑起来的那个智能体 |
| 5. 验证 | 第二个智能体读磁盘，不读报告 |
| 6. 标记 | 提交、文件哈希和退出码都在标记里 |
| 7. 交接 | Telegram 汇报，小岔路交给夜间议事会，然后开新会话 |

### 第 1 步：先把目标说一次

你先说一句想做什么。Helioz 一次只问一个问题，并且附上自己的建议，所以同意只要一个词。回答可以在编辑器里，也可以在终端或 Telegram 里。

<p align="center"><img src="docs/assets/pantheon/workflow/01-interview.png" alt="Pantheon 宽幅大理石场景：Helioz 工作流程第 1 步，先把目标说一次" width="100%"></p>

**你会得到：** `queue/GOAL.md` 里的一个目标，之后每个决定都要对着它核对。

### 第 2 步：两个智能体各写各的计划

两个智能体互相看不见，各写一份计划。第三个在盲态下把它们合并。一个聪明的智能体偏爱自己的错误，两个就会争。

<p align="center"><img src="docs/assets/pantheon/workflow/02-plan.png" alt="Pantheon 宽幅大理石场景：Helioz 工作流程第 2 步，两个智能体各写各的计划" width="100%"></p>

**你会得到：** 一份总计划和 `queue/tasks/` 里的小任务，每个都带自己的检查命令。

### 第 3 步：闸门挑出下一个任务

闸门只放行依赖已经关闭、预算窗口还有余量的任务。两个智能体不可能拿到同一个文件，代码会拒绝第二个。

<p align="center"><img src="docs/assets/pantheon/workflow/03-gate.png" alt="Pantheon 宽幅大理石场景：Helioz 工作流程第 3 步，闸门挑出下一个任务" width="100%"></p>

**你会得到：** 一个正在执行的任务，文件集合已锁定，预算实时计数。

### 第 4 步：执行者干活

交活之前，Helioz 会真跑一遍每个智能体命令行，而不是相信版本号。任务交给答应了的那一个。

<p align="center"><img src="docs/assets/pantheon/workflow/04-execute.png" alt="Pantheon 宽幅大理石场景：Helioz 工作流程第 4 步，执行者干活" width="100%"></p>

**你会得到：** 被改动的工作目录，以及智能体真正执行过什么的日志。

### 第 5 步：盲检的验证者来核

验证者看不到执行者的报告。它看文件、跑检查命令，再加一个对抗性探针。这里没有人给自己判分。

<p align="center"><img src="docs/assets/pantheon/workflow/05-verify.png" alt="Pantheon 宽幅大理石场景：Helioz 工作流程第 5 步，盲检的验证者来核" width="100%"></p>

**你会得到：** 一个有命令输出撑着的结论，或者一个被打回重做的任务。

### 第 6 步：代码写下完成标记

标记由闸门写，不由智能体写。十三个对抗性探针专门来伪造它：复制的回执、缺少外部提交的标记、被改过的日志、被换掉的检查命令。

<p align="center"><img src="docs/assets/pantheon/workflow/06-mark.png" alt="Pantheon 宽幅大理石场景：Helioz 工作流程第 6 步，代码写下完成标记" width="100%"></p>

**你会得到：** 一个用证据关闭的任务，经得起事后翻查。

### 第 7 步：汇报、议事会、交接

进展会发到 Telegram，也写到磁盘。小岔路交给四个视角的议事会：它们分开写，结论再对着你的目标核对。生产动作、和别人工作的冲突、代价大的岔路始终等你。

<p align="center"><img src="docs/assets/pantheon/workflow/07-handoff.png" alt="Pantheon 宽幅大理石场景：Helioz 工作流程第 7 步，汇报、议事会、交接" width="100%"></p>

**你会得到：** 一份交接文件，看门狗据此拉起下一个会话，上下文不丢。

## 快速开始

你需要 macOS 或 Linux、Node.js 20 以上、git，以及至少一个智能体命令行：`claude`、`codex` 或 `kimi`。三条路进来都行。

```bash
git clone https://github.com/zarubinvibe/helioz.git ~/helioz
cd ~/helioz
bash install.sh en
bash scripts/helioz-start.sh
```

没有 Git？下载 [ZIP](https://github.com/zarubinvibe/helioz/archive/refs/heads/main.zip) 解压后在里面执行同样的 `bash install.sh en`。习惯在终端里用压缩包？拿 [tar.gz](https://github.com/zarubinvibe/helioz/archive/refs/heads/main.tar.gz)。 第一次用？在 Claude Code 里打开项目并运行 `/helioz-setup`：安装以对话的方式进行，一次问一个问题，没有你的同意不会装任何东西。

第一次做这件事？[上手引导](docs/ONBOARDING.zh.md) 会一步一步带你走完第一次运行，并写清楚每条命令之后你会看到什么。

**你会得到：** 安装脚本先做自我介绍，检查 Node、git 和你的智能体命令行，跑一遍各个器件的自检，然后告诉你还剩下哪些要手动做。

## 简单对比

| 方案 | 适合什么时候 | 你会得到 | 代价 |
|---|---|---|---|
| **Helioz** | 你不在的时候长活也要往前走 | 状态写在磁盘、盲检验证、无法伪造的标记、夜间决策 | 要你自己启动并留意 |
| 手动跑智能体 | 一次坐下能做完的小任务 | 每一步都在你手里 | 合上笔记本，活就停了 |
| CI 流水线 | 提交之后的重复检查 | 服务器端执行和历史记录 | 它只对提交作出反应，不做计划也不做决定 |
| 任务板加智能体聊天 | 团队协作 | 看得见的看板和评论 | 没有人验证“做完了”是不是真的 |

## 简单词汇

| 词 | 简单解释 |
|---|---|
| Repository | 仓库：Git 保存并记录版本的项目文件夹 |
| Terminal | 终端：你输入命令的窗口 |
| Command | 命令：给电脑的一条指令 |
| Branch | 分支：不影响 `main` 的另一条修改线 |
| Pull Request | 合并请求：请别人审阅并接受你的修改 |
| Agent CLI | 智能体命令行：在终端里运行的编码助手，例如 Claude Code、Codex |
| Check command | 检查命令：证明任务做完的那条命令，例如 `npm test` |

## 安全与隐私

- 文件访问不出克隆目录，除非任务明确写出另一个允许的路径。
- `.helioz/`、`queue/` 和日志是本地运行状态，不会被发布出去。
- 密钥放在 git 之外，只有发送或轮询的那一刻才被读取。
- Telegram 的送达是尽力而为：消息先落在本地发件箱里。
- 生产环境的动作和代价大的岔路会被议事会拒绝，它们等你来定。
- 空队列、读不出来的状态、没有目标的议事会都算红色结果，不算通过。

任何 push 之前，先看 `git diff`，再跑一遍公开发布闸门。

## 局限

状态：可用的本地系统，作者每天都在用。

- 只支持 macOS 和 Linux，没有 Windows 的路径。
- 工作的质量就是你装的那个智能体命令行的质量。
- 闸门证明的是文件状态和命令输出，不评判产品品味。
- Telegram、夜间议事会和看门狗都是可选的，可以关掉。

想看得更深：[完整参考](docs/DETAILS.md)、[状态契约](docs/CONTRACTS.md)、[编排提示词](ORCHESTRATOR.md) 和 [总计划](docs/MASTER-PLAN.md)。上面这些说法的证据：`node scripts/helioz-probes.mjs` 会跑十三个对抗性探针，全部必须是绿的。

## 点亮星标与参与

觉得有用？给 Helioz 点亮星标：[https://github.com/zarubinvibe/helioz](https://github.com/zarubinvibe/helioz)。这只要一秒，却决定别人能不能找到这个项目。

想改点什么？流程很短：先 fork 仓库，建一个分支 branch，提交 commit，推送 push，然后开一个 Pull Request。请不要直接向 `main` 推送，发布闸门会拒绝。

发现问题？到 [https://github.com/zarubinvibe/helioz/issues](https://github.com/zarubinvibe/helioz/issues) 开一个 issue，写清楚你运行了什么、发生了什么。

<!-- beginner-readme:end -->

<!-- pantheon-family:start -->
## Olympuz 家族

这是 [Olympuz 家族](https://github.com/zarubinvibe/athena#olympuz-family) 的公开项目之一。表格里的每一行都可以打开仓库，或者直接下载源码压缩包。

| 类型 | 名称 | 做什么 | 获取 |
|---|---|---|---|
| 项目 | Athena | 可携带的智能体操作系统：在新的 Mac 上重建 Claude 与 Codex 的工作环境。 | [仓库](https://github.com/zarubinvibe/athena) · [ZIP](https://github.com/zarubinvibe/athena/archive/refs/heads/main.zip) |
| 项目 | Helioz | 全天候的智能体工作传送带，带可验证的完成标记和按目标做出的夜间决策。 | [仓库](https://github.com/zarubinvibe/helioz) · [ZIP](https://github.com/zarubinvibe/helioz/archive/refs/heads/main.zip) |
| 项目 | Mnemazine | 本地优先的记忆系统：把原始材料变成可复用的、已核验的知识。 | [仓库](https://github.com/zarubinvibe/mnemazine) · [ZIP](https://github.com/zarubinvibe/mnemazine/archive/refs/heads/main.zip) |
| 项目 | Themis | 面向俄罗斯诉讼的多智能体助手，本地识别扫描件，五位法学家组成合议审阅。 | [仓库](https://github.com/zarubinvibe/themis) · [ZIP](https://github.com/zarubinvibe/themis/archive/refs/heads/main.zip) |
| 项目 | Zeuz | 工作流工厂：把一个想法变成带规则、闸门、可观测性和回放的多智能体系统。 | [仓库](https://github.com/zarubinvibe/zeuz) · [ZIP](https://github.com/zarubinvibe/zeuz/archive/refs/heads/main.zip) |
<!-- pantheon-family:end -->

## 许可证

MIT。见 [LICENSE](LICENSE)。
