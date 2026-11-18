# 部署与复现指南

本文从一台空服务器开始，复现「海大充电地图」的完整部署，并说明如何继续采集新的充电桩点位。

> 示例环境：Ubuntu 24.04、Caddy 2、Python 3.12。命令默认以 root 执行，`sudo` 可自行补上。

## 0. 方案概览

| 组件 | 作用 | 位置 |
|---|---|---|
| `server.py` | 静态文件服务 + `/api/status` 代理 + 60 秒缓存 | `127.0.0.1:8791` |
| Caddy | HTTPS、Basic Auth、反向代理 | `:80` / `:443` |
| systemd | 守护 Python 进程 | `hnu-charge-map.service` |
| 静态资源 | 页面、脚本、桩位数据、底图瓦片 | `/opt/hnu-charge-map` |
| token | 街电小程序登录态 | `/etc/hnu-charge-map.env` |

> 仓库内置 3 个示例站点、12 台桩，桩码和坐标都是占位值。正式部署前请按第 8 节替换成自己采集的数据。

## 1. 前置条件

- 一台 Ubuntu 22.04 / 24.04 服务器（1 核 1G 足够）
- 一个域名，A 记录可指向服务器
- 中国大陆服务器：**域名必须完成 ICP 备案**，否则云厂商会拦截 80/443（80 返回备案提示页，443 可能被重置）。没有备案时请用香港/海外服务器，或先用非标准端口 + 自签证书过渡（见 6.3）
- 服务器防火墙 / 云安全组放行 `22`、`80`、`443`（过渡方案再放行 `8443`）

## 2. DNS

在域名服务商添加两条 A 记录：

```
@    A    服务器公网 IP
www  A    服务器公网 IP
```

TTL 可以先设 600 秒。新域名或刚改过 NS 时，注册局的委派可能延迟几分钟到几小时，用下面的命令确认：

```bash
dig NS  example.com @a.nic.xyz +short     # .xyz 为例，其他后缀换成对应 TLD 服务器
dig A   example.com @223.5.5.5 +short
```

`dig NS` 能看到注册商分配的 NS、`dig A` 能返回服务器 IP，才说明解析生效。

## 3. 安装依赖与目录

```bash
apt-get update
apt-get install -y python3 caddy rsync curl ufw

# 专用系统用户
id -u hnu >/dev/null 2>&1 || useradd --system --home /opt/hnu-charge-map --shell /usr/sbin/nologin hnu

mkdir -p /opt/hnu-charge-map /etc/hnu-charge-map
chown -R hnu:hnu /opt/hnu-charge-map
chmod 700 /etc/hnu-charge-map
```

把仓库同步到服务器（在本地仓库根目录执行）：

```bash
rsync -az --exclude '.git' --exclude 'tiles/*' \
  ./ root@服务器IP:/opt/hnu-charge-map/
ssh root@服务器IP 'chown -R hnu:hnu /opt/hnu-charge-map'
```

> `tiles/` 是高德瓦片缓存，仓库不包含（版权原因）。没有瓦片时地图会空白，见第 9 节。

## 4. 配置街电 token

`server.py` 通过环境变量 `ZHUMANG_TOKEN` 读取 token。获取方式：

1. 在电脑上用 mitmproxy / Charles 开一个 HTTP(S) 代理，手机连上并安装证书
2. 打开微信「街电」小程序，进入任意充电桩的扫码页
3. 在代理里找到 `union.zhumanggroup.com/api/rent/scan-code` 请求，复制请求头 `Authorization: Bearer eyJ...` 中 `Bearer ` 后面的部分
4. 写入环境变量文件（仓库自带交互脚本）：

```bash
sudo bash /opt/hnu-charge-map/deploy/update-token.sh
```

脚本会提示粘贴 token，写入 `/etc/hnu-charge-map.env`（权限 600）并重启服务。

也可以手动写：

```bash
umask 077
printf 'ZHUMANG_TOKEN=%s\n' 'eyJ...' > /etc/hnu-charge-map.env
```

token 是微信登录态，通常 **7 天左右**过期。过期后页面会自动回退到 `data.js` 里的截图快照，更新 token 即可恢复。注意：token 属于个人账号凭证，不要提交到 Git、不要发给别人。

## 5. systemd

仓库已经带好服务单元：

```bash
install -m 644 /opt/hnu-charge-map/deploy/hnu-charge-map.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now hnu-charge-map
systemctl status hnu-charge-map
```

服务以 `hnu` 用户运行，只监听 `127.0.0.1:8791`。日志：

```bash
journalctl -u hnu-charge-map -f
```

## 6. Caddy 与 HTTPS

### 6.1 域名 + 自动证书（推荐）

