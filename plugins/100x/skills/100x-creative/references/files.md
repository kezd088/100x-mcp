本地文件通过插件目录中的 `scripts/media.mjs` 上传或下载，需要 Node.js 22+。从此文件向上三级即插件根目录，执行时使用该脚本的绝对路径，不依赖当前工作目录。

脚本与 MCP 共用 `-Connect` 向导保存的加密凭据。无需在聊天或命令参数中提供令牌。v0.3.0 使用网页设备授权；公网接口尚待发布。本机验证可用环境变量指定隔离服务。

上传图片：

```powershell
node scripts/media.mjs upload "C:/media/reference.png"
```

上传视频或音频时附实际秒数：

```powershell
node scripts/media.mjs upload "C:/media/clip.mp4" 5.2
```

脚本只输出 100x 素材编号。用该编号作为报价工具的 `references`。
单份素材最大 20 MB。视频/音频时长必须取自实际文件，不能虚构。

下载任务返回的 100x 链接：

```powershell
node scripts/media.mjs download "任务返回的完整链接" "C:/media/result.png"
```

输出文件存在时脚本拒绝覆盖。下载链接有效 1 小时，过期后重新查询任务即可。
