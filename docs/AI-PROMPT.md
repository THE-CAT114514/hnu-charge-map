# 用 AI 部署这个项目

这份文档给出一段可以直接粘给 AI 的提示词。核心思路：**你提供环境和自己的点位数据，AI 负责按文档操作、填数据和验证**。

## 你需要准备

- 一台 Ubuntu 服务器（root SSH 可用）
- 域名与 DNS 管理权限（大陆服务器还需要 ICP 备案）
- 街电小程序 token（约 7 天有效期）
- 用手机拍好的桩位二维码照片，或已经用 `tools/` 生成的 `piles.json`

## 提示词模板

```text
你是一名 Linux 运维 + 前端工程师，请帮我把「校园充电桩地图」部署到我的服务器。

仓库：<仓库地址或本地路径>
目标服务器：Ubuntu 24.04，root SSH：<IP / 用户名 / 登录方式>
域名：<example.com>（DNS 已指向服务器；<已备案 / 未备案，先用 8443 过渡>）
街电 token：<token>（只允许写入 /etc/hnu-charge-map.env，禁止写进代码、日志、Git）
桩位数据：见附件 piles.json（由 tools/wgs2gcj.py 生成）

请严格按仓库里的 docs/DEPLOY.md 执行，并遵守以下要求：

1. 先在服务器上跑通示例数据（python3 server.py），再配置 systemd 和 Caddy
2. 用 piles.json 替换 assets/data.js 的 stations，以及 server.py 的 DEVICES / STATIONS
3. 站点名称、品牌名、反馈邮箱、赞赏码按我提供的信息替换；没提供的用占位值
4. 不要修改 docs/ 里的说明，除非发现明显错误
5. 每一步完成后运行验证命令：
   - curl -s http://127.0.0.1:8791/api/status
   - curl -I https://<域名>/guest/
   - systemctl status hnu-charge-map caddy
6. 不要提交 token、服务器密码、私钥；不要执行破坏性命令
7. 最后告诉我：访问地址、Basic Auth 账号密码位置、还有哪些需要我手动完成的事
```

## 只做数据、不做部署

如果服务器已经跑起来，只想加新点位，可以用这一段：

```text
这是 hnu-charge-map 仓库。附件是我刚拍的桩位二维码照片（或 piles.json）。
请：
1. 用 tools 的规则整理成桩位数据；
2. 追加到 assets/data.js 的对应站点；
3. 在 server.py 的 DEVICES / STATIONS 里登记；
4. 检查 id / code / label / station 是否一致；
5. 提醒我更新 index.html 里的 ?v= 版本号并重启服务。
不要改动其它站点，不要提交 token。
```

## 给 AI 的边界

- token 是个人账号凭证，只放服务器环境变量；不要贴进 README、issue、提交记录
- 真实点位数据是否公开由你决定；公开仓库建议只放示例数据
- 高德瓦片、街电接口都有各自的使用条款，部署前确认合规
- 大陆服务器未备案时，域名 80/443 可能被拦截，这不是代码问题

## 验证清单

- [ ] 首页能打开，站点列表显示你的点位
- [ ] 点击桩号能放大并出现指示牌
- [ ] `/api/status` 返回 `{"ok": true, ...}`，桩数与实际一致
- [ ] `/guest/` 免登录可访问
- [ ] token 过期后页面回退到快照而不是报错
- [ ] `systemctl status` 两个服务都是 active