编辑 `/etc/caddy/Caddyfile`，使用 `deploy/Caddyfile.domain` 为模板：

```
example.com {
    encode gzip

    header {
        Strict-Transport-Security "max-age=31536000;"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer"
    }

    handle_path /guest/* {
        reverse_proxy 127.0.0.1:8791
    }

    handle /guest {
        redir /guest/ 308
    }

    handle {
        basicauth {
            hnu <BCRYPT_HASH>
        }
        reverse_proxy 127.0.0.1:8791
    }
}
```

生成 Basic Auth 密码哈希：

```bash
caddy hash-password --plaintext '你的密码'
```

把输出的 `$2a$...` 填到 `<BCRYPT_HASH>`，然后：

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Caddy 会自动申请 Let's Encrypt 证书；要求 80/443 从公网可达。查看签发日志：

```bash
journalctl -u caddy -f
```

> Caddy 2.8 起 `basicauth` 改名为 `basic_auth`，如果 apt 装的是新版，按提示改一下指令名。

### 6.2 防火墙

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

云厂商的安全组也要单独放行同样的端口。

### 6.3 过渡方案：8443 + 自签证书

域名未备案、或只想先在内网/测试环境跑通时，可以用 `deploy/Caddyfile.temp`：

```bash
sudo bash /opt/hnu-charge-map/deploy/setup-tls.sh 服务器公网IP
install -m 644 /opt/hnu-charge-map/deploy/Caddyfile.temp /etc/caddy/Caddyfile
systemctl restart caddy
```

访问 `https://服务器IP:8443/`，浏览器会提示证书不受信任，手动继续即可。注意：

- 这种方式只适合过渡，不适合正式分享
- 云厂商对未备案域名的拦截是按 SNI / Host 做的，换端口不一定能绕过；具体以实际测试为准

## 7. 验证

```bash
# 1. 本地接口
curl -s http://127.0.0.1:8791/api/status | head -c 400

# 2. 本机页面
curl -I http://127.0.0.1:8791/

# 3. 域名 / 证书（主站有 Basic Auth，返回 401 是正常的）
curl -I https://example.com/

# 4. 免登录分享路径（应返回 200）
curl -I https://example.com/guest/
```

`/api/status` 正常时会返回 `{"ok": true, "stations": [...]}`；`missing_token` 表示没配置 token，`token 已过期` 表示需要重新抓取。

## 8. 新增点位

以一个停车场为例，完整流程如下。仓库内置示例数据，先跑通再替换。建议在 macOS 上采集和转换。

### 8.1 拍照

- 打开手机相册的定位权限，逐台拍摄桩上的二维码
- 每张照片尽量正对二维码，站在桩旁边拍
- 文件名会按拍摄顺序排列，后续也按这个顺序编号
- 拍完确认照片 EXIF 里有 GPS（iPhone 默认有）

### 8.2 提取二维码和 GPS

仓库自带一个基于 macOS Vision 的小工具：

```bash
swiftc -O tools/qr-gps.swift -o /tmp/qr-gps
/tmp/qr-gps ~/Downloads/IMG_*.HEIC > /tmp/piles.json
```

输出每个文件的经纬度与二维码内容（形如 `https://union.zhumanggroup.com/pile?id=XUA12345`）。

非 macOS 环境可以用任意二维码识别库（如 `zbarimg`）加 `exiftool` 读取 GPS，效果一样。

### 8.3 转换坐标

```bash
python3 tools/wgs2gcj.py /tmp/piles.json
# 追加到已有站点时，用 --start 指定起始桩号
python3 tools/wgs2gcj.py /tmp/piles.json --start 18
```

脚本会按文件名排序、提取桩码、把 WGS-84 转成高德 GCJ-02，输出可直接粘贴的 JSON 条目。示例：

```json
{
  "id": "xua12345",
  "label": "1号桩",
  "code": "XUA12345",
  "power": 1200,
  "totalPorts": 12,
  "lat": 30.0004000,
  "lng": 120.0000000,
  "wgsLat": 30.0004000,
  "wgsLng": 120.0000000,
  "slots": null,
  "snapshotPorts": null
}
```

### 8.4 写入数据

1. `assets/data.js`：在 `stations` 数组里新增一个站点对象，`piles` 填入上面的条目；`id` 用小写桩码，`label` 用 `N号桩`，`power` 默认 1200，`totalPorts` 默认 12
2. `server.py`：
   - `DEVICES` 增加 `{"id": "...", "code": "...", "label": "...", "power": 1200, "station": "站点id"}`
   - `STATIONS` 增加 `{"id": "站点id", "name": "显示名", "lat": ..., "lng": ...}`
