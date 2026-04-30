/**
 * src/api/banners.ts — 主页合影轮播 API（plan API-5）
 *
 * 当前阶段（G3）：banners 集合尚未创建，先返回 mock 占位数据；
 * G7 上线管理员合影管理时切换为真实 `db.collection('banners').get()` 或
 * `cloudfunctions/listBanners`。
 *
 * 切换契约：返回值类型保持 `Banner[]`，调用方 `BannerCarousel.vue` 不需要改。
 *
 * Mock 数据来源：picsum.photos —— 公共占位图床，URL 稳定可缓存；
 * 若 picsum 不可用，BannerCarousel 仍会回落到「敬请期待班级合影」空态。
 */

export interface Banner {
  id: string
  url: string
  /** 可选标题（spec / plan 暂未定义；预留） */
  caption?: string
  /** 可选发布时间（占位用） */
  createdAt?: number
}

const MOCK_BANNERS: Banner[] = [
  {
    id: 'mock-1',
    url: 'https://picsum.photos/seed/zy-memoir-banner-1/1200/600',
    caption: '占位合影 · 2024 春',
  },
  {
    id: 'mock-2',
    url: 'https://picsum.photos/seed/zy-memoir-banner-2/1200/600',
    caption: '占位合影 · 2024 秋',
  },
  {
    id: 'mock-3',
    url: 'https://picsum.photos/seed/zy-memoir-banner-3/1200/600',
    caption: '占位合影 · 2025 毕业',
  },
]

/**
 * 返回主页轮播图列表（按时间倒序，本期 mock）。
 *
 * 当前实现：直接返回 MOCK_BANNERS 拷贝；后期切真接口时改为调用云函数 / db。
 */
export async function listBanners(): Promise<Banner[]> {
  // 用 microtask 模拟异步，避免调用方误以为同步并破坏 loading 流程
  await Promise.resolve()
  return MOCK_BANNERS.slice()
}
