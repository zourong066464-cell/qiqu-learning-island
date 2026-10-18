# 启用注册、登录和个人进度

前端仍部署在 GitHub Pages；账号验证和学习档案由你自己的 Supabase 项目保存。目前 `cloud-config.js` 的连接信息为空，线上仍使用游客模式，不会假装完成注册。

## 管理员首次启用

1. 在 [Supabase Dashboard](https://supabase.com/dashboard) 创建你自己的项目。
2. 打开 SQL Editor，执行 [数据库迁移](supabase/migrations/202610180001_learning_accounts.sql)。只执行一次。数据表启用行级权限，用户只能读取和修改自己的记录；游客无权限读取。
3. 在 Authentication → URL Configuration，把 Site URL 及允许的 Redirect URL 设为 `https://zourong066464-cell.github.io/qiqu-learning-island/`。
4. Authentication → Providers 中启用 Email，保留邮箱确认，并在邮件设置配置你自己的 SMTP。默认邮件服务只向项目团队成员发信，不能直接给公众提供注册验证与找回密码。SMTP 密码只填在 Supabase 控制台。
5. 在项目 Connect 对话框或 Settings → API Keys 找到 **Project URL** 和 **Publishable key**（`sb_publishable_` 开头）。填入 `cloud-config.js` 的 `url` 和 `publishableKey`，提交到 GitHub 后等待 Pages 发布。不要填写 `sb_secret_`、`service_role`、数据库密码或个人访问令牌。
6. 用两个不同邮箱完成下列真实验收，确认后再分享给学生家长。

公开连接信息可以放在前端；数据权限由数据库的 RLS 和用户登录令牌控制。邮箱和密码由 Supabase Auth 处理，本应用不保存密码。

## 真实验收

- A 邮箱注册，点击邮件验证，登录，修改昵称并答题；B 邮箱注册后应从零开始，不能看到 A 的错题和星星。
- A 在另一台设备登录，应看到 A 的昵称、年级、目标和学习记录。
- 离线答题后显示待同步，恢复网络后星星和错题同步；离线首次登录不可用。
- 两台设备同时修改记录，后一台遇到版本冲突时须选择保留云端或本机，并可先备份，不能静默覆盖。
- 使用“忘记密码”获取邮件链接，设置新密码后可重新登录。
- 退出账号后显示本机游客档案，清除该账号的会话和本机缓存。未同步时退出须先备份或明确放弃。
- 在 Supabase 的隔离测试库运行 `supabase test db`，执行 `supabase/tests/isolation.sql`，验证行级权限。不要把测试数据灌入真实学生数据库。

## 当前功能边界

每个家长邮箱对应一个孩子档案；尚未提供同一家庭多孩子切换、教师班级管理或完整教材。支持昵称、年级和目标的个性化；题目按年级出题，尚无自适应教学算法。游客记录不会自动归入任何账号，可登录后明确选择复制或导入备份。

登录令牌仅保存在当前标签页的 sessionStorage；关闭标签页后可能需要重新登录。每次重新登录必须联网。学习记录本机缓存按账号分开，退出时清除；密码从不缓存。换设备和清理浏览器数据前，请确认“已与云端同步”。

本地 `file://` 打开仍可游客学习；云端注册、验证和找回密码应使用 HTTPS 在线网址。服务工作线程只缓存本网站静态资源，不缓存账号接口响应。

## 参考

- [Supabase 密码登录](https://supabase.com/docs/guides/auth/passwords)
- [行级权限](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [公开 API key](https://supabase.com/docs/guides/getting-started/api-keys)
- [注册与找回密码的邮件服务](https://supabase.com/docs/guides/auth/auth-smtp)