3. 重启服务：`systemctl restart hnu-charge-map`
4. 打开 `/api/status` 确认新站点和新桩都返回了 `slots`

### 8.5 坐标整理（可选）

照片 GPS 记录的是拍摄者位置，不是桩的精确坐标。项目里做了两层近似：

- **直线化**：同一列桩统一经度，保留纬度方向的真实间隔（该密的地方密、该空的地方空）
- **分组**：密集的一簇桩按俯视图排成规则网格，并适当加大行距避免圆点粘连

如果现场是明显的直线、拐角或方阵，建议按实际形状手动调整 `lat/lng`，同时保留 `wgsLat/wgsLng` 作为原始记录。

### 8.6 快照回退（可选）

如果没有 token，页面会读 `data.js` 里的 `snapshotPorts`。可以按小程序端口页的颜色填 `status`（0 空闲，1/2 不可用），作为接口不可用时的兜底展示。

## 9. 底图瓦片

`assets/config.js` 默认读取本地瓦片：

```js
tileUrl: "tiles/{z}/{x}/{y}.png"
```

仓库**不包含** `tiles/`（高德瓦片版权限制）。两种处理方式：

1. 使用已获授权的瓦片服务，把 `tileUrl` 改成对应地址，并在 `attribution` 里保留版权信息
2. 自行准备离线瓦片，放在 `tiles/{z}/{x}/{y}.png` 下（该目录已被 `.gitignore` 忽略，不会误传）

注意：高德瓦片使用 GCJ-02 坐标系，和 `data.js` 里的坐标一致；如果换成 OpenStreetMap 等 WGS-84 底图，桩位会偏移几百米，需要额外做坐标转换。

## 9.1 异常接口检测

服务端会记录每个接口的占用开始时间和短时占用事件：

- 短时占用：一次占用在 `SHORT_SESSION_SECONDS`（默认 600 秒）内又恢复空闲
- 统计窗口：`ABNORMAL_WINDOW_SECONDS`（默认 24 小时）
- 达到 `ABNORMAL_EVENT_LIMIT`（默认 3 次）即标记为异常

三个阈值都可以用环境变量覆盖，例如在 systemd 单元或环境文件里加：

```
Environment=SHORT_SESSION_SECONDS=600
Environment=ABNORMAL_WINDOW_SECONDS=86400
Environment=ABNORMAL_EVENT_LIMIT=3
```

检测精度受轮询间隔（60 秒）限制，短于一个轮询周期的占用/空闲切换可能漏记。

## 10. 日常维护

```bash
# 更新代码（本地仓库根目录）
rsync -az --exclude '.git' --exclude 'tiles/*' ./ root@服务器IP:/opt/hnu-charge-map/
ssh root@服务器IP 'chown -R hnu:hnu /opt/hnu-charge-map && systemctl restart hnu-charge-map'

# 更新 token
sudo bash /opt/hnu-charge-map/deploy/update-token.sh

# 查看日志
journalctl -u hnu-charge-map -n 100 --no-pager
```

修改 `assets/*.js`、`styles.css` 后，记得把 `index.html` 里的 `?v=...` 版本号一起改掉，否则浏览器可能继续用缓存。

## 11. 故障排查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 域名 `NXDOMAIN` | 注册局委派未发布 / 缓存未过期 | `dig NS 域名 @TLD服务器`，等待同步；必要时刷新本机 DNS |
| 页面打不开、80 返回「Non-compliance ICP Filing」 | 域名未备案，被云厂商拦截 | 备案，或换香港/海外服务器 |
| 443 连接被重置 | 未备案域名的 SNI 被拦 | 同上；过渡期可用其他端口/自签证书 |
| 证书申请失败 | 80/443 不可达、DNS 未生效 | 检查安全组、`dig`、Caddy 日志 |
| 页面显示「截图快照」 | token 未配置/过期/接口异常 | 更新 token，看 `journalctl` 与 `/api/status` |
| 地图空白 | `tiles/` 缺失，或 `tileUrl` 不对 | 按第 9 节准备底图 |
| 改了 JS/CSS 但页面没变 | 浏览器/服务缓存 | 修改 `index.html` 的 `?v=` 版本号 |

## 12. 合规与安全

- 只抓取公开小程序接口中自己账号可见的状态数据，控制请求频率（本项目 60 秒一轮）
- token 只放服务器环境变量，文件权限 600，目录 700；不要提交到 Git
- 主站加 Basic Auth；分享给同学用 `/guest/`，避免把管理入口公开
- 域名对外提供服务前完成 ICP 备案；底图和接口的使用遵守各自平台条款
- 本项目与街电、海南大学无隶属关系，数据版权归原平台所有
