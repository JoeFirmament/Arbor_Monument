# Flora of China 墨线图资料

## 当前处理原则

这些图版来自 [Flora of China @ eFloras](http://www.efloras.org/flora_page.aspx?flora_id=2)，用于核对苏州古树名录中的树种。下载文件保存在 `data/source-images/efloras-foc/`，不放入 `public/`，因此不会随网站公开发布。

原因是 eFloras 页面公开可访问并不等于图版采用 CC0、CC BY 等开放许可。现阶段所有图版统一标记为 `permission-needed-for-publication`；在获得明确的网页再发布许可前，只作为研究、物种核对和策展选材使用。

## 对应清单

`data/efloras-illustrations.json` 为机器可读清单。每个树种记录：

- 苏州名录中文名及学名
- 实际检索词（含旧属名处理）
- eFloras taxon id、接受名称和物种页
- Illustration 对象页和原图地址
- 本地研究文件、大小和 SHA-256
- `downloaded`、`no-illustration`、`taxon-not-found`、`image-unavailable` 等状态

同一图版可能服务于同一种的两个名录中文名，例如“榆”和“榆树”；清单仍分别保留对应关系，便于前端按名录名称查找。

## 更新

运行 `python3 scripts/fetch_efloras_illustrations.py`。脚本支持缓存和断点续传：已经成功下载或确认没有图版的记录不会重复请求，失败项会在下次运行时重试。
