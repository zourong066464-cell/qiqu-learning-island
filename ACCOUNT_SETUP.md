# 启用注册、登录和个人进度

前端仍部署在 GitHub Pages；账号验证和学习档案由你自己的 Supabase 项目保存。项目 `qiqu-learning-island`（`iogxqrbganboiuolnsuo`）已创建，数据表、RLS 和版本控制触发器已初始化，`cloud-config.js` 已填写公开连接信息。

`registrationEnabled: false` 表示邮件注册和找回密码尚未对外启用；现有账号可登录，游客仍可学习。账号入口明确显示此状态。

## 剩余启用步骤

1. 登录 Supabase 控制台，进入已创建的 `qiqu-learning-island` 项目。无需重复创建项目或执行首次迁移。
2. 在 Authentication → URL Configuration，把 Site URL 及允许的 Redirect URL 设为 `https://zourong066464-cell.github.io/qiqu-learning-island/`。
3. 保留邮箱确认，在邮件设置配置自己的 SMTP。默认邮件服务不能直接给公众提供注册验证与找回密码；SMTP 密码只填在 Supabase 控制台，不提交到代码仓库。
4. 使用两个真实邮箱验证邮件送达和回跳、注册、登录、密码重置及跨设备同步。确认后将 `cloud-config.js` 的 `registrationEnabled` 改为 `true` 并发布；测试期间可在本地开发配置中启用，不要把尚未验收的流程当作已完成。
5. 再执行下列验收清单，确认后分享给学生家长。

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

每个家长邮箱对应一个孩子档案；尚未提供同一家庭多孩子切换、教师班级管理或完整教材。支持昵称、头像、年级和目标的个性化；首页根据错题数量和最近三次完整练习的正确率推荐学科，题目仍按年级出题。游客记录不会自动归入任何账号，可登录后明确选择复制或导入备份。

登录令牌仅保存在当前标签页的 sessionStorage；关闭标签页后可能需要重新登录。每次重新登录必须联网。学习记录本机缓存按账号分开，退出时清除；密码从不缓存。换设备和清理浏览器数据前，请确认“已与云端同步”。

本地 `file://` 打开仍可游客学习；云端注册、验证和找回密码应使用 HTTPS 在线网址。服务工作线程只缓存本网站静态资源，不缓存账号接口响应。

## 参考

- [Supabase 密码登录](https://supabase.com/docs/guides/auth/passwords)
- [行级权限](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [公开 API key](https://supabase.com/docs/guides/getting-started/api-keys)
- [注册与找回密码的邮件服务](https://supabase.com/docs/guides/auth/auth-smtp)

## 已完成的实际验证

- 数据库真实事务测试：用户 A/B 各自只能看到自己的档案；A 不能修改或代替 B 创建数据；游客不可读；版本由服务端递增，旧版本更新无效。测试事务已回滚，不保留测试用户与学习记录。
- 安全与性能 Advisor 均未报告问题。
- 前端公开 key 对 Auth settings 的请求返回 200，允许本站来源；未登录访问学习记录返回拒绝权限。没有向游客开放学习数据。
- 12 项账号接口模拟测试与 9,000 道随机口算检查通过。邮件送达、完整注册和手机实机跨设备验收尚未完成。
